import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

// 3 statuses only
const STATUSES = ['new', 'shipped', 'cancelled'] as const
type Status = typeof STATUSES[number]

// Sub-tabs
const FILTERS = ['ALL ORDERS', 'NEW', 'SHIPPED', 'CANCELLED'] as const
type Filter = typeof FILTERS[number]

type Order = {
  id: number
  customer_name: string
  status: Status
  total: number
  subtotal: number
  discount: number
  tax: number
  created_at: string
}

type OrderItem = {
  id: number
  order_id: number
  product_id: number
  qty: number
  price: number
  line_total: number
  product?: { name: string, sku: string }
}

type StatusRow = {
  id: number
  to_status: Status
  from_status: Status | null
  changed_at: string
}

export default function AdminBoard() {
  const [orders, setOrders] = useState<Order[]>([])
  // Counts for each status (and all)
  const counts = React.useMemo(() => ({
  all: orders.length,
  new: orders.filter(o => o.status === 'new').length,
  shipped: orders.filter(o => o.status === 'shipped').length,
  cancelled: orders.filter(o => o.status === 'cancelled').length,
  }), [orders])

  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('ALL ORDERS')

  // selection (kept for your bulk toolbar)
  const [selected, setSelected] = useState<Record<number, boolean>>({})

  async function load() {
    setErr(null)
    const { data, error } = await supabase
      .from('v_orders')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setErr(error.message)
    else setOrders((data as any) || [])
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    const ch = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // ---- Filtering
  const filtered = useMemo(() => orders.filter(o => {
    if (filter === 'ALL ORDERS') return true
    if (filter === 'NEW') return o.status === 'new'
    if (filter === 'SHIPPED') return o.status === 'shipped'
    if (filter === 'CANCELLED') return o.status === 'cancelled'
    return true
  }), [orders, filter])

  // ---- Selection helpers
  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected]
  )
  const allVisibleSelected = useMemo(() => {
    const ids = filtered.map(o => o.id)
    return ids.length > 0 && ids.every(id => selected[id])
  }, [selected, filtered])

  function toggleOne(id: number) {
    setSelected(s => ({ ...s, [id]: !s[id] }))
  }
  function toggleAllVisible() {
    const ids = filtered.map(o => o.id)
    setSelected(s => {
      const next = { ...s }
      const make = !allVisibleSelected
      ids.forEach(id => { next[id] = make })
      return next
    })
  }

  // BULK toolbar still works (kept)
  async function bulkMove(to: Status) {
    if (selectedIds.length === 0) return alert('Select at least one order.')
    if (!confirm(`Change ${selectedIds.length} order(s) to "${to}"?`)) return

    const { error: e1 } = await supabase.from('orders').update({ status: to }).in('id', selectedIds)
    if (e1) return alert(e1.message)

    const user = await supabase.auth.getUser()
    const payload = selectedIds.map(id => ({
      order_id: id, from_status: null, to_status: to, changed_by: user.data.user?.id
    }))
    const { error: e2 } = await supabase.from('order_status_history').insert(payload)
    if (e2) console.warn('history insert warning:', e2.message)

    setSelected({})
    await load()
  }

  // ------- Detail Modal state
  const [showDetail, setShowDetail] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [detail, setDetail] = useState<{
    order?: Order,
    items: OrderItem[],
    history: StatusRow[]
  }>({ items: [], history: [] })

  // Open detail
  async function openDetail(id: number) {
    setErr(null)
    const head = orders.find(o => o.id === id)
    if (!head) return

    const { data: items, error: e1 } = await supabase
      .from('order_items')
      .select('id, order_id, product_id, qty, price, line_total, products:product_id (name, sku)')
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
        product: it.products ? { name: it.products.name, sku: it.products.sku } : undefined
      })),
      history: (hist as any) || []
    })
    setEditMode(false)
    setShowDetail(true)
  }

  // Save edits (qty/price) + recalc totals in orders
  async function saveEdits() {
    if (!detail.order) return
    const id = detail.order.id

    // Update each item (qty, price)
    const updates = detail.items.map(it => ({
      id: it.id,
      qty: Number(it.qty),
      price: Number(it.price)
    }))
    const { error: e1 } = await supabase.from('order_items').upsert(updates, { onConflict: 'id' })
    if (e1) return alert(e1.message)

    // Recompute totals client-side and update order header
    const subtotal = detail.items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0)
    const total = subtotal // (no discount/tax logic yet)
    const { error: e2 } = await supabase.from('orders').update({
      subtotal, total
    }).eq('id', id)
    if (e2) return alert(e2.message)

    setEditMode(false)
    await load()
    await openDetail(id)
  }

  // Cancel the order (set status=cancelled + history)
  async function cancelOrder() {
    if (!detail.order) return
    const id = detail.order.id
    if (!confirm(`Cancel order #${id}?`)) return

    const { data: current } = await supabase.from('orders').select('status').eq('id', id).single()
    const from = (current?.status || null) as Status | null

    const { error: e1 } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id)
    if (e1) return alert(e1.message)

    const user = await supabase.auth.getUser()
    const { error: e2 } = await supabase.from('order_status_history').insert([{
      order_id: id, from_status: from, to_status: 'cancelled', changed_by: user.data.user?.id
    }])
    if (e2) console.warn('history insert warning:', e2.message)

    setShowDetail(false)
    await load()
  }

  // ---------- EXPORT: selected (or visible if none) to CSV (Excel friendly)
  function csvEscape(v: any) {
    const s = (v ?? '').toString()
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  async function exportSelectedCsv() {
  // Use selected orders, or fall back to all currently visible in the tab
  const rowsToExport = selectedIds.length ? orders.filter(o => selectedIds.includes(o.id)) : filtered
  if (rowsToExport.length === 0) return alert('No orders to export.')

  const orderIds = rowsToExport.map(r => r.id)

  // Get ALL items for these orders, including product info
  const { data: items, error } = await supabase
    .from('order_items')
    .select('order_id, qty, price, line_total, products:product_id (sku, name)')
    .in('order_id', orderIds)

  if (error) return alert(error.message)

  // Quick lookup for order header fields
  const byId: Record<number, typeof rowsToExport[number]> = {}
  rowsToExport.forEach(o => { byId[o.id] = o })

  // CSV headers (one row per item)
  const headers = [
    'Order ID',
    'Date',
    'Customer',
    'Status',
    'Order Subtotal',
    'Order Discount',
    'Order Tax',
    'Order Total',
    'SKU',
    'Product Name',
    'Qty',
    'Unit Price',
    'Line Total'
  ]
  const lines = [headers.join(',')]

  ;(items as any[]).forEach(it => {
    const ord = byId[it.order_id]
    if (!ord) return
    const row = [
      `#${ord.id}`,
      new Date(ord.created_at).toLocaleString(),
      ord.customer_name,
      ord.status,
      ord.subtotal?.toString() ?? '',
      ord.discount?.toString() ?? '',
      ord.tax?.toString() ?? '',
      ord.total?.toString() ?? '',
      it.products?.sku ?? '',
      it.products?.name ?? '',
      Number(it.qty),
      Number(it.price),
      Number(it.line_total)
    ].map(csvEscape).join(',')
    lines.push(row)
  })

  if (lines.length === 1) return alert('No items found for the selected orders.')

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date()
  const pad = (n:number)=>String(n).padStart(2,'0')
  a.href = url
  a.download = `order-items-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}





  
  return (
    <div className="grid">
      <div className="card">
        <h3>Orders (Admin)</h3>
        {err && <div className="card" style={{background:'#fff3f3', borderColor:'#f5c2c2', color:'#a30000', marginTop:8}}>
          <b>Error:</b> {err}
        </div>}

        {/* Sub tabs */}
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 12px' }}>
          {FILTERS.map(f => {
            const label =
              f === 'ALL ORDERS' ? `ALL ORDERS (${counts.all})` :
              f === 'NEW'        ? `NEW (${counts.new})` :
              f === 'SHIPPED'    ? `SHIPPED (${counts.shipped})` :
                                    `CANCELLED (${counts.cancelled})`;
            return (
              <button
                key={f}
                className={'btn ' + (filter === f ? 'primary' : '')}
                onClick={() => setFilter(f)}
            >
              {label}
            </button>
            )
          })}
        </div>

        {/* Top toolbar for bulk actions + EXPORT */}
        <div className="card" style={{display:'flex', gap:8, alignItems:'center', justifyContent:'space-between'}}>
          <div className="small">Selected: <b>{selectedIds.length}</b></div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn" onClick={exportSelectedCsv}>Export to Excel (.csv)</button>
            {STATUSES.map(st => (
              <button key={st} className="btn" onClick={() => bulkMove(st)}>Set {st}</button>
            ))}
          </div>
        </div>

        {/* Table: only "View" per row now */}
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th style={{width:32}}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                </th>
                <th style={{width:80}}>ID</th>
                <th style={{width:220}}>Date</th>
                <th>Customer</th>
                <th style={{width:140}}>Status</th>
                <th style={{width:160}}>Total</th>
                <th style={{width:120}}>Row Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!selected[o.id]}
                      onChange={() => toggleOne(o.id)}
                    />
                  </td>
                  <td>#{o.id}</td>
                  <td>{new Date(o.created_at).toLocaleString()}</td>
                  <td>{o.customer_name}</td>
                  <td className="status" style={{textTransform:'capitalize'}}>{o.status}</td>
                  <td>{Number(o.total).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}</td>
                  <td>
                    <button className="btn" onClick={() => openDetail(o.id)}>View</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="small">No orders match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal with action bar: Edit / Save / Cancel Order */}
      {showDetail && detail.order && (
        <Modal onClose={() => setShowDetail(false)}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
            <h3>Order #{detail.order.id}</h3>
            <div style={{display:'flex', gap:8}}>
              {!editMode && <button className="btn" onClick={() => setEditMode(true)}>Edit</button>}
              {editMode && <button className="btn primary" onClick={saveEdits}>Save</button>}
              <button className="btn danger" onClick={cancelOrder}>Cancel</button>
            </div>
          </div>

          <div className="small" style={{marginBottom:8}}>
            {new Date(detail.order.created_at).toLocaleString()} • {detail.order.customer_name} •
            <span className="badge" style={{marginLeft:8, textTransform:'capitalize'}}>{detail.order.status}</span>
          </div>

          <div className="card" style={{marginBottom:12}}>
            <b>Items</b>
            <table className="table">
              <thead><tr><th>SKU</th><th>Name</th><th>Qty</th><th>Price</th><th>Line Total</th></tr></thead>
              <tbody>
                {detail.items.map((it, idx) => (
                  <tr key={it.id}>
                    <td>{it.product?.sku || '-'}</td>
                    <td>{it.product?.name || '-'}</td>
                    <td>
                      {editMode
                        ? <input className="input" style={{width:90}}
                            value={it.qty}
                            onChange={e=>{
                              const v = Number((e.target as HTMLInputElement).value || 0)
                              setDetail(d => ({...d, items: d.items.map((x,i)=> i===idx? {...x, qty:v}: x)}))
                            }}
                          />
                        : it.qty}
                    </td>
                    <td>
                      {editMode
                        ? <input className="input" style={{width:120}}
                            value={it.price}
                            onChange={e=>{
                              const v = Number((e.target as HTMLInputElement).value || 0)
                              setDetail(d => ({...d, items: d.items.map((x,i)=> i===idx? {...x, price:v}: x)}))
                            }}
                          />
                        : Number(it.price).toLocaleString('id-ID',{style:'currency',currency:'IDR'})}
                    </td>
                    <td>
                      {Number((editMode ? Number(it.qty)*Number(it.price) : it.line_total))
                        .toLocaleString('id-ID',{style:'currency',currency:'IDR'})}
                    </td>
                  </tr>
                ))}
                {detail.items.length === 0 && <tr><td colSpan={5} className="small">No items.</td></tr>}
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
                    <td className="status">{h.from_status ?? '—'}</td>
                    <td className="status">{h.to_status}</td>
                  </tr>
                ))}
                {detail.history.length === 0 && <tr><td colSpan={3} className="small">No history yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{marginTop:12, textAlign:'right'}}>
            <button className="btn" onClick={() => setShowDetail(false)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Minimal modal (no external libs) */
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
