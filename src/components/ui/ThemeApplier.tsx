'use client'
import { useEffect } from 'react'

export default function ThemeApplier() {
  useEffect(() => {
    const applyStoredTheme = () => {
      try {
        const saved = localStorage.getItem('app_theme')
        if (!saved) return
        const theme = JSON.parse(saved)

        const colors: Record<string,string> = {
          blue:'#2563eb', green:'#16a34a', purple:'#9333ea',
          orange:'#f97316', red:'#dc2626', teal:'#0d9488'
        }
        const fonts: Record<string,string> = {small:'13px', medium:'15px', large:'17px'}

        interface ThemeVars {
          bg: string; card: string; text: string; border: string
          sidebar: string; sidebarText: string; sidebarHoverBg: string
          sidebarHoverText: string; sidebarActiveBg: string; sidebarActiveText: string
          sidebarBorder: string; sidebarGroupText: string; sidebarTitle: string; sidebarIcon: string
        }

        const themes: Record<string, ThemeVars> = {
          light: {
            bg: '#f9fafb',
            card: '#ffffff',
            text: '#111827',
            border: '#e5e7eb',
            sidebar: '#E2E8F0',
            sidebarText: '#000000',
            sidebarHoverBg: '#F1F5F9',
            sidebarHoverText: '#0F172A',
            sidebarActiveBg: '#0D9488',
            sidebarActiveText: '#FFFFFF',
            sidebarBorder: '#CBD5E1',
            sidebarGroupText: '#374151',
            sidebarTitle: '#000000',
            sidebarIcon: '#374151',
          },
          dark: {
            bg: '#1f2937',
            card: '#374151',
            text: '#f9fafb',
            border: '#4b5563',
            sidebar: '#030712',
            sidebarText: '#CBD5E1',
            sidebarHoverBg: '#1f2937',
            sidebarHoverText: '#FFFFFF',
            sidebarActiveBg: '#0D9488',
            sidebarActiveText: '#FFFFFF',
            sidebarBorder: '#374151',
            sidebarGroupText: '#6B7280',
            sidebarTitle: '#FFFFFF',
            sidebarIcon: '#9CA3AF',
          },
          classic: {
            bg: '#f5f0e8',
            card: '#fefcf8',
            text: '#2c1a0e',
            border: '#d4b896',
            sidebar: '#3d2b1f',
            sidebarText: '#e8d5c4',
            sidebarHoverBg: '#5c4033',
            sidebarHoverText: '#fefcf8',
            sidebarActiveBg: '#8b4513',
            sidebarActiveText: '#FFFFFF',
            sidebarBorder: '#5c4033',
            sidebarGroupText: '#a0836e',
            sidebarTitle: '#fefcf8',
            sidebarIcon: '#a0836e',
          },
        }

        const t = themes[theme.mode] || themes.light
        const root = document.documentElement

        root.style.setProperty('--color-primary', colors[theme.primaryColor] || '#2563eb')
        root.style.setProperty('--color-bg', t.bg)
        root.style.setProperty('--color-card', t.card)
        root.style.setProperty('--color-text', t.text)
        root.style.setProperty('--color-border', t.border)
        root.style.setProperty('--color-sidebar', t.sidebar)
        root.style.setProperty('--sidebar-text', t.sidebarText)
        root.style.setProperty('--sidebar-hover-bg', t.sidebarHoverBg)
        root.style.setProperty('--sidebar-hover-text', t.sidebarHoverText)
        root.style.setProperty('--sidebar-active-bg', t.sidebarActiveBg)
        root.style.setProperty('--sidebar-active-text', t.sidebarActiveText)
        root.style.setProperty('--sidebar-border', t.sidebarBorder)
        root.style.setProperty('--sidebar-group-text', t.sidebarGroupText)
        root.style.setProperty('--sidebar-title', t.sidebarTitle)
        root.style.setProperty('--sidebar-icon', t.sidebarIcon)

        document.body.style.fontSize = fonts[theme.fontSize] || '15px'
        document.body.style.backgroundColor = t.bg
        document.body.style.color = t.text
      } catch {}
    }

    applyStoredTheme()
    window.addEventListener('theme-updated', applyStoredTheme)
    return () => window.removeEventListener('theme-updated', applyStoredTheme)
  }, [])
  return null
}
