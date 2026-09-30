'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

// ─── ERP Menu Groups ───────────────────────────────────────────────────────────
const ERP_MENU_GROUPS = [
  {
    groupKey: null,
    items: [
      { href: '/dashboard',             icon: '📊', key: 'dashboard' },
      { href: '/pos',                   icon: '🛒', key: 'pos' },
    ],
  },
  {
    groupKey: 'stock',
    items: [
      { href: '/admin/products',        icon: '📦', key: 'products' },
      { href: '/inventory',             icon: '🏭', key: 'inventory' },
      { href: '/grn',                   icon: '📥', key: 'grn' },
    ],
  },
  {
    groupKey: 'contacts',
    items: [
      { href: '/customers',             icon: '👤', key: 'customers' },
      { href: '/suppliers',             icon: '🏪', key: 'suppliers' },
      { href: '/employees',             icon: '👥', key: 'employees' },
    ],
  },
  {
    groupKey: 'ops',
    items: [
      { href: '/purchases',             icon: '🛍️', key: 'purchases' },
      { href: '/shipments',             icon: '🚚', key: 'shipments' },
      { href: '/damaged-stock',         icon: '🗑️', key: 'damaged_stock' },
    ],
  },
  {
    groupKey: 'finance',
    items: [
      { href: '/finance/bank-accounts', icon: '🏦', key: 'bank_accounts' },
      { href: '/finance/ar',            icon: '📨', key: 'ar' },
      { href: '/finance/ap',            icon: '📤', key: 'ap' },
      { href: '/expenses',              icon: '💸', key: 'expenses' },
    ],
  },
  {
    groupKey: null,
    items: [
      { href: '/sales-return',          icon: '↩️', key: 'sales_return' },
      { href: '/reports/sales',         icon: '📈', key: 'reports' },
      { href: '/settings',              icon: '⚙️', key: 'settings' },
    ],
  },
]

