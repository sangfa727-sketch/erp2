'use client'
import { getCompanyId } from '@/lib/getCompanyId'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'

interface TxnItem {
  product_id: string
  quantity: number
  unit_price: number
  product?: { name: string; unit: string }
}

interface Transaction {
  id: string
  total_amount: number
  amount_received: number
  created_at: string
  customer_id: string | null
  items?: TxnItem[]
}

type FilterMode = 'all' | 'cash' | 'credit'

export default function SalesReportPage() {
  const { t } = useI18n()
  const [txns, setTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const supabase = createClient()

  const fetchSales = async (selectedDate: string) => {
    setLoading(true)
    const start = selectedDate + 'T00:00:00'
    const end = selectedDate + 'T23:59:59'
    const { data } = await supabase
      .from('transactions')
      .select('id,total_amount,amount_received,created_at,customer_id,items:transaction_items(product_id,quantity,unit_price,product:product_id(name,unit))')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
    setTxns((data as any) || [])
    setLoading(false)
  }

  useEffect(() => { fetchSales(date) }, [date])

  const totalSales = txns.reduce((s, x) => s + Number(x.total_amount), 0)
  const totalReceived = txns.reduce((s, x) => s + Number(x.amount_received), 0)
  const totalCredit = totalSales - totalReceived

  const cashTxns = txns.filter(x => Number(x.amount_received) >= Number(x.total_amount))
  const creditTxns = txns.filter(x => Number(x.amount_received) < Number(x.total_amount))

  const totalCashSales = cashTxns.reduce((s, x) => s + Number(x.total_amount), 0)
  const totalCreditSales = creditTxns.reduce((s, x) => s + Number(x.total_amount), 0)
  const totalCreditBalance = creditTxns.reduce((s, x) => s + (Number(x.total_amount) - Number(x.amount_received)), 0)

  const filtered = filterMode === 'cash' ? cashTxns
    : filterMode === 'credit' ? creditTxns
    : txns

  const filteredTotal = filtered.reduce((s, x) => s + Number(x.total_amount), 0)
  const filteredReceived = filtered.reduce((s, x) => s + Number(x.amount_received), 0)
  const filteredBalance = filteredTotal - filteredReceived

  const handleCardClick = (mode: FilterMode) => {
    setFilterMode(prev => prev === mode ? 'all' : mode)
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl md:text-2xl font-bold" style={{color:'var(--color-text)'}}>📈 {t.page_reports}</h1>
          {filterMode !== 'all' && (
            <button onClick={() => setFilterMode('all')}
              className="text-xs px-3 py-1.5 rounded-full transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '1px solid #93c5fd',
                color: '#1e40af'
              }}>
              ← {t.rep_filter_all}
            </button>
          )}
        </div>

        {/* Date Picker - Floating Style */}
        <div className="rounded-2xl p-4 mb-4" style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
        }}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{color:'var(--color-text-secondary)'}}>{t.rep_date_label}</span>
            <input type="date" value={date}
              onChange={e => { setDate(e.target.value); setFilterMode('all') }}
              className="flex-1 p-2.5 rounded-xl text-sm outline-none transition-all"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)'
              }} />
          </div>
        </div>

        {/* Summary Cards - Gradient Floating Style */}
        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6">
          {/* Total Sales */}
          <button onClick={() => handleCardClick('all')}
            className={`rounded-2xl p-3 md:p-5 text-left transition-all duration-200 active:scale-[0.98] ${
              filterMode === 'all' ? 'ring-2 ring-blue-400 ring-offset-2' : ''
            }`}
            style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              border: '1px solid #93c5fd',
              boxShadow: filterMode === 'all' 
                ? '0 8px 30px rgba(59,130,246,0.25)' 
                : '0 4px 20px rgba(59,130,246,0.1)'
            }}>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-base md:text-lg">💰</span>
              <span className="text-[10px] md:text-xs font-medium text-blue-600">{t.rep_total_sales}</span>
            </div>
            <div className="text-lg md:text-2xl font-bold text-blue-700">K {totalSales.toLocaleString()}</div>
            <div className="text-[10px] md:text-xs text-blue-500 mt-1">{txns.length} {t.rep_transactions}</div>
          </button>

          {/* Cash Received */}
          <button onClick={() => handleCardClick('cash')}
            className={`rounded-2xl p-3 md:p-5 text-left transition-all duration-200 active:scale-[0.98] ${
              filterMode === 'cash' ? 'ring-2 ring-green-400 ring-offset-2' : ''
            }`}
            style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              border: '1px solid #86efac',
              boxShadow: filterMode === 'cash' 
                ? '0 8px 30px rgba(34,197,94,0.25)' 
                : '0 4px 20px rgba(34,197,94,0.1)'
            }}>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-base md:text-lg">✅</span>
              <span className="text-[10px] md:text-xs font-medium text-green-600">{t.rep_received}</span>
            </div>
            <div className="text-lg md:text-2xl font-bold text-green-700">K {totalReceived.toLocaleString()}</div>
            <div className="text-[10px] md:text-xs text-green-500 mt-1">{cashTxns.length} {t.rep_transactions}</div>
          </button>

          {/* Credit Balance */}
          <button onClick={() => handleCardClick('credit')}
            className={`rounded-2xl p-3 md:p-5 text-left transition-all duration-200 active:scale-[0.98] ${
              filterMode === 'credit' ? 'ring-2 ring-orange-400 ring-offset-2' : ''
            }`}
            style={{
              background: totalCreditBalance > 0 
                ? 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)' 
                : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              border: totalCreditBalance > 0 ? '1px solid #fdba74' : '1px solid #86efac',
              boxShadow: filterMode === 'credit' 
                ? '0 8px 30px rgba(249,115,22,0.25)' 
                : '0 4px 20px rgba(249,115,22,0.1)'
            }}>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-base md:text-lg">{totalCreditBalance > 0 ? '📋' : '✨'}</span>
              <span className={`text-[10px] md:text-xs font-medium ${totalCreditBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {t.rep_credit}
              </span>
            </div>
            <div className={`text-lg md:text-2xl font-bold ${totalCreditBalance > 0 ? 'text-orange-700' : 'text-green-700'}`}>
              K {totalCreditBalance.toLocaleString()}
            </div>
            <div className={`text-[10px] md:text-xs mt-1 ${totalCreditBalance > 0 ? 'text-orange-500' : 'text-green-500'}`}>
              {creditTxns.length} {t.rep_transactions}
            </div>
          </button>
        </div>

        {/* Active Filter Badge */}
        {filterMode !== 'all' && (
          <div className="mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
              style={{
                background: filterMode === 'cash' 
                  ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' 
                  : 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                border: filterMode === 'cash' ? '1px solid #86efac' : '1px solid #fdba74',
                color: filterMode === 'cash' ? '#15803d' : '#c2410c'
              }}>
              🔍 {filterMode === 'cash' ? t.rep_cash_tag : t.rep_credit_tag} ({filtered.length})
            </span>
          </div>
        )}

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="rounded-2xl p-8 text-center" style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
            }}>
              <p style={{color:'var(--color-text-secondary)'}}>{t.loading}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
            }}>
              <span className="text-3xl mb-2 block">📭</span>
              <p style={{color:'var(--color-text-secondary)'}}>{t.rep_no_data}</p>
            </div>
          ) : (
            <>
              {filtered.map(txn => {
                const isCash = Number(txn.amount_received) >= Number(txn.total_amount)
                const balance = Number(txn.total_amount) - Number(txn.amount_received)
                return (
                  <div key={txn.id} 
                    className="rounded-2xl p-4 transition-all active:scale-[0.99]"
                    style={{
                      background: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderLeft: `4px solid ${isCash ? '#22c55e' : '#f97316'}`,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
                    }}>
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
                          isCash 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {isCash ? '✅ ' + t.rep_cash_tag : '📋 ' + t.rep_credit_tag}
                        </span>
                        <span className="text-xs" style={{color:'var(--color-text-secondary)'}}>
                          {new Date(txn.created_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
                        </span>
                      </div>
                      <p className="text-lg font-bold" style={{color:'var(--color-text)'}}>
                        K {Number(txn.total_amount).toLocaleString()}
                      </p>
                    </div>
                    
                    {/* Items */}
                    <div className="space-y-1.5 mb-3 pb-3" style={{borderBottom:'1px solid var(--color-border)'}}>
                      {(txn.items||[]).map((item,i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="font-medium" style={{color:'var(--color-text)'}}>
                            {(item.product as any)?.name||'-'}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-blue-600">{item.quantity}</span>
                            <span style={{color:'var(--color-text-secondary)'}}>× K {Number(item.unit_price).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Footer */}
                    <div className="flex justify-between text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-green-600 font-medium">✅ K {Number(txn.amount_received).toLocaleString()}</span>
                      </div>
                      {balance > 0 && (
                        <span className="text-orange-600 font-medium">📋 K {balance.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                )
              })}
              
              {/* Summary Footer */}
              <div className="rounded-2xl p-4" style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
              }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold" style={{color:'var(--color-text)'}}>
                    {t.rep_total_label} ({filtered.length})
                  </span>
                  <span className="text-lg font-bold" style={{color:'var(--color-text)'}}>
                    K {filteredTotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-green-600 font-medium">✅ {t.rep_col_received}: K {filteredReceived.toLocaleString()}</span>
                  {filteredBalance > 0 && (
                    <span className="text-orange-600 font-medium">📋 K {filteredBalance.toLocaleString()}</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Desktop Table - Floating Style */}
        <div className="hidden md:block rounded-2xl overflow-hidden" style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
        }}>
          <div className="p-4 border-b" style={{background:'var(--color-bg)', borderColor:'var(--color-border)'}}>
            <h2 className="font-bold" style={{color:'var(--color-text)'}}>📋 {(t as any).rep_list_title || 'Sales List'}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{background:'var(--color-bg)', borderBottom:'1px solid var(--color-border)'}}>
                <tr>
                  <th className="text-left p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.rep_col_time}</th>
                  <th className="text-left p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.rep_col_items}</th>
                  <th className="text-right p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.rep_col_sales}</th>
                  <th className="text-right p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.rep_col_received}</th>
                  <th className="text-right p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.rep_credit}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center p-8" style={{color:'var(--color-text-secondary)'}}>{t.loading}</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center p-8" style={{color:'var(--color-text-secondary)'}}>{t.rep_no_data}</td></tr>
                ) : filtered.map(txn => {
                  const isCash = Number(txn.amount_received) >= Number(txn.total_amount)
                  const balance = Number(txn.total_amount) - Number(txn.amount_received)
                  return (
                    <tr key={txn.id} 
                      className="transition-colors"
                      style={{borderBottom:'1px solid var(--color-border)'}}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td className="p-3">
                        <div className="text-xs mb-1" style={{color:'var(--color-text-secondary)'}}>
                          {new Date(txn.created_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                          isCash ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {isCash ? t.rep_cash_tag : t.rep_credit_tag}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="space-y-1">
                          {(txn.items||[]).map((item,i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="font-medium" style={{color:'var(--color-text)'}}>{(item.product as any)?.name||'-'}</span>
                              <span className="text-blue-600 font-bold">×{item.quantity}</span>
                              <span style={{color:'var(--color-text-secondary)'}}>@ K {Number(item.unit_price).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right font-bold" style={{color:'var(--color-text)'}}>
                        K {Number(txn.total_amount).toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-medium text-green-600">
                        K {Number(txn.amount_received).toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-medium text-orange-600">
                        {balance > 0 ? `K ${balance.toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot style={{background:'var(--color-bg)', borderTop:'2px solid var(--color-border)'}}>
                  <tr>
                    <td className="p-4 font-bold" colSpan={2} style={{color:'var(--color-text)'}}>
                      {t.rep_total_label} ({filtered.length} {t.rep_transactions})
                    </td>
                    <td className="p-4 text-right font-bold" style={{color:'var(--color-text)'}}>
                      K {filteredTotal.toLocaleString()}
                    </td>
                    <td className="p-4 text-right font-bold text-green-600">
                      K {filteredReceived.toLocaleString()}
                    </td>
                    <td className="p-4 text-right font-bold text-orange-600">
                      {filteredBalance > 0 ? `K ${filteredBalance.toLocaleString()}` : '-'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
