export type ThemeMode = 'light' | 'dark' | 'classic'
export type PrimaryColor = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'teal'
export type FontSize = 'small' | 'medium' | 'large'

export interface AppTheme {
  mode: ThemeMode
  primaryColor: PrimaryColor
  fontSize: FontSize
}

export const DEFAULT_THEME: AppTheme = {
  mode: 'light',
  primaryColor: 'blue',
  fontSize: 'medium',
}

export const PRIMARY_COLORS: Record<PrimaryColor, { bg: string; hover: string; text: string; light: string; hex: string }> = {
  blue:   { bg: 'bg-blue-600',   hover: 'hover:bg-blue-700',   text: 'text-blue-600',   light: 'bg-blue-50',   hex: '#2563eb' },
  green:  { bg: 'bg-green-600',  hover: 'hover:bg-green-700',  text: 'text-green-600',  light: 'bg-green-50',  hex: '#16a34a' },
  purple: { bg: 'bg-purple-600', hover: 'hover:bg-purple-700', text: 'text-purple-600', light: 'bg-purple-50', hex: '#9333ea' },
  orange: { bg: 'bg-orange-500', hover: 'hover:bg-orange-600', text: 'text-orange-500', light: 'bg-orange-50', hex: '#f97316' },
  red:    { bg: 'bg-red-600',    hover: 'hover:bg-red-700',    text: 'text-red-600',    light: 'bg-red-50',    hex: '#dc2626' },
  teal:   { bg: 'bg-teal-600',   hover: 'hover:bg-teal-700',   text: 'text-teal-600',   light: 'bg-teal-50',   hex: '#0d9488' },
}

export const FONT_SIZES: Record<FontSize, string> = {
  small:  '13px',
  medium: '15px',
  large:  '17px',
}

export const THEMES: Record<ThemeMode, {
  bg: string; sidebar: string; card: string; border: string
  text: string; textSub: string; inputBg: string; navActive: string
}> = {
  light: {
    bg: '#f9fafb',
    sidebar: '#111827',
    card: '#ffffff',
    border: '#e5e7eb',
    text: '#111827',
    textSub: '#6b7280',
    inputBg: '#ffffff',
    navActive: '#2563eb',
  },
  dark: {
    bg: '#1f2937',
    sidebar: '#030712',
    card: '#374151',
    border: '#4b5563',
    text: '#f9fafb',
    textSub: '#9ca3af',
    inputBg: '#4b5563',
    navActive: '#3b82f6',
  },
  classic: {
    bg: '#f5f0e8',
    sidebar: '#3d2b1f',
    card: '#fefcf8',
    border: '#d4b896',
    text: '#2c1a0e',
    textSub: '#7c5c3e',
    inputBg: '#fefcf8',
    navActive: '#8b4513',
  },
}

export function applyTheme(theme: AppTheme) {
  const t = THEMES[theme.mode]
  const p = PRIMARY_COLORS[theme.primaryColor]
  const root = document.documentElement

  root.style.setProperty('--color-bg', t.bg)
  root.style.setProperty('--color-sidebar', t.sidebar)
  root.style.setProperty('--color-card', t.card)
  root.style.setProperty('--color-border', t.border)
  root.style.setProperty('--color-text', t.text)
  root.style.setProperty('--color-text-sub', t.textSub)
  root.style.setProperty('--color-input-bg', t.inputBg)
  root.style.setProperty('--color-nav-active', t.navActive)
  root.style.setProperty('--color-primary', p.hex)
  root.style.setProperty('--font-size-base', FONT_SIZES[theme.fontSize])

  document.body.style.fontSize = FONT_SIZES[theme.fontSize]
  document.body.style.backgroundColor = t.bg
  document.body.style.color = t.text
}

export function loadTheme(): AppTheme {
  if (typeof window === 'undefined') return DEFAULT_THEME
  try {
    const saved = localStorage.getItem('app_theme')
    if (saved) return { ...DEFAULT_THEME, ...JSON.parse(saved) }
  } catch {}
  return DEFAULT_THEME
}

export function saveTheme(theme: AppTheme) {
  localStorage.setItem('app_theme', JSON.stringify(theme))
  applyTheme(theme)
}