// ─── Support Menu Groups ───────────────────────────────────────────────────────
const SUPPORT_MENU_GROUPS = [
  {
    groupKey: null,
    items: [
      { href: '/support/chat',           icon: '💬', key: 'support_chat',     label: 'Live Chat' },
      { href: '/support/tickets',        icon: '🎫', key: 'support_tickets',  label: 'Tickets' },
      { href: '/support/pending-orders', icon: '⏳', key: 'support_orders',   label: 'Pending Orders' },
    ],
  },
  {
    groupKey: 'config',
    items: [
      { href: '/support/ai-config',      icon: '🤖', key: 'support_ai',       label: 'AI ထိန်းချုပ်' },
      { href: '/support/contacts',       icon: '📋', key: 'support_contacts', label: 'Contacts' },
    ],
  },
  {
    groupKey: null,
    items: [
      { href: '/settings',               icon: '⚙️', key: 'settings',         label: 'Settings' },
    ],
  },
]

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname  = usePathname()
  const { t }     = useI18n()
  const tAny      = t as any

  const [collapsed,      setCollapsed]      = useState(false)
  const [permissions,    setPermissions]    = useState<string[] | null>(null)
  const [staffName,      setStaffName]      = useState('')
  const [companyName,    setCompanyName]    = useState('1Admin')
  const [companyLogo,    setCompanyLogo]    = useState('')
  const [hiddenMenuKeys, setHiddenMenuKeys] = useState<string[]>([])
  const [pendingCount,   setPendingCount]   = useState(0)
  const [isMounted,      setIsMounted]      = useState(false)

  const isSupportMode = pathname.startsWith('/support')
  const MENU_GROUPS   = isSupportMode ? SUPPORT_MENU_GROUPS : ERP_MENU_GROUPS

  useEffect(() => { setIsMounted(true) }, [])

  // Staff session expiry check
  useEffect(() => {
    const check = () => {
      const s = localStorage.getItem('staff_session')
      if (!s) return
      try {
        const sess = JSON.parse(s)
        if (sess.expiresAt && Date.now() > sess.expiresAt) {
          localStorage.removeItem('staff_session')
          window.location.replace('/staff-login')
        }
      } catch { localStorage.removeItem('staff_session') }
    }
    check()
    const timer = setInterval(check, 60000)
    return () => clearInterval(timer)
  }, [])

  // Load permissions, hidden menus, company info
  useEffect(() => {
    const supabase = createClient()

    const loadPerms = async () => {
      const staffSession = localStorage.getItem('staff_session')
      if (staffSession) {
        const sess = JSON.parse(staffSession)
        setStaffName(sess.name || '')
        if (sess.permissions?.includes('all')) { setPermissions(null); return }
        const { data: fp } = await supabase.from('profiles').select('permissions,role').eq('id', sess.id).maybeSingle()
        if (fp?.role === 'Admin') { setPermissions(null); return }
        setPermissions((fp?.permissions as string[]) || sess.permissions || [])
        return
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('role,role_id,permissions').eq('auth_user_id', user.id).maybeSingle()
      if (!profile) return
      if (profile.role === 'Admin') { setPermissions(null); return }
      if (profile.permissions) { setPermissions(profile.permissions as string[]); return }
      if (profile.role_id) {
        const { data: rd } = await supabase.from('roles').select('permissions').eq('id', profile.role_id).maybeSingle()
        if (rd?.permissions) { setPermissions(rd.permissions as string[]); return }
      }
      setPermissions(null)
    }
    loadPerms()

    const loadHidden = () => {
      try {
        const h = localStorage.getItem('hidden_menus')
        if (h) setHiddenMenuKeys(JSON.parse(h))
      } catch {}
    }
    loadHidden()
    window.addEventListener('menu-updated', loadHidden)

    const fetchCompany = async () => {
      try {
        // ── Cache check — show instantly, skip fetch ──
        const cached = sessionStorage.getItem('company_info')
        if (cached) {
          const c = JSON.parse(cached)
          if (c.name)     setCompanyName(c.name)
          if (c.logo_url) setCompanyLogo(c.logo_url)
          return
        }

        let companyId: string | null = null
        const staffSession = localStorage.getItem('staff_session')
        if (staffSession) {
          const sess = JSON.parse(staffSession)
          const { data: p } = await supabase.from('profiles').select('company_id').eq('id', sess.id).maybeSingle()
          companyId = p?.company_id
        } else {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: p } = await supabase.from('profiles').select('company_id').eq('auth_user_id', user.id).maybeSingle()
            companyId = p?.company_id
          }
        }
        const { data } = await (companyId
          ? supabase.from('companies').select('name,logo_url').eq('id', companyId).maybeSingle()
          : supabase.from('companies').select('name,logo_url').maybeSingle())
        if (data?.name)     setCompanyName(data.name)
        if (data?.logo_url) setCompanyLogo(data.logo_url)
        // ── Save to cache ──
        if (data) sessionStorage.setItem('company_info', JSON.stringify(data))
      } catch {}
    }
    fetchCompany()

    // ── Clear cache when settings updated ──
    const clearCompanyCache = () => sessionStorage.removeItem('company_info')
    window.addEventListener('company-updated', clearCompanyCache)

    return () => {
      window.removeEventListener('menu-updated', loadHidden)
      window.removeEventListener('company-updated', clearCompanyCache)
    }
  }, [])

  // Support pending orders count
  useEffect(() => {
    if (!isSupportMode) return
    const fetchPendingCount = async () => {
      try {
        const supabase = createClient()
        const { count } = await supabase
          .from('support_pending_orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
        setPendingCount(count || 0)
      } catch {}
    }
    fetchPendingCount()
    const interval = setInterval(fetchPendingCount, 30000)
    return () => clearInterval(interval)
  }, [isSupportMode])

  const can = (key: string) =>
    (permissions === null || permissions.includes(key)) && !hiddenMenuKeys.includes(key)

  const GROUP_LABELS: Record<string, string> = {
    stock:    tAny['inventory']  || 'Stock',
    contacts: tAny['customers']  || 'Contacts',
    ops:      tAny['purchases']  || 'Operations',
    finance:  tAny['finance']    || 'Finance',
    config:   'Config',
  }

  const getLabel = (item: any) => {
    if (isSupportMode) return item.label || item.key
    return tAny[item.key] || item.key
  }

  const logout = async () => {
    const staffSession = localStorage.getItem('staff_session')
    if (staffSession) {
      localStorage.removeItem('staff_session')
      document.cookie = 'staff_session=; path=/; max-age=0'
      window.location.replace('/staff-login')
    } else {
      const { createClient: cc } = await import('@/lib/supabase')
      await cc().auth.signOut()
      window.location.replace('/login')
    }
  }

  if (!isMounted) return null

  return (
    <div
      className={`${collapsed && !isSupportMode ? 'w-16' : 'w-56'} h-screen flex flex-col transition-all duration-300`}
      style={{
        backgroundColor: isSupportMode ? '#4C1D95' : 'var(--color-sidebar, #111827)',
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-3 pt-4 pb-3 flex-shrink-0"
        style={{ borderBottom: `1px solid ${isSupportMode ? 'rgba(255,255,255,0.15)' : 'var(--sidebar-border, #1f2937)'}` }}
      >
        {isSupportMode ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              🎧
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-white truncate">SUPPORT HUB</div>
              <div className="text-[10px] text-purple-200 uppercase tracking-wide">Customer Service</div>
            </div>
          </div>
        ) : (
          <>
            {!collapsed ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {companyLogo ? (
                  <img src={companyLogo} alt="logo" className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 shadow flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                    style={{ backgroundColor: 'var(--sidebar-hover-bg, #374151)' }}>🏢</div>
                )}
                <span className="font-bold text-sm truncate" style={{ color: 'var(--sidebar-title, #FFFFFF)' }}>
                  {companyName}
                </span>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto"
                style={{ backgroundColor: 'var(--sidebar-hover-bg, #374151)' }}>
                {companyLogo
                  ? <img src={companyLogo} alt="logo" className="w-6 h-6 object-contain rounded" />
                  : <span className="text-sm">🏢</span>
                }
              </div>
            )}
          </>
        )}

        {/* Mobile close button */}
        {onClose && (
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ml-2 md:hidden transition-colors"
            style={{
              color: isSupportMode ? 'rgba(255,255,255,0.8)' : 'var(--sidebar-icon, #9CA3AF)',
              backgroundColor: isSupportMode ? 'rgba(255,255,255,0.1)' : 'var(--sidebar-hover-bg, #1f2937)',
            }}>
            <span className="text-base leading-none">✕</span>
          </button>
        )}

        {/* Desktop collapse toggle (ERP only) */}
        {!isSupportMode && (
          <button onClick={() => setCollapsed(!collapsed)}
            className="w-6 h-6 rounded-md items-center justify-center flex-shrink-0 ml-1 hidden md:flex transition-colors"
            style={{ color: 'var(--sidebar-icon, #6B7280)' }}>
            <span className="text-xs">{collapsed ? '▶' : '◀'}</span>
          </button>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav
        className="flex-1 py-3 overflow-y-auto px-2"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: isSupportMode ? 'rgba(255,255,255,0.2) transparent' : 'var(--sidebar-border) transparent',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        {MENU_GROUPS.map((group, gi) => {
          const visibleItems = isSupportMode
            ? group.items
            : group.items.filter(item => can(item.key))
          if (visibleItems.length === 0) return null

          return (
            <div key={gi} className={gi > 0 ? 'mt-2' : ''}>
              {group.groupKey && !collapsed && (
                <p className="px-3 pt-3 pb-2 text-[10px] font-semibold uppercase tracking-widest select-none"
                  style={{ color: isSupportMode ? 'rgba(255,255,255,0.5)' : 'var(--sidebar-group-text, #6B7280)' }}>
                  {GROUP_LABELS[group.groupKey] || group.groupKey}
                </p>
              )}
              {group.groupKey && collapsed && !isSupportMode && (
                <div className="my-2 mx-3 h-px" style={{ backgroundColor: 'var(--sidebar-border, #1f2937)' }} />
              )}

              {visibleItems.map((item: any) => {
                const active    = pathname === item.href || pathname.startsWith(item.href + '/')
                const label     = getLabel(item)
                const showBadge = item.href === '/support/pending-orders' && pendingCount > 0

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed && !isSupportMode ? label : undefined}
                    onClick={onClose}
                    className="flex items-center rounded-xl mb-1 transition-all duration-150 active:scale-[0.98]"
                    style={{
                      padding:         collapsed && !isSupportMode ? '10px' : '10px 12px',
                      justifyContent:  collapsed && !isSupportMode ? 'center' : 'flex-start',
                      gap:             collapsed && !isSupportMode ? '0' : '10px',
                      backgroundColor: active
                        ? (isSupportMode ? 'rgba(255,255,255,0.2)' : 'var(--sidebar-active-bg, #0D9488)')
                        : 'transparent',
                      color: active
                        ? (isSupportMode ? '#FFFFFF' : 'var(--sidebar-active-text, #FFFFFF)')
                        : (isSupportMode ? 'rgba(255,255,255,0.85)' : 'var(--sidebar-text, #9CA3AF)'),
                      fontWeight: active ? '600' : '400',
                      fontSize: '14px',
                    }}
                    onMouseEnter={e => {
                      if (!active) {
                        const el = e.currentTarget as HTMLElement
                        el.style.backgroundColor = isSupportMode ? 'rgba(255,255,255,0.1)' : 'var(--sidebar-hover-bg, #1f2937)'
                        el.style.color = isSupportMode ? '#FFFFFF' : 'var(--sidebar-hover-text, #FFFFFF)'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        const el = e.currentTarget as HTMLElement
                        el.style.backgroundColor = 'transparent'
                        el.style.color = isSupportMode ? 'rgba(255,255,255,0.85)' : 'var(--sidebar-text, #9CA3AF)'
                      }
                    }}
                  >
                    <span style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                    {(!collapsed || isSupportMode) && (
                      <span className="truncate flex-1">{label}</span>
                    )}
                    {showBadge && (
                      <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
        <div className="h-4 md:h-0" />
      </nav>

      {/* ── Footer: User & Logout ── */}
      <div
        className="px-2 py-3 flex-shrink-0"
        style={{ borderTop: `1px solid ${isSupportMode ? 'rgba(255,255,255,0.15)' : 'var(--sidebar-border, #1f2937)'}` }}
      >
        {!collapsed || isSupportMode ? (
          <div className="flex items-center justify-between px-2 py-1.5 rounded-xl"
            style={{ backgroundColor: isSupportMode ? 'rgba(255,255,255,0.1)' : 'var(--sidebar-hover-bg, #1f2937)' }}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                  color: '#FFFFFF',
                  boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
                }}>
                {staffName ? staffName.charAt(0).toUpperCase() : 'A'}
              </div>
              <span className="text-xs font-medium truncate"
                style={{ color: isSupportMode ? '#FFFFFF' : 'var(--sidebar-title, #FFFFFF)' }}>
                {staffName || 'Admin'}
              </span>
            </div>
            <button
              onClick={logout}
              title={tAny['logout'] || 'Logout'}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-[0.92] hover:shadow-lg flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                boxShadow: '0 2px 8px rgba(239,68,68,0.25)',
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{
                background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                color: '#FFFFFF',
                boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
              }}>
              {staffName ? staffName.charAt(0).toUpperCase() : 'A'}
            </div>
            <button
              onClick={logout}
              title={tAny['logout'] || 'Logout'}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-[0.92] hover:shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                boxShadow: '0 2px 8px rgba(239,68,68,0.25)',
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
