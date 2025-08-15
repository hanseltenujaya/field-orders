import React, { useEffect, useMemo, useRef, useState } from 'react'
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

/* ------------------------- small helpers ------------------------- */

const BRANCHES: Branch[] = ['JKP', 'BGR', 'TGR']
const PAGE_SIZE = 200 // server page size for list/search

function toStrOrNull(v: any): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function asBranch(v: any): Branch {
  const s = String(v || '').toUpperCase().trim()
  return (['JKP', 'BGR', 'TGR'].includes(s) ? s : 'JKP') as Branch
}

/* ----------------------------- Modal ----------------------------- */

function Modal({
  open, onClose, title, children, footer
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.35)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:9999
      }}
    >
      <div className="card" onClick={e=>e.stopPropagation()} style={{width:'min(900px,95vw)', maxHeight:'90vh', overflow:'auto'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <h3 style={{margin:0}}>{title}</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        {children}
        {footer && <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:12}}>{footer}</div>}
      </div>
    </div>
  )
}

/* --------------------------- Component --------------------------- */

export default function Customers({ isAdmin = false }: { isAdmin?: boolean }) {
  const [rows, setRows] = useState<Customer[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // search & pagination (server-side)
  const [q, setQ] = useState('')
  const [canLoadMore, setCanLoadMore] = useState(false)
  const debounce = useRef<number | null>(null)

  // create
  const [openCreate, setOpenCreate] = useState(false)
  const [cName, setCName] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cAddress, setCAddress] = useState('')
  const [cCode, setCCode] = useState('')
  const [cLat, setCLat] = useState<string>('')   // keep as string in inputs
  const [cLng, setCLng] = useState<string>('')
  const [cBranch, setCBranch] = useState<Branch>('JKP')

  // edit
  const [editing, setEditing] = useState<Customer | null>(null)

  // view
  const [viewing, setViewing] = useState<Customer | null>(null)

  // import
  const [openImport, setOpenImport] = useState(false)
  const [importRows, setImportRows] = useState<Partial<Customer>[]>([])
  const [importErr, setImportErr] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  /* ------------------------- Data loading ------------------------- */

  async function fetchServer(term: string, offset: number) {
    // Build the base query
    let query = supabase
      .from('customers')
      .select('id, name, phone, address, customer_code, latitude, longitude, branch, created_at')
      .order(term.trim() ? 'name' : 'created_at', { ascending: term.trim() ? true : false })

    // Server-side search: match Order page behavior
    if (term.trim()) {
      const like = `%${term.trim()}%`
      query = query.or(
        [
          `name.ilike.${like}`,
          `address.ilike.${like}`,
          `customer_code.ilike.${like}`,
          `phone.ilike.${like}`
        ].join(',')
      )
    }

    // Pagination window
    query = query.range(offset, offset + PAGE_SIZE - 1)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data as Customer[]) || []
  }

  async function loadFirst(term: string) {
    setLoading(true); setErr(null)
    try {
      const batch = await fetchServer(term, 0)
      setRows(batch)
      setCanLoadMore(batch.length === PAGE_SIZE)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load customers'); setRows([]); setCanLoadMore(false)
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!canLoadMore || loading) return
    setLoading(true); setErr(null)
    try {
      const batch = await fetchServer(q, rows.length)
      setRows(prev => [...prev, ...batch])
      setCanLoadMore(batch.length === PAGE_SIZE)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load more')
    } finally {
      setLoading(false)
    }
  }

  // initial load
  useEffect(() => { loadFirst('') }, [])

  // debounced search
  function onSearchChange(v: string) {
    setQ(v)
    if (debounce.current) window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => loadFirst(v), 250)
  }

  /* ------------------------ Create customer ------------------------ */

  async function createCustomer() {
    if (!cName.trim()) return alert('Name is required')
    const payload = {
      name: cName.trim(),
      phone: toStrOrNull(cPhone),
      address: toStrOrNull(cAddress),
      customer_code: toStrOrNull(cCode),
      latitude: toNumOrNull(cLat),
      longitude: toNumOrNull(cLng),
      branch: cBranch
    }
    const { error } = await supabase.from('customers').insert([payload])
    if (error) return alert(error.message)
    setOpenCreate(false)
    setCName(''); setCPhone(''); setCAddress(''); setCCode(''); setCLat(''); setCLng(''); setCBranch('JKP')
    await loadFirst(q)
  }

  /* ------------------------- Edit customer ------------------------- */

  function startEdit(c: Customer) {
    if (!isAdmin) return
    setEditing(c)
  }

  async function saveEdit() {
    if (!editing) return
    const payload = {
      name: editing.name?.trim(),
      phone: toStrOrNull(editing.phone),
      address: toStrOrNull(editing.address),
      customer_code: toStrOrNull(editing.customer_code),
      latitude: toNumOrNull(editing.latitude),
      longitude: toNumOrNull(editing.longitude),
      branch: editing.branch
    }
    const { error } = await supabase.from('customers').update(payload).eq('id', editing.id)
    if (error) return alert(error.message)
    setEditing(null)
    await loadFirst(q)
  }

  /* ------------------------ Import from Excel ----------------------- */

  async function handleFile(f: File | null) {
    setImportErr(null)
    setImportRows([])
    if (!f) return

    try {
      // dynamic import; requires `npm i xlsx`
      const XLSX = await import('xlsx')
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

      // Normalize header names once (case-insensitive)
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
      const mapHeader = (obj: any, keys: string[]) => {
        const o: Record<string, any> = {}
        Object.keys(obj).forEach(k => { o[norm(k)] = obj[k] })
        for (const k of keys) { if (!(k in o)) o[k] = '' }
        return o
      }

      const normalized = rows.map(r => mapHeader(r, [
        'name','phone','address','customercode','latitude','longitude','branch'
      ]))

      const prepared: Partial<Customer>[] = normalized.map((r, i) => {
        const name = toStrOrNull(r['name'])
        return {
          name: name || `Unnamed ${i+1}`,
          phone: toStrOrNull(r['phone']),
          address: toStrOrNull(r['address']),
          customer_code: toStrOrNull(r['customercode']),
          latitude: toNumOrNull(r['latitude']),
          longitude: toNumOrNull(r['longitude']),
          branch: asBranch(r['branch'])
        }
      })

      setImportRows(prepared)
    } catch (e: any) {
      setImportErr(e?.message || 'Failed to read file')
    }
  }

  async function importCommit() {
    if (importRows.length === 0) return
    setImporting(true)
    try {
      // insert in chunks to avoid payload limits
      const CHUNK = 200
      for (let i = 0; i < importRows.length; i += CHUNK) {
        const slice = importRows.slice(i, i + CHUNK)
        const { error } = await supabase.from('customers').insert(slice as any[])
        if (error) throw new Error(error.message)
      }
      setOpenImport(false)
      setImportRows([])
      await loadFirst(q)
      alert('Import complete!')
    } catch (e: any) {
      alert(e?.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  /* ------------------------------- UI ------------------------------ */

  const emptyMsg = useMemo(() => {
    if (loading) return ''
    if (rows.length === 0) {
      return q.trim()
        ? `No customers found for “${q.trim()}”.`
        : 'No customers found.'
    }
    return ''
  }, [loading, rows.length, q])

  return (
    <div className="grid">
      <div className="card">
        <h3 style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}>
          <span>Customers</span>
          <span style={{display:'flex', gap:8}}>
            <button className="btn" onClick={()=>setOpenImport(true)}>Import (.xlsx / .csv)</button>
            <button className="btn primary" onClick={()=>setOpenCreate(true)}>+ New Customer</button>
          </span>
        </h3>

        {/* Search (server-side) */}
        <div style={{display:'flex', gap:8, marginBottom:12}}>
          <input
            className="input"
            placeholder="Search by name, phone, address, or customer code…"
            value={q}
            onChange={e=>onSearchChange(e.target.value)}
            style={{flex:1}}
          />
          <button
            className="btn"
            onClick={()=>{ setQ(''); loadFirst('') }}
          >
            Clear
          </button>
        </div>

        {err && <div className="small" style={{color:'#a00', marginBottom:8}}>Error: {err}</div>}

        <div className="card" style={{padding:0, overflowX:'auto'}}>
          <table className="table">
            <thead>
              <tr>
                <th style={{width:60}}>ID</th>
                <th>Customer&nbsp;ID</th>
                <th>Name</th>
                <th>Address</th>
                <th>Phone</th>
                <th>Lat</th>
                <th>Lng</th>
                <th>Branch</th>
                <th style={{width:160}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="small">Loading…</td></tr>
              )}

              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="small">{emptyMsg}</td></tr>
              )}

              {rows.map(c => (
                <tr key={c.id}>
                  <td className="small">{c.id}</td>
                  <td>{c.customer_code || '-'}</td>
                  <td>{c.name}</td>
                  <td>{c.address || '-'}</td>
                  <td>{c.phone || '-'}</td>
                  <td>{c.latitude ?? '-'}</td>
                  <td>{c.longitude ?? '-'}</td>
                  <td>{c.branch}</td>
                  <td>
                    <div style={{display:'flex', gap:6}}>
                      {isAdmin && <button className="btn" onClick={()=>startEdit(c)}>Edit</button>}
                      <button className="btn" onClick={()=>setViewing(c)}>View</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && canLoadMore && (
            <div style={{padding:12}}>
              <button className="btn" onClick={loadMore}>Load more</button>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <Modal
        open={openCreate}
        onClose={()=>setOpenCreate(false)}
        title="New Customer"
        footer={
          <>
            <button className="btn" onClick={()=>setOpenCreate(false)}>Cancel</button>
            <button className="btn primary" onClick={createCustomer}>Save</button>
          </>
        }
      >
        <div className="grid two" style={{gap:8}}>
          <input className="input" placeholder="Name *" value={cName} onChange={e=>setCName(e.target.value)} />
          <input className="input" placeholder="Phone" value={cPhone} onChange={e=>setCPhone(e.target.value)} />
          <input className="input" placeholder="Address" value={cAddress} onChange={e=>setCAddress(e.target.value)} />
          <input className="input" placeholder="Customer ID / Code" value={cCode} onChange={e=>setCCode(e.target.value)} />
          <input className="input" placeholder="Latitude (-90..90)" value={cLat} onChange={e=>setCLat(e.target.value)} />
          <input className="input" placeholder="Longitude (-180..180)" value={cLng} onChange={e=>setCLng(e.target.value)} />
          <select className="input" value={cBranch} onChange={e=>setCBranch(e.target.value as Branch)}>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <div />
        </div>
      </Modal>

      {/* Edit Modal (admin) */}
      {isAdmin && (
        <Modal
          open={!!editing}
          onClose={()=>setEditing(null)}
          title={editing ? `Edit Customer #${editing.id}` : 'Edit Customer'}
          footer={
            <>
              <button className="btn" onClick={()=>setEditing(null)}>Cancel</button>
              <button className="btn primary" onClick={saveEdit}>Save</button>
            </>
          }
        >
          {!editing ? null : (
            <div className="grid two" style={{gap:8}}>
              <input className="input" value={editing.name || ''} onChange={e=>setEditing({...editing, name:e.target.value})} />
              <input className="input" value={editing.phone || ''} onChange={e=>setEditing({...editing, phone:e.target.value})} />
              <input className="input" value={editing.address || ''} onChange={e=>setEditing({...editing, address:e.target.value})} />
              <input className="input" value={editing.customer_code || ''} onChange={e=>setEditing({...editing, customer_code:e.target.value})} />
              <input className="input" value={editing.latitude ?? ''} onChange={e=>setEditing({...editing, latitude: toNumOrNull(e.target.value)})} />
              <input className="input" value={editing.longitude ?? ''} onChange={e=>setEditing({...editing, longitude: toNumOrNull(e.target.value)})} />
              <select className="input" value={editing.branch} onChange={e=>setEditing({...editing, branch: e.target.value as Branch})}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <div />
            </div>
          )}
        </Modal>
      )}

      {/* View Modal */}
      <Modal
        open={!!viewing}
        onClose={()=>setViewing(null)}
        title={viewing ? viewing.name : 'Customer'}
        footer={<button className="btn" onClick={()=>setViewing(null)}>Close</button>}
      >
        {!viewing ? null : (
          <div className="grid" style={{gap:8}}>
            <div><b>Name:</b> {viewing.name}</div>
            <div><b>Phone:</b> {viewing.phone || '-'}</div>
            <div><b>Address:</b> {viewing.address || '-'}</div>
            <div><b>Customer ID / Code:</b> {viewing.customer_code || '-'}</div>
            <div className="grid two">
              <div><b>Latitude:</b> {viewing.latitude ?? '-'}</div>
              <div><b>Longitude:</b> {viewing.longitude ?? '-'}</div>
            </div>
            <div><b>Branch:</b> {viewing.branch}</div>
            <div className="small" style={{opacity:.7}}><b>Created:</b> {new Date(viewing.created_at).toLocaleString()}</div>
          </div>
        )}
      </Modal>

      {/* Import Modal */}
      <Modal
        open={openImport}
        onClose={()=>setOpenImport(false)}
        title="Import Customers (.xlsx / .csv)"
        footer={
          <>
            <button className="btn" onClick={()=>setOpenImport(false)}>Close</button>
            <button className="btn primary" disabled={importRows.length===0 || importing} onClick={importCommit}>
              {importing ? 'Importing…' : `Import ${importRows.length} row(s)`}
            </button>
          </>
        }
      >
        <div className="grid" style={{gap:10}}>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e=>handleFile(e.target.files?.[0] ?? null)}
          />
          <div className="small" style={{opacity:.75}}>
            Expected headers (case-insensitive): <code>name</code>, <code>phone</code>, <code>address</code>, <code>customer code</code>, <code>latitude</code>, <code>longitude</code>, <code>branch</code> (JKP/BGR/TGR).
          </div>
          {importErr && <div className="small" style={{color:'#a00'}}>Error: {importErr}</div>}
          {importRows.length > 0 && (
            <div className="card">
              <b>Preview (first 10)</b>
              <table className="table">
                <thead>
                  <tr><th>Name</th><th>Phone</th><th>Address</th><th>Code</th><th>Lat</th><th>Lng</th><th>Branch</th></tr>
                </thead>
                <tbody>
                  {importRows.slice(0,10).map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td>{r.phone ?? '-'}</td>
                      <td>{r.address ?? '-'}</td>
                      <td>{r.customer_code ?? '-'}</td>
                      <td>{r.latitude ?? '-'}</td>
                      <td>{r.longitude ?? '-'}</td>
                      <td>{r.branch}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="small" style={{marginTop:6, opacity:.7}}>
                Total parsed rows: <b>{importRows.length}</b>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
