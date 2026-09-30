'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

const SESSION_HOURS = 8
const COMPANY_EMAIL_KEY = 'staff_company_email'
const COMPANY_NAME_KEY = 'staff_company_name'

export default function StaffLoginPage() {
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
    const staffSession = localStorage.getItem('staff_session')
    if (staffSession) {
      try {
        const sess = JSON.parse(staffSession)
        if (sess.expiresAt && Date.now() < sess.expiresAt) {
          window.location.replace('/dashboard')
          return
        }
      } catch {}
      localStorage.removeItem('staff_session')
      document.cookie = 'staff_session=; path=/; max-age=0'
    }
  }, [])
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()

  const [step, setStep] = useState<'email' | 'login'>('email')
  const [adminEmail, setAdminEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyLogo, setCompanyLogo] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)

  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)

  // Check existing session + saved email
  useEffect(() => {
    const existing = localStorage.getItem('staff_session')
    if (existing) {
      try {
        const sess = JSON.parse(existing)
        const hoursElapsed = (Date.now() - sess.loginAt) / (1000 * 60 * 60)
        if (hoursElapsed < SESSION_HOURS) { router.push('/dashboard'); return }
        else { localStorage.removeItem('staff_session') }
      } catch { localStorage.removeItem('staff_session') }
    }

    // Check saved company email
    const savedEmail = localStorage.getItem(COMPANY_EMAIL_KEY)
    const savedName = localStorage.getItem(COMPANY_NAME_KEY)
    if (savedEmail) {
      setAdminEmail(savedEmail)
      if (savedName) setCompanyName(savedName)
      setStep('login')
    }
    setPageLoading(false)
  }, [])

  // Verify admin email → get company
  const handleEmailSubmit = async () => {
    if (!adminEmail.trim()) { setEmailError('Email ထည့်ပါ'); return }
    setEmailLoading(true); setEmailError('')
    // Use RPC to find company by email
    const { data: compData } = await supabase.rpc('get_company_by_admin_email', {
      p_email: adminEmail.trim().toLowerCase()
    })

    if (!compData?.found) {
      setEmailError('ဒီ Email နဲ့ ဆက်စပ်တဲ့ Company မတွေ့ပါ')
      setEmailLoading(false); return
    }

    setCompanyName(compData.company_name || '')
    setCompanyLogo(compData.logo_url || '')
    localStorage.setItem(COMPANY_EMAIL_KEY, adminEmail.trim().toLowerCase())
    localStorage.setItem(COMPANY_NAME_KEY, compData.company_name || '')
    setStep('login')
    setEmailLoading(false)
  }

  const handleLogin = useCallback(async () => {
    if (!username.trim() || pin.length !== 4) return
    setLoading(true); setError('')

    // Rate limit check
    try {
      const rl = await fetch('/api/rate-limit', { method: 'POST' })
      const rlData = await rl.json()
      if (rlData.blocked) {
        setError(`ကြိုးစားမှု အများဆုံး ကျော်လွန်သည်။ ${rlData.retryAfter} စက္ကန့် စောင့်ပါ`)
        setPin(''); setLoading(false); return
      }
    } catch {}

    const savedEmail = localStorage.getItem(COMPANY_EMAIL_KEY) || adminEmail
    const { data, error: rpcError } = await supabase.rpc('verify_staff_by_company', {
      p_admin_email: savedEmail,
      p_username: username.trim(),
      p_pin: pin,
    })

    if (rpcError || !data?.success) {
      setError(data?.error || 'Username သို့မဟုတ် PIN မှားနေသည်')
      setPin(''); setLoading(false); return
    }

    const secureToken = data.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    const sessionData = JSON.stringify({
      id: data.id, name: data.name, role: data.role, role_id: data.role_id,
      permissions: data.permissions, company_id: data.company_id, pin_verified: true,
      loginAt: Date.now(),
      expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
    })
    localStorage.setItem('staff_session', sessionData)
    document.cookie = `staff_session=${secureToken}; path=/; max-age=${SESSION_HOURS * 3600}; SameSite=Lax`
    router.push('/dashboard')
    setLoading(false)
  }, [username, pin, adminEmail])

  useEffect(() => { if (pin.length === 4) handleLogin() }, [pin, handleLogin])

  const handlePinInput = (num: string) => { if (pin.length < 4) setPin(prev => prev + num) }
  const handleDelete = () => setPin(prev => prev.slice(0, -1))
  const handleClear = () => setPin('')
  const handleChangeCompany = () => {
    localStorage.removeItem(COMPANY_EMAIL_KEY)
    localStorage.removeItem(COMPANY_NAME_KEY)
    setStep('email'); setUsername(''); setPin(''); setError('')
  }

  if (pageLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)'}}>
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{background:'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', fontFamily:'Inter, system-ui, sans-serif'}}>

      {/* Logo */}
      <div className="mb-8 text-center">
        {companyLogo ? (
          <img src={companyLogo} alt="logo" className="w-16 h-16 rounded-2xl object-contain mx-auto mb-3 shadow-md"/>
        ) : (
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
            <span className="text-white font-bold text-2xl">
              {companyName ? companyName.charAt(0).toUpperCase() : 'S'}
            </span>
          </div>
        )}
        <h1 className="text-2xl font-bold text-slate-800">{companyName || 'Stillastock'}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {step === 'email' ? 'Company Email ထည့်ပါ' : 'Staff Login'}
        </p>
      </div>

      <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden">

        {/* Step 1: Email */}
        {step === 'email' && (
          <div className="p-8">
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Admin Email</label>
              <input
                type="email"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()}
                placeholder="owner@company.com"
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors"
                autoFocus
              />
              {emailError && <p className="text-red-500 text-xs mt-2">{emailError}</p>}
              <p className="text-slate-400 text-xs mt-2">Admin ရဲ့ email ကို Company ID အဖြစ် သုံးပါ</p>
            </div>
            <button onClick={handleEmailSubmit} disabled={emailLoading || !adminEmail.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50">
              {emailLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                  စစ်ဆေးနေသည်...
                </span>
              ) : 'ဆက်လက်ဆောင်ရွက်မည် →'}
            </button>
          </div>
        )}

        {/* Step 2: Username + PIN */}
        {step === 'login' && (
          <div className="p-6">
            {/* Company badge */}
            <div className="flex items-center justify-between mb-5 px-3 py-2 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-center gap-2">
                <span className="text-blue-500 text-sm">🏢</span>
                <span className="text-blue-700 text-sm font-medium">{companyName || adminEmail}</span>
              </div>
              <button onClick={handleChangeCompany} className="text-xs text-slate-400 hover:text-red-500 transition-colors">
                ပြောင်း
              </button>
            </div>

            {/* Username */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="ဝန်ထမ်း နာမည် / Username"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors"
                autoFocus
              />
            </div>

            {/* PIN Display */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">PIN</label>
              <div className="flex justify-center gap-3 py-3">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${
                    pin.length > i ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50'
                  }`}>
                    {pin.length > i && <div className="w-3 h-3 bg-blue-600 rounded-full"/>}
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs text-center">
                {error}
              </div>
            )}

            {/* PIN Pad */}
            <div className="grid grid-cols-3 gap-2">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} onClick={() => handlePinInput(n.toString())} disabled={loading}
                  className="h-12 rounded-xl bg-slate-50 hover:bg-blue-50 active:bg-blue-100 active:scale-95
                    border border-slate-200 text-slate-700 font-semibold text-lg transition-all disabled:opacity-50">
                  {n}
                </button>
              ))}
              <button onClick={handleClear} disabled={loading}
                className="h-12 rounded-xl bg-slate-50 hover:bg-red-50 active:scale-95 border border-slate-200 text-slate-400 text-sm font-medium transition-all">
                CLR
              </button>
              <button onClick={() => handlePinInput('0')} disabled={loading}
                className="h-12 rounded-xl bg-slate-50 hover:bg-blue-50 active:bg-blue-100 active:scale-95
                  border border-slate-200 text-slate-700 font-semibold text-lg transition-all disabled:opacity-50">
                0
              </button>
              <button onClick={handleDelete} disabled={loading}
                className="h-12 rounded-xl bg-slate-50 hover:bg-orange-50 active:scale-95 border border-slate-200 text-slate-400 text-xl transition-all">
                ⌫
              </button>
            </div>

            {loading && (
              <div className="mt-4 flex items-center justify-center gap-2 text-blue-600 text-sm">
                <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                စစ်ဆေးနေသည်...
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-6 text-slate-400 text-xs">Session valid for {SESSION_HOURS} hours</p>
      <a href="/login" onClick={(e:any)=>{e.preventDefault();window.location.replace("/login")}} className="mt-2 text-xs text-slate-400 hover:text-blue-600 transition-colors">
        Admin Login →
      </a>
    </div>
  )
}
