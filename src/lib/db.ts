import { createClient } from '@/lib/supabase'

// Get company_id from session
export function getSessionCompanyId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const staffSession = localStorage.getItem('staff_session')
    if (staffSession) {
      const sess = JSON.parse(staffSession)
      return sess.company_id || null
    }
  } catch {}
  return null
}

// Create supabase client with company context set
export async function getDb() {
  const supabase = createClient()
  const companyId = getSessionCompanyId()
  if (companyId) {
    try {
      await supabase.rpc('set_staff_company', { p_company_id: companyId })
    } catch {}
  }
  return supabase
}
