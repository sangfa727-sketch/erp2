let cachedCompanyId: string | null = null
let cacheTs = 0
const CACHE_TTL = 30 * 60 * 1000 // 30 min

export async function getCompanyId(): Promise<string> {
  // Return cached
  if (cachedCompanyId && Date.now() - cacheTs < CACHE_TTL) {
    return cachedCompanyId
  }

  if (typeof window === 'undefined') return ''

  // 1. Staff session - company_id ပါပြီးသား (no DB query)
  const staffSession = localStorage.getItem('staff_session')
  if (staffSession) {
    try {
      const sess = JSON.parse(staffSession)
      if (sess.company_id) {
        cachedCompanyId = sess.company_id
        cacheTs = Date.now()
        return cachedCompanyId!
      }
    } catch {}
  }

  // 2. Admin auth - Supabase cookie ထဲက user id ယူပြီး profile query
  try {
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (data?.company_id) {
        cachedCompanyId = data.company_id
        cacheTs = Date.now()
        return cachedCompanyId!
      }
    }
  } catch {}

  return ''
}

export function clearCompanyIdCache() {
  cachedCompanyId = null
  cacheTs = 0
}
