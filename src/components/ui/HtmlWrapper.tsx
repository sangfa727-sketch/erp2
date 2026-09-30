'use client'
import { useEffect, useState } from 'react'

export default function HtmlWrapper({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState('my')

  useEffect(() => {
    const saved = localStorage.getItem('app_lang') || 'my'
    setLang(saved)
    document.documentElement.setAttribute('lang', saved)
  }, [])

  return <>{children}</>
}
