import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

type Branch = 'JKP' | 'BGR' | 'TGR'
type Role = 'sales' | 'admin'

type Profile = {
  id: string
  full_name: string
  role: Role
  branch: Branch
}

const BRANCHES: Branch[] = ['JKP', 'BGR', 'TGR']
const ROLES: Role[] = ['sales', 'admin']

function normalizeProfile(r: any): Profile {
  const role: Role = r?.role === 'admin' ? 'admin' : 'sales'
  const branch: Branch =
    r?.branch === 'BGR' ? 'BGR' : r?.branch === 'TGR' ? 'TGR' : 'JKP'
  return {
    id: String(r.id),
    full_name: r?.full_name ?? '',
    role,
    branch,
  }
}

export default function Users() {
  const [rows, setRows] = useState<Profile[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [q, setQ] = useState('')

  async function load() {
    setErr(null)
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, branch, created_at')
      .order('created_at', { ascending: true })

    setLoading(false)
    if (error) return setErr(error.message)

    const normalized = (data ?? []).map(normalizeProfile)
    setRows(normalized)
  }

  useEffect(() => { load() }, [])

  async function saveRow(p: Profile) {
    setSavingId(p.id)
    const payload = {
      id: p.id,
      full_name: p.full_name?.trim() || null,
      role: p.role,
      branch: p.branch,
    }
    // upsert creates the row if missing, updates if exists
    const { error } = await supabase
      .from('profiles')
      .upsert([payload], { onConflict: 'id' })

    setSavingId(null)
    if (error) return alert(error.message)
    await load()
  }

  const filtered = rows.filter(r => {
    if (!q.trim()) return true
    const hay = `${r.full_name} ${r.role} ${r.branch} ${r.id}`.toLowerCase()
    return hay.includes(q.toLowerCase())
  })

  return (
    <div className="grid">
      <div className="card">
        <h3>Users (Admin)</h3>

        <div style={{display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px'}}>
          <input
            className="input"
            placeholder="Search name/id/role/branch…"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{maxWidth:360}}
          />
          <button className="btn" onClick={load} disabled={loading}>Refresh</button>
          <span className="small" style={{marginLeft:'auto'}}>
            {loading ? 'Loading…' : `${filtered.length} user(s)`}
          </span>
        </div>

        {err && (
          <div className="card" style={{background:'#fff3f3', borderColor:'#f5c2c2', color:'#a30000', marginBottom:12}}>
            <b>Error:</b> {err}
          </div>
        )}

        <div className="card" style={{padding:0}}>
          <table className="table">
            <thead>
              <tr>
                <th style={{minWidth:180}}>User ID</th>
                <th style={{minWidth:160}}>Name</th>
                <th style={{width:120}}>Branch</th>
                <th style={{width:120}}>Role</th>
                <th style={{width:140}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => (
                <tr key={p.id}>
                  <td className="small" style={{maxWidth:280, overflowWrap:'anywhere'}}>{p.id}</td>
                  <td>
                    <input
                      className="input"
                      value={p.full_name}
                      onChange={e => setRows(xs => xs.map((x,i)=> i===idx ? {...x, full_name: e.target.value} : x))}
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      value={p.branch}
                      onChange={e => setRows(xs => xs.map((x,i)=> i===idx ? {...x, branch: e.target.value as Branch} : x))}
                    >
                      {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      className="input"
                      value={p.role}
                      onChange={e => setRows(xs => xs.map((x,i)=> i===idx ? {...x, role: e.target.value as Role} : x))}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn primary"
                      disabled={savingId === p.id}
                      onClick={() => saveRow(p)}
                    >
                      {savingId === p.id ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="small">
                    No users found. Ask the salesperson to sign up first, then assign their Branch & Role here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="small" style={{marginTop:8}}>
          Tip: Branch codes are <b>JKP</b>, <b>BGR</b>, and <b>TGR</b>. Set <b>Role</b> to <b>sales</b> for salespeople or <b>admin</b> for administrators.
        </div>
      </div>
    </div>
  )
}
