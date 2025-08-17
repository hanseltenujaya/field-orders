import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

type Branch = 'JKP' | 'BGR' | 'TGR'

type Customer = { id:number; name:string; address?: string | null; branch?: Branch }
type Product  = {
  id:number; sku:string; name:string;
  /** STORED AS: price per UOM1 (CTN) */
  price:number;
  uom1_name:string|null; uom2_name:string|null; uom3_name:string|null;
  conv1_to_2:number|null; conv2_to_3:number|null;
}
type OrderRow = { id:string; product_id:number | null; uom: 1|2|3; qty:number; price:number }
type MyOrder = { id:number; created_at:string; customer_name:string; status:string; total:number; created_by?: string | null }

function uuid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
async function getUid() { const { data } = await supabase.auth.getUser(); return data.user?.id ?? null }
function formatDate(ts: string) {
  const d = new Date(ts)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

function formatTime(ts: string) {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mi}`
}

/** Minimal modal */
function Modal({ children, onClose }: { children:React.ReactNode; onClose:()=>void }) {
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1000}} onClick={onClose}>
      <div className="card" style={{maxWidth:900, width:'100%', maxHeight:'85vh', overflow:'auto'}} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export default function Orders() {
  // ---------- Data ----------
  const [products,setProducts]     = useState<Product[]>([])
  const [myBranch, setMyBranch]    = useState<Branch | null>(null)

  // create form
  const [customerId, setCustomerId]= useState<number|''>('')
  const [rows, setRows] = useState<OrderRow[]>([])
  const [notes, setNotes] = useState('')
  const [paymentTerms, setPaymentTerms] = useState<'' | 'CASH' | 'CREDIT'>('')

  // my orders
  const [myOrders, setMyOrders] = useState<MyOrder[]>([])

  // ---------- Product typeahead (local) ----------
  const [q, setQ] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  // ---------- Customer typeahead (server-side, debounced) ----------
  const [cq, setCq] = useState('')
  const [isCustOpen, setIsCustOpen] = useState(false)
  const custRef = useRef<HTMLInputElement>(null)
  const custBoxRef = useRef<HTMLDivElement>(null)
  const [custResults, setCustResults] = useState<Customer[]>([])

  // ---------- Detail modal for "My Orders" ----------
  const [viewId, setViewId] = useState<number | null>(null)
  const [viewHead, setViewHead] = useState<MyOrder | null>(null)
  const [viewItems, setViewItems] = useState<Array<{
    id:number; sku:string; name:string; qty:number; price:number; line_total:number; uom_level:1|2|3;
    uom1?: string | null; uom2?: string | null; uom3?: string | null;
  }>>([])

  // ---------- Bootstrap: profile branch + products + my orders ----------
  useEffect(()=>{ (async()=>{
    // profile branch
    const { data: u } = await supabase.auth.getUser()
    const uid = u.user?.id
    if (uid) {
      const { data: prof } = await supabase.from('profiles').select('branch').eq('id', uid).single()
      if (prof?.branch) setMyBranch(prof.branch as Branch)
    }

    // active products
    const p = await supabase.from('products')
      .select('id,sku,name,price,uom1_name,uom2_name,uom3_name,conv1_to_2,conv2_to_3')
      .eq('is_active', true)
      .order('name')
    if (!p.error) setProducts((p.data as any) || [])

    await loadMyOrders()
  })() }, [])

  async function loadMyOrders() {
    const uid = await getUid()
    const q = supabase.from('v_orders')
      .select('id, created_at, customer_name, status, total, created_by')
      .order('created_at', { ascending:false })
    const { data, error } = uid ? await q.eq('created_by', uid) : await q
    if (!error) setMyOrders((data as any) || [])
  }

  // ---------- Outside click to close dropdowns ----------
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (!searchBoxRef.current?.contains(t)) setIsOpen(false)
      if (!custBoxRef.current?.contains(t)) setIsCustOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // ---------- Escape to close ----------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setIsOpen(false); setIsCustOpen(false) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ---------- Product helpers ----------
  const byId = useMemo(() => {
    const map: Record<number, Product> = {}
    products.forEach(p => { map[p.id] = p })
    return map
  }, [products])

  const filteredProducts = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    return products.filter(p =>
      p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)
    ).slice(0, 30)
  }, [products, q])

  // ---------- Debounced, server-side customer search (by branch) ----------
  useEffect(() => {
    if (!myBranch) return
    if (!isCustOpen && !cq.trim()) return

    const handle = setTimeout(async () => {
      const term = cq.trim()
      let sel = supabase
        .from('customers')
        .select('id,name,address,branch')
        .eq('branch', myBranch)
        .order('name')
        .limit(30)

      if (term) sel = sel.or(`name.ilike.%${term}%,address.ilike.%${term}%`)

      const { data, error } = await sel
      if (!error) setCustResults((data as any) ?? [])
      else setCustResults([])
    }, 200)

    return () => clearTimeout(handle)
  }, [cq, isCustOpen, myBranch])

  // ---------- Price/unit helpers ----------
  function unitsPer(product: Product, uom: 1|2|3) {
    const c12 = Math.max(1, product.conv1_to_2 || 1)
    const c23 = Math.max(1, product.conv2_to_3 || 1)
    if (uom === 3) return 1
    if (uom === 2) return c23
    return c12 * c23
  }
  function pricePerPCSFromUOM1(p: Product) {
    const c12 = Math.max(1, p.conv1_to_2 || 1)
    const c23 = Math.max(1, p.conv2_to_3 || 1)
    const perPCS = c12 * c23
    const priceUOM1 = Number(p.price) || 0
    return perPCS > 0 ? (priceUOM1 / perPCS) : priceUOM1
  }

  function addProductToOrder(pid: number) {
    const p = byId[pid]
    if (!p) return
    const pricePerPCS = pricePerPCSFromUOM1(p)
    setRows(prev => {
      const idx = prev.findIndex(r => r.product_id === pid && r.uom === 3)
      const lineUnits = unitsPer(p, 3)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1, price: pricePerPCS * lineUnits }
        return next
      }
      return [...prev, { id: uuid(), product_id: pid, uom: 3, qty: 1, price: pricePerPCS * lineUnits }]
    })
    searchRef.current?.blur()
  }

  function changeUom(rowId: string, u: 1|2|3) {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId || !r.product_id) return r
      const p = byId[r.product_id]
      const pricePerPCS = pricePerPCSFromUOM1(p)
      const currentUnits = unitsPer(p, r.uom)
      const baseQty = r.qty * currentUnits
      const newUnits = unitsPer(p, u)
      const newQty = baseQty / newUnits
      return { ...r, uom: u, qty: newQty, price: pricePerPCS * newUnits }
    }))
  }

  function removeRow(rowId: string) { setRows(prev => prev.filter(r => r.id !== rowId)) }

  const subtotal = useMemo(() => rows.reduce((s,r)=> s + (r.qty * r.price), 0), [rows])

  // ---------- Save Order ----------
  async function saveOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) return alert('Select a customer')
    if (rows.length === 0) return alert('Add at least one item')
    if (rows.some(r => !r.product_id)) return alert('All rows must have a product')

    const uid = await getUid()
    if (!uid) { alert('Not signed in'); return }

    const { data: o, error: e1 } = await supabase
      .from('orders')
      .insert([{
        customer_id: customerId,
        created_by: uid,
        status: 'new',
        subtotal, discount:0, tax:0, total: subtotal, notes, payment_terms: paymentTerms || undefined
      }])
      .select('id')
      .single()

    if (e1) { alert(e1.message); return }
    const orderId = (o as any)?.id

    const items = rows.map(r => {
      const p = byId[r.product_id!]
      const per = unitsPer(p, r.uom)
      const qty_base = r.qty * per
      return { order_id: orderId, product_id: r.product_id!, qty: r.qty, price: r.price, uom_level: r.uom, qty_base }
    })

    const { error: e2 } = await supabase.from('order_items').insert(items)
    if (e2) {
      try { await supabase.from('orders').delete().eq('id', orderId) } catch {}
      alert(e2.message); return
    }

    setRows([]); setNotes(''); setQ(''); setIsOpen(false); setCustomerId(''); setCq(''); setPaymentTerms('')
    await loadMyOrders()
    alert('Order saved')
  }

  // ---------- View modal data ----------
  async function openView(id: number) {
    const head = myOrders.find(o => o.id === id) || null
    setViewHead(head)
    setViewId(id)

    const { data, error } = await supabase
      .from('order_items')
      .select('id, order_id, qty, price, line_total, uom_level, products:product_id (sku, name, uom1_name, uom2_name, uom3_name)')
      .eq('order_id', id)
      .order('id', { ascending:true })

    if (!error) {
      const mapped = (data as any[]).map(it => ({
        id: it.id,
        sku: it.products?.sku ?? '',
        name: it.products?.name ?? '',
        qty: Number(it.qty),
        price: Number(it.price),
        line_total: Number(it.line_total),
        uom_level: (it.uom_level ?? 3) as 1|2|3,
        uom1: it.products?.uom1_name,
        uom2: it.products?.uom2_name,
        uom3: it.products?.uom3_name,
      }))
      setViewItems(mapped)
    } else {
      setViewItems([])
    }
  }

  function closeView() {
    setViewId(null); setViewHead(null); setViewItems([])
  }

  // ---------- UI ----------
  return (
    <div className="grid">
      <style>{`
  .cell-prod { max-width: 1px; white-space: normal; word-break: break-word; }
  .wrap-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: normal; }
  .nowrap { white-space: nowrap; }
  .myorders .order-time { margin-left: 4px; }
  @media (max-width: 720px){ .myorders .order-time { display: none; } }

  @media (max-width: 640px) {
    .table { table-layout: fixed; width:100%; }
    .table th, .table td { padding: 8px 6px; }

    /* create-order */
    .col-prod   { width: 54%; }
    .col-uom    { width: 23%; }
    .col-qty    { width: 23%; }
    .col-price  { width: 28%; }
    .col-total  { width: 22%; text-align:right; }
    .col-actions{ width: 14%; }
    .uom-select, .qty-input { font-size:16px; }
    .qty-input { min-width:56px; width:100%; text-align:center; }

    /* my-orders responsive columns */
    .myorders { table-layout: fixed; width: 100%; }
    .myorders th, .myorders td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .myorders .c-id { width: 56px; }
    .myorders .c-date { width: 6rem; }
    .myorders .c-cust { width: auto; }
    .myorders .c-status { width: 6rem; }
    .myorders .c-total { width: 6rem; text-align: right; }
    .myorders .c-act { width: 60px; }
  }
