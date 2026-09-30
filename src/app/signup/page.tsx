'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function SignupPage() {
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError('Password မတူပါ'); return }
    if (password.length < 6) { setError('Password အနည်းဆုံး ၆ လုံး ထည့်ပါ'); return }
    if (!companyName.trim()) { setError('Company နာမည် ထည့်ပါ'); return }
    setLoading(true)

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          companyName: companyName.trim(),
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(result.error || 'Signup failed')
        setLoading(false)
        return
      }
      setSuccess(true)
      setLoading(false)
      setTimeout(() => window.location.replace('/login'), 3000)
    } catch (err: any) {
      setError('Network error: ' + (err.message || 'unknown'))
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: '12px',
    border: '2px solid #e2e8f0', fontSize: '0.9rem',
    color: '#0f172a', backgroundColor: '#ffffff',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',fontFamily:'Inter, system-ui, sans-serif'}}>
      <div style={{backgroundColor:'#ffffff',padding:'2.5rem',borderRadius:'1.5rem',boxShadow:'0 20px 60px rgba(0,0,0,0.1)',width:'100%',maxWidth:'420px',margin:'1rem'}}>
        <div style={{textAlign:'center',marginBottom:'2rem'}}>
          <div style={{width:'56px',height:'56px',backgroundColor:'#2563eb',borderRadius:'16px',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
            <span style={{color:'#fff',fontWeight:'bold',fontSize:'24px'}}>S</span>
          </div>
          <h1 style={{fontSize:'1.5rem',fontWeight:'700',color:'#0f172a',margin:0}}>Stillastock</h1>
          <p style={{fontSize:'0.875rem',color:'#64748b',marginTop:'4px'}}>အကောင့်အသစ် ဖွင့်ပါ</p>
        </div>

        {success ? (
          <div style={{backgroundColor:'#f0fdf4',border:'1px solid #86efac',borderRadius:'12px',padding:'20px',textAlign:'center'}}>
            <div style={{fontSize:'2rem',marginBottom:'8px'}}>✅</div>
            <p style={{color:'#16a34a',fontWeight:'600',fontSize:'0.95rem'}}>အကောင့် တည်ဆောက်ပြီးပါပြီ!</p>
            <p style={{color:'#64748b',fontSize:'0.8rem',marginTop:'4px'}}>Login page သို့ ပြန်သွားနေသည်...</p>
          </div>
        ) : (
          <>
            {error && (
              <div style={{backgroundColor:'#fef2f2',border:'1px solid #fecaca',borderRadius:'10px',padding:'12px',marginBottom:'1rem',color:'#dc2626',fontSize:'0.85rem'}}>
                {error}
              </div>
            )}
            <form onSubmit={handleSignup}>
              <div style={{marginBottom:'1rem'}}>
                <label style={{display:'block',fontSize:'0.8rem',fontWeight:'600',color:'#374151',marginBottom:'6px'}}>Company နာမည် *</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} required style={inp}
                  placeholder="ဥပမာ: Star Light Trading" />
              </div>
              <div style={{marginBottom:'1rem'}}>
                <label style={{display:'block',fontSize:'0.8rem',fontWeight:'600',color:'#374151',marginBottom:'6px'}}>Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inp}
                  placeholder="admin@company.com" />
              </div>
              <div style={{marginBottom:'1rem'}}>
                <label style={{display:'block',fontSize:'0.8rem',fontWeight:'600',color:'#374151',marginBottom:'6px'}}>Password *</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inp}
                  placeholder="အနည်းဆုံး ၆ လုံး" />
              </div>
              <div style={{marginBottom:'1.5rem'}}>
                <label style={{display:'block',fontSize:'0.8rem',fontWeight:'600',color:'#374151',marginBottom:'6px'}}>Password အတည်ပြု *</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required style={inp}
                  placeholder="Password ထပ်ရိုက်ပါ" />
              </div>
              <button type="submit" disabled={loading}
                style={{width:'100%',padding:'14px',borderRadius:'12px',backgroundColor:loading?'#93c5fd':'#2563eb',color:'#ffffff',fontWeight:'700',fontSize:'0.95rem',border:'none',cursor:loading?'not-allowed':'pointer'}}>
                {loading ? 'တည်ဆောက်နေသည်...' : '🚀 အကောင့် ဖွင့်မည်'}
              </button>
            </form>
            <div style={{marginTop:'1.5rem',paddingTop:'1rem',borderTop:'1px solid #e2e8f0',textAlign:'center'}}>
              <span style={{fontSize:'0.8rem',color:'#64748b'}}>အကောင့် ရှိပြီးသားလား? </span>
              <a href="/login" onClick={e=>{e.preventDefault();window.location.replace('/login')}}
                style={{fontSize:'0.8rem',color:'#2563eb',fontWeight:'600',textDecoration:'none'}}>
                Login ဝင်ပါ →
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
