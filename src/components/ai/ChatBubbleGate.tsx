'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import ChatBubble from './ChatBubble'

const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/staff-login', '/landing', '/']

export default function ChatBubbleGate() {
  const pathname = usePathname() || ''
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const isPublic = PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
  if (isPublic) return null
  if (hasSession !== true) return null

  return <ChatBubble />
}
