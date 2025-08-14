import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

type Customer = { id:number; name:string }
type Product  = {
  id:number; sku:string; name:string; price:number;    // price per UOM3 (PCS)
  uom1_name:string|null; uom2_name:string|null; uom3_name:string|null;
  conv1_to_2:number|null; conv2_to_3:number|null;
}
type OrderRow = { id:string; product_id:number | null; uom: 1|2|3; qty:number; price:number }

function uuid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

export default function Orders() {
  const [customers,setCustomers]   = useState<Customer[]>([])
  const [products,setProducts]     = useState<Product[]>([])
  const [customerId, setCustomerId]= useState<number|''>('')

  const [rows, setRows] = useState<OrderRow[]>([])
  const [notes, setNotes] = useState('')
  const [myOrders, setMyOrders] = useState<any[]>([])

  // ==== Product typeahead ====
  const [q, setQ] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  // ==== Customer typeahead ====
  const [cq, setCq] = useState('')                         // input text / selected name
  const [isCustOpen, setIsCustOpen] = useState(false)
  const custRef = useRef<HTMLInputElement>(null)
  const custBoxRef = useRef<HTMLDivElement>(null)

  useEffect(()=>{ (async()=>{
    const c = await supabase.from('customers').select('id,name').order('name')
    if (!c.error) setCustomers(c.data as any)

    const p = await supabase.from('products')
      .select('id,sku,name,price,uom1_name,uom2_name,uom3_name,conv1_to_2,conv2_to_3')
      .eq('is_active', true)
      .order('name')
    if (!p.error) setProducts(p.data as any)

    await loadMyOrders()
  })() }, [])

  async function loadMyOrders() {
    const { data, error } = await supabase
      .from('v_orders').select('*')
      .order('created_at', {ascending:false})
    if (!error) setMyOrders(data as any)
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleDocMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (!searchBoxRef.current?.contains(t)) setIsOpen(false)
      if (!custBoxRef.current?.contains(t)) setIsCustOpen(false)
    }
    document.addEventListener('mousedown', handleDocMouseDown)
    return () => document.removeEventListener('mousedown', handleDocMouseDown)
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setIsOpen(false); setIsCustOpen(false) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const byId = useMemo(() => {
    const map: Record<number, Product> = {}
    products.forEach(p => { map[p.id] = p })
    return map
  }, [products])

  const filteredProducts = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    return products
      .filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term)
      )
      .slice(0, 30)
  }, [products, q])

  const filteredCustomers = useMemo(() => {
    const term = cq.trim().toLowerCase()
    if (!term) return customers.slice(0, 30)
    return customers
      .filter(c => c.name.toLowerCase().includes(term))
      .slice(0, 30)
  }, [customers, cq])

  function unitsPer(product: Product, uom: 1|2|3) {
    const c12 = Math.max(1, product.conv1_to_2 || 1)
    const c23 = Math.max(1, product.conv2_to_3 || 1)
    if (uom === 3) return 1
    if (uom === 2) return c23
    return c12 * c23 // UOM1
  }

  function addProductToOrder(pid: number) {
    const p = byId[pid]
    if (!p) return
    const pricePerUnit = Number(p.price) || 0
    setRows(prev => {
      const idx = prev.findIndex(r => r.product_id === pid && r.uom === 3)
      if (idx >= 0) {
        const next = [...prev]
        const lineUnits = unitsPer(p, 3) // 1
        next[idx] = { ...next[idx], qty: next[idx].qty + 1, price: pricePerUnit * lineUnits }
        return next
      }
      const lineUnits = unitsPer(p, 3)
      return [...prev, { id: uuid(), product_id: pid, uom: 3, qty: 1, price: pricePerUnit * lineUnits }]
    })
    // MOBILE: close keyboard but keep dropdown open so user can add more
    searchRef.current?.blur()
  }

  function changeUom(rowId: string, u: 1|2|3) {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId || !r.product_id) return r
      const p = byId[r.product_id]
      const lineUnits = unitsPer(p, u)
      const pricePerUnit = Number(p.price) || 0
      return { ...r, uom: u, price: pricePerUnit * lineUnits }
    }))
  }

  function removeRow(rowId: string) {
    setRows(prev => prev.filter(r => r.id !== rowId))
  }

  const subtotal = useMemo(
    () => rows.reduce((s,r)=> s + (r.qty * r.price), 0),
    [rows]
  )

  async function saveOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) return alert('Select a customer')
    if (rows.length === 0) return alert('Add at least one item')
    if (rows.some(r => !r.product_id)) return alert('All rows must have a product')

    const user = await supabase.auth.getUser()
    const created_by = user.data.user?.id

    const { data: o, error: e1 } = await supabase.from('orders').insert([{
      customer_id: customerId,
      created_by,
      status: 'new',
      subtotal, discount:0, tax:0, total: subtotal, notes
    }]).select().single()
    if (e1) return alert(e1.message)

    // payload with uom_level + qty_base (pcs)
    const payload = rows.map(r => {
      const p = byId[r.product_id!]
      const per = unitsPer(p, r.uom)
      const qty_base = r.qty * per
      return {
        order_id: o.id,
        product_id: r.product_id!,
        qty: r.qty,
        price: r.price,
        uom_level: r.uom,
        qty_base
      }
    })
    const { error: e2 } = await supabase.from('order_items').insert(payload)
    if (e2) return alert(e2.message)

    setRows([]); setNotes(''); setQ(''); setIsOpen(false)
    await loadMyOrders()
    alert('Order saved')
  }

  return (
    <div className="grid">
      {/* === Mobile-first table tweaks (show Product+UOM+Qty first) === */}
      <style>{`
        .cell-prod { max-width: 1px; white-space: normal; word-break: break-word; }
        .wrap-2 { 
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          white-space: normal;
        }

        @media (max-width: 640px) {
          .table { table-layout: fixed; width:100%; }
          .table th, .table td { padding: 8px 6px; }

          .col-prod   { width: 54%; }
          .col-uom    { width: 23%; }
          .col-qty    { width: 23%; }

          /* Off-screen to the right (scroll to see) */
          .col-price  { width: 28%; }
          .col-total  { width: 22%; text-align:right; }
          .col-actions{ width: 14%; }

          .uom-select, .qty-input { font-size:16px; }
          .qty-input { min-width:56px; width:100%; text-align:center; }
        }
      `}</style>

      {/* === Create Order Card === */}
      <div className="card">
        <h3>Create Order</h3>

        <form className="grid" onSubmit={saveOrder}>

          {/* Customer selector (searchable) */}
          <div className="grid two">
            <div ref={custBoxRef} style={{ position:'relative' }}>
              <label className="small" style={{ display:'block', marginBottom:6 }}><b>Customer</b></label>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  className="input"
                  placeholder="Search customer…"
                  value={cq}
                  onChange={e => { setCq(e.target.value); setIsCustOpen(true) }}
                  onFocus={() => setIsCustOpen(true)}
                  autoComplete="off"
                  spellCheck={false}
                  ref={custRef}
                  style={{ flex:1 }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setCustomerId('');
                    setCq('');
                    setIsCustOpen(false);
                    custRef.current?.blur();
                  }}
                >
                  Clear
                </button>
              </div>

              {/* Customer dropdown */}
              {isCustOpen && (
                <div
                  style={{
                    position:'absolute',
                    top:'100%',
                    left:0,
                    right:0,
                    border:'1px solid #ccc',
                    background:'#fff',
                    zIndex:1000,
                    maxHeight:'40vh',
                    overflowY:'auto',
                    borderTop:'none',
                    borderRadius:'0 0 10px 10px',
                    boxShadow:'0 10px 18px rgba(0,0,0,0.08)'
                  }}
                >
                  {filteredCustomers.length === 0 && (
                    <div className="small" style={{ padding:'10px 12px', opacity:.7 }}>No customers.</div>
                  )}
                  {filteredCustomers.map(c => (
                    <div
                      key={c.id}
                      style={{ padding:'10px 12px', cursor:'pointer' }}
                      onMouseDown={e => {
                        e.preventDefault()
                        setCustomerId(c.id)
                        setCq(c.name)
                        setIsCustOpen(false)
                        custRef.current?.blur()
                      }}
                    >
                      {c.name}
                    </div>
                  ))}
                </div>
              )}

              {customerId && (
                <div className="small" style={{ marginTop:6, opacity:.7 }}>
                  Selected: {customers.find(x => x.id === customerId)?.name || '—'}
                </div>
              )}
            </div>
            <div />
          </div>

          {/* === Product Search (directly under customer) === */}
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
              <button
                type="button"
                className="btn"
                onClick={()=>{ setQ(''); setIsOpen(false); searchRef.current?.blur() }}
              >
                Clear
              </button>
            </div>

            {/* Floating product dropdown */}
            {isOpen && q.trim() !== '' && filteredProducts.length > 0 && (
              <div
                style={{
                  position:'absolute',
                  top:'100%',
                  left:0,
                  right:0,
                  border:'1px solid #ccc',
                  background:'#fff',
                  zIndex:1000,
                  maxHeight: '50vh',
                  overflowY:'auto',
                  borderTop:'none',
                  borderRadius:'0 0 10px 10px',
                  boxShadow:'0 10px 18px rgba(0,0,0,0.08)'
                }}
              >
                {filteredProducts.map(p => (
                  <div
                    key={p.id}
                    style={{
                      padding:'12px 14px',
                      cursor:'pointer',
                      display:'flex',
                      gap:12,
                      alignItems:'center'
                    }}
                    onMouseDown={e => { e.preventDefault(); addProductToOrder(p.id) }}
                  >
                    <div style={{width:100, fontFamily:'monospace'}}>{p.sku}</div>
                    <div style={{flex:1}}>{p.name}</div>
                    <div style={{whiteSpace:'nowrap'}}>
                      {(Number(p.price)||0).toLocaleString('id-ID',{style:'currency',currency:'IDR'})} / {(p.uom3_name||'PCS')}
                    </div>
                    <span className="btn">+ Add</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Order items table (horizontal scroll allowed) */}
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
                      <td className="cell-prod">
                        {p ? <div className="wrap-2">{p.sku} — {p.name}</div> : <i className="small">Not selected</i>}
                      </td>
                      <td>
                        {p ? (
                          <select
                            className="input uom-select"
                            value={r.uom}
                            onChange={e=>changeUom(r.id, Number(e.target.value) as 1|2|3)}
                          >
                            <option value={1}>{u1}</option>
                            <option value={2}>{u2}</option>
                            <option value={3}>{u3}</option>
                          </select>
                        ) : '—'}
                      </td>
                      <td>
                        <input
                          className="input qty-input"
                          type="number"
                          min={0}
                          inputMode="numeric"
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
                  <tr><td colSpan={6} className="small" style={{opacity:.7, padding:'10px 12px'}}>
                    No items yet. Search above and tap results to add.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <textarea className="input" placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)} />
          <div className="sticky-actions" style={{textAlign:'right'}}>
            <div style={{fontWeight:600, marginBottom:8}}>
              Subtotal: {subtotal.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}
            </div>
            <button className="btn primary">Save Order</button>
          </div>
        </form>
      </div>

      {/* === My Orders (unchanged) === */}
      <div className="card">
        <h3>My Orders</h3>
        <table className="table">
          <thead><tr><th>ID</th><th>Date</th><th>Customer</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {myOrders.map(o => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{new Date(o.created_at).toLocaleString()}</td>
                <td>{o.customer_name}</td>
                <td className="status">{o.status}</td>
                <td>{Number(o.total).toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
