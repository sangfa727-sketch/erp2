'use client'
import AppLayout from '@/components/layout/AppLayout'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface Conversation {
  id: string
  contact_id: string | null
  channel: string
  status: string
  ai_handled: boolean
  external_ref_id: string | null
  created_at: string
  contact?: { contact_name: string; phone: string | null } | null
}
interface Message {
  id: string
  conversation_id: string
  sender_type: string
  content: string
  ai_suggested: boolean
  created_at: string
}

const CHANNEL_ICON: Record<string,string> = { telegram:'✈️', viber:'📱', facebook:'📘', chat:'💬', phone:'📞' }
const CHANNEL_LABEL: Record<string,string> = { telegram:'Telegram', viber:'Viber', facebook:'Messenger', chat:'Live Chat', phone:'Phone' }
const STATUS_COLOR: Record<string,string> = { open:'#10B981', pending:'#F59E0B', resolved:'#6B7280', closed:'#EF4444' }

// Support accent — works on both light and dark backgrounds
const S = {
  accent:      '#7C3AED',
  accentLight: 'rgba(167,139,250,0.15)',  // purple tint — readable in dark mode
  accentText:  '#A78BFA',                 // light purple text — readable on dark bg
  agentBg:     '#6D28D9',                 // agent bubble — slightly darker purple
  aiBg:        'rgba(167,139,250,0.18)',
  aiText:      '#C4B5FD',                 // light purple — readable dark/light
  gradient:    'linear-gradient(135deg,#7C3AED,#3B82F6)',
}

