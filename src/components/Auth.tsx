import React, { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin'|'signup'>('signin')
  const [msg, setMsg] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)
    try {
      if (mode==='signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg('Check your email to confirm the signup (if email confirmation is enabled).')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e:any) {
      setMsg(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{maxWidth:420, margin:'80px auto'}}>
      <h2>Field Orders — Login</h2>
      <form onSubmit={submit} className="grid">
        <input className="input" placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="input" placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="btn primary" disabled={loading}>{mode==='signin'?'Sign in':'Sign up'}</button>
      </form>
      <div className="small" style={{marginTop:8}}>
        {mode==='signin' ? <>No account? <button className="btn" onClick={()=>setMode('signup')}>Sign up</button></> :
          <>Have an account? <button className="btn" onClick={()=>setMode('signin')}>Sign in</button></>}
      </div>
      {msg && <div className="small" style={{marginTop:8}}>{msg}</div>}
    </div>
  )
}
