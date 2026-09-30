// Simple in-memory cache with TTL
const store: Record<string, { data: any; ts: number }> = {}
const TTL = 30000 // 30 seconds

export function getCache(key: string) {
  const entry = store[key]
  if (!entry) return null
  if (Date.now() - entry.ts > TTL) { delete store[key]; return null }
  return entry.data
}

export function setCache(key: string, data: any) {
  store[key] = { data, ts: Date.now() }
}

export function clearCache(key?: string) {
  if (key) delete store[key]
  else Object.keys(store).forEach(k => delete store[k])
}

// Hook for cached supabase fetch
import { useState, useEffect } from 'react'
import { createClient } from './supabase'

export function useCachedFetch<T>(
  cacheKey: string,
  fetcher: (supabase: ReturnType<typeof createClient>) => Promise<T>,
  deps: any[] = []
) {
  const cached = getCache(cacheKey)
  const [data, setData] = useState<T | null>(cached)
  const [loading, setLoading] = useState(!cached)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    const cached = getCache(cacheKey)
    if (cached) {
      setData(cached)
      setLoading(false)
      // Background refresh
      fetcher(supabase).then(fresh => {
        if (!cancelled) { setData(fresh); setCache(cacheKey, fresh) }
      })
      return
    }
    setLoading(true)
    fetcher(supabase).then(fresh => {
      if (!cancelled) { setData(fresh); setCache(cacheKey, fresh); setLoading(false) }
    })
    return () => { cancelled = true }
  }, deps)

  const refresh = async () => {
    clearCache(cacheKey)
    setLoading(true)
    const fresh = await fetcher(supabase)
    setData(fresh)
    setCache(cacheKey, fresh)
    setLoading(false)
  }

  return { data, loading, refresh }
}
