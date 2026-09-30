'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'

export default function LoginPage() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.style.colorScheme = 'light'
    document.body.classList.add('auth-page')
    document.body.style.backgroundColor = '#f8fafc'
    document.body.style.color = '#0f172a'
    return () => {
      document.body.classList.remove('auth-page')
    }
  }, [])

  useEffect(() => {
    // If already logged in, redirect to dashboard
    const checkSession = async () => {
      const staffSession = localStorage.getItem('staff_session')
      if (staffSession) {
        try {
          const sess = JSON.parse(staffSession)
          if (sess.expiresAt && Date.now() < sess.expiresAt) {
            localStorage.setItem('last_login_time', Date.now().toString()); window.location.replace('/dashboard')
            return
          }
        } catch {}
        localStorage.removeItem('staff_session')
        document.cookie = 'staff_session=; path=/; max-age=0'
      }
      // Check Supabase session - only auto-redirect if recently logged in
      const lastLoginTime = localStorage.getItem('last_login_time')
      const recentLogin = lastLoginTime && (Date.now() - parseInt(lastLoginTime)) < 10000
      if (recentLogin) {
        const { createClient } = await import('@/lib/supabase')
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          window.location.replace('/dashboard')
        }
      }
    }
    checkSession()
  }, [])
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(t.login_error)
      setLoading(false)
    } else {
      localStorage.removeItem('pin_lock_active'); localStorage.setItem('last_login_time', Date.now().toString()); router.push('/dashboard')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        padding: '2.5rem',
        borderRadius: '1.5rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px',
        margin: '1rem',
      }}>
        {/* Logo */}
        <div style={{textAlign:'center', marginBottom:'2rem'}}>
          <div style={{
            width:'56px', height:'56px', backgroundColor:'#2563eb',
            borderRadius:'16px', display:'flex', alignItems:'center',
            justifyContent:'center', margin:'0 auto 12px',
          }}>
            <span style={{color:'#fff', fontWeight:'bold', fontSize:'24px'}}>S</span>
          </div>
          <h1 style={{fontSize:'1.5rem', fontWeight:'700', color:'#0f172a', margin:0}}>Stillastock</h1>
          <p style={{fontSize:'0.875rem', color:'#64748b', marginTop:'4px'}}>Admin Login</p>
        </div>

        {error && (
          <div style={{
            backgroundColor:'#fef2f2', border:'1px solid #fecaca',
            borderRadius:'12px', padding:'12px', marginBottom:'1rem',
            color:'#dc2626', fontSize:'0.875rem', textAlign:'center',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{marginBottom:'1rem'}}>
            <label style={{display:'block', fontSize:'0.8rem', fontWeight:'600', color:'#374151', marginBottom:'6px'}}>
              {t.email}
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width:'100%', padding:'12px 16px', borderRadius:'12px',
                border:'2px solid #e2e8f0', fontSize:'0.9rem',
                color:'#0f172a', backgroundColor:'#f8fafc',
                outline:'none', boxSizing:'border-box',
              }}
              onFocus={e => { e.target.style.borderColor='#2563eb'; e.target.style.backgroundColor='#ffffff'; e.target.style.color='#0f172a' }}
              onBlur={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.backgroundColor='#f8fafc'; e.target.style.color='#0f172a' }}
              placeholder="admin@company.com"
            />
          </div>

          <div style={{marginBottom:'1.5rem'}}>
            <label style={{display:'block', fontSize:'0.8rem', fontWeight:'600', color:'#374151', marginBottom:'6px'}}>
              {t.password}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width:'100%', padding:'12px 16px', borderRadius:'12px',
                border:'2px solid #e2e8f0', fontSize:'0.9rem',
                color:'#0f172a', backgroundColor:'#f8fafc',
                outline:'none', boxSizing:'border-box',
              }}
              onFocus={e => { e.target.style.borderColor='#2563eb'; e.target.style.backgroundColor='#ffffff'; e.target.style.color='#0f172a' }}
              onBlur={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.backgroundColor='#f8fafc'; e.target.style.color='#0f172a' }}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width:'100%', padding:'14px', borderRadius:'12px',
              backgroundColor: loading ? '#93c5fd' : '#2563eb',
              color:'#ffffff', fontWeight:'700', fontSize:'0.95rem',
              border:'none', cursor: loading ? 'not-allowed' : 'pointer',
              transition:'all 0.15s',
            }}>
            {loading ? '...' : t.login_btn}
          </button>
        </form>

        <div style={{marginTop:'1rem', textAlign:'center'}}>
          <a href="/forgot-password" style={{fontSize:'0.8rem', color:'#2563eb', textDecoration:'none'}}>
            {t.forgot_password}
          </a>
        </div>

        <div style={{marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid #e2e8f0', textAlign:'center'}}>
          <a href="/staff-login" style={{
            display:'inline-block', padding:'10px 20px',
            backgroundColor:'#0f172a', color:'#ffffff',
            borderRadius:'12px', fontSize:'0.85rem',
            textDecoration:'none', fontWeight:'600',
          }}>
            👤 {t.staff_pin_login}
          </a>
        </div>
        <div style={{marginTop:'1rem', textAlign:'center'}}>
          <span style={{fontSize:'0.8rem', color:'#64748b'}}>Account မရှိသေးဘူးလား? </span>
          <a href="/signup" onClick={(e:any)=>{e.preventDefault();window.location.replace("/signup")}} style={{fontSize:'0.8rem', color:'#2563eb', fontWeight:'600', textDecoration:'none'}}>
            Sign Up →
          </a>
        </div>
      </div>
    </div>
  )
}
