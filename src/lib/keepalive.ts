import { createClient } from '@/lib/supabase'

// Keep Supabase warm - ping every 4 minutes
let pingInterval: NodeJS.Timeout | null = null

export function startSupabasePing() {
  if (pingInterval) return
  const supabase = createClient()
  pingInterval = setInterval(async () => {
    await supabase.from('companies').select('id').limit(1).maybeSingle()
  }, 4 * 60 * 1000) // 4 minutes
}

export function stopSupabasePing() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null }
}
