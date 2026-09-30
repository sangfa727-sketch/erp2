import { createBrowserClient } from '@supabase/ssr'

// Shared auth options — explicit auto-refresh + session persistence to
// prevent JWT expired errors after tab idle / laptop sleep / long sessions.
const AUTH_OPTIONS = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    AUTH_OPTIONS,
  )
}

// Staff session aware client — RLS အတွက် company_id set လုပ်တယ်
export async function createStaffClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    AUTH_OPTIONS,
  )

  try {
    const staffSession = localStorage.getItem('staff_session')
    if (staffSession) {
      const sess = JSON.parse(staffSession)
      if (sess.company_id) {
        // Set company_id for RLS
        await client.rpc('set_staff_company', { p_company_id: sess.company_id })
      }
    }
  } catch {}

  return client
}

// Auto-detect: staff or admin session
export async function createAutoClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    AUTH_OPTIONS,
  )

  try {
    const staffSession = localStorage.getItem('staff_session')
    if (staffSession) {
      const sess = JSON.parse(staffSession)
      if (sess.company_id) {
        await client.rpc('set_staff_company', { p_company_id: sess.company_id })
        return client
      }
    }
  } catch {}

  return client
}
