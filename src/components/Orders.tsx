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
  const [customers,setCustomers] = useState<Customer[]>([])
  const [products,setProducts]   = useState<Product[]>([])
  const [customerId, setCustomerId] = useState<number|''>('')

  const [rows, setRows] = useState<OrderRow[]>([])
  const [notes, setNotes] = useState('')
  const [myOrders, setMyOrders] = useState<any[]>([])

  // Typeahead search
  const [q, setQ] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    function handleDocMouseDown(e: MouseEvent) {
      if (!searchBoxRef.current) return
      if (!searchBoxRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleDocMouseDown)
    return () => document.removeEventListener('mousedown', handleDocMouseDown)
  }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setIsOpen(false) }
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
      .slice(0, 20)
  }, [products, q])

  function unitsPer(product: Product, uom: 1|2|3) {
    const c12 = Math.max(1, product.conv1_to_2 || 1)
    const c23 = Math.max(1, product.conv2_to_3 || 1)
    if (uom === 3) return 1
    if (uom === 2) return c23
    return c12 * c23 // UOM1
  }

  function uomName(product: Product, uom: 1|2|3) {
    if (uom === 1) return product.uom1_name || 'UOM1'
    if (uom === 2) return product.uom2_name || 'UOM2'
    return product.uom3_name || 'UOM3'
  }

  function addProductToOrder(pid: number) {
    const p = byId[pid]
    if (!p) return
    // default to smallest unit (UOM3) qty=1
    const pricePerUnit = Number(p.price) || 0
    setRows(prev => {
      // if already in list with same UOM, just +1 qty on that line
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
    requestAnimationFrame(() => searchRef.current?.focus())
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

    // build payload with uom_level + qty_base (pcs)
    const payload = rows.map(r => {
      const p = byId[r.product_id!]
      const per = unitsPer(p, r.uom)
      const qty_base = r.qty * per
      return {
        order_id: o.id,
        product_id: r.product_id!,
        qty: r.qty,
        price: r.price,          // price per selected UOM
        uom_level: r.uom,        // 1/2/3
        qty_base                 // total pcs
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
      <div className="card">
        <h3>Create Order</h3>

        <form className="grid" onSubmit={saveOrder}>
          <div className="grid two">
            <select
              className="input"
              value={customerId}
              onChange={e=>setCustomerId(Number((e.target as HTMLSelectElement).value))}
            >
              <option value="">Select customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div />
          </div>

          {/* Product search with sticky dropdown */}
          <div className="card" style={{marginTop:8}}>
            <b>Add Products</b>
            <div ref={searchBoxRef} style={{position:'relative', marginTop:8, maxWidth:520}}>
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
                />
                <button type="button" className="btn" onClick={()=>{ setQ(''); setIsOpen(false); searchRef.current?.focus() }}>Clear</button>
              </div>

              {isOpen && q.trim() !== '' && filteredProducts.length > 0 && (
                <div
                  style={{
                    position:'absolute', top:'100%', left:0, right:0,
                    border:'1px solid #ccc', background:'#fff', zIndex:10,
                    maxHeight:220, overflowY:'auto', borderTop:'none',
                    borderRadius:'0 0 6px 6px', boxShadow:'0 6px 14px rgba(0,0,0,0.06)'
                  }}
                >
                  {filteredProducts.map(p => (
                    <div
                      key={p.id}
                      style={{padding:'10px 12px', cursor:'pointer', display:'flex', gap:12, alignItems:'center'}}
                      onMouseDown={e => { e.preventDefault(); addProductToOrder(p.id) }}
                    >
                      <div style={{width:96, fontFamily:'monospace'}}>{p.sku}</div>
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
            <div className="small" style={{marginTop:6, opacity:.7}}>
              Price shown is per {`"${'PCS'}"`} (smallest UOM). Larger UOM prices are calculated by conversion.
            </div>
          </div>

          {/* Order items with UOM selection */}
          <div className="card" style={{marginTop:12, padding:0}}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{width:'40%'}}>Product</th>
                  <th style={{width:120}}>UOM</th>
                  <th>Qty</th>
                  <th>Price / UOM</th>
                  <th>Line Total</th>
                  <th style={{width:80}}></th>
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
                      <td>{p ? `${p.sku} — ${p.name}` : <i className="small">Not selected</i>}</td>
                      <td>
                        {p ? (
                          <select
                            className="input"
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
                          className="input"
                          type="number"
                          min={0}
                          value={r.qty}
                          onChange={e=>setRows(rs=>rs.map(x=>x.id===r.id?{...x, qty:Number((e.target as HTMLInputElement).value)||0}:x))}
                        />
                      </td>
                      <td>{r.price.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                      <td>{(r.qty*r.price).toLocaleString('id-ID',{style:'currency',currency:'IDR'})}</td>
                      <td><button type="button" className="btn" onClick={()=>removeRow(r.id)}>✕</button></td>
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="small" style={{opacity:.7, padding:'10px 12px'}}>
                    No items yet. Search above and click results to add.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <textarea className="input" placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)} />
          <div style={{textAlign:'right', fontWeight:600}}>
            Subtotal: {subtotal.toLocaleString('id-ID',{style:'currency',currency:'IDR'})}
          </div>
          <button className="btn primary">Save Order</button>
        </form>
      </div>

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
