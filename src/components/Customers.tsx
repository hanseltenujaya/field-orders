import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

type Branch = 'JKP' | 'BGR' | 'TGR'

type Customer = {
  id: number
  name: string
  phone: string | null
  address: string | null
  customer_code: string | null
  latitude: number | null
  longitude: number | null
  branch: Branch
  created_at: string
}

export default function Customers({ isAdmin = false }: { isAdmin?: boolean }) {
  const [list, setList] = useState<Customer[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Add form state
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [customerCode, setCustomerCode] = useState('')
  const [lat, setLat] = useState<string>('')   // keep as string for input
  const [lng, setLng] = useState<string>('')

  // Edit state
  const [editing, setEditing] = useState<Customer | null>(null)

  async function load() {
    setErr(null); setLoading(true)
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone, address, customer_code, latitude, longitude, branch, created_at')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) setErr(error.message)
    else setList((data as any) || [])
  }

  useEffect(() => { load() }, [])

  // Create new customer
  async function addCustomer() {
    if (!name.trim()) return alert('Name is required')
    const latNum = lat.trim() === '' ? null : Number(lat)
    const lngNum = lng.trim() === '' ? null : Number(lng)
    if (latNum !== null && (isNaN(latNum) || latNum < -90 || latNum > 90)) return alert('Latitude must be between -90 and 90')
    if (lngNum !== null && (isNaN(lngNum) || lngNum < -180 || lngNum > 180)) return alert('Longitude must be between -180 and 180')

    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      customer_code: customerCode.trim() || null,
      latitude: latNum,
      longitude: lngNum,
    }

    const { error } = await supabase.from('customers').insert([payload])
    if (error) return alert(error.message)

    // reset form
    setName(''); setPhone(''); setAddress(''); setCustomerCode(''); setLat(''); setLng('')
    await load()
  }

  // Start edit
  function startEdit(c: Customer) {
    if (!isAdmin) return
    setEditing(c)
  }

  // Save edit (admin only)
  async function saveEdit() {
    if (!editing) return
    const latNum = editing.latitude
    const lngNum = editing.longitude
    if (latNum !== null && (isNaN(latNum) || latNum < -90 || latNum > 90)) return alert('Latitude must be between -90 and 90')
    if (lngNum !== null && (isNaN(lngNum) || lngNum < -180 || lngNum > 180)) return alert('Longitude must be between -180 and 180')

    const { error } = await supabase.from('customers').update({
      name: editing.name?.trim(),
      phone: editing.phone?.trim() || null,
      address: editing.address?.trim() || null,
      customer_code: editing.customer_code?.trim() || null,
      latitude: editing.latitude,
      longitude: editing.longitude,
    }).eq('id', editing.id)

    if (error) return alert(error.message)
    setEditing(null)
    await load()
  }

  return (
    <div className="grid">
      <div className="card">
        <h3>Customers</h3>

        {/* Add customer */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr auto', gap:8, margin:'12px 0'}}>
          <input className="input" placeholder="Name *" value={name} onChange={e=>setName(e.target.value)} />
          <input className="input" placeholder="Phone" value={phone} onChange={e=>setPhone(e.target.value)} />
          <input className="input" placeholder="Address" value={address} onChange={e=>setAddress(e.target.value)} />
          <input className="input" placeholder="Customer ID / Code" value={customerCode} onChange={e=>setCustomerCode(e.target.value)} />
          <input className="input" placeholder="Latitude (-90..90)" value={lat} onChange={e=>setLat(e.target.value)} />
          <input className="input" placeholder="Longitude (-180..180)" value={lng} onChange={e=>setLng(e.target.value)} />
          <button className="btn primary" onClick={addCustomer}>Save</button>
        </div>

        {err && <div className="small" style={{color:'#a00'}}>Error: {err}</div>}

        {/* List */}
        {loading ? 'Loading…' : (
          <table className="table">
            <thead>
              <tr>
                <th style={{width:60}}>ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Customer&nbsp;ID</th>
                <th>Lat</th>
                <th>Lng</th>
                <th>Branch</th>
                <th style={{width:120}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <tr key={c.id}>
                  <td className="small">{c.id}</td>
                  <td>{c.name}</td>
                  <td>{c.phone || '-'}</td>
                  <td>{c.address || '-'}</td>
                  <td>{c.customer_code || '-'}</td>
                  <td>{c.latitude ?? '-'}</td>
                  <td>{c.longitude ?? '-'}</td>
                  <td>{c.branch}</td>
                  <td>
                    {isAdmin ? (
                      <button className="btn" onClick={()=>startEdit(c)}>Edit</button>
                    ) : (
                      <span className="small" style={{opacity:.6}}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && !loading && (
                <tr><td colSpan={9} className="small">No customers yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Inline edit panel (admin only) */}
      {isAdmin && editing && (
        <div className="card">
          <h3>Edit Customer #{editing.id}</h3>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr auto', gap:8}}>
            <input className="input" value={editing.name || ''} onChange={e=>setEditing({...editing, name:e.target.value})} />
            <input className="input" value={editing.phone || ''} onChange={e=>setEditing({...editing, phone:e.target.value})} />
            <input className="input" value={editing.address || ''} onChange={e=>setEditing({...editing, address:e.target.value})} />
            <input className="input" value={editing.customer_code || ''} onChange={e=>setEditing({...editing, customer_code:e.target.value})} />
            <input className="input" value={editing.latitude ?? ''} onChange={e=>setEditing({...editing, latitude: e.target.value===''? null : Number(e.target.value)})} />
            <input className="input" value={editing.longitude ?? ''} onChange={e=>setEditing({...editing, longitude: e.target.value===''? null : Number(e.target.value)})} />
            <div style={{display:'flex', gap:8}}>
              <button className="btn" onClick={()=>setEditing(null)}>Cancel</button>
              <button className="btn primary" onClick={saveEdit}>Save</button>
            </div>
          </div>
          <div className="small" style={{marginTop:6, opacity:.7}}>
            Only admins can edit customers. Latitude: -90..90, Longitude: -180..180
          </div>
        </div>
      )}
    </div>
  )
}
