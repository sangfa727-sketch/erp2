'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

export function useSupabase() {
  const [supabase] = useState(() => createClient())
  
  useEffect(() => {
    // Set company context for RLS on mount
    const setContext = async () => {
      try {
        const staffSession = localStorage.getItem('staff_session')
        if (staffSession) {
          const sess = JSON.parse(staffSession)
          if (sess.company_id) {
            await supabase.rpc('set_staff_company', { p_company_id: sess.company_id })
          }
        }
      } catch {}
    }
    setContext()
  }, [supabase])
  
  return supabase
}
