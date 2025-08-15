import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

/* =========================
   Types & constants
========================= */
type Branch = 'JKP' | 'BGR' | 'TGR'
const BRANCHES: Branch[] = ['JKP', 'BGR', 'TGR']

type Product = {
  id: number
  sku: string
  name: string
  is_active: boolean
  /** Price per UOM1 (CTN by default) */
  price: number
  uom1_name: string | null
  uom2_name: string | null
  uom3_name: string | null
  conv1_to_2: number | null
  conv2_to_3: number | null
}

type PB = { product_id: number; branch: Branch }

/* =========================
   Minimal Modal component
========================= */
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
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 'min(900px,95vw)', maxHeight: '90vh', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ overflowY: 'auto', maxHeight: '65vh' }}>{children}</div>
        {footer && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* =========================
   Page
========================= */
export default function Products({ isAdmin = false }: { isAdmin?: boolean }) {
  /* -------- Admin gating -------- */
  const [canEdit, setCanEdit] = useState<boolean>(isAdmin)
  useEffect(() => { setCanEdit(isAdmin) }, [isAdmin])
  useEffect(() => {
    if (isAdmin) return
    ;(async () => {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id
      if (!uid) return
      const { data } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle()
      if (data?.role === 'admin') setCanEdit(true)
    })()
  }, [isAdmin])

  /* -------- Data -------- */
  const [rows, setRows] = useState<Product[]>([])
  const [pbRows, setPbRows] = useState<PB[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  /* -------- Search -------- */
  const [q, setQ] = useState('')

  /* -------- Create -------- */
  const [openCreate, setOpenCreate] = useState(false)
  const [newP, setNewP] = useState<Partial<Product>>({
    sku: '', name: '', is_active: true, price: 0,
    uom1_name: 'CTN', uom2_name: 'BOX', uom3_name: 'PCS',
    conv1_to_2: 6, conv2_to_3: 6,
  })
  const [newBranches, setNewBranches] =
    useState<Record<Branch, boolean>>({ JKP: true, BGR: false, TGR: false })

  /* -------- View -------- */
  const [openView, setOpenView] = useState(false)
  const [viewP, setViewP] = useState<Product | null>(null)

  /* -------- Edit (Modal) -------- */
  const [openEdit, setOpenEdit] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Partial<Product>>({})
  const [editBranches, setEditBranches] =
    useState<Record<Branch, boolean>>({ JKP: false, BGR: false, TGR: false })

  /* -------- Import -------- */
  const [openImport, setOpenImport] = useState(false)
  type ImportRow = {
    sku: string
    name?: string
    is_active?: string | number | boolean | null
    /** Price per UOM1 */
    price?: string | number | null
    uom1_name?: string | null
    uom2_name?: string | null
    uom3_name?: string | null
    conv1_to_2?: string | number | null
    conv2_to_3?: string | number | null
    branches?: string | null
    _branchesParsed?: Branch[]
  }
  const [parsed, setParsed] = useState<ImportRow[]>([])
  const [importErr, setImportErr] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  /* -------- Load data -------- */
  async function load() {
    setErr(null); setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, name, is_active, price, uom1_name, uom2_name, uom3_name, conv1_to_2, conv2_to_3')
      .order('name')
    if (error) { setErr(error.message); setLoading(false); return }
    setRows((data as any) || [])

    const { data: pb, error: ePB } = await supabase
      .from('product_branches')
      .select('product_id, branch')
    if (!ePB) setPbRows((pb as any) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  /* -------- Helpers -------- */
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(r =>
      (r.sku || '').toLowerCase().includes(term) ||
      (r.name || '').toLowerCase().includes(term)
    )
  }, [rows, q])

  function priceUom1(p: Product) { return Number(p.price) || 0 }
  function pricePCS(p: { price?: number | null; conv1_to_2?: number | null; conv2_to_3?: number | null }) {
    const c12 = Math.max(1, Number(p.conv1_to_2 || 1))
    const c23 = Math.max(1, Number(p.conv2_to_3 || 1))
    const total = c12 * c23
    const perPCS = total > 0 ? (Number(p.price) || 0) / total : (Number(p.price) || 0)
    return perPCS
  }
  function branchesForProduct(id: number) {
    return BRANCHES.filter(b => pbRows.some(x => x.product_id === id && x.branch === b))
  }

  /* -------- Edit flow -------- */
  function beginEdit(r: Product) {
    if (!canEdit) return
    setEditingId(r.id)
    setDraft({ ...r })
    const current = new Set(pbRows.filter(x => x.product_id === r.id).map(x => x.branch))
    setEditBranches({ JKP: current.has('JKP'), BGR: current.has('BGR'), TGR: current.has('TGR') })
    setOpenEdit(true)
  }
  function cancelEdit() {
    setEditingId(null)
    setDraft({})
    setEditBranches({ JKP: false, BGR: false, TGR: false })
  }
  async function saveEdit() {
    if (!canEdit || !editingId) return
    const payload = {
      sku: (draft.sku ?? '').trim(),
      name: (draft.name ?? '').trim(),
      is_active: !!draft.is_active,
      price: Math.max(0, Number(draft.price) || 0), // UOM1
      uom1_name: (draft.uom1_name ?? 'CTN') || 'CTN',
      uom2_name: (draft.uom2_name ?? 'BOX') || 'BOX',
      uom3_name: (draft.uom3_name ?? 'PCS') || 'PCS',
      conv1_to_2: Math.max(1, Number(draft.conv1_to_2) || 1),
      conv2_to_3: Math.max(1, Number(draft.conv2_to_3) || 1),
    }
    if (!payload.sku || !payload.name) return alert('SKU and Name are required')

    const { error } = await supabase.from('products').update(payload).eq('id', editingId)
    if (error) return alert(error.message)

    // branches
    const wanted = BRANCHES.filter(b => editBranches[b])
    const current = pbRows.filter(x => x.product_id === editingId).map(x => x.branch as Branch)
    const toAdd = wanted.filter(b => !current.includes(b)).map(b => ({ product_id: editingId, branch: b }))
    const toDel = current.filter(b => !wanted.includes(b))

    if (toAdd.length) {
      const { error: eAdd } = await supabase.from('product_branches').insert(toAdd)
      if (eAdd) return alert(eAdd.message)
    }
    if (toDel.length) {
      const { error: eDel } = await supabase.from('product_branches').delete().eq('product_id', editingId).in('branch', toDel)
      if (eDel) return alert(eDel.message)
    }

    await load()
    setOpenEdit(false)
    cancelEdit()
  }

  /* -------- Create flow -------- */
  async function createProduct() {
    if (!canEdit) return
    const p = {
      sku: (newP.sku ?? '').trim(),
      name: (newP.name ?? '').trim(),
      is_active: newP.is_active ?? true,
      price: Math.max(0, Number(newP.price) || 0), // per UOM1
      uom1_name: (newP.uom1_name ?? 'CTN') || 'CTN',
      uom2_name: (newP.uom2_name ?? 'BOX') || 'BOX',
      uom3_name: (newP.uom3_name ?? 'PCS') || 'PCS',
      conv1_to_2: Math.max(1, Number(newP.conv1_to_2) || 1),
      conv2_to_3: Math.max(1, Number(newP.conv2_to_3) || 1),
    }
    if (!p.sku || !p.name) return alert('SKU and Name are required')

    const { data: inserted, error: insErr } = await supabase
      .from('products')
      .insert([p])
      .select('id')
      .single()
    if (insErr) return alert(insErr.message)
    const pid = inserted?.id
    if (pid) {
      const wanted = BRANCHES.filter(b => newBranches[b]).map(b => ({ product_id: pid, branch: b }))
      if (wanted.length) {
        const { error: ePB } = await supabase.from('product_branches').insert(wanted)
        if (ePB) return alert(ePB.message)
      }
    }

    setOpenCreate(false)
    setNewP({
      sku: '', name: '', is_active: true, price: 0,
      uom1_name: 'CTN', uom2_name: 'BOX', uom3_name: 'PCS', conv1_to_2: 6, conv2_to_3: 6
    })
    setNewBranches({ JKP: true, BGR: false, TGR: false })
    await load()
  }

  /* -------- View flow -------- */
  function openViewModal(r: Product) { setViewP(r); setOpenView(true) }

  /* -------- Import helpers -------- */
  function downloadTemplate() {
    const headers = ['sku', 'name', 'is_active', 'price', 'uom1_name', 'uom2_name', 'uom3_name', 'conv1_to_2', 'conv2_to_3', 'branches']
    const sample = ['HT999', 'Sample Product', 'yes', '56000', 'CTN', 'BOX', 'PCS', '6', '6', 'JKP,BGR']
    const csv = [headers.join(','), sample.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'products-import-template.csv'; a.click()
    URL.revokeObjectURL(url)
  }
  function splitBranches(s?: string | null): Branch[] {
    if (!s) return []
    const parts = s.split(/[;,]/).map(x => x.trim().toUpperCase()).filter(Boolean)
    return BRANCHES.filter(b => parts.includes(b))
  }
  function normalizeBool(v: any): boolean {
    const s = String(v ?? '').trim().toLowerCase()
    if (['1', 'true', 'yes', 'y'].includes(s)) return true
    if (['0', 'false', 'no', 'n'].includes(s)) return false
    return s === '' ? true : false
  }
  function parseCsvText(text: string): ImportRow[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
    if (lines.length === 0) return []
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const out: ImportRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim())
      const row: any = {}
      headers.forEach((h, idx) => row[h] = cols[idx] ?? '')
      if (!row.sku) continue
      row._branchesParsed = splitBranches(row.branches)
      out.push(row as ImportRow)
    }
    return out
  }
  async function handleFile(f: File) {
    setImportErr(null)
    try {
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        try {
          // @ts-ignore
          const XLSX: any = await import('xlsx')
          const buf = await f.arrayBuffer()
          const wb = XLSX.read(buf, { type: 'array' })
          const sheet = wb.Sheets[wb.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json(sheet, { raw: false }) as any[]
          const mapped: ImportRow[] = json.map(row => ({
            sku: String(row.sku ?? row.SKU ?? '').trim(),
            name: row.name ?? row.Name ?? '',
            is_active: row.is_active ?? row.active ?? '',
            price: row.price ?? '',
            uom1_name: row.uom1_name ?? row.UOM1 ?? '',
            uom2_name: row.uom2_name ?? row.UOM2 ?? '',
            uom3_name: row.uom3_name ?? row.UOM3 ?? '',
            conv1_to_2: row.conv1_to_2 ?? row['1→2'] ?? row['1-2'] ?? '',
            conv2_to_3: row.conv2_to_3 ?? row['2→3'] ?? row['2-3'] ?? '',
            branches: row.branches ?? '',
          }))
          mapped.forEach(r => { r._branchesParsed = splitBranches(r.branches || '') })
          setParsed(mapped.filter(r => r.sku))
        } catch {
          setImportErr('XLSX parsing failed. Install: npm i xlsx. You can also import CSV.')
          setParsed([])
        }
      } else {
        const text = await f.text()
        setParsed(parseCsvText(text))
      }
    } catch (e: any) {
      setImportErr(e?.message || 'Failed to read file'); setParsed([])
    }
  }
  async function commitImport() {
    if (!canEdit) return
    if (parsed.length === 0) return alert('No rows to import.')
    setImportBusy(true)

    const { data: existing } = await supabase.from('products').select('id, sku')
    const bySku: Record<string, number> = {}
    ;(existing || []).forEach(p => { bySku[(p as any).sku] = (p as any).id })

    const inserts: any[] = []
    const updates: Array<{ id: number, payload: any, branches: Branch[] }> = []

    for (const r of parsed) {
      if (!r.sku) continue
      const payload = {
        sku: r.sku.trim(),
        name: String(r.name ?? '').trim(),
        is_active: normalizeBool(r.is_active),
        price: Math.max(0, Number(r.price ?? 0) || 0), // per UOM1
        uom1_name: (r.uom1_name ?? 'CTN') || 'CTN',
        uom2_name: (r.uom2_name ?? 'BOX') || 'BOX',
        uom3_name: (r.uom3_name ?? 'PCS') || 'PCS',
        conv1_to_2: Math.max(1, Number(r.conv1_to_2 ?? 1) || 1),
        conv2_to_3: Math.max(1, Number(r.conv2_to_3 ?? 1) || 1),
      }
      const branches = r._branchesParsed ?? []
      const id = bySku[payload.sku]
      if (id) updates.push({ id, payload, branches })
      else inserts.push(payload)
    }

    if (inserts.length) {
      const { data: ins, error: e1 } = await supabase.from('products').insert(inserts).select('id, sku')
      if (e1) { setImportBusy(false); return alert(e1.message) }
      (ins as any[]).forEach(p => { bySku[p.sku] = p.id })
    }

    for (const u of updates) {
      const { error } = await supabase.from('products').update(u.payload).eq('id', u.id)
      if (error) { setImportBusy(false); return alert(error.message) }
    }

    // replace branches for all affected rows
    const affected: Array<{ product_id: number, branches: Branch[] }> = []
    parsed.forEach(r => {
      const pid = bySku[r.sku]; if (!pid) return
      affected.push({ product_id: pid, branches: r._branchesParsed ?? [] })
    })
    for (const a of affected) {
      await supabase.from('product_branches').delete().eq('product_id', a.product_id)
      if (a.branches.length) {
        const payload = a.branches.map(b => ({ product_id: a.product_id, branch: b }))
        const { error } = await supabase.from('product_branches').insert(payload)
        if (error) { setImportBusy(false); return alert(error.message) }
      }
    }

    setImportBusy(false)
    setOpenImport(false)
    setParsed([])
    await load()
    alert('Import complete.')
  }

  /* =========================
     Render
  ========================= */
  return (
    <div className="grid">
      <div className="card">
        <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span>Products</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="small" style={{ opacity: .6 }}>Admin mode: {canEdit ? 'yes' : 'no'}</span>
            {canEdit && (
              <>
                <button className="btn" onClick={() => setOpenImport(true)}>Import</button>
                <button className="btn primary" onClick={() => setOpenCreate(true)}>+ New Product</button>
              </>
            )}
          </div>
        </h3>

        {/* Search */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Search by SKU or name…"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={() => setQ('')}>Clear</button>
        </div>

        {err && <div className="small" style={{ color: '#a00' }}>Error: {err}</div>}

        {loading ? 'Loading…' : (
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Active</th>
                <th>Price/CTN</th>
                <th>Branches</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const priceText = priceUom1(r).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })
                const branchesText = branchesForProduct(r.id).join(', ') || '—'
                return (
                  <tr key={r.id}>
                    <td>{r.sku}</td>
                    <td>{r.name}</td>
                    <td style={{ textAlign: 'center' }}>{r.is_active ? 'Yes' : 'No'}</td>
                    <td>{priceText}</td>
                    <td><span className="small" style={{ opacity: .8 }}>{branchesText}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {canEdit && <button className="btn" onClick={() => beginEdit(r)}>Edit</button>}
                        <button className="btn" onClick={() => openViewModal(r)}>View</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && <tr><td colSpan={6} className="small">No products.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Product Modal */}
      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="New Product"
        footer={canEdit ? (
          <>
            <button className="btn" onClick={() => setOpenCreate(false)}>Cancel</button>
            <button className="btn primary" onClick={createProduct}>Save</button>
          </>
        ) : null}
      >
        <div className="grid" style={{ gap: 10 }}>
          <div className="grid two">
            <input className="input" placeholder="SKU *" value={newP.sku ?? ''} onChange={e => setNewP(p => ({ ...p, sku: e.target.value }))} />
            <input className="input" placeholder="Name *" value={newP.name ?? ''} onChange={e => setNewP(p => ({ ...p, name: e.target.value }))} />
          </div>

          <div className="grid two">
            <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={newP.is_active ?? true} onChange={e => setNewP(p => ({ ...p, is_active: e.target.checked }))} />
              Active
            </label>
            <input className="input" type="number" step="0.01" placeholder="Price (per UOM1)" value={newP.price ?? 0} onChange={e => setNewP(p => ({ ...p, price: Number(e.target.value) || 0 }))} />
          </div>

          <div className="grid three">
            <input className="input" placeholder="UOM1 (e.g. CTN)" value={newP.uom1_name ?? ''} onChange={e => setNewP(p => ({ ...p, uom1_name: e.target.value }))} />
            <input className="input" placeholder="UOM2 (e.g. BOX)" value={newP.uom2_name ?? ''} onChange={e => setNewP(p => ({ ...p, uom2_name: e.target.value }))} />
            <input className="input" placeholder="UOM3 (e.g. PCS)" value={newP.uom3_name ?? ''} onChange={e => setNewP(p => ({ ...p, uom3_name: e.target.value }))} />
          </div>

          <div className="grid two">
            <input className="input" type="number" min={1} placeholder="1 → 2 (e.g. 6)" value={newP.conv1_to_2 ?? 1} onChange={e => setNewP(p => ({ ...p, conv1_to_2: Math.max(1, Number(e.target.value) || 1) }))} />
            <input className="input" type="number" min={1} placeholder="2 → 3 (e.g. 6)" value={newP.conv2_to_3 ?? 1} onChange={e => setNewP(p => ({ ...p, conv2_to_3: Math.max(1, Number(e.target.value) || 1) }))} />
          </div>

          <div className="small" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
            {BRANCHES.map(b => (
              <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!newBranches[b]} onChange={e => setNewBranches(s => ({ ...s, [b]: e.target.checked }))} />
                {b}
              </label>
            ))}
          </div>

          {/* Price/PCS helper */}
          <div className="small" style={{ opacity: .75 }}>
            ≈ {pricePCS({ price: newP.price, conv1_to_2: newP.conv1_to_2, conv2_to_3: newP.conv2_to_3 })
              .toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}
            {' '}per {newP.uom3_name || 'PCS'} (computed from price per {newP.uom1_name || 'CTN'})
          </div>
        </div>
      </Modal>

      {/* Edit Product Modal */}
      <Modal
        open={openEdit}
        onClose={() => { setOpenEdit(false); cancelEdit() }}
        title={draft.sku ? `Edit Product • ${draft.sku}` : 'Edit Product'}
        footer={canEdit ? (
          <>
            <button className="btn" onClick={() => { setOpenEdit(false); cancelEdit() }}>Cancel</button>
            <button className="btn primary" onClick={saveEdit}>Save</button>
          </>
        ) : null}
      >
        <div className="grid" style={{ gap: 10 }}>
          <div className="grid two">
            <input className="input" placeholder="SKU *" value={draft.sku ?? ''} onChange={e => setDraft(d => ({ ...d, sku: e.target.value }))} />
            <input className="input" placeholder="Name *" value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          </div>

          <div className="grid two">
            <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!!draft.is_active} onChange={e => setDraft(d => ({ ...d, is_active: e.target.checked }))} />
              Active
            </label>
            <input className="input" type="number" step="0.01" placeholder="Price (per UOM1)" value={draft.price ?? 0} onChange={e => setDraft(d => ({ ...d, price: Number(e.target.value) || 0 }))} />
          </div>

          <div className="grid three">
            <input className="input" placeholder="UOM1 (e.g. CTN)" value={draft.uom1_name ?? ''} onChange={e => setDraft(d => ({ ...d, uom1_name: e.target.value }))} />
            <input className="input" placeholder="UOM2 (e.g. BOX)" value={draft.uom2_name ?? ''} onChange={e => setDraft(d => ({ ...d, uom2_name: e.target.value }))} />
            <input className="input" placeholder="UOM3 (e.g. PCS)" value={draft.uom3_name ?? ''} onChange={e => setDraft(d => ({ ...d, uom3_name: e.target.value }))} />
          </div>

          <div className="grid two">
            <input className="input" type="number" min={1} placeholder="1 → 2 (e.g. 6)" value={draft.conv1_to_2 ?? 1} onChange={e => setDraft(d => ({ ...d, conv1_to_2: Math.max(1, Number(e.target.value) || 1) }))} />
            <input className="input" type="number" min={1} placeholder="2 → 3 (e.g. 6)" value={draft.conv2_to_3 ?? 1} onChange={e => setDraft(d => ({ ...d, conv2_to_3: Math.max(1, Number(e.target.value) || 1) }))} />
          </div>

          <div className="small" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
            {BRANCHES.map(b => (
              <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!editBranches[b]} onChange={e => setEditBranches(s => ({ ...s, [b]: e.target.checked }))} />
                {b}
              </label>
            ))}
          </div>

          {/* Price/PCS helper */}
          <div className="small" style={{ opacity: .75 }}>
            ≈ {pricePCS({ price: draft.price, conv1_to_2: draft.conv1_to_2, conv2_to_3: draft.conv2_to_3 })
              .toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}
            {' '}per {draft.uom3_name || 'PCS'} (computed from price per {draft.uom1_name || 'CTN'})
          </div>
        </div>
      </Modal>

      {/* View Product Modal */}
      <Modal
        open={openView}
        onClose={() => setOpenView(false)}
        title={viewP ? `Product • ${viewP.sku}` : 'Product'}
        footer={<button className="btn" onClick={() => setOpenView(false)}>Close</button>}
      >
        {!viewP ? null : (
          <div className="grid" style={{ gap: 10 }}>
            <div><b>SKU:</b> {viewP.sku}</div>
            <div><b>Name:</b> {viewP.name}</div>
            <div><b>Active:</b> {viewP.is_active ? 'Yes' : 'No'}</div>
            <div>
              <b>Price / {viewP.uom1_name || 'CTN'}:</b>{' '}
              {(Number(viewP.price) || 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}
              <span className="small" style={{ opacity: .7 }}>
                {' '} (≈ {pricePCS(viewP).toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}
                {' '} / {(viewP.uom3_name || 'PCS')})
              </span>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '6px 0' }} />
            <div className="grid three">
              <div><b>UOM1:</b> {viewP.uom1_name || '-'}</div>
              <div><b>UOM2:</b> {viewP.uom2_name || '-'}</div>
              <div><b>UOM3:</b> {viewP.uom3_name || '-'}</div>
            </div>
            <div className="grid two">
              <div><b>1 → 2:</b> {viewP.conv1_to_2 ?? '-'}</div>
              <div><b>2 → 3:</b> {viewP.conv2_to_3 ?? '-'}</div>
            </div>
            <div><b>Available Branches:</b> {branchesForProduct(viewP.id).join(', ') || '—'}</div>
          </div>
        )}
      </Modal>

      {/* Import Modal */}
      <Modal
        open={openImport}
        onClose={() => setOpenImport(false)}
        title="Import Products (CSV or XLSX)"
        footer={
          <>
            <button className="btn" onClick={downloadTemplate}>Download Template</button>
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={() => setOpenImport(false)}>Cancel</button>
            <button className="btn primary" disabled={!canEdit || parsed.length === 0 || importBusy} onClick={commitImport}>
              {importBusy ? 'Importing…' : 'Import'}
            </button>
          </>
        }
      >
        <div className="grid" style={{ gap: 10 }}>
          <div className="small" style={{ opacity: .8 }}>
            Columns: <code>sku,name,is_active,price,uom1_name,uom2_name,uom3_name,conv1_to_2,conv2_to_3,branches</code>.
            Branches can be separated by comma or semicolon (e.g. <code>JKP,BGR</code>).<br />
            <i>Note:</i> <code>price</code> is interpreted as <b>Price per UOM1 (CTN)</b>.
          </div>
          <input
            type="file" accept=".csv, .xlsx, .xls"
            onChange={e => {
              const f = e.target.files?.[0]
              if (!f) return
              handleFile(f)
            }}
          />
          {importErr && <div className="small" style={{ color: '#a00' }}>Import error: {importErr}</div>}
          {parsed.length > 0 && (
            <div className="card">
              <b>Preview ({parsed.length} rows)</b>
              <table className="table">
                <thead><tr><th>SKU</th><th>Name</th><th>Active</th><th>Price (UOM1)</th><th>Branches</th></tr></thead>
                <tbody>
                  {parsed.slice(0, 50).map((r, i) => (
                    <tr key={i}>
                      <td>{r.sku}</td>
                      <td>{r.name || <span className="small" style={{ opacity: .6 }}>—</span>}</td>
                      <td>{String(r.is_active ?? '')}</td>
                      <td>{r.price ?? ''}</td>
                      <td>{(r._branchesParsed ?? []).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 50 && <div className="small" style={{ opacity: .7, marginTop: 6 }}>Showing first 50 rows…</div>}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
