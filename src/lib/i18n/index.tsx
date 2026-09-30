'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import en from './en.json'
import my from './my.json'
import th from './th.json'

type Lang = 'en' | 'my' | 'th'
type T = typeof en

const translations: Record<Lang, T> = { en, my: my as T, th: th as T }

const FONT_MAP: Record<Lang, string> = {
  en: "'Noto Sans', system-ui, sans-serif",
  my: "'Noto Sans Myanmar', 'Noto Sans', system-ui, sans-serif",
  th: "'Noto Sans Thai', 'Noto Sans', system-ui, sans-serif",
}

function applyLang(l: Lang) {
  document.documentElement.lang = l
  document.documentElement.style.setProperty('--font-noto', FONT_MAP[l])
  document.body.style.setProperty('font-family', FONT_MAP[l], 'important')
}

interface I18nCtx { lang: Lang; t: T; setLang: (l: Lang) => void }
const I18nContext = createContext<I18nCtx>({ lang: 'my', t: my as T, setLang: () => {} })

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang | null>(null)

  useEffect(() => {
    const saved = (localStorage.getItem('app_lang') as Lang) || 'my'
    setLangState(saved)
    applyLang(saved)
    // Restore theme on page load
    try {
      const th = localStorage.getItem('app_theme')
      if (th) {
        const parsed = JSON.parse(th)
        document.documentElement.setAttribute('data-theme', parsed.mode || 'light')
      }
    } catch {}
  }, [])

  const setLang = (l: Lang) => {
    setLangState(l)
    localStorage.setItem('app_lang', l)
    applyLang(l)
  }

  // hydration မဖြစ်မချင်း ဘာမှ render မလုပ်
  if (lang === null) return null

  return (
    <I18nContext.Provider value={{ lang, t: translations[lang], setLang }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => useContext(I18nContext)
