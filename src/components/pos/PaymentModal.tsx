'use client'
import { useState, useEffect } from 'react'
import { toEnglishNumber } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'

interface BankAccount { id: string; account_name: string; current_balance: number; account_type?: { icon: string } }
interface Contact { id: string; contact_name: string; phone?: string }

interface PaymentModalProps {
  totalAmount: number
  customerId?: string
  customerName?: string
  onClose: () => void
  onConfirm: (data: {
    totalAmount: number
    amountReceived: number
    customerId?: string
    customerName?: string
    paymentType: string
    payments: { method: string; amount: number; bankAccountId?: string }[]
    bankAccountId?: string
  }) => Promise<void>
}

type PayMode = 'cash' | 'credit' | 'split'

export default function PaymentModal({ totalAmount, customerId: initCustomerId, customerName: initCustomerName, onClose, onConfirm }: PaymentModalProps) {
  const { t } = useI18n()
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS
  const [mode, setMode] = useState<PayMode>('cash')
  const [cashAmount, setCashAmount] = useState<string>(totalAmount.toString())
  const [splitCash, setSplitCash] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // Bank account
  const [useBankTransfer, setUseBankTransfer] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [splitBankId, setSplitBankId] = useState('')
  const [showSplitBank, setShowSplitBank] = useState(false)

  // Customer selection (for credit)
  const [customerId, setCustomerId] = useState(initCustomerId || '')
  const [customerName, setCustomerName] = useState(initCustomerName || '')
  const [customers, setCustomers] = useState<Contact[]>([])
  const [custSearch, setCustSearch] = useState('')
  const [showCustPicker, setShowCustPicker] = useState(false)

  useEffect(() => {
    // Get company_id then fetch bank accounts
    const getComp = async () => {
      let cid = ''
      const ss = localStorage.getItem('staff_session')
      if (ss) {
        try { const sess = JSON.parse(ss); const { data: p } = await supabase.from('profiles').select('company_id').eq('id', sess.id).maybeSingle(); cid = p?.company_id || '' } catch {}
      }
      if (!cid) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) { const { data: p } = await supabase.from('profiles').select('company_id').eq('auth_user_id', user.id).maybeSingle(); cid = p?.company_id || '' }
      }
      const q = supabase.from('bank_accounts').select('id,account_name,current_balance,account_type:account_type_id(icon)').eq('is_active', true).eq('is_deleted', false)
      const { data } = cid ? await q.eq('company_id', cid) : await q
      setBankAccounts((data as any) || [])
    }
    getComp()

    const fetchCustomers = async () => {
      let q = supabase.from('contacts')
        .select('id,contact_name,phone')
        .in('contact_type', ['Customer','Both'])
        .eq('is_deleted', false).order('contact_name')
      // company_id filter
      let cid = ''
      const ss = localStorage.getItem('staff_session')
      if (ss) { try { const s = JSON.parse(ss); cid = s.company_id || '' } catch {} }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: p } = await supabase.from('profiles').select('company_id').eq('auth_user_id', session.user.id).maybeSingle()
          cid = p?.company_id || ''
        }
      }
      if (cid) q = q.eq('company_id', cid)
      const { data } = await q
      setCustomers(data || [])
    }
    fetchCustomers()
  }, [])

  const cashNum = Number(cashAmount || 0)
  const splitCashNum = Number(splitCash || 0)
  const splitCredit = Math.max(0, totalAmount - splitCashNum)
  const change = cashNum - totalAmount

  const filteredCusts = customers.filter(c =>
    c.contact_name.toLowerCase().includes(custSearch.toLowerCase()) ||
    (c.phone || '').includes(custSearch))

  const handleConfirm = async () => {
    setMsg('')
    if (mode === 'credit' && !customerId) { setMsg(t.payment_err_no_customer_credit); return }
    if (mode === 'split' && !customerId) { setMsg(t.payment_err_no_customer_split); return }
    if (mode === 'cash' && !useBankTransfer && cashNum < totalAmount) { setMsg(t.payment_err_insufficient); return }
    if (useBankTransfer && !selectedBankId) { setMsg('Bank account ရွေးပါ'); return }
    if (mode === 'split' && splitCashNum <= 0) { setMsg(t.payment_err_no_cash); return }
    if (mode === 'split' && splitCashNum >= totalAmount) { setMsg(t.payment_err_cash_too_high); return }

    setLoading(true)
    let payments: { method: string; amount: number; bankAccountId?: string }[] = []
    let amountReceived = 0
    let paymentType = mode as string

    if (mode === 'cash') {
      if (useBankTransfer) {
        payments = [{ method: 'bank', amount: totalAmount, bankAccountId: selectedBankId }]
        amountReceived = totalAmount
        paymentType = 'bank'
        // Update bank balance
        const ba = bankAccounts.find(b => b.id === selectedBankId)
        if (ba) await supabase.from('bank_accounts').update({ current_balance: Number(ba.current_balance) + totalAmount }).eq('id', selectedBankId)
      } else {
        payments = [{ method: 'cash', amount: totalAmount }]
        amountReceived = cashNum
      }
    } else if (mode === 'credit') {
      payments = [{ method: 'credit', amount: totalAmount }]
      amountReceived = 0
    } else {
      payments = [
        { method: splitBankId ? 'bank' : 'cash', amount: splitCashNum, bankAccountId: splitBankId || undefined },
        { method: 'credit', amount: splitCredit },
      ]
      amountReceived = splitCashNum
      // Update split bank balance if bank selected
      if (splitBankId) {
        const ba = bankAccounts.find(b => b.id === splitBankId)
        if (ba) await supabase.from('bank_accounts').update({
          current_balance: Number(ba.current_balance) + splitCashNum
        }).eq('id', splitBankId)
      }
    }

    await onConfirm({ totalAmount, amountReceived, customerId, customerName, paymentType, payments, bankAccountId: selectedBankId })
    setLoading(false)
  }

  const s = (light: string, dark: string) => light // use CSS vars instead

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{backgroundColor: 'var(--color-card, #fff)', color: 'var(--color-text, #111827)'}}>

        {/* Title */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{t.payment_title}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
            style={{backgroundColor: 'var(--color-bg, #f9fafb)', color: 'var(--color-text-sub, #6b7280)'}}>✕</button>
        </div>

        {/* Total */}
        <div className="rounded-xl p-4 mb-4 text-center"
          style={{backgroundColor: 'var(--color-bg, #f9fafb)', border: '1px solid var(--color-border, #e5e7eb)'}}>
          <p className="text-xs mb-1" style={{color: 'var(--color-text-sub, #6b7280)'}}>{t.payment_total}</p>
          <p className="text-3xl font-bold" style={{color: 'var(--color-primary, #2563eb)'}}>
            K {totalAmount.toLocaleString()}
          </p>
          {customerName && <p className="text-xs mt-1 font-medium" style={{color: '#16a34a'}}>👤 {customerName}</p>}
        </div>

        {/* Mode tabs */}
        <div className="grid grid-cols-3 gap-1 mb-4 p-1 rounded-xl"
          style={{backgroundColor: 'var(--color-bg, #f3f4f6)'}}>
          {([['cash','💵',t.payment_cash],['credit','📒',t.payment_credit],['split','🔀',t.payment_split]] as [PayMode,string,string][]).map(([m,icon,label]) => (
            <button key={m} onClick={() => { setMode(m); setMsg(''); setUseBankTransfer(false) }}
              className="py-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-0.5"
              style={{
                backgroundColor: mode === m ? 'var(--color-card, #fff)' : 'transparent',
                color: mode === m ? 'var(--color-primary, #2563eb)' : 'var(--color-text-sub, #6b7280)',
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>

        {/* Cash mode */}
        {mode === 'cash' && (
          <div className="mb-4 space-y-3">
            {/* Bank transfer toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl"
              style={{backgroundColor: 'var(--color-bg, #f9fafb)', border: '1px solid var(--color-border, #e5e7eb)'}}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🏦</span>
                <span className="text-sm font-medium" style={{color: 'var(--color-text, #111827)'}}>🏦 Bank Account</span>
              </div>
              <button onClick={() => setUseBankTransfer(p => !p)}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                style={{backgroundColor: useBankTransfer ? 'var(--color-primary, #2563eb)' : 'var(--color-border, #d1d5db)'}}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useBankTransfer ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Bank account selector */}
            {useBankTransfer && (
              <div className="space-y-2">
                {bankAccounts.length === 0 ? (
                  <p className="text-xs text-center p-3 rounded-xl"
                    style={{backgroundColor: 'var(--color-bg, #f9fafb)', color: 'var(--color-text-sub, #6b7280)'}}>
                    Bank account မရှိ — Settings မှာ ထည့်ပါ
                  </p>
                ) : bankAccounts.map(b => (
                  <button key={b.id} onClick={() => setSelectedBankId(b.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl transition-all"
                    style={{
                      backgroundColor: selectedBankId === b.id ? '#f0fdf4' : 'var(--color-bg, #f9fafb)',
                      border: `2px solid ${selectedBankId === b.id ? '#16a34a' : 'var(--color-border, #e5e7eb)'}`,
                    }}>
                    <span className="text-xl">{(b.account_type as any)?.icon || '🏦'}</span>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm" style={{color: 'var(--color-text, #111827)'}}>{b.account_name}</p>
                      <p className="text-xs" style={{color: 'var(--color-text-sub, #6b7280)'}}>K {Number(b.current_balance).toLocaleString()}</p>
                    </div>
                    {selectedBankId === b.id && <span style={{color: '#16a34a'}}>✓</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Cash input (only if not bank transfer) */}
            {!useBankTransfer && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-2" style={{color: 'var(--color-text-sub, #6b7280)'}}>
                    {t.payment_received}
                  </label>
                  <input type="text" inputMode="numeric" value={cashAmount}
                    onChange={e => { const v = toEnglishNumber(e.target.value); if(/^[0-9]*$/.test(v)) setCashAmount(v) }}
                    className="w-full rounded-xl p-3 text-2xl font-bold text-right outline-none"
                    style={{
                      backgroundColor: 'var(--color-bg, #f9fafb)',
                      border: '2px solid var(--color-primary, #2563eb)',
                      color: 'var(--color-text, #111827)',
                    }} autoFocus />
                </div>
                {cashNum >= totalAmount && (
                  <div className="flex justify-between p-2.5 rounded-xl text-sm"
                    style={{backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0'}}>
                    <span style={{color: '#374151'}}>{t.payment_change}</span>
                    <span className="font-bold" style={{color: '#16a34a'}}>K {change.toLocaleString()}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Credit mode */}
        {mode === 'credit' && (
          <div className="mb-4 space-y-3">
            {/* Customer picker */}
            {!customerId ? (
              <div>
                <p className="text-xs font-medium mb-2" style={{color: 'var(--color-text-sub, #6b7280)'}}>Customer ရွေးပါ *</p>
                {!showCustPicker ? (
                  <button onClick={() => setShowCustPicker(true)}
                    className="w-full p-3 rounded-xl text-sm font-medium flex items-center gap-2"
                    style={{border: '2px dashed var(--color-primary, #2563eb)', color: 'var(--color-primary, #2563eb)'}}>
                    <span>👤</span><span>Customer ရွေးရန် နှိပ်ပါ</span>
                  </button>
                ) : (
                  <div className="rounded-xl overflow-hidden"
                    style={{border: '1px solid var(--color-border, #e5e7eb)'}}>
                    <input type="text" value={custSearch} onChange={e => setCustSearch(e.target.value)}
                      placeholder="နာမည် / ဖုန်း ရှာပါ..." autoFocus
                      className="w-full p-2.5 text-sm outline-none"
                      style={{backgroundColor: 'var(--color-bg, #f9fafb)', color: 'var(--color-text, #111827)',
                        borderBottom: '1px solid var(--color-border, #e5e7eb)'}} />
                    <div className="max-h-40 overflow-y-auto">
                      {filteredCusts.map(c => (
                        <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerName(c.contact_name); setShowCustPicker(false) }}
                          className="w-full flex justify-between px-3 py-2 text-sm transition-all"
                          style={{color: 'var(--color-text, #111827)'}}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg, #f9fafb)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                          <span className="font-medium">{c.contact_name}</span>
                          {c.phone && <span style={{color: 'var(--color-text-sub, #6b7280)'}}>{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-xl"
                style={{backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0'}}>
                <span>👤</span>
                <span className="flex-1 font-medium text-sm" style={{color: '#166534'}}>{customerName}</span>
                <button onClick={() => { setCustomerId(''); setCustomerName(''); setShowCustPicker(false) }}
                  className="text-xs" style={{color: '#ef4444'}}>✕</button>
              </div>
            )}

            <div className="rounded-xl p-3"
              style={{backgroundColor: '#fff7ed', border: '1px solid #fed7aa'}}>
              <p className="text-sm font-semibold" style={{color: '#c2410c'}}>{t.payment_credit_info}</p>
              <p className="text-sm mt-1" style={{color: '#374151'}}>K {totalAmount.toLocaleString()} — ကြွေးစာရင်းသွင်းမည်</p>
            </div>
          </div>
        )}

        {/* Split mode */}
        {mode === 'split' && (
          <div className="mb-4 space-y-3">
            {/* Customer for split */}
            {!customerId ? (
              <div>
                <p className="text-xs font-medium mb-2" style={{color: 'var(--color-text-sub, #6b7280)'}}>Customer ရွေးပါ *</p>
                {!showCustPicker ? (
                  <button onClick={() => setShowCustPicker(true)}
                    className="w-full p-3 rounded-xl text-sm font-medium flex items-center gap-2"
                    style={{border: '2px dashed var(--color-primary, #2563eb)', color: 'var(--color-primary, #2563eb)'}}>
                    <span>👤</span><span>Customer ရွေးရန် နှိပ်ပါ</span>
                  </button>
                ) : (
                  <div className="rounded-xl overflow-hidden"
                    style={{border: '1px solid var(--color-border, #e5e7eb)'}}>
                    <input type="text" value={custSearch} onChange={e => setCustSearch(e.target.value)}
                      placeholder="နာမည် / ဖုန်း ရှာပါ..." autoFocus
                      className="w-full p-2.5 text-sm outline-none"
                      style={{backgroundColor: 'var(--color-bg, #f9fafb)', color: 'var(--color-text, #111827)',
                        borderBottom: '1px solid var(--color-border, #e5e7eb)'}} />
                    <div className="max-h-40 overflow-y-auto">
                      {filteredCusts.map(c => (
                        <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerName(c.contact_name); setShowCustPicker(false) }}
                          className="w-full flex justify-between px-3 py-2 text-sm"
                          style={{color: 'var(--color-text, #111827)'}}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg, #f9fafb)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                          <span className="font-medium">{c.contact_name}</span>
                          {c.phone && <span style={{color: 'var(--color-text-sub, #6b7280)'}}>{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-xl"
                style={{backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0'}}>
                <span>👤</span>
                <span className="flex-1 font-medium text-sm" style={{color: '#166534'}}>{customerName}</span>
                <button onClick={() => { setCustomerId(''); setCustomerName(''); setShowCustPicker(false) }}
                  className="text-xs" style={{color: '#ef4444'}}>✕</button>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-2" style={{color: 'var(--color-text-sub, #6b7280)'}}>
                {t.payment_split_cash}
              </label>
              <input type="text" inputMode="numeric" value={splitCash}
                onChange={e => { const v = toEnglishNumber(e.target.value); if(/^[0-9]*$/.test(v)) setSplitCash(v) }}
                className="w-full rounded-xl p-3 text-2xl font-bold text-right outline-none"
                style={{
                  backgroundColor: 'var(--color-bg, #f9fafb)',
                  border: '2px solid var(--color-primary, #2563eb)',
                  color: 'var(--color-text, #111827)',
                }} placeholder="0" />
            </div>
            {splitCashNum > 0 && splitCashNum < totalAmount && (
              <div className="rounded-xl p-3 space-y-1.5"
                style={{backgroundColor: '#fff7ed', border: '1px solid #fed7aa'}}>
                <div className="flex justify-between text-sm">
                  <span style={{color: '#374151'}}>{t.payment_cash}</span>
                  <span className="font-bold" style={{color: '#111827'}}>K {splitCashNum.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{color: '#374151'}}>{t.payment_split_credit}</span>
                  <span className="font-bold" style={{color: '#c2410c'}}>K {splitCredit.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Bank account for split - optional */}
            <div className="rounded-xl overflow-hidden"
              style={{border: '1px solid var(--color-border, #e5e7eb)'}}>
              <button
                onClick={() => setShowSplitBank(p => !p)}
                className="w-full flex items-center justify-between p-3 text-sm"
                style={{backgroundColor: 'var(--color-bg, #f9fafb)', color: 'var(--color-text, #111827)'}}>
                <div className="flex items-center gap-2">
                  <span>🏦</span>
                  <span className="font-medium">Bank Account (ရှေ့ပိုင်း Bank ဖြင့် ချေမည်ဆိုရင်)</span>
                </div>
                <span style={{color: 'var(--color-text-sub,#6b7280)'}}>{showSplitBank ? '▲' : '▼'}</span>
              </button>
              {showSplitBank && bankAccounts.length > 0 && (
                <div className="p-2 space-y-1"
                  style={{borderTop: '1px solid var(--color-border, #e5e7eb)', backgroundColor: 'var(--color-card,#fff)'}}>
                  <button
                    onClick={() => setSplitBankId('')}
                    className="w-full flex items-center gap-2 p-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: splitBankId === '' ? '#f0fdf4' : 'transparent',
                      border: splitBankId === '' ? '1px solid #bbf7d0' : '1px solid transparent',
                      color: 'var(--color-text, #111827)',
                    }}>
                    <span>💵</span><span>ငွေသားဖြင့်သာ ရောနှောပေးမည်</span>
                    {splitBankId === '' && <span className="ml-auto" style={{color:'#16a34a'}}>✓</span>}
                  </button>
                  {bankAccounts.map(b => (
                    <button key={b.id} onClick={() => setSplitBankId(b.id)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: splitBankId === b.id ? '#f0fdf4' : 'transparent',
                        border: splitBankId === b.id ? '1px solid #bbf7d0' : '1px solid transparent',
                        color: 'var(--color-text, #111827)',
                      }}>
                      <span>{(b.account_type as any)?.icon || '🏦'}</span>
                      <span className="font-medium">{b.account_name}</span>
                      <span className="text-xs ml-auto" style={{color:'var(--color-text-sub,#6b7280)'}}>
                        K {Number(b.current_balance).toLocaleString()}
                      </span>
                      {splitBankId === b.id && <span style={{color:'#16a34a'}}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {msg && (
          <p className="text-xs mb-3 px-3 py-2 rounded-lg"
            style={{backgroundColor: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca'}}>
            {msg}
          </p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-medium"
            style={{border: '1px solid var(--color-border, #e5e7eb)', color: 'var(--color-text, #111827)'}}>
            {t.cancel}
          </button>
          <button onClick={handleConfirm} disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{backgroundColor: '#16a34a'}}>
            {loading ? t.payment_processing : t.payment_confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
