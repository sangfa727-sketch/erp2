'use client'
import { useState, useRef, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'

const LANGS = [
  { code: 'en', label: 'English', flag: '🇬🇧', short: 'EN' },
  { code: 'my', label: 'မြန်မာ', flag: '🇲🇲', short: 'MM' },
  { code: 'th', label: 'ภาษาไทย', flag: '🇹🇭', short: 'TH' },
]

export default function LangSwitcher() {
  const { lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = LANGS.find(l => l.code === lang) || LANGS[1]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
        style={{
          backgroundColor: '#f1f5f9',
          border: '1px solid #e2e8f0',
          color: '#475569',
        }}>
        <span>{current.flag}</span>
        <span className="font-semibold text-xs">{current.short}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 rounded-xl overflow-hidden z-50"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            minWidth: '140px',
          }}>
          {LANGS.map(l => (
            <button key={l.code}
              onClick={() => { setLang(l.code as any); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-gray-50"
              style={{
                backgroundColor: lang === l.code ? '#f0f9ff' : 'transparent',
                color: lang === l.code ? '#0891b2' : '#374151',
                fontWeight: lang === l.code ? '600' : '400',
              }}>
              <span className="text-base">{l.flag}</span>
              <span>{l.label}</span>
              {lang === l.code && (
                <span className="ml-auto text-xs" style={{color:'#0891b2'}}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
