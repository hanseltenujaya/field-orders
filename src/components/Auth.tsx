import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Auth({ recovering = false }: { recovering?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const initialMode = recovering || window.location.hash.includes('type=recovery') ? 'update' : 'signin'
  const [mode, setMode] = useState<'signin'|'signup'|'reset'|'update'>(initialMode)
  const [msg, setMsg] = useState<string | null>(null)

  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin
  if (!import.meta.env.VITE_APP_URL) {
    console.warn(
      'Missing VITE_APP_URL. Set it in your .env (local) and in Vercel → Project → Settings → Environment Variables.'
    )
  }

  useEffect(() => {
      if (recovering) setMode('update')
  }, [recovering])

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

  async function reset(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl })
      if (error) throw error
      setMsg('Check your email for the password reset link.')
    } catch (e:any) {
      setMsg(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function update(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setMsg('Password updated successfully. Please sign in.')
      setMode('signin')
      setPassword('')
    } catch (e:any) {
      setMsg(e.message)
    } finally {
      setLoading(false)
      setNewPassword('')
    }
  }


  return (
    <div className="card" style={{maxWidth:420, margin:'80px auto'}}>
      <h2>Field Orders — Login</h2>
            {mode==='reset' ? (
        <form onSubmit={reset} className="grid">
          <input className="input" placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
          <button className="btn primary" disabled={loading}>Send reset link</button>
        </form>
      ) : mode==='update' ? (
        <form onSubmit={update} className="grid">
          <input className="input" placeholder="new password" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} />
          <button className="btn primary" disabled={loading}>Update password</button>
        </form>
      ) : (
        <form onSubmit={submit} className="grid">
          <input className="input" placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="input" placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button className="btn primary" disabled={loading}>{mode==='signin'?'Sign in':'Sign up'}</button>
        </form>
      )}
      <div className="small" style={{marginTop:8}}>
        {mode==='signin' && <>
          No account? <button className="btn" onClick={()=>setMode('signup')}>Sign up</button>
          {' | '}<button className="btn" onClick={()=>setMode('reset')}>Forgot password?</button>
        </>}
        {mode==='signup' && <>Have an account? <button className="btn" onClick={()=>setMode('signin')}>Sign in</button></>}
        {mode==='reset' && <><button className="btn" onClick={()=>setMode('signin')}>Back to sign in</button></>}
      </div>
      {msg && <div className="small" style={{marginTop:8}}>{msg}</div>}
    </div>
  )
}
