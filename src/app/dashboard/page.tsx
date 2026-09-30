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

        {/* Header - Floating Style */}
        <div className="rounded-2xl px-5 py-4 mb-6" style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
        }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold" style={{color:'var(--color-text)'}}>
                📊 {(t as any).dash_title || 'Dashboard'}
              </h1>
              <p className="text-sm mt-0.5" style={{color:'var(--color-text-secondary)'}}>{dateStr}</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
              border: '1px solid #a7f3d0'
            }}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-medium text-emerald-700">{t.live}</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_,i)=>(
              <div key={i} className="h-32 rounded-2xl animate-pulse" style={{backgroundColor:'var(--color-border)'}}/>
            ))}
          </div>
        ) : (
          <>
            {/* KPI Cards - Gradient Floating Style */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
              {kpiCards.map((card, i) => (
                <Link key={i} href={card.href}>
                  <div className="rounded-2xl p-4 md:p-5 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
                    style={{
                      background: card.gradient,
                      border: `1px solid ${card.border}`,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
                    }}>
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{color: card.textColor, opacity: 0.8}}>
                        {card.label}
                      </span>
                      <span className="text-lg">{card.icon}</span>
                    </div>
                    <div className="text-xl md:text-2xl font-bold mb-1" style={{color: card.textColor}}>
                      {card.value}
                    </div>
                    <div className="text-xs font-medium" style={{color: card.textColor, opacity: 0.7}}>
                      {card.sub}
                    </div>
                    {/* Progress indicator */}
                    <div className="mt-3 h-1 rounded-full overflow-hidden" style={{backgroundColor: 'rgba(255,255,255,0.5)'}}>
                      <div className="h-full rounded-full" style={{
                        width: '100%',
                        background: `linear-gradient(90deg, ${card.textColor}40 0%, ${card.textColor}80 100%)`
                      }}/>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

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
