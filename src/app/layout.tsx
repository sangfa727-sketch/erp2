import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '@/lib/i18n'
import ThemeApplier from '@/components/ui/ThemeApplier'
import ChatBubbleGate from '@/components/ai/ChatBubbleGate'

export const metadata: Metadata = {
  title: 'Stillastock — Smart POS & ERP',
  description: 'All-in-one POS & ERP system for local businesses. Manage stock, sales, accounting and employees in one place.',
  metadataBase: new URL('https://stillastock.xyz'),
  openGraph: {
    title: 'Stillastock — Smart POS & ERP',
    description: 'All-in-one POS & ERP system for local businesses.',
    url: 'https://stillastock.xyz',
    siteName: 'Stillastock',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Stillastock — Smart POS & ERP',
    description: 'All-in-one POS & ERP system for local businesses.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="my">
      <body>
        <script dangerouslySetInnerHTML={{__html: `
          try {
            var th = JSON.parse(localStorage.getItem('app_theme')||'{"mode":"light","primaryColor":"blue","fontSize":"medium"}');
            if(th.mode) document.documentElement.setAttribute('data-theme', th.mode);
            var colors = {blue:'#2563eb',green:'#16a34a',purple:'#9333ea',orange:'#f97316',red:'#dc2626',teal:'#0d9488'};
            var fonts = {small:'13px',medium:'15px',large:'17px'};
            var themes = {
              light:{bg:'#f9fafb',card:'#ffffff',text:'#111827',border:'#e5e7eb',sidebar:'#111827'},
              dark:{bg:'#374151',card:'#4B5563',text:'#F9FAFB',border:'#6B7280',sidebar:'#111827'},
              classic:{bg:'#f5f0e8',card:'#fefcf8',text:'#2c1a0e',border:'#d4b896',sidebar:'#3d2b1f'}
            };
            var sv = {
              light:{'--sidebar-text':'#000000','--sidebar-hover-bg':'#F1F5F9','--sidebar-hover-text':'#0F172A','--sidebar-active-bg':'#0D9488','--sidebar-active-text':'#FFFFFF','--sidebar-border':'#CBD5E1','--sidebar-group-text':'#374151','--sidebar-title':'#000000','--sidebar-icon':'#374151'},
              dark:{'--sidebar-text':'#CBD5E1','--sidebar-hover-bg':'#1f2937','--sidebar-hover-text':'#FFFFFF','--sidebar-active-bg':'#0D9488','--sidebar-active-text':'#FFFFFF','--sidebar-border':'#374151','--sidebar-group-text':'#6B7280','--sidebar-title':'#FFFFFF','--sidebar-icon':'#9CA3AF'},
              classic:{'--sidebar-text':'#e8d5c4','--sidebar-hover-bg':'#5c4033','--sidebar-hover-text':'#fefcf8','--sidebar-active-bg':'#8b4513','--sidebar-active-text':'#FFFFFF','--sidebar-border':'#5c4033','--sidebar-group-text':'#a0836e','--sidebar-title':'#fefcf8','--sidebar-icon':'#a0836e'}
            };
            var mode = th.mode || 'light';
            var tm = themes[mode] || themes.light;
            var root = document.documentElement;
            if(th.primaryColor) root.style.setProperty('--color-primary', colors[th.primaryColor]||'#2563eb');
            root.style.setProperty('--color-bg', tm.bg);
            root.style.setProperty('--color-card', tm.card);
            root.style.setProperty('--color-text', tm.text);
            root.style.setProperty('--color-border', tm.border);
            root.style.setProperty('--color-sidebar', tm.sidebar);
            var sidebarVars = sv[mode] || sv.light;
            Object.keys(sidebarVars).forEach(function(k){ root.style.setProperty(k, sidebarVars[k]); });
            if(th.fontSize) document.body && (document.body.style.fontSize = fonts[th.fontSize]||'15px');
          } catch(e){}
        `}} />
        <I18nProvider>
          <ThemeApplier />
          {children}
          <ChatBubbleGate />
        </I18nProvider>
      </body>
    </html>
  )
}
