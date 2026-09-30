'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Sidebar from './Sidebar'
import LangSwitcher from '@/components/ui/LangSwitcher'
import { startSupabasePing } from '@/lib/keepalive'
import { createClient } from '@/lib/supabase'

// Helper: notify ChatBubble (and anyone else) when lock state changes
function dispatchLockChange(locked: boolean) {
  try {
    window.dispatchEvent(
      new CustomEvent('pin_lock_change', { detail: { locked } })
    )
  } catch {}
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showPinLock, setShowPinLock] = useState(false)
  const [pinLoading, setPinLoading] = useState(false)
  const [pinUnlocking, setPinUnlocking] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null)
  const INACTIVITY_MINUTES = 15

  const lockNow = useCallback(() => {
    localStorage.setItem('pin_lock_active', '1')
    setShowPinLock(true)
    dispatchLockChange(true)
  }, [])

  const unlockNow = useCallback(() => {
    localStorage.removeItem('pin_lock_active')
    setShowPinLock(false)
    setPinInput('')
    setPinError('')
    setPinLoading(false)
    setPinUnlocking(false)
    dispatchLockChange(false)
  }, [])

  const resetTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    inactivityTimer.current = setTimeout(() => {
      lockNow()
    }, INACTIVITY_MINUTES * 60 * 1000)
  }, [lockNow])

  // ── PIN Unlock ──────────────────────────────────────────────────────────────
  const handlePinUnlock = async () => {
    setPinError('')
    setPinLoading(true)
    setPinUnlocking(true)
    const supabase = createClient()

    // 0000 = admin/owner bypass — with specific error reporting
    if (pinInput === '0000') {
      let reason = ''
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          reason = 'Session ပြတ်သွားပြီ — ပြန် login လုပ်ပါ'
        } else {
          const { data: p, error: pErr } = await supabase
            .from('profiles')
            .select('role')
            .eq('auth_user_id', session.user.id)
            .maybeSingle()
          if (pErr) {
            console.error('[PIN] profile fetch error:', pErr)
            reason = 'Profile ဖတ်လို့မရပါ — RLS စစ်ပါ'
          } else if (!p) {
            reason = 'Profile မရှိပါ'
          } else {
            const role = (p.role || '').toLowerCase()
            if (role === 'admin' || role === 'owner') {
              unlockNow()
              resetTimer()
              return
            }
            reason = `Role "${p.role || '(empty)'}" က admin/owner မဟုတ်ပါ`
          }
        }
      } catch (e: any) {
        console.error('[PIN] 0000 check exception:', e)
        reason = e?.message || 'Unknown error'
      }
      setPinError(reason || 'PIN မှားသည်')
      setPinInput('')
      setPinLoading(false)
      setPinUnlocking(false)
      return
    }

    // Normal PIN verify via RPC
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setPinError('Session ပြတ်သွားပြီ — ပြန် login လုပ်ပါ')
        setPinInput('')
        setPinLoading(false)
        setPinUnlocking(false)
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()

      if (!profile) {
        setPinError('Profile မရှိပါ')
        setPinInput('')
        setPinLoading(false)
        setPinUnlocking(false)
        return
      }

      const { data: v, error: vErr } = await supabase.rpc('verify_staff_pin', {
        p_profile_id: profile.id,
        p_pin: pinInput,
      })

      if (!vErr && v === true) {
        unlockNow()
        resetTimer()
        return
      }
    } catch (e) {
      console.error('[PIN] verify exception:', e)
    }

    setPinError('PIN မှားသည်')
    setPinInput('')
    setPinLoading(false)
    setPinUnlocking(false)
  }

  // ── Inactivity timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (showPinLock) return
    resetTimer()
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, resetTimer))
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [resetTimer, showPinLock])

  // ── Page-load PIN lock check ────────────────────────────────────────────────
  // If pin_lock_active=1 but no session, clear the stale flag (user can't unlock
  // anyway without a session — let auth flow handle redirect to login).
  useEffect(() => {
    if (localStorage.getItem('pin_lock_active') !== '1') return
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session?.user) {
          // Stale lock without session — clear it
          localStorage.removeItem('pin_lock_active')
          dispatchLockChange(false)
          return
        }
        setShowPinLock(true)
        dispatchLockChange(true)
      } catch {
        // On any error, clear stale lock to avoid trapping user
        localStorage.removeItem('pin_lock_active')
        dispatchLockChange(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── Defensive auth listener — JWT failure → PIN lock fallback ──────────────
  // Catches Supabase auth state changes (signed out, token refresh failed).
  // When admin auth fails, trigger PIN lock so user sees graceful re-entry UI
  // instead of raw error toasts on pages. Staff sessions (localStorage 8h)
  // are honored — if staff session still valid, don't lock for admin events.
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // SIGNED_OUT or TOKEN_REFRESHED without session = admin auth failed
        const authFailed =
          event === 'SIGNED_OUT' ||
          (event === 'TOKEN_REFRESHED' && !session)
        if (!authFailed) return

        // If staff session still valid, don't lock (staff uses different auth)
        try {
          const staffSession = localStorage.getItem('staff_session')
          if (staffSession) {
            const sess = JSON.parse(staffSession)
            if (sess.expiresAt && Date.now() < sess.expiresAt) return
          }
        } catch {}

        // Admin auth failed — trigger PIN lock for graceful re-entry
        lockNow()
      }
    )
    return () => {
      subscription.unsubscribe()
    }
  }, [lockNow])

  // ── Periodic JWT health check (backup safety net) ──────────────────────────
  // Runs every 60s + on tab visibility change (catches wake-from-sleep,
  // background → foreground). If JWT is about to expire, forces a refresh;
  // if refresh fails or session is gone, triggers PIN lock.
  useEffect(() => {
    const supabase = createClient()
    const HEALTH_CHECK_MS = 60_000

    const check = async () => {
      // Skip if already locked
      if (localStorage.getItem('pin_lock_active') === '1') return

      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          console.warn('[AuthHealth] getSession error:', error.message)
          return
        }
        if (!session) {
          // No admin session — check if staff session is valid
          try {
            const staffSession = localStorage.getItem('staff_session')
            if (staffSession) {
              const sess = JSON.parse(staffSession)
              if (sess.expiresAt && Date.now() < sess.expiresAt) return
            }
          } catch {}
          // Neither admin nor valid staff — trigger lock
          lockNow()
          return
        }

        // Check JWT expiry (Supabase exposes expires_at as unix seconds)
        if (typeof session.expires_at === 'number') {
          const expiresInMs = session.expires_at * 1000 - Date.now()
          if (expiresInMs < 30_000 && expiresInMs > -60_000) {
            // About to expire — force refresh now
            const { error: refreshErr } = await supabase.auth.refreshSession()
            if (refreshErr) {
              console.warn('[AuthHealth] refresh failed:', refreshErr.message)
              lockNow()
            }
          } else if (expiresInMs < -60_000) {
            // Already expired by >60s — refresh definitely missed, lock
            console.warn('[AuthHealth] JWT expired by', Math.abs(expiresInMs / 1000), 'seconds')
            lockNow()
          }
        }
      } catch (err) {
        console.warn('[AuthHealth] check threw:', err)
      }
    }

    const interval = setInterval(check, HEALTH_CHECK_MS)
    // Immediate check on mount (catches wake-from-sleep on page load)
    void check()

    // Check on tab visibility change (catches background → foreground)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [lockNow])

  // ── Theme restore ───────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('app_theme')
      if (saved) {
        const th = JSON.parse(saved)
        document.documentElement.setAttribute('data-theme', th.mode || 'light')
        const colors: Record<string,string> = {
          blue:'#2563eb', green:'#16a34a', purple:'#9333ea',
          orange:'#f97316', red:'#dc2626', teal:'#0d9488',
        }
        if (colors[th.primaryColor]) {
          document.documentElement.style.setProperty('--color-primary', colors[th.primaryColor])
        }
        const fonts: Record<string,string> = { small:'13px', medium:'15px', large:'17px' }
        if (fonts[th.fontSize]) document.body.style.fontSize = fonts[th.fontSize]
        const sv: Record<string,Record<string,string>> = {
          light: {
            '--sidebar-text':'#000000','--sidebar-hover-bg':'#F1F5F9',
            '--sidebar-hover-text':'#0F172A','--sidebar-active-bg':'#0D9488',
            '--sidebar-active-text':'#FFFFFF','--sidebar-border':'#CBD5E1',
            '--sidebar-group-text':'#374151','--sidebar-title':'#000000','--sidebar-icon':'#374151',
          },
          dark: {
            '--sidebar-text':'#CBD5E1','--sidebar-hover-bg':'#1e293b',
            '--sidebar-hover-text':'#FFFFFF','--sidebar-active-bg':'#0D9488',
            '--sidebar-active-text':'#FFFFFF','--sidebar-border':'#334155',
            '--sidebar-group-text':'#6B7280','--sidebar-title':'#FFFFFF','--sidebar-icon':'#9CA3AF',
          },
          classic: {
            '--sidebar-text':'#e8d5c4','--sidebar-hover-bg':'#5c4033',
            '--sidebar-hover-text':'#fefcf8','--sidebar-active-bg':'#8b4513',
            '--sidebar-active-text':'#FFFFFF','--sidebar-border':'#5c4033',
            '--sidebar-group-text':'#a0836e','--sidebar-title':'#fefcf8','--sidebar-icon':'#a0836e',
          },
        }
        const mode = th.mode || 'light'
        Object.entries(sv[mode] || sv.light).forEach(([k,v]) =>
          document.documentElement.style.setProperty(k, v))
      } else {
        document.documentElement.setAttribute('data-theme', 'light')
        const defaults: Record<string,string> = {
          '--color-primary':'#2563eb','--color-bg':'#f9fafb','--color-card':'#ffffff',
          '--color-text':'#111827','--color-border':'#e5e7eb','--color-sidebar':'#111827',
          '--sidebar-text':'#000000','--sidebar-hover-bg':'#F1F5F9',
          '--sidebar-hover-text':'#0F172A','--sidebar-active-bg':'#0D9488',
          '--sidebar-active-text':'#FFFFFF','--sidebar-border':'#CBD5E1',
          '--sidebar-group-text':'#374151','--sidebar-title':'#000000','--sidebar-icon':'#374151',
        }
        Object.entries(defaults).forEach(([k,v]) => document.documentElement.style.setProperty(k,v))
        document.body.style.backgroundColor = '#f9fafb'
        document.body.style.color = '#111827'
        localStorage.setItem('app_theme', JSON.stringify({ mode:'light', primaryColor:'blue', fontSize:'medium' }))
      }
    } catch {}
  }, [])

  // ── Keepalive ───────────────────────────────────────────────────────────────
  useEffect(() => { startSupabasePing() }, [])

  // ── Mobile detection ────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Close sidebar on route change (mobile)
  // Also signal ChatBubble to stop voice
  useEffect(() => {
    setSidebarOpen(false)
    window.dispatchEvent(new CustomEvent("routeChange"))
  }, [pathname])

  return (
    <>
      {/* ── PIN Lock Overlay ── */}
      {showPinLock && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-xs shadow-2xl text-center">
            <div className="relative inline-flex items-center justify-center w-16 h-16 mb-4">
              <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-30" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-2xl">🔒</span>
              </div>
            </div>
            <h2 className="font-bold text-lg text-gray-800 mb-1">Screen Locked</h2>
            <p className="text-xs text-gray-400 mb-5">PIN ၄ လုံး ရိုက်ပါ</p>

            <div className="flex justify-center gap-3 mb-5">
              {[0,1,2,3].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                  pinInput.length > i ? 'bg-blue-600 border-blue-600 scale-110' : 'border-gray-300'
                }`} />
              ))}
            </div>

            {pinError && (
              <div className="mb-4 text-sm text-red-500 bg-red-50 py-2 px-3 rounded-lg">
                {pinError}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2.5 mb-4">
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                <button key={i}
                  onClick={() => {
                    if (k === '') return
                    if (k === '⌫') { setPinInput(p => p.slice(0,-1)); setPinError(''); return }
                    if (pinInput.length < 4) setPinInput(p => p + k)
                  }}
                  disabled={k === ''}
                  className={`h-14 rounded-xl font-semibold text-lg transition-all ${
                    k === '' ? 'invisible' :
                    k === '⌫' ? 'bg-orange-50 hover:bg-orange-100 text-orange-500' :
                    'bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-800'
                  } disabled:opacity-40`}>
                  {k}
                </button>
              ))}
            </div>

            <button onClick={handlePinUnlock}
              disabled={pinInput.length !== 4 || pinUnlocking}
              className="w-full py-3 rounded-xl font-medium text-sm mb-3 transition-all flex items-center justify-center gap-2"
              style={{
                backgroundColor: pinInput.length === 4 ? '#2563eb' : '#e5e7eb',
                color: pinInput.length === 4 ? '#ffffff' : '#9ca3af',
              }}>
              {pinUnlocking ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  စစ်ဆေးနေသည်...
                </>
              ) : 'Unlock'}
            </button>

            <button
              onClick={async () => {
                // Clear lock flag BEFORE redirecting to login (prevents getting trapped)
                localStorage.removeItem('pin_lock_active')
                dispatchLockChange(false)
                const supabase = createClient()
                await supabase.auth.signOut()
                window.location.replace('/login')
              }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              အကောင့်ပြောင်းမည်
            </button>
          </div>
        </div>
      )}

      {/* ── Main Layout ── */}
      <div className="flex h-screen overflow-hidden">

        {/* Mobile overlay backdrop */}
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-[55]"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — fixed on mobile, static on desktop */}
        <div className={`
          ${isMobile
            ? `fixed inset-y-0 left-0 z-[60] transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
            : 'relative flex-shrink-0'
          }
        `}>
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Topbar */}
          <div
            className="flex items-center justify-between px-4 py-2 border-b sticky top-0 flex-shrink-0"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              minHeight: '48px',
              zIndex: 30,
            }}>

            {/* Left: hamburger (mobile only) */}
            <div className="flex items-center gap-3 w-10">
              {isMobile && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                  style={{ color: 'var(--color-text)' }}>
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="2" y1="5" x2="18" y2="5" />
                    <line x1="2" y1="10" x2="18" y2="10" />
                    <line x1="2" y1="15" x2="18" y2="15" />
                  </svg>
                </button>
              )}
            </div>

            {/* Center: ERP / Support mode switcher */}
            <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
              <Link
                href="/dashboard"
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  !pathname.startsWith('/support')
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200'
                }`}>
                📊 ERP
              </Link>
              <Link
                href="/support/chat"
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  pathname.startsWith('/support')
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200'
                }`}>
                🎧 Support
              </Link>
            </div>

            {/* Right: Language switcher */}
            <LangSwitcher />
          </div>

          {/* Page content */}
          <main
            className="flex-1 overflow-auto"
            style={{ backgroundColor: 'var(--color-bg)' }}>
            {children}
          </main>
        </div>

      </div>
    </>
  )
}
