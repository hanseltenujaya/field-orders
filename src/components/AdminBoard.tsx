import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const STATUSES = ['new', 'shipped', 'cancelled'] as const
type Status = typeof STATUSES[number]

const FILTERS = ['ALL ORDERS', 'NEW', 'SHIPPED', 'CANCELLED'] as const
type Filter = typeof FILTERS[number]

type Order = {
  id: number
  created_at: string
  customer_name: string | null
  status: Status
  total: number | null
  created_by: string | null
  submitted_by_id?: string | null
  submitted_by_name?: string | null
  payment_terms?: string | null
  subtotal?: number | null
  discount?: number | null
  tax?: number | null
}

type OrderItem = {
  id: number
  order_id: number
  product_id: number
  qty: number
  price: number
  line_total: number
  uom_level: number
  products?: { sku: string; name: string; uom1_name?: string | null; uom2_name?: string | null; uom3_name?: string | null }
}

type StatusRow = {
  id: number
  to_status: Status
  from_status: Status | null
  changed_at: string
}

export default function AdminBoard() {
  // ***** DEBUG: leaves a fingerprint so you KNOW this file is the one rendering
  console.log('[AdminBoard v3] mounted at', new Date().toISOString())

  const [orders, setOrders] = useState<Order[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('ALL ORDERS')
  const [selected, setSelected] = useState<Record<number, boolean>>({})

  const counts = useMemo(() => ({
    all: orders.length,
    new: orders.filter(o => o.status === 'new').length,
    shipped: orders.filter(o => o.status === 'shipped').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  }), [orders])

  async function load() {
    setErr(null)
    const { data, error } = await supabase
      .from('v_orders')
      .select('id, created_at, status, total, customer_name, created_by, submitted_by_id, submitted_by_name, payment_terms')
      .order('created_at', { ascending: false })

    if (error) setErr(error.message)
    else setOrders((data as any) || [])

    // DEBUG: show what fields we actually received
    if (Array.isArray(data) && data[0]) {
      console.log('[AdminBoard v3] first row keys:', Object.keys(data[0]))
    } else {
      console.log('[AdminBoard v3] no rows or undefined data')
    }
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    const ch = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { schema: 'public', table: 'orders', event: '*' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'ALL ORDERS') return orders
    if (filter === 'NEW') return orders.filter(o => o.status === 'new')
    if (filter === 'SHIPPED') return orders.filter(o => o.status === 'shipped')
    if (filter === 'CANCELLED') return orders.filter(o => o.status === 'cancelled')
    return orders
  }, [orders, filter])

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected]
  )
  const allVisibleSelected = useMemo(() => {
    const ids = filtered.map(o => o.id)
    return ids.length > 0 && ids.every(id => selected[id])
  }, [selected, filtered])

  function toggleOne(id: number) { setSelected(s => ({ ...s, [id]: !s[id] })) }
  function toggleAllVisible() {
    const ids = filtered.map(o => o.id)
    setSelected(s => {
      const next = { ...s }
      const make = !allVisibleSelected
      ids.forEach(id => { next[id] = make })
      return next
    })
  }

  async function bulkMove(to: Status) {
    if (selectedIds.length === 0) return alert('Select at least one order.')
    if (!confirm(`Change ${selectedIds.length} order(s) to "${to}"?`)) return

    const { error: e1 } = await supabase.from('orders').update({ status: to }).in('id', selectedIds)
    if (e1) return alert(e1.message)

    const { data: u } = await supabase.auth.getUser()
    const payload = selectedIds.map(id => ({ order_id: id, from_status: null, to_status: to, changed_by: u.user?.id }))
    const { error: e2 } = await supabase.from('order_status_history').insert(payload)
    if (e2) console.warn('history insert warning:', e2.message)

    setSelected({})
    await load()
  }

  // ------- Detail Modal
  const [showDetail, setShowDetail] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [detail, setDetail] = useState<{ order?: Order, items: any[], history: StatusRow[] }>({ items: [], history: [] })

  async function openDetail(id: number) {
    setErr(null)
    const head = orders.find(o => o.id === id)
    if (!head) return

    const { data: items, error: e1 } = await supabase
      .from('order_items')
      .select('id, order_id, product_id, qty, price, line_total, uom_level, ' +
    'products:product_id (sku, name, uom1_name, uom2_name, uom3_name)')
      .eq('order_id', id)
    if (e1) return setErr(e1.message)

    const { data: hist, error: e2 } = await supabase
      .from('order_status_history')
      .select('id, to_status, from_status, changed_at')
      .eq('order_id', id)
      .order('changed_at', { ascending: false })
    if (e2) return setErr(e2.message)

    setDetail({
      order: head,
      items: (items as any[]).map(it => ({
        ...it,
        product: it.products ? { name: it.products.name, sku: it.products.sku, uom1_name: it.products.uom1_name, uom2_name: it.products.uom2_name, uom3_name: it.products.uom3_name } : undefined
      })),
      history: (hist as any) || []
    })
    setEditMode(false)
    setShowDetail(true)
  }

  async function saveEdits() {
    if (!detail.order) return
    const id = detail.order.id

    const updates = detail.items.map(it => ({ id: it.id, qty: Number(it.qty), price: Number(it.price) }))
    const { error: e1 } = await supabase.from('order_items').upsert(updates, { onConflict: 'id' })
    if (e1) return alert(e1.message)

    const subtotal = detail.items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0)
    const total = subtotal
    const { error: e2 } = await supabase.from('orders').update({ subtotal, total }).eq('id', id)
    if (e2) return alert(e2.message)

    setEditMode(false)
    await load()
    await openDetail(id)
  }

  async function cancelOrder() {
    if (!detail.order) return
    const id = detail.order.id
    if (!confirm(`Cancel order #${id}?`)) return

    const { data: current } = await supabase.from('orders').select('status').eq('id', id).single()
    const from = (current?.status || null) as Status | null

    const { error: e1 } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id)
    if (e1) return alert(e1.message)

    const { data: u } = await supabase.auth.getUser()
    const { error: e2 } = await supabase.from('order_status_history').insert([{ order_id:id, from_status: from, to_status:'cancelled', changed_by: u.user?.id }])
    if (e2) console.warn('history insert warning:', e2.message)

    setShowDetail(false)
    await load()
  }