export default function SupportChatPage() {
  const supabase = createClient()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string|null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileView, setMobileView] = useState<'list'|'chat'>('list')

  const bottomRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<NodeJS.Timeout|null>(null)
  const chatBoxRef = useRef<HTMLDivElement>(null)
  const shouldScrollRef = useRef(true)

  const activeConv = conversations.find(c => c.id === activeId)

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((force = false) => {
    if (force || shouldScrollRef.current) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 80)
    }
  }, [])

  const handleScroll = () => {
    if (!chatBoxRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatBoxRef.current
    shouldScrollRef.current = scrollHeight - scrollTop - clientHeight < 120
  }

  const loadConversations = useCallback(async () => {
    const { data } = await supabase
      .from('support_conversations')
      .select('*, contact:contact_id(contact_name, phone)')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) { setConversations(data as any); setLoading(false) }
  }, [])

  const loadMessages = useCallback(async (convId: string, forceScroll = false) => {
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    if (data) {
      setMessages(data as any)
      if (forceScroll) {
        shouldScrollRef.current = true
      }
      scrollToBottom(forceScroll)
    }
  }, [scrollToBottom])

  useEffect(() => { loadConversations() }, [])

  useEffect(() => {
    if (conversations.length > 0 && !activeId) setActiveId(conversations[0].id)
  }, [conversations])

  useEffect(() => {
    if (!activeId) return
    // Force scroll when switching conversation
    shouldScrollRef.current = true
    loadMessages(activeId, true)

    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => {
      loadMessages(activeId)
      loadConversations()
    }, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeId])

  // Scroll when mobileView switches to chat
  useEffect(() => {
    if (mobileView === 'chat' && activeId) {
      shouldScrollRef.current = true
      scrollToBottom(true)
    }
  }, [mobileView])

  const sendMessage = async () => {
    if (!input.trim() || !activeId || sending) return
    setSending(true)
    await supabase.from('support_messages').insert({
      conversation_id: activeId,
      sender_type: 'agent',
      content: input.trim(),
    })
    setInput('')
    setSending(false)
    shouldScrollRef.current = true
    loadMessages(activeId, true)
  }

  const createConversation = async () => {
    const { data } = await supabase
      .from('support_conversations')
      .insert({ channel: 'chat', status: 'open' })
      .select().single()
    if (data) {
      setConversations(prev => [data as any, ...prev])
      setActiveId(data.id)
      if (isMobile) setMobileView('chat')
    }
  }

  const handleSelectConv = (id: string) => {
    setActiveId(id)
    shouldScrollRef.current = true
    if (isMobile) setMobileView('chat')
  }

  const getDisplayName = (conv: Conversation) => {
    if (conv.contact?.contact_name) return conv.contact.contact_name
    if (conv.external_ref_id) return `${CHANNEL_LABEL[conv.channel]||conv.channel} User`
    return 'Unknown'
  }

  // ── Conversation List ────────────────────────────────────────────────────────
  const renderList = () => (
    <div
      className={`flex flex-col border-r ${isMobile ? 'w-full' : 'w-72 flex-shrink-0'}`}
      style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
    >
      <div className="p-3 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'var(--color-border)' }}>
        <span className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
          💬 Live Chat
        </span>
        <button onClick={createConversation}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
          style={{ background: S.accent }}>
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm" style={{ color: 'var(--color-text)' }}>Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-3xl mb-2">💬</div>
            <p className="text-sm" style={{ color: 'var(--color-text)', opacity: 0.5 }}>စကားဝိုင်း မရှိသေးပါ</p>
          </div>
        ) : conversations.map(conv => {
          const isActive = conv.id === activeId
          const name = getDisplayName(conv)
          return (
            <div key={conv.id}
              onClick={() => handleSelectConv(conv.id)}
              className="flex items-start gap-3 px-3 py-3 cursor-pointer border-b transition-all active:opacity-70"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: isActive && !isMobile ? S.accentLight : 'transparent',
                borderLeft: isActive && !isMobile ? `3px solid ${S.accent}` : '3px solid transparent',
              }}>
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ background: S.gradient }}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px]"
                  style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                  {CHANNEL_ICON[conv.channel]||'💬'}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                    {name}
                  </span>
                  <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text)', opacity: 0.4 }}>
                    {new Date(conv.created_at).toLocaleTimeString('my-MM', { hour:'2-digit', minute:'2-digit' })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: STATUS_COLOR[conv.status]||'#6B7280' }}/>
                  <span className="text-[11px] truncate" style={{ color: 'var(--color-text)', opacity: 0.5 }}>
                    {CHANNEL_LABEL[conv.channel]||conv.channel} · {conv.status}
                  </span>
                  {conv.ai_handled && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0"
                      style={{ background: S.accentLight, color: S.accentText }}>AI</span>
                  )}
                </div>
              </div>
              {isMobile && (
                <span className="self-center flex-shrink-0 text-lg" style={{ color: 'var(--color-text)', opacity: 0.3 }}>›</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── Chat Window ──────────────────────────────────────────────────────────────
  const renderChat = () => {
    if (!activeId) return (
      <div className="flex-1 flex items-center justify-center opacity-40">
        <div className="text-center">
          <div className="text-5xl mb-3">💬</div>
          <p className="text-sm" style={{ color: 'var(--color-text)' }}>စကားဝိုင်း ရွေးပါ</p>
        </div>
      </div>
    )

    return (
      <div className={`flex flex-col min-w-0 ${isMobile ? 'w-full' : 'flex-1'}`}
        style={{ height: '100%' }}>

        {/* Header */}
        <div className="px-3 py-2.5 border-b flex items-center gap-2 flex-shrink-0"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>

          {isMobile && (
            <button onClick={() => setMobileView('list')}
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xl font-light"
              style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
              ‹
            </button>
          )}

          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: S.gradient }}>
              {getDisplayName(activeConv!).charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px]"
              style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
              {CHANNEL_ICON[activeConv?.channel||'chat']}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
              {getDisplayName(activeConv!)}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--color-text)', opacity: 0.5 }}>
              {CHANNEL_LABEL[activeConv?.channel||'chat']} · {activeConv?.status}
            </p>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {['open','pending','resolved'].map(s => (
              <button key={s}
                onClick={async () => {
                  await supabase.from('support_conversations').update({ status: s }).eq('id', activeId)
                  setConversations(prev => prev.map(c => c.id === activeId ? {...c, status: s} : c))
                }}
                className="px-2 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: activeConv?.status === s ? STATUS_COLOR[s] : 'var(--color-bg)',
                  color: activeConv?.status === s ? '#fff' : 'var(--color-text)',
                  opacity: activeConv?.status === s ? 1 : 0.6,
                  border: '1px solid var(--color-border)',
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Messages — flex-1 with overflow */}
        <div
          ref={chatBoxRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3 space-y-3"
          style={{ backgroundColor: 'var(--color-bg)', minHeight: 0 }}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-40">
              <div className="text-4xl mb-2">💬</div>
              <p className="text-sm" style={{ color: 'var(--color-text)' }}>စကားမစသေးပါ</p>
            </div>
          ) : messages.map(msg => {
            const isAgent = msg.sender_type === 'agent'
            const isAI = msg.sender_type === 'ai'
            const isRight = isAgent || isAI
            return (
              <div key={msg.id} className={`flex ${isRight ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%]">
                  {isAI && (
                    <p className="text-[10px] mb-1 flex items-center justify-end gap-1"
                      style={{ color: S.accentText }}>
                      <span>🤖</span><span>AI</span>
                    </p>
                  )}
                  <div className="px-3 py-2 text-sm whitespace-pre-wrap"
                    style={{
                      background: isAgent ? S.agentBg : isAI ? S.aiBg : 'var(--color-card)',
                      color: isAgent ? '#fff' : isAI ? S.aiText : 'var(--color-text)',
                      border: isAgent ? 'none' : `1px solid var(--color-border)`,
                      borderRadius: isRight ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    }}>
                    {msg.content}
                  </div>
                  <p className="text-[10px] mt-1 px-1"
                    style={{ color: 'var(--color-text)', opacity: 0.4, textAlign: isRight ? 'right' : 'left' }}>
                    {new Date(msg.created_at).toLocaleTimeString('my-MM', { hour:'2-digit', minute:'2-digit' })}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input — always at bottom, never hidden */}
        <div className="border-t flex items-end gap-2 flex-shrink-0 p-3"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Message ရိုက်ပါ... (Enter = ပို့မည်)"
            rows={1}
            className="flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              maxHeight: '120px',
            }}/>
          <button onClick={sendMessage} disabled={!input.trim() || sending}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
            style={{ background: S.accent }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-48px)] overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
        {isMobile ? (
          mobileView === 'list' ? renderList() : renderChat()
        ) : (
          <>
            {renderList()}
            {renderChat()}
          </>
        )}
      </div>
    </AppLayout>
  )
}
