import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import Orders from './components/Orders'
import Customers from './components/Customers'
import Products from './components/Products'
import AdminBoard from './components/AdminBoard'
import Nav from './components/Nav'
import Users from './components/Users'

type Branch = 'JKP' | 'BGR' | 'TGR'
type Role = 'sales' | 'admin'
type MyProfile = {
  id: string
  full_name: string | null
  role: Role | null
  branch: Branch | null
}

type Tab = 'sales' | 'admin' | 'customers' | 'products' | 'users' | 'about'

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('sales')
  const [recovering, setRecovering] = useState(false)

  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [profileErr, setProfileErr] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState<boolean>(true)

  // Keep Supabase session in state
  useEffect(() => {
    let unsub: (() => void) | undefined

    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess)
      setRecovering(event === 'PASSWORD_RECOVERY')
    })
    unsub = () => sub?.subscription?.unsubscribe()

    return () => { unsub?.() }
  }, [])

  // Read-or-create current user's profile safely
  useEffect(() => {
    ;(async () => {
      setLoadingProfile(true)
      setProfileErr(null)

      try {
        const { data: u, error: uerr } = await supabase.auth.getUser()
        if (uerr) throw new Error(uerr.message)
        const uid = u.user?.id
        if (!uid) {
          setProfile(null)
          setLoadingProfile(false)
          return
        }

        // 1) Try read (safe if 0 rows)
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, role, branch')
          .eq('id', uid)
          .maybeSingle()

        if (error) {
          setProfile(null)
          setProfileErr(error.message)
          setLoadingProfile(false)
          return
        }

        if (data) {
          setProfile(data as MyProfile)
          setLoadingProfile(false)
          return
        }

        // 2) No row yet → try to create minimal row
        const { error: insErr } = await supabase
          .from('profiles')
          .insert([{ id: uid }])

        if (insErr) {
          // Likely RLS blocking insert (until you add the signup trigger/policies)
          setProfile(null)
          setProfileErr('Profile row missing and could not be created automatically. Ask an admin to enable the signup trigger or add your profile.')
          setLoadingProfile(false)
          return
        }

        // 3) Read back after insert
        const { data: fresh, error: rerr } = await supabase
          .from('profiles')
          .select('id, full_name, role, branch')
          .eq('id', uid)
          .maybeSingle()

        if (rerr) {
          setProfile(null)
          setProfileErr(rerr.message)
        } else {
          setProfile((fresh ?? null) as MyProfile | null)
        }
      } catch (e: any) {
        setProfile(null)
        setProfileErr(e?.message || 'Failed to load profile')
      } finally {
        setLoadingProfile(false)
      }
    })()
  }, [session])

  if (!session || recovering) return <Auth recovering={recovering} />

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isAdmin = profile?.role === 'admin'
  const branchLabel = profile?.branch ?? '—'
  const roleLabel = profile?.role ?? '—'
  const nameLabel = profile?.full_name || 'User'

  return (
    <div className="container">
      {/* Header */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', margin:'12px 0'}}>
        <h2>Field Orders</h2>
        <div className="small" style={{display:'flex', alignItems:'center', gap:8}}>
          {loadingProfile
            ? 'Loading profile…'
            : profile
              ? <>{nameLabel} • {branchLabel} • {roleLabel}</>
              : <span style={{color:'#7a5d00'}}>Profile pending</span>}
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {/* Global profile errors / info */}
      {profileErr && (
        <div className="card" style={{background:'#fff3f3', borderColor:'#f5c2c2', color:'#a30000', marginBottom:12}}>
          <b>Profile error:</b> {profileErr}
        </div>
      )}
      {!profileErr && !loadingProfile && !profile && (
        <div className="card" style={{background:'#fff9e6', borderColor:'#ffe8a1', color:'#7a5d00', marginBottom:12}}>
          We created (or tried to create) your profile. Ask an admin to assign your <b>Branch</b> and <b>Role</b> in the <b>Users</b> tab.
        </div>
      )}

      {/* Nav (Users tab hidden for non-admins) */}
      <Nav tab={tab} setTab={setTab} isAdmin={isAdmin} />

      {/* Pages */}
      <div className="grid">
        {tab === 'sales' && <Orders />}

        {tab === 'admin' && (
          isAdmin ? <AdminBoard /> : <div className="card">You must be an admin to view this page.</div>
        )}

        {tab === 'customers' && <Customers isAdmin={isAdmin} />}

        {/* pass isAdmin so Edit appears */}
        {tab === 'products' && <Products isAdmin={isAdmin} />}

        {tab === 'users' && (
          isAdmin ? <Users /> : <div className="card">You must be an admin to view this page.</div>
        )}

        {tab === 'about' && (
          <div className="card">
            <h3>About</h3>
            <ul>
              <li>Branch-based access control: JKP / BGR / TGR</li>
              <li>Admins assign Branch & Role in the Users tab</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}