async function changeStatus(to: Status) {
  if (!detail.order) return
  const id = detail.order.id

  if (!confirm(`Change order #${id} to "${to}"?`)) return

  // read current (for history)
  const { data: current, error: e0 } = await supabase
    .from('orders')
    .select('status')
    .eq('id', id)
    .single()
  if (e0) return alert(e0.message)

  const from = (current?.status || null) as Status | null

  // update header
  const { error: e1 } = await supabase
    .from('orders')
    .update({ status: to })
    .eq('id', id)
  if (e1) return alert(e1.message)

  // history
  const { data: u } = await supabase.auth.getUser()
  const { error: e2 } = await supabase
    .from('order_status_history')
    .insert([{ order_id: id, from_status: from, to_status: to, changed_by: u.user?.id }])
  if (e2) console.warn('history insert warning:', e2.message)

  // refresh UI
  await load()
  await openDetail(id)
}


  function csvEscape(v: any) { const s = (v ?? '').toString(); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s }
  // Export orders: XLSX if 'xlsx' is installed, else CSV
async function exportSelectedCsv() {
  // Use selected orders, or all visible if none selected
  const rowsToExport = selectedIds.length ? orders.filter(o => selectedIds.includes(o.id)) : filtered
  if (rowsToExport.length === 0) return alert('No orders to export.')
  const orderIds = rowsToExport.map(r => r.id)

  // Items with UOM info
  const { data: items, error } = await supabase
    .from('order_items')
    .select('order_id, qty, price, line_total, uom_level, products:product_id (sku, name, uom1_name, uom2_name, uom3_name)')
    .in('order_id', orderIds)
  if (error) return alert(error.message)

  // Header monetary fields (since v_orders may not expose them)
  const { data: ordMeta, error: ordErr } = await supabase
    .from('orders')
    .select('id, subtotal, discount, tax, total')
    .in('id', orderIds)
  if (ordErr) return alert(ordErr.message)
  const metaById: Record<number, any> =
    Object.fromEntries((ordMeta || []).map(o => [o.id, o]))

  // Quick lookup for header fields from v_orders already loaded in UI
  const byId: Record<number, typeof rowsToExport[number]> = {}
  rowsToExport.forEach(o => { byId[o.id] = o })

  // Flatten to one row per item
  const rows = (items || []).map((it: any) => {
    const ord = byId[it.order_id]; if (!ord) return null

    const u1 = it.products?.uom1_name || 'UOM1'
    const u2 = it.products?.uom2_name || 'UOM2'
    const u3 = it.products?.uom3_name || 'UOM3'
    const lvl = Number(it.uom_level || 3)
    const uomLabel = lvl === 1 ? u1 : lvl === 2 ? u2 : u3

    const meta = metaById[ord.id] || {}

    return {
      'Order ID'       : `#${ord.id}`,
      'Date'           : new Date(ord.created_at).toLocaleString(),
      'Customer'       : ord.customer_name ?? '',
      'Status'         : ord.status,
      'Payment Terms'  : ord.payment_terms ?? '',
      'Submitted By'   : ord.submitted_by_name || (ord.created_by ? ord.created_by.slice(0,8) : ''),
      'SKU'            : it.products?.sku ?? '',
      'Product Name'   : it.products?.name ?? '',
      'UOM'            : uomLabel,
      'Qty'            : Number(it.qty),
      'Unit Price'     : Number(it.price),
      'Line Total'     : Number(it.line_total),
      'Order Subtotal' : meta.subtotal ?? '',
      'Order Discount' : meta.discount ?? '',
      'Order Tax'      : meta.tax ?? '',
      'Order Total'    : (meta.total ?? ord.total ?? '')
    }
  }).filter(Boolean) as Record<string, any>[]

  if (rows.length === 0) return alert('No items found for the selected orders.')

  const HEADERS = [
    'Order ID','Date','Customer','Status','Payment Terms','Submitted By',
    'SKU','Product Name','UOM','Qty','Unit Price','Line Total',
    'Order Subtotal','Order Discount','Order Tax','Order Total'
  ]

  // Try XLSX first
  try {
    // @ts-ignore - optional dep
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Orders')
    const ts = new Date(); const pad = (n:number)=>String(n).padStart(2,'0')
    const fname = `order-items-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}.xlsx`
    XLSX.writeFile(wb, fname)
    return
  } catch (e) {
    console.warn('xlsx not installed; falling back to CSV', e)
  }

  // CSV fallback (Excel-friendly)
  const csvEscape = (v:any) => {
    const s = (v ?? '').toString()
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
  }
  const lines = [HEADERS.join(',')]
  rows.forEach(r => lines.push(HEADERS.map(h => csvEscape(r[h])).join(',')))

  const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date(); const pad = (n:number)=>String(n).padStart(2,'0')
  a.href = url
  a.download = `order-items-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

return (
    <div className="grid">
      <div className="card">
        {/* ***** Title fingerprint so you can see the new component is actually mounted */}
        <h3>Orders (Admin) • v3</h3>

        {/* DEBUG banner to prove fields are present */}
        {orders[0] && (
          <div className="small" style={{background:'#f6f7ff', border:'1px solid #dfe3ff', padding:8, margin:'8px 0', overflow:'auto'}}>
            <b>First row keys:</b> {Object.keys(orders[0] as any).join(', ')}
          </div>
        )}

        {err && <div className="card" style={{background:'#fff3f3', borderColor:'#f5c2c2', color:'#a30000', marginTop:8}}>
          <b>Error:</b> {err}
        </div>}

        <div style={{ display:'flex', gap:8, margin:'8px 0 12px' }}>
          {FILTERS.map(f => {
            const label =
              f === 'ALL ORDERS' ? `ALL ORDERS (${counts.all})` :
              f === 'NEW'        ? `NEW (${counts.new})` :
              f === 'SHIPPED'    ? `SHIPPED (${counts.shipped})` :
                                   `CANCELLED (${counts.cancelled})`
            return (
              <button key={f} className={'btn ' + (filter===f?'primary':'')} onClick={()=>setFilter(f)}>
                {label}
              </button>
            )
          })}
        </div>

        <div className="card" style={{display:'flex', gap:8, alignItems:'center', justifyContent:'space-between'}}>
          <div className="small">Selected: <b>{selectedIds.length}</b></div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn" onClick={exportSelectedCsv}>Export to Excel (.csv)</button>
            {STATUSES.map(st => (
              <button key={st} className="btn" onClick={()=>bulkMove(st)}>Set {st}</button>
            ))}
          </div>
        </div>

        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th style={{width:32}}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /></th>
                <th style={{width:80}}>ID</th>
                <th style={{width:220}}>Date</th>
                <th>Customer</th>
                <th style={{width:160}}>Submitted by</th> {/* Always render header */}
                <th style={{width:140}}>Status</th>
                <th style={{width:140}}>Terms</th>
                <th style={{width:160}}>Total</th>
                <th style={{width:120}}>Row Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id}>
                  <td><input type="checkbox" checked={!!selected[o.id]} onChange={()=>toggleOne(o.id)} /></td>
                  <td>#{o.id}</td>
                  <td>{new Date(o.created_at).toLocaleString()}</td>
                  <td>{o.customer_name}</td>
                  <td className="small">{o.submitted_by_name || (o.created_by ? o.created_by.slice(0,8) : '—')}</td>
                  <td style={{ textTransform:'capitalize', fontWeight:400 }}>{o.status}</td>
                  <td>{o.payment_terms || '—'}</td>
                  <td>{Number(o.total ?? 0).toLocaleString('id-ID', { style:'currency', currency:'IDR' })}</td>
                  <td><button className="btn" onClick={()=>openDetail(o.id)}>View</button></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="small">No orders match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showDetail && detail.order && (
        <Modal onClose={()=>setShowDetail(false)}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
            <h3>Order #{detail.order.id}</h3>
            <div style={{display:'flex', gap:8}}>
              {!editMode && <button className="btn" onClick={()=>setEditMode(true)}>Edit</button>}
              {editMode && <button className="btn primary" onClick={saveEdits}>Save</button>}
              <button className="btn" onClick={()=>changeStatus('new')}>Set new</button>
              <button className="btn" onClick={()=>changeStatus('shipped')}>Set shipped</button>
              <button className="btn danger" onClick={()=>changeStatus('cancelled')}>Set cancelled</button>
            </div>
          </div>

          <div className="small" style={{marginBottom:8}}>
            {new Date(detail.order.created_at).toLocaleString()} • {detail.order.customer_name} •
            <span className="badge" style={{marginLeft:8, textTransform:'capitalize'}}>{detail.order.status}</span>
            {(detail.order.submitted_by_name || detail.order.created_by) && (
              <span style={{marginLeft:8}}>
                • Submitted by: {detail.order.submitted_by_name || (detail.order.created_by ? detail.order.created_by.slice(0,8) : '')}
              </span>
            )}
          </div>

          <div className="card" style={{marginBottom:12}}>
            <b>Items</b>
            <table className="table">
              <thead><tr><th>SKU</th><th>Name</th><th>UOM</th><th>Qty</th><th>Price</th><th>Line Total</th></tr></thead>
              <tbody>
  {detail.items.map((it, idx) => {
    const u1 = it.product?.uom1_name || 'UOM1'
    const u2 = it.product?.uom2_name || 'UOM2'
    const u3 = it.product?.uom3_name || 'UOM3'
    const lvl = Number(it.uom_level || 3)
    const uomLabel = lvl === 1 ? u1 : lvl === 2 ? u2 : u3

    return (
      <tr key={it.id}>
        <td>{it.product?.sku || '-'}</td>
        <td>{it.product?.name || '-'}</td>
        <td>{uomLabel}</td>  {/* ← show UOM */}
        <td>
          {editMode ? (
            <input
              className="input"
              style={{ width: 90 }}
              value={it.qty}
              onChange={e => {
                const v = Number((e.target as HTMLInputElement).value || 0)
                setDetail(d => ({
                  ...d,
                  items: d.items.map((x, i) => (i === idx ? { ...x, qty: v } : x))
                }))
              }}
            />
          ) : (
            it.qty
          )}
        </td>
        <td>
          {editMode ? (
            <input
              className="input"
              style={{ width: 120 }}
              value={it.price}
              onChange={e => {
                const v = Number((e.target as HTMLInputElement).value || 0)
                setDetail(d => ({
                  ...d,
                  items: d.items.map((x, i) => (i === idx ? { ...x, price: v } : x))
                }))
              }}
            />
          ) : (
            Number(it.price).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })
          )}
        </td>
        <td>
          {Number(
            editMode ? Number(it.qty) * Number(it.price) : it.line_total
          ).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}
        </td>
      </tr>
    )
  })}
  {detail.items.length === 0 && (
    <tr><td colSpan={6} className="small">No items.</td></tr>
  )}
</tbody>































            </table>
          </div>

          <div className="card">
            <b>Status History</b>
            <table className="table">
              <thead><tr><th>When</th><th>From</th><th>To</th></tr></thead>
              <tbody>
                {detail.history.map(h => (
                  <tr key={h.id}>
                    <td>{new Date(h.changed_at).toLocaleString()}</td>
                    <td style={{ textTransform:'capitalize', fontWeight:400 }}>{h.from_status ?? '—'}</td>
                    <td style={{ textTransform:'capitalize', fontWeight:400 }}>{h.to_status}</td>
                  </tr>
                ))}
                {detail.history.length === 0 && <tr><td colSpan={3} className="small">No history yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{marginTop:12, textAlign:'right'}}>
            <button className="btn" onClick={()=>setShowDetail(false)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1000 }}
      onClick={onClose}
    >
      <div className="card" style={{maxWidth:900, width:'100%', maxHeight:'85vh', overflow:'auto'}} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
