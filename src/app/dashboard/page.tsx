'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { getCompanyId } from '@/lib/getCompanyId'
import AppLayout from '@/components/layout/AppLayout'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    todaySales: 0, todayCount: 0,
    monthSales: 0, monthProfit: 0,
    totalProducts: 0, lowStock: 0,
    ar: 0, ap: 0, monthExpenses: 0,
  })
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [lowStockItems, setLowStockItems] = useState<any[]>([])
  const supabase = createClient()
  const { t } = useI18n()

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0]
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const cid = await getCompanyId()
      const filter = (q: any) => cid ? q.eq('company_id', cid) : q
      const [
        { data: todayTxns }, { data: monthTxns }, { data: monthItems },
        { data: prods }, { data: lowProds }, { data: contacts }, { data: expenses },
      ] = await Promise.all([
        filter(supabase.from('transactions').select('total_amount')).gte('created_at', today),
        filter(supabase.from('transactions').select('total_amount')).gte('created_at', monthStart),
        filter(supabase.from('transaction_items').select('product_id,quantity,unit_price,cost_at_sale,products(name)')).gte('created_at', monthStart),
        filter(supabase.from('products').select('stock_qty,reorder_level')).eq('is_deleted', false),
        filter(supabase.from('products').select('id,name,stock_qty,reorder_level')).eq('is_deleted', false).lt('stock_qty', 10).order('stock_qty').limit(5),
        filter(supabase.from('contacts').select('contact_type,current_balance')).eq('is_deleted', false),
        filter(supabase.from('expenses').select('amount')).gte('created_at', monthStart),
      ])
      const todaySales = (todayTxns||[]).reduce((s:number,t:any)=>s+Number(t.total_amount),0)
      const todayCount = (todayTxns||[]).length
      const monthSales = (monthTxns||[]).reduce((s:number,t:any)=>s+Number(t.total_amount),0)
      const monthExpenses = (expenses||[]).reduce((s:number,e:any)=>s+Number(e.amount),0)
      const cogs = (monthItems||[]).reduce((s:number,i:any)=>s+(Number(i.cost_at_sale)*Number(i.quantity)),0)
      const monthProfit = monthSales - cogs
      const totalProducts = (prods||[]).length
      const lowStock = (prods||[]).filter((p:any)=>Number(p.stock_qty)<=Number(p.reorder_level||5)).length
      const ar = (contacts||[]).filter((c:any)=>['Customer','Both'].includes(c.contact_type)).reduce((s:number,c:any)=>s+Number(c.current_balance||0),0)
      const ap = (contacts||[]).filter((c:any)=>['Supplier','Both'].includes(c.contact_type)).reduce((s:number,c:any)=>s+Number(c.current_balance||0),0)
      const prodMap: any = {}
      ;(monthItems||[]).forEach((i:any)=>{
        const pid = i.product_id
        if(!prodMap[pid]) prodMap[pid]={name:i.products?.name||pid,qty:0,revenue:0}
        prodMap[pid].qty+=Number(i.quantity)
        prodMap[pid].revenue+=Number(i.unit_price)*Number(i.quantity)
      })
      const top5 = Object.values(prodMap).sort((a:any,b:any)=>b.revenue-a.revenue).slice(0,5)
      setStats({todaySales,todayCount,monthSales,monthProfit,totalProducts,lowStock,ar,ap,monthExpenses})
      setTopProducts(top5)
      setLowStockItems(lowProds||[])
      setLoading(false)
    }
    load()
  }, [])

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

  // KPI Cards with gradient backgrounds
  const kpiCards = [
    { 
      label: t.today_revenue, 
      sub: `${stats.todayCount} ${t.transactions}`, 
      value: `K ${stats.todaySales.toLocaleString()}`, 
      icon: '💰',
      gradient: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
      border: '#a7f3d0',
      textColor: '#065f46',
      href: '/reports/sales' 
    },
    { 
      label: t.monthly_sales, 
      sub: t.this_month, 
      value: `K ${stats.monthSales.toLocaleString()}`, 
      icon: '📈',
      gradient: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
      border: '#93c5fd',
      textColor: '#1e40af',
      href: '/reports/sales' 
    },
    { 
      label: t.gross_profit, 
      sub: 'After COGS', 
      value: `K ${stats.monthProfit.toLocaleString()}`, 
      icon: stats.monthProfit >= 0 ? '✨' : '📉',
      gradient: stats.monthProfit >= 0 ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' : 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',
      border: stats.monthProfit >= 0 ? '#a7f3d0' : '#fca5a5',
      textColor: stats.monthProfit >= 0 ? '#065f46' : '#991b1b',
      href: '/reports/sales' 
    },
    { 
      label: t.expenses_label, 
      sub: t.this_month, 
      value: `K ${stats.monthExpenses.toLocaleString()}`, 
      icon: '💸',
      gradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
      border: '#fcd34d',
      textColor: '#92400e',
      href: '/expenses' 
    },
    { 
      label: t.receivables, 
      sub: (t as any).dash_cust_owe || 'Customers owe', 
      value: `K ${stats.ar.toLocaleString()}`, 
      icon: '📨',
      gradient: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
      border: '#fdba74',
      textColor: '#c2410c',
      href: '/finance/ar' 
    },
    { 
      label: t.payables, 
      sub: (t as any).dash_supp_owe || 'Owe suppliers', 
      value: `K ${stats.ap.toLocaleString()}`, 
      icon: '📤',
      gradient: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)',
      border: '#e879f9',
      textColor: '#86198f',
      href: '/finance/ap' 
    },
    { 
      label: t.total_products, 
      sub: (t as any).dash_active_sku || 'Active SKUs', 
      value: stats.totalProducts.toString(), 
      icon: '🛒',
      gradient: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
      border: '#c4b5fd',
      textColor: '#5b21b6',
      href: '/admin/products' 
    },
    { 
      label: t.low_stock, 
      sub: (t as any).dash_needs_reorder || 'Needs reorder', 
      value: stats.lowStock > 0 ? `${stats.lowStock} items` : (t as any).dash_all_clear || 'All clear', 
      icon: stats.lowStock > 0 ? '⚠️' : '✅',
      gradient: stats.lowStock > 0 ? 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)' : 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
      border: stats.lowStock > 0 ? '#fca5a5' : '#a7f3d0',
      textColor: stats.lowStock > 0 ? '#991b1b' : '#065f46',
      href: '/inventory' 
    },
  ]

  return (
    <AppLayout>
      <div className="min-h-screen p-4 md:p-6" style={{backgroundColor:'var(--color-bg)'}}>

        <header className="mb-4 md:mb-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{color:'var(--color-text-secondary)'}}>ERP2 • {dateStr}</p>
              <h1 className="mt-1 text-2xl md:text-3xl font-bold tracking-tight" style={{color:'var(--color-text)'}}>ဒီနေ့ ဘာလုပ်မလဲ?</h1>
            </div>
            <div className="hidden sm:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{background:'var(--surface-1)',border:'1px solid var(--color-border)',color:'var(--color-text-secondary)'}}>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />{t.live}
            </div>
          </div>
        </header>

        <section aria-label="Quick actions" className="mb-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
            {[
              ['/pos','＋','ရောင်းချမယ်','POS ကို တန်းဖွင့်ပြီး စရောင်းပါ'],
              ['/inventory','▣','Stock စစ်မယ်','လက်ကျန်နဲ့ reorder ကို တစ်ချက်ကြည့်ပါ'],
              ['/expenses','−','Expense မှတ်မယ်','အသုံးစရိတ်ကို အလွယ်တကူ မှတ်ပါ'],
              ['/finance/ar','₿','အကြွေးစစ်မယ်','Customer ရရန်ငွေကို စစ်ပါ'],
            ].map(([href,icon,title,hint], i) => (
              <Link key={href} href={href} className="material-control group min-h-[104px] md:min-h-[116px] rounded-xl p-4 flex flex-col justify-between" style={{background:i===0?'var(--surface-1)':'var(--surface-2)',borderColor:i===0?'var(--color-primary)':'var(--color-border)'}}>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-semibold" style={{color:i===0?'var(--color-primary)':'var(--color-text)'}}>{icon}</span>
                  <span className="text-xs opacity-50 group-hover:opacity-100">→</span>
                </div>
                <div>
                  <div className="text-sm font-bold" style={{color:'var(--color-text)'}}>{title}</div>
                  <div className="mt-0.5 text-[11px] leading-4 line-clamp-1" style={{color:'var(--color-text-secondary)'}}>{hint}</div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-3 rounded-xl px-4 py-3 flex items-center gap-3" style={{background:'linear-gradient(135deg,rgba(59,130,246,.08),rgba(99,102,241,.04))',border:'1px solid var(--color-border)'}}>
            <span className="text-lg">✦</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{color:'var(--color-text)'}}>မသိတာရှိရင် AI ကို မေးပါ</p>
              <p className="text-xs truncate" style={{color:'var(--color-text-secondary)'}}>“ဒီနေ့ sales ဘယ်လောက်လဲ?” “Stock နည်းတာ ဘာတွေရှိလဲ?”</p>
            </div>
            <span className="text-xs font-semibold whitespace-nowrap" style={{color:'var(--color-primary)'}}>AI →</span>
          </div>
        </section>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_,i)=>(
              <div key={i} className="h-32 rounded-2xl animate-pulse" style={{backgroundColor:'var(--color-border)'}}/>
            ))}
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 mb-5">
              {[
                [t.today_revenue, 'K ' + stats.todaySales.toLocaleString(), stats.todayCount + ' ' + t.transactions, '/reports/sales'],
                [t.monthly_sales, 'K ' + stats.monthSales.toLocaleString(), t.this_month, '/reports/sales'],
                [t.gross_profit, 'K ' + stats.monthProfit.toLocaleString(), 'After COGS', '/reports/sales'],
                [t.expenses_label, 'K ' + stats.monthExpenses.toLocaleString(), t.this_month, '/expenses'],
              ].map(([label,value,sub,href]) => (
                <Link key={href} href={href} className="material-control rounded-xl p-3.5 md:p-4" style={{background:'var(--surface-1)',borderColor:'var(--color-border)'}}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{color:'var(--color-text-secondary)'}}>{label}</div>
                  <div className="mt-1 text-lg md:text-xl font-bold truncate" style={{color:'var(--color-text)'}}>{value}</div>
                  <div className="mt-0.5 text-[11px]" style={{color:'var(--color-text-secondary)'}}>{sub}</div>
                </Link>
              ))}
            </section>

            {/* Bottom Panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Top Products - Floating Style */}
              <div className="rounded-2xl overflow-hidden" style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
              }}>
                <div className="p-4 border-b" style={{background:'var(--color-bg)', borderColor:'var(--color-border)'}}>
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold" style={{color:'var(--color-text)'}}>🏆 {t.top_products}</h2>
                    <span className="text-xs px-3 py-1 rounded-full" style={{
                      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                      border: '1px solid #93c5fd',
                      color: '#1e40af'
                    }}>
                      {(t as any).dash_this_month || 'This month'}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  {topProducts.length === 0 ? (
                    <div className="text-center py-10" style={{color:'var(--color-text-secondary)'}}>
                      <span className="text-3xl mb-2 block">📭</span>
                      <p className="text-sm">{(t as any).dash_no_sales || 'No sales data yet'}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(topProducts as any[]).map((p:any, i:number) => {
                        const pct = Math.round((p.revenue / (topProducts[0] as any).revenue) * 100)
                        const gradients = [
                          { bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', color: '#92400e', border: '#fcd34d' },
                          { bg: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)', color: '#475569', border: '#94a3b8' },
                          { bg: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)', color: '#c2410c', border: '#fb923c' },
                          { bg: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', color: '#64748b', border: '#94a3b8' },
                          { bg: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', color: '#64748b', border: '#94a3b8' },
                        ]
                        const style = gradients[i]
                        return (
                          <div key={i} className="rounded-xl p-3" style={{
                            background: style.bg,
                            border: `1px solid ${style.border}`
                          }}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                  style={{backgroundColor: style.color}}>
                                  {i+1}
                                </span>
                                <span className="text-sm font-semibold truncate max-w-[140px]" style={{color: style.color}}>
                                  {p.name}
                                </span>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold" style={{color: style.color}}>K {Number(p.revenue).toLocaleString()}</div>
                                <div className="text-xs" style={{color: style.color, opacity: 0.7}}>{p.qty} {(t as any).dash_units || 'units'}</div>
                              </div>
                            </div>
                            <div className="w-full rounded-full h-1.5 overflow-hidden" style={{backgroundColor: 'rgba(255,255,255,0.6)'}}>
                              <div className="h-full rounded-full transition-all duration-500"
                                style={{width:`${pct}%`, backgroundColor: style.color}}/>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Stock Alerts - Floating Style */}
              <div className="rounded-2xl overflow-hidden" style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
              }}>
                <div className="p-4 border-b" style={{background:'var(--color-bg)', borderColor:'var(--color-border)'}}>
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold" style={{color:'var(--color-text)'}}>📦 {t.stock_alerts}</h2>
                    <Link href="/inventory"
                      className="text-xs font-medium px-3 py-1 rounded-full transition-all hover:scale-105"
                      style={{
                        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                        border: '1px solid #93c5fd',
                        color: '#1e40af'
                      }}>
                      {(t as any).dash_view_all || 'View all'}
                    </Link>
                  </div>
                </div>
                <div className="p-4">
                  {lowStockItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3 rounded-xl" style={{
                      background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                      border: '1px solid #a7f3d0'
                    }}>
                      <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                        style={{backgroundColor:'rgba(255,255,255,0.8)', border:'2px solid #6ee7b7'}}>
                        ✅
                      </div>
                      <p className="text-emerald-700 font-semibold text-sm">{(t as any).dash_stock_healthy || 'All stock levels healthy'}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lowStockItems.map((p:any) => {
                        const isOut = Number(p.stock_qty) <= 0
                        return (
                          <Link key={p.id} href="/inventory">
                            <div className="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all hover:scale-[1.01]"
                              style={{
                                background: isOut 
                                  ? 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)' 
                                  : 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                                border: `1px solid ${isOut ? '#fca5a5' : '#fcd34d'}`,
                              }}>
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{isOut ? '🚨' : '⚠️'}</span>
                                <span className="text-sm font-medium truncate" style={{color: isOut ? '#991b1b' : '#92400e'}}>
                                  {p.name}
                                </span>
                              </div>
                              <span className="text-xs font-bold px-3 py-1 rounded-full text-white"
                                style={{backgroundColor: isOut ? '#ef4444' : '#f59e0b'}}>
                                {isOut ? 'OUT' : `${p.stock_qty} left`}
                              </span>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
