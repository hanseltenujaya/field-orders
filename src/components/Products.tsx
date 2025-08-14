import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

type Product = {
  id: number
  sku: string
  name: string
  is_active: boolean
  price: number              // price per UOM3 (smallest unit)
  uom1_name: string | null
  uom2_name: string | null
  uom3_name: string | null
  conv1_to_2: number | null
  conv2_to_3: number | null
}

export default function Products() {
  const [rows, setRows] = useState<Product[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // add form
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState<string>('0') // per PCS
  const [u1, setU1] = useState('CTN')
  const [u2, setU2] = useState('BOX')
  const [u3, setU3] = useState('PCS')
  const [c12, setC12] = useState<string>('6')
  const [c23, setC23] = useState<string>('6')

  async function load() {
    setErr(null); setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, name, is_active, price, uom1_name, uom2_name, uom3_name, conv1_to_2, conv2_to_3')
      .order('name')
    setLoading(false)
    if (error) setErr(error.message)
    else setRows((data as any) || [])
  }
  useEffect(()=>{ load() }, [])

  async function addProduct() {
    if (!sku.trim() || !name.trim()) return alert('SKU and Name required')
    const p = Number(price) || 0
    const conv12 = Math.max(1, Number(c12) || 1)
    const conv23 = Math.max(1, Number(c23) || 1)
    const { error } = await supabase.from('products').insert([{
      sku: sku.trim(),
      name: name.trim(),
      is_active: true,
      price: p,
      uom1_name: u1.trim() || 'CTN',
      uom2_name: u2.trim() || 'BOX',
      uom3_name: u3.trim() || 'PCS',
      conv1_to_2: conv12,
      conv2_to_3: conv23
    }])
    if (error) return alert(error.message)
    setSku(''); setName(''); setPrice('0'); setU1('CTN'); setU2('BOX'); setU3('PCS'); setC12('6'); setC23('6')
    load()
  }

  async function saveRow(r: Product) {
    const payload = {
      sku: r.sku,
      name: r.name,
      is_active: r.is_active,
      price: Number(r.price) || 0,
      uom1_name: r.uom1_name || 'CTN',
      uom2_name: r.uom2_name || 'BOX',
      uom3_name: r.uom3_name || 'PCS',
      conv1_to_2: Math.max(1, Number(r.conv1_to_2) || 1),
      conv2_to_3: Math.max(1, Number(r.conv2_to_3) || 1)
    }
    const { error } = await supabase.from('products').update(payload).eq('id', r.id)
    if (error) return alert(error.message)
    load()
  }

  return (
    <div className="grid">
      <div className="card">
        <h3>Products</h3>

        {/* Add product */}
        <div style={{display:'grid', gridTemplateColumns:'120px 1fr 120px 100px 100px 100px 100px 100px auto', gap:8, marginBottom:12}}>
          <input className="input" placeholder="SKU" value={sku} onChange={e=>setSku(e.target.value)} />
          <input className="input" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
          <input className="input" type="number" step="0.01" placeholder="Price (per PCS)" value={price} onChange={e=>setPrice(e.target.value)} />

          <input className="input" placeholder="UOM1" value={u1} onChange={e=>setU1(e.target.value)} />
          <input className="input" placeholder="UOM2" value={u2} onChange={e=>setU2(e.target.value)} />
          <input className="input" placeholder="UOM3" value={u3} onChange={e=>setU3(e.target.value)} />

          <input className="input" type="number" min={1} placeholder="1→2 (e.g. 6)" value={c12} onChange={e=>setC12(e.target.value)} />
          <input className="input" type="number" min={1} placeholder="2→3 (e.g. 6)" value={c23} onChange={e=>setC23(e.target.value)} />

          <button className="btn primary" onClick={addProduct}>Add</button>
        </div>

        {err && <div className="small" style={{color:'#a00'}}>Error: {err}</div>}

        {loading ? 'Loading…' : (
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th><th>Name</th><th>Active</th>
                <th>Price/PCS</th>
                <th>UOM1</th><th>UOM2</th><th>UOM3</th>
                <th>1→2</th><th>2→3</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td><input className="input" value={r.sku} onChange={e=>setRows(xs=>xs.map((x,ix)=>ix===i?{...x, sku:e.target.value}:x))} /></td>
                  <td><input className="input" value={r.name} onChange={e=>setRows(xs=>xs.map((x,ix)=>ix===i?{...x, name:e.target.value}:x))} /></td>
                  <td style={{textAlign:'center'}}>
                    <input type="checkbox" checked={r.is_active} onChange={e=>setRows(xs=>xs.map((x,ix)=>ix===i?{...x, is_active:e.target.checked}:x))} />
                  </td>
                  <td><input className="input" type="number" step="0.01" value={r.price ?? 0} onChange={e=>setRows(xs=>xs.map((x,ix)=>ix===i?{...x, price:Number(e.target.value)||0}:x))} /></td>

                  <td><input className="input" value={r.uom1_name ?? ''} onChange={e=>setRows(xs=>xs.map((x,ix)=>ix===i?{...x, uom1_name:e.target.value}:x))} /></td>
                  <td><input className="input" value={r.uom2_name ?? ''} onChange={e=>setRows(xs=>xs.map((x,ix)=>ix===i?{...x, uom2_name:e.target.value}:x))} /></td>
                  <td><input className="input" value={r.uom3_name ?? ''} onChange={e=>setRows(xs=>xs.map((x,ix)=>ix===i?{...x, uom3_name:e.target.value}:x))} /></td>

                  <td><input className="input" type="number" min={1} value={r.conv1_to_2 ?? 1} onChange={e=>setRows(xs=>xs.map((x,ix)=>ix===i?{...x, conv1_to_2:Number(e.target.value)||1}:x))} /></td>
                  <td><input className="input" type="number" min={1} value={r.conv2_to_3 ?? 1} onChange={e=>setRows(xs=>xs.map((x,ix)=>ix===i?{...x, conv2_to_3:Number(e.target.value)||1}:x))} /></td>

                  <td><button className="btn primary" onClick={()=>saveRow(r)}>Save</button></td>
                </tr>
              ))}
              {rows.length===0 && <tr><td colSpan={10} className="small">No products.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