`}</style>

      {/* ---------- Create Order ---------- */}
      <div className="card">
        <h3>Order</h3>

        <form className="grid" onSubmit={saveOrder}>
          {/* Customer selector */}
          <div className="grid two">
            <div ref={custBoxRef} style={{ position:'relative' }}>
              <label className="small" style={{ display:'block', marginBottom:6 }}><b>Customer</b></label>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  className="input"
                  placeholder="Search customer by name or address…"
                  value={cq}
                  onChange={e => { setCq(e.target.value); setIsCustOpen(true) }}
                  onFocus={() => setIsCustOpen(true)}
                  autoComplete="off"
                  spellCheck={false}
                  ref={custRef}
                  style={{ flex:1 }}
                />
                <button type="button" className="btn" onClick={() => { setCustomerId(''); setCq(''); setIsCustOpen(false); custRef.current?.blur() }}>
                  Clear
                </button>
              </div>

              {isCustOpen && (
                <div
                  style={{
                    position:'absolute', top:'100%', left:0, right:0, border:'1px solid #ccc', background:'#fff',
                    zIndex:1000, maxHeight:'40vh', overflowY:'auto', borderTop:'none',
                    borderRadius:'0 0 10px 10px', boxShadow:'0 10px 18px rgba(0,0,0,0.08)'
                  }}
                >
                  {custResults.length === 0 && (
                    <div className="small" style={{ padding:'10px 12px', opacity:.7 }}>No customers.</div>
                  )}
                  {custResults.map(c => (
                    <div
                      key={c.id}
                      style={{ padding:'10px 12px', cursor:'pointer' }}
                      onMouseDown={e => { e.preventDefault(); setCustomerId(c.id); setCq(`${c.name} - ${c.address || ''}`); setIsCustOpen(false); custRef.current?.blur() }}
                    >
                      {c.name} - {c.address || ''}
                    </div>
                  ))}
                </div>
              )}

              {customerId && (
                <div className="small" style={{ marginTop:6, opacity:.7 }}>
                  Selected: {cq || '—'}
                </div>
              )}
            </div>
            <div />
          </div>

          {/* Product Search */}
          <div ref={searchBoxRef} style={{position:'relative', marginTop: 6}}>
            <label className="small" style={{display:'block', marginBottom:6}}><b>Add Products</b></label>
            <div style={{display:'flex', gap:8}}>
              <input
                className="input"
                placeholder="Search SKU or name…"
                value={q}
                onChange={e=>{ setQ(e.target.value); setIsOpen(true) }}
                onFocus={()=> setIsOpen(!!q.trim())}
                autoComplete="off"
                spellCheck={false}
                ref={searchRef}
                style={{flex:1}}
              />
              <button type="button" className="btn" onClick={()=>{ setQ(''); setIsOpen(false); searchRef.current?.blur() }}>
                Clear
              </button>
            </div>

            {isOpen && q.trim() !== '' && filteredProducts.length > 0 && (
              <div
                style={{
                  position:'absolute', top:'100%', left:0, right:0, border:'1px solid #ccc', background:'#fff',
                  zIndex:1000, maxHeight: '50vh', overflowY:'auto', borderTop:'none',
                  borderRadius:'0 0 10px 10px', boxShadow:'0 10px 18px rgba(0,0,0,0.08)'
                }}
              >
                {filteredProducts.map(p => (
                  <div
                    key={p.id}
                    style={{ padding:'12px 14px', cursor:'pointer', display:'flex', gap:12, alignItems:'center' }}
                    onMouseDown={e => { e.preventDefault(); addProductToOrder(p.id) }}
                  >
                    <div style={{width:100, fontFamily:'monospace'}}>{p.sku}</div>
                    <div style={{flex:1}}>{p.name}</div>
                    <div style={{whiteSpace:'nowrap'}}>
                      {(Number(p.price)||0).toLocaleString('id-ID',{style:'currency',currency:'IDR'})} / {(p.uom1_name||'CTN')}
                    </div>
                    <span className="btn">+ Add</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Items */}
          <div className="card" style={{marginTop:8, padding:0, overflowX:'auto'}}>
            <table className="table">
              <thead>
                <tr>
                  <th className="col-prod">Product</th>
                  <th className="col-uom">UOM</th>
                  <th className="col-qty">Qty</th>
                  <th className="col-price">Price / UOM</th>
                  <th className="col-total">Line Total</th>
                  <th className="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const p = r.product_id ? byId[r.product_id] : undefined
                  const u1 = p?.uom1_name || 'UOM1'
                  const u2 = p?.uom2_name || 'UOM2'
                  const u3 = p?.uom3_name || 'UOM3'
                  return (
                    <tr key={r.id}>
                      <td className="cell-prod">{p ? <div className="wrap-2">{p.sku} — {p.name}</div> : <i className="small">Not selected</i>}</td>
                      <td>
                        {p ? (
                          <select className="input uom-select" value={r.uom} onChange={e=>changeUom(r.id, Number(e.target.value) as 1|2|3)}>
                            <option value={1}>{u1}</option>
                            <option value={2}>{u2}</option>
                            <option value={3}>{u3}</option>
                          </select>
                        ) : '—'}
                      </td>
                      <td>
                        <input
                          className="input qty-input"
                          type="number" min={0} inputMode="numeric"
                          value={r.qty}
                          onChange={e=>setRows(rs=>rs.map(x=>x.id===r.id?{...x, qty:Number((e.target as HTMLInputElement).value)||0}:x))}
                        />
                      </td>
                      <td className="col-price">{r.price.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                      <td className="col-total">{(r.qty*r.price).toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                      <td className="col-actions"><button type="button" className="btn" onClick={()=>removeRow(r.id)}>✕</button></td>
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="small" style={{opacity:.7, padding:'10px 12px'}}>No items yet. Search above and tap results to add.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8 }}>
            <label className="small" style={{ display:'block', marginBottom:6 }}><b>Payment Terms</b></label>
            <select
              className="input"
              value={paymentTerms}
              onChange={e=>setPaymentTerms(e.target.value as '' | 'CASH' | 'CREDIT')}
            >
              <option value="" disabled hidden></option>
              <option value="CASH">CASH</option>
              <option value="CREDIT">CREDIT</option>
            </select>
          </div>

          <textarea className="input" placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)} />
          <div className="sticky-actions" style={{textAlign:'right'}}>
            <div style={{fontWeight:600, marginBottom:8}}>Subtotal: {subtotal.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</div>
            <button className="btn primary">Save Order</button>
          </div>
        </form>
      </div>

      {/* ---------- My Orders ---------- */}
      <div className="card">
        <h3>My Orders</h3>
        <table className="table myorders">
          <thead>
            <tr>
              <th className="c-id">ID</th>
              <th className="c-date">Date</th>
              <th className="c-cust">Customer</th>
              <th className="c-status">Status</th>
              <th className="c-total">Total</th>
              <th className="c-act">Action</th>
            </tr>
          </thead>
          <tbody>
            {myOrders.map(o => (
              <tr key={o.id}>
                <td>#{o.id}</td>
                <td className="nowrap">
                  {formatDate(o.created_at)}<span className="order-time">{formatTime(o.created_at)}</span>
                </td>
                <td>{o.customer_name}</td>
                <td className="c-status" style={{ fontWeight: 400 }}>{o.status}</td>
                <td className="c-total">{Number(o.total).toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                <td className="c-act">
                  <button className="btn" onClick={()=>openView(o.id)}>View</button>
                </td>
              </tr>
            ))}
            {myOrders.length === 0 && (
              <tr><td colSpan={6} className="small">No orders.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- View Modal ---------- */}
      {viewId !== null && viewHead && (
        <Modal onClose={closeView}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginBottom:8}}>
            <h3>Order #{viewHead.id}</h3>
            <button className="btn" onClick={closeView}>Close</button>
          </div>

          <div className="small" style={{marginBottom:8}}>
            {new Date(viewHead.created_at).toLocaleString()} • {viewHead.customer_name} •{' '}
            <span className="badge" style={{textTransform:'capitalize'}}>{viewHead.status}</span>
          </div>

          <div className="card">
            <b>Items</b>
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th><th>Name</th><th>UOM</th><th>Qty</th><th>Price</th><th>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {viewItems.map(it => {
                  const uom =
                    it.uom_level === 1 ? (it.uom1 || 'UOM1') :
                    it.uom_level === 2 ? (it.uom2 || 'UOM2') :
                                         (it.uom3 || 'UOM3')
                  return (
                    <tr key={it.id}>
                      <td>{it.sku}</td>
                      <td>{it.name}</td>
                      <td>{uom}</td>
                      <td>{it.qty}</td>
                      <td>{Number(it.price).toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                      <td>{Number(it.line_total).toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                    </tr>
                  )
                })}
                {viewItems.length === 0 && <tr><td colSpan={6} className="small">No items.</td></tr>}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}
