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
  role: Role
  branch: Branch
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [tab, setTab] = useState<'sales'|'admin'|'customers'|'products'|'users'|'about'>('sales')
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [profileErr, setProfileErr] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState<boolean>(true)

  // Keep Supabase session in state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Load current user's profile (role + branch)
  useEffect(() => {
    (async () => {
      setLoadingProfile(true)
      setProfileErr(null)
      try {
        const { data: u } = await supabase.auth.getUser()
        const uid = u.user?.id
        if (!uid) { setLoadingProfile(false); return }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, role, branch')
          .eq('id', uid)
          .single()

        if (error) setProfileErr(error.message)
        else setProfile(data as MyProfile)
      } catch (e: any) {
        setProfileErr(e?.message || 'Failed to load profile')
      } finally {
        setLoadingProfile(false)
      }
    })()
  }, [session])

  if (!session) return <Auth />

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="container">
      {/* Header */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', margin:'12px 0'}}>
        <h2>Field Orders</h2>
        <div className="small">
          {loadingProfile
            ? 'Loading profile…'
            : profile
              ? <>{profile.full_name || 'User'} • {profile.branch} • {profile.role}</>
              : <span style={{color:'#a00'}}>Profile not found</span>}
          <button className="btn" onClick={signOut} style={{marginLeft:8}}>Sign out</button>
        </div>
      </div>

      {profileErr && (
        <div className="card" style={{background:'#fff3f3', borderColor:'#f5c2c2', color:'#a30000', marginBottom:12}}>
          <b>Profile error:</b> {profileErr}
        </div>
      )}

      {/* Nav with admin-only Users tab */}
      <Nav tab={tab} setTab={setTab} isAdmin={isAdmin} />

      {/* Pages */}
      <div className="grid">
        {tab==='sales' && <Orders />}
        {tab==='admin' && <AdminBoard />}
        {tab==='customers' && <Customers isAdmin={isAdmin} />}
        {tab==='products' && <Products />}
        {isAdmin && tab==='users' && <Users />}
        {tab==='about' && (
          <div className="card">
            <h3>About</h3>
            <ul>
              <li>Branch-based access control: JKP / BGR / TGR</li>
              <li>Admins can set Branch & Role in the Users tab</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
