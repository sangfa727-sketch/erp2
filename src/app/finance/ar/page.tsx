'use client'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getCompanyId } from '@/lib/getCompanyId'
import { getDb } from '@/lib/db'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'
import { toEnglishNumber } from '@/lib/utils'

interface CreditSale {
  id: string
  total_amount: number
  amount_received: number
  created_at: string
  customer_id: string | null
  customer?: { contact_name: string }
  items?: { quantity: number; unit_price: number; product?: { name: string; unit: string } }[]
}
interface BankAccount { id: string; account_name: string; account_type?: { icon: string } }
interface ARPayment {
  id: string; contact_id: string; transaction_id?: string; amount: number
  payment_date: string; payment_method: string; notes: string
  contact?: { contact_name: string }
  bank_account?: { account_name: string }
}

// Manual AR entry (not from POS)
interface ManualAR {
  customerId: string
  amount: string
  description: string
  date: string
}

export default function ARPage() {
  const { t } = useI18n()
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS
  const [creditSales, setCreditSales] = useState<CreditSale[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [payments, setPayments] = useState<ARPayment[]>([])
  const [allCustomers, setAllCustomers] = useState<{id:string;contact_name:string}[]>([])
  const [loading, setLoading] = useState(true)

  // Receive payment modal
  const [receiveModal, setReceiveModal] = useState<{ open: boolean; txn: CreditSale | null }>({ open: false, txn: null })
  // Add manual AR modal
  const [addModal, setAddModal] = useState(false)
  const [manualAR, setManualAR] = useState<ManualAR>({ customerId: '', amount: '', description: '', date: new Date().toISOString().split('T')[0] })

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [amount, setAmount] = useState('')
  // Batch payment state
  const [selectedSales, setSelectedSales] = useState<string[]>([])
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchPayMethod, setBatchPayMethod] = useState<'cash'|'bank'|'split'>('cash')
  const [batchCash, setBatchCash] = useState('')
  const [batchBankId, setBatchBankId] = useState('')
  const [batchSaving, setBatchSaving] = useState(false)

  const toggleSale = (id: string) => setSelectedSales(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )
  // getSelectedTotal(selectedCustomerData) calculated after selectedCustomerData is declared
  const getSelectedTotal = (data: typeof selectedCustomerData) =>
    (data?.sales || [])
      .filter(s => selectedSales.includes(s.id))
      .reduce((sum, s) => sum + (Number(s.total_amount) - Number(s.amount_received)), 0)

  const handleBatchPay = async () => {
    if (!selectedSales.length) return
    setBatchSaving(true)
    const cashAmt = batchPayMethod === 'cash' ? getSelectedTotal(selectedCustomerData)
      : batchPayMethod === 'bank' ? 0
      : parseFloat(batchCash) || 0
    const bankAmt = batchPayMethod === 'bank' ? getSelectedTotal(selectedCustomerData)
      : batchPayMethod === 'split' ? getSelectedTotal(selectedCustomerData) - cashAmt : 0
    const today = new Date().toISOString().split('T')[0]
    for (const saleId of selectedSales) {
      const sale = selectedCustomerData?.sales.find(s => s.id === saleId)
      if (!sale) continue
      const debt = Number(sale.total_amount) - Number(sale.amount_received)
      if (debt <= 0) continue
      // Insert payment record
      if (cashAmt > 0) {
        await supabase.from('ar_payments').insert({
          contact_id: sale.customer_id, transaction_id: saleId,
          amount: Math.min(cashAmt / selectedSales.length, debt),
          payment_date: today, payment_method: 'cash', notes: 'Batch payment'
        })
      }
      if (bankAmt > 0 && batchBankId) {
        await supabase.from('ar_payments').insert({
          contact_id: sale.customer_id, transaction_id: saleId,
          amount: Math.min(bankAmt / selectedSales.length, debt),
          payment_date: today, payment_method: 'bank',
          bank_account_id: batchBankId, notes: 'Batch payment'
        })
      }
      // Update transaction amount_received
      const payAmt = Math.min(cashAmt / selectedSales.length + bankAmt / selectedSales.length, debt)
      await supabase.from('transactions').update({
        amount_received: Number(sale.amount_received) + payAmt
      }).eq('id', saleId)
      // Update customer balance
      if (sale.customer_id) {
        const { data: contact } = await supabase.from('contacts').select('current_balance').eq('id', sale.customer_id).single()
        if (contact) await supabase.from('contacts').update({
          current_balance: Math.max(0, Number(contact.current_balance) - payAmt)
        }).eq('id', sale.customer_id)
      }
    }
    // Update bank balance
    if (bankAmt > 0 && batchBankId) {
      const { data: ba } = await supabase.from('bank_accounts').select('current_balance').eq('id', batchBankId).single()
      if (ba) await supabase.from('bank_accounts').update({
        current_balance: Math.max(0, Number(ba.current_balance) - bankAmt)
      }).eq('id', batchBankId)
    }
    setSelectedSales([])
    setShowBatchModal(false)
    setBatchCash('')
    setBatchSaving(false)
    await fetchAll()
  }
  const [payMethod, setPayMethod] = useState('cash')
  const [bankAccountId, setBankAccountId] = useState('')
  const [notes, setNotes] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const searchParams = useSearchParams()
  const [filterCustomer, setFilterCustomer] = useState(searchParams.get('customer') || '')

  const fetchAll = async () => {
    const cid = await getCompanyId()
    setLoading(true)
    const [{ data: txns }, { data: banks }, { data: pays }, { data: custs }] = await Promise.all([
      supabase.from('transactions')
        .select('id,total_amount,amount_received,created_at,customer_id,customer:customer_id(contact_name),items:transaction_items(quantity,unit_price,product:product_id(name,unit))')
        .order('created_at', { ascending: false }),
      supabase.from('bank_accounts').select('id,account_name,account_type:account_type_id(icon)').eq('is_active', true).eq('is_deleted', false),
      supabase.from('ar_payments').select('*,contact:contact_id(contact_name),bank_account:bank_account_id(account_name)')
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('contacts').select('id,contact_name').in('contact_type',['Customer','Both']).eq('company_id',cid).order('contact_name'),
    ])
    // credit sales: amount_received < total_amount
    const credits = ((txns as any)||[]).filter((x:any) => Number(x.amount_received) < Number(x.total_amount))
    setCreditSales(credits)
    setBankAccounts((banks as any)||[])
    setPayments((pays as any)||[])
    setAllCustomers((custs as any)||[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  // Group credit sales by customer
  const customerMap = new Map<string, { name: string; sales: CreditSale[]; totalDebt: number }>()
  creditSales.forEach(s => {
    const custId = s.customer_id || 'unknown'
    const custName = (s.customer as any)?.contact_name || 'Unknown'
    const debt = Number(s.total_amount) - Number(s.amount_received)
    if (!customerMap.has(custId)) customerMap.set(custId, { name: custName, sales: [], totalDebt: 0 })
    const entry = customerMap.get(custId)!
    entry.sales.push(s)
    entry.totalDebt += debt
  })
  const customerList = Array.from(customerMap.entries()).map(([id, v]) => ({ id, ...v }))
  const totalAR = customerList.reduce((s, c) => s + c.totalDebt, 0)

  const selectedCustomerData = filterCustomer ? customerMap.get(filterCustomer) : null
  const filteredPayments = filterCustomer
    ? payments.filter(p => p.contact_id === filterCustomer)
    : payments

  // Open receive payment modal
  const openReceive = (txn: CreditSale) => {
    const maxAmt = Number(txn.total_amount) - Number(txn.amount_received)
    setAmount(String(maxAmt))
    setReceiveModal({ open: true, txn })
    setMsg('')
  }

  // Handle receive payment
  const handleReceive = async () => {
    if (!receiveModal.txn) return
    if (!amount || Number(amount) <= 0) { setMsg(t.ar_err_amount); return }
    setSaving(true); setMsg('')
    const cid = await getCompanyId()
    const payAmt = Number(amount)
    const maxAmt = Number(receiveModal.txn.total_amount) - Number(receiveModal.txn.amount_received)
    const actualAmt = Math.min(payAmt, maxAmt)

    const { error } = await supabase.from('ar_payments').insert({
      company_id: cid,
      contact_id: receiveModal.txn.customer_id,
      transaction_id: receiveModal.txn.id,
      payment_date: payDate,
      amount: actualAmt,
      payment_method: payMethod,
      bank_account_id: payMethod !== 'cash' ? bankAccountId || null : null,
      notes: notes || null,
    })
    if (error) { setMsg('Error: ' + error.message); setSaving(false); return }

    // Update transaction amount_received
    await supabase.from('transactions').update({
      amount_received: Number(receiveModal.txn.amount_received) + actualAmt
    }).eq('id', receiveModal.txn.id)

    // Update customer balance
    if (receiveModal.txn.customer_id) {
      const { data: contact } = await supabase.from('contacts').select('current_balance').eq('id', receiveModal.txn.customer_id).single()
      if (contact) await supabase.from('contacts').update({ current_balance: Math.max(0, Number(contact.current_balance) - actualAmt) }).eq('id', receiveModal.txn.customer_id)
    }

    // Update bank balance
    if (payMethod !== 'cash' && bankAccountId) {
      const { data: ba } = await supabase.from('bank_accounts').select('current_balance').eq('id', bankAccountId).single()
      if (ba) await supabase.from('bank_accounts').update({ current_balance: Number(ba.current_balance) + actualAmt }).eq('id', bankAccountId)
    }

    setMsg('✅'); await fetchAll()
    setReceiveModal({ open: false, txn: null }); setAmount(''); setNotes(''); setBankAccountId('')
    setSaving(false)
  }

  // Handle manual AR add (ကြွေးထည့်)
  const handleAddManualAR = async () => {
    if (!manualAR.customerId) { setMsg('Customer ရွေးပါ'); return }
    if (!manualAR.amount || Number(manualAR.amount) <= 0) { setMsg(t.ar_err_amount); return }
    const cid = await getCompanyId()
    setSaving(true); setMsg('')
    const { data: profileData } = await supabase.from('profiles').select('company_id')
    const companyId = profileData?.[0]?.company_id
    const amt = Number(manualAR.amount)

    // Create a manual transaction record
    const { data: newTxn, error } = await supabase.from('transactions').insert({
      company_id: cid,
      customer_id: manualAR.customerId,
      total_amount: amt,
      amount_received: 0,
      payment_type: 'credit',
      created_at: manualAR.date + 'T00:00:00',
    }).select().single()
    if (error) { setMsg('Error: ' + error.message); setSaving(false); return }

    // Update customer balance
    const { data: contact } = await supabase.from('contacts').select('current_balance').eq('id', manualAR.customerId).single()
    if (contact) {
      await supabase.from('contacts').update({ current_balance: Number(contact.current_balance) + amt }).eq('id', manualAR.customerId)
    }

    setMsg('✅'); await fetchAll()
    setAddModal(false)
    setManualAR({ customerId: '', amount: '', description: '', date: new Date().toISOString().split('T')[0] })
    setSaving(false)
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">📨 {t.ar}</h1>
          <div className="flex gap-2">
            {filterCustomer && (
              <button onClick={() => setFilterCustomer('')}
                className="text-sm text-blue-600 hover:underline px-3 py-1 bg-blue-50 rounded-full border border-blue-200">
                ← {t.ar_show_all}
              </button>
            )}
            <button onClick={() => { setAddModal(true); setMsg('') }}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">
              {t.ar_add_debt_btn}
            </button>
          </div>
        </div>

        {/* Total AR */}
        <div className="rounded-2xl p-5 mb-6" style={{
          background:'linear-gradient(135deg,#fff7ed,#ffedd5)',
          border:'1px solid #fed7aa',
          boxShadow:'0 4px 20px rgba(249,115,22,0.1), 0 1px 4px rgba(0,0,0,0.05)'
        }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-orange-600 mb-1">📨 {t.ar_total}</div>
              <div className="text-3xl font-bold text-orange-700">K {totalAR.toLocaleString()}</div>
              <div className="text-xs text-orange-500 mt-1">{customerList.length} customers · ကြွေးကျန်</div>
            </div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
              style={{background:'rgba(249,115,22,0.15)'}}>
              📨
            </div>
          </div>
        </div>

        {!filterCustomer ? (
          /* Customer List */
          <div className="rounded-2xl overflow-hidden mb-6" style={{
          background:'var(--color-card)',
          border:'1px solid var(--color-border)',
          boxShadow:'0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)'
        }}>
            <div className="p-4 border-b" style={{background:'var(--color-bg)', borderColor:'var(--color-border)'}}>
              <h2 className="font-bold" style={{color:'var(--color-text)'}}>{t.ar_customer_list}</h2>
            </div>
            {/* Mobile */}
            <div className="md:hidden divide-y">
              {loading ? <p className="text-center p-8 text-gray-400">{t.loading}</p>
              : customerList.length===0 ? <p className="text-center p-8 text-gray-400">{t.ar_no_debt}</p>
              : customerList.map(c => (
                <div key={c.id} className="p-4 flex items-center justify-between cursor-pointer transition-colors"
                  style={{borderBottom:'0.5px solid var(--color-border)'}}
                  onMouseEnter={e=>(e.currentTarget.style.background='var(--color-bg)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                  onClick={()=>setFilterCustomer(c.id)}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{background:'rgba(249,115,22,0.12)',color:'#ea580c'}}>
                      {c.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-sm" style={{color:'var(--color-text)'}}>{c.name}</p>
                      <p className="text-xs text-gray-400">{c.sales.length} {t.ar_times}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-orange-600">K {c.totalDebt.toLocaleString()}</p>
                    <p className="text-xs text-blue-500 mt-0.5">{t.ar_view_btn} →</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop */}
            <table className="hidden md:table w-full text-sm">
              <thead style={{background:'var(--color-bg)',borderBottom:'1px solid var(--color-border)'}}>
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-500 uppercase tracking-wide" style={{fontSize:'11px'}}>{t.col_name}</th>
                  <th className="text-center p-3 font-semibold text-gray-500 uppercase tracking-wide" style={{fontSize:'11px'}}>{t.ar_col_times}</th>
                  <th className="text-right p-3 font-semibold text-gray-500 uppercase tracking-wide" style={{fontSize:'11px'}}>{t.ar_col_debt}</th>
                  <th className="text-center p-3 font-semibold text-gray-500 uppercase tracking-wide" style={{fontSize:'11px'}}>{t.col_action}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="text-center p-8 text-gray-400">{t.loading}</td></tr>
                ) : customerList.length === 0 ? (
                  <tr><td colSpan={4} className="text-center p-8 text-gray-400">{t.ar_no_debt}</td></tr>
                ) : customerList.map(c => (
                  <tr key={c.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setFilterCustomer(c.id)}>
                    <td className="p-3 font-medium text-blue-700">{c.name}</td>
                    <td className="p-3 text-center text-gray-500">{c.sales.length} {t.ar_times}</td>
                    <td className="p-3 text-right font-bold text-orange-600">K {c.totalDebt.toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded text-xs">{t.ar_view_btn}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Customer Detail */
          <div>
            <div className="rounded-2xl overflow-hidden mb-6" style={{
              background:'var(--color-card)',
              border:'1px solid var(--color-border)',
              boxShadow:'0 4px 20px rgba(0,0,0,0.06)'
            }}>
              <div className="p-4 border-b" style={{background:'linear-gradient(135deg,#fff7ed,#ffedd5)',borderColor:'#fed7aa'}}>
                <h2 className="font-bold text-gray-800 text-lg">👤 {selectedCustomerData?.name || 'Unknown Customer'}</h2>
                <p className="text-sm text-orange-600">{t.ar_col_debt}: <span className="font-bold">K {selectedCustomerData?.totalDebt.toLocaleString()}</span></p>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3 w-8">
                      <input type="checkbox" className="w-4 h-4"
                        checked={selectedSales.length === (selectedCustomerData?.sales.filter(s=>Number(s.total_amount)-Number(s.amount_received)>0).length||0) && selectedSales.length > 0}
                        onChange={e => {
                          if (e.target.checked) setSelectedSales(selectedCustomerData?.sales.filter(s=>Number(s.total_amount)-Number(s.amount_received)>0).map(s=>s.id)||[])
                          else setSelectedSales([])
                        }}/>
                    </th>
                    <th className="text-left p-3 font-semibold text-gray-600">{t.col_date}</th>
                    <th className="text-left p-3 font-semibold text-gray-600">{t.ar_items}</th>
                    <th className="text-right p-3 font-semibold text-gray-600">{t.col_total}</th>
                    <th className="text-right p-3 font-semibold text-gray-600">{t.ar_paid}</th>
                    <th className="text-right p-3 font-semibold text-gray-600">{t.ar_col_debt}</th>
                    <th className="text-center p-3 font-semibold text-gray-600">{t.col_action}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCustomerData?.sales.map(s => {
                    const debt = Number(s.total_amount) - Number(s.amount_received)
                    return (
                      <tr key={s.id}
                        className={"border-b cursor-pointer transition-colors " + (selectedSales.includes(s.id) ? "bg-orange-50" : "hover:bg-gray-50")}
                        onClick={() => debt > 0 && toggleSale(s.id)}>
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          {debt > 0 && <input type="checkbox" className="w-4 h-4" checked={selectedSales.includes(s.id)} onChange={() => toggleSale(s.id)}/>}
                        </td>
                        <td className="p-3 text-xs text-gray-500">
                          {new Date(s.created_at).toLocaleDateString()}<br/>
                          <span className="text-gray-400">{new Date(s.created_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>
                        </td>
                        <td className="p-3">
                          <div className="space-y-1">
                            {(s.items||[]).map((item,i) => (
                              <div key={i} className="flex items-center gap-1 text-xs">
                                <span className="font-medium text-gray-800">{(item.product as any)?.name||'-'}</span>
                                <span className="text-gray-400">×</span>
                                <span className="text-blue-700 font-bold">{item.quantity} {(item.product as any)?.unit||'ခု'}</span>
                                <span className="text-gray-400">@ K {Number(item.unit_price).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-right font-bold">K {Number(s.total_amount).toLocaleString()}</td>
                        <td className="p-3 text-right text-green-600">K {Number(s.amount_received).toLocaleString()}</td>
                        <td className="p-3 text-right font-bold text-orange-600">K {debt.toLocaleString()}</td>
                        <td className="p-3 text-center">
                          {debt > 0 && (
                            <button onClick={() => openReceive(s)}
                              className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600">
                              {t.ar_receive_btn}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {/* Payment History */}
            <div className="rounded-2xl overflow-hidden" style={{
              background:'var(--color-card)',
              border:'1px solid var(--color-border)',
              boxShadow:'0 4px 20px rgba(0,0,0,0.06)'
            }}>
              <div className="p-4 border-b" style={{background:'var(--color-bg)',borderColor:'var(--color-border)'}}>
                <h2 className="font-bold text-gray-700">{t.ar_history}</h2>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-600">{t.col_date}</th>
                    <th className="text-left p-3 font-semibold text-gray-600">{t.ar_col_payment}</th>
                    <th className="text-left p-3 font-semibold text-gray-600">{t.ar_notes}</th>
                    <th className="text-right p-3 font-semibold text-gray-600">{t.col_amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.length === 0 ? (
                    <tr><td colSpan={4} className="text-center p-8 text-gray-400">{t.no_data}</td></tr>
                  ) : filteredPayments.map(p => (
                    <tr key={p.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-xs text-gray-500">{p.payment_date}</td>
                      <td className="p-3 text-xs">{p.payment_method==='cash'?t.ar_cash:`🏦 ${(p.bank_account as any)?.account_name||p.payment_method}`}</td>
                      <td className="p-3 text-xs text-gray-500">{p.notes||'-'}</td>
                      <td className="p-3 text-right font-bold text-green-600">K {Number(p.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Receive Payment Modal */}
      {receiveModal.open && receiveModal.txn && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-5 md:p-6 w-full md:max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-2">{t.ar_modal_title}</h2>
            <div className="bg-orange-50 rounded-lg p-3 mb-4 text-sm">
              <p className="font-medium text-gray-800">👤 {(receiveModal.txn.customer as any)?.contact_name}</p>
              <p className="text-orange-600">{t.ar_col_debt}: <span className="font-bold">K {(Number(receiveModal.txn.total_amount)-Number(receiveModal.txn.amount_received)).toLocaleString()}</span></p>
              <div className="mt-2 space-y-0.5">
                {(receiveModal.txn.items||[]).map((item,i) => (
                  <div key={i} className="text-xs text-gray-600 flex gap-1">
                    <span>{(item.product as any)?.name}</span>
                    <span className="text-gray-400">× {item.quantity}</span>
                    <span>@ K {Number(item.unit_price).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.col_date}</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.ar_payment_method}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setPayMethod('cash')} className={`py-2 rounded-lg text-sm border ${payMethod==='cash'?'bg-blue-600 text-white':'hover:bg-gray-50'}`}>{t.ar_cash}</button>
                  <button onClick={() => setPayMethod('bank')} className={`py-2 rounded-lg text-sm border ${payMethod==='bank'?'bg-blue-600 text-white':'hover:bg-gray-50'}`}>{t.ar_bank}</button>
                </div>
              </div>
              {payMethod==='bank' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.ar_bank_account}</label>
                  <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className="w-full p-2 border rounded-lg text-sm">
                    <option value="">{t.ar_select}</option>
                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{(b.account_type as any)?.icon} {b.account_name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.ar_amount}</label>
                <input type="text" inputMode="numeric" value={amount}
                  onChange={e => { const v=toEnglishNumber(e.target.value); if(/^[0-9.]*$/.test(v)) setAmount(v) }}
                  className="w-full p-2 border rounded-lg text-sm" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.ar_notes}</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
              </div>
            </div>
            {msg && <p className={'text-sm mt-3 '+(msg.includes('✅')?'text-green-600':'text-red-500')}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setReceiveModal({open:false,txn:null}); setMsg('') }} className="flex-1 py-2 border rounded-lg text-sm">{t.btn_cancel}</button>
              <button onClick={handleReceive} disabled={saving} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? t.loading : t.ar_confirm_btn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Manual AR Modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-5 md:p-6 w-full md:max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{t.ar_add_debt_title}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
                <select value={manualAR.customerId} onChange={e => setManualAR(m => ({...m, customerId: e.target.value}))}
                  className="w-full p-2 border rounded-lg text-sm">
                  <option value="">{t.ar_select}</option>
                  {allCustomers.map(c => <option key={c.id} value={c.id}>{c.contact_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.col_date}</label>
                <input type="date" value={manualAR.date} onChange={e => setManualAR(m => ({...m, date: e.target.value}))}
                  className="w-full p-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.ar_description}</label>
                <input type="text" value={manualAR.description} onChange={e => setManualAR(m => ({...m, description: e.target.value}))}
                  className="w-full p-2 border rounded-lg text-sm" placeholder={t.ar_description_ph} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.ar_amount}</label>
                <input type="text" inputMode="numeric" value={manualAR.amount}
                  onChange={e => { const v=toEnglishNumber(e.target.value); if(/^[0-9.]*$/.test(v)) setManualAR(m => ({...m, amount: v})) }}
                  className="w-full p-2 border rounded-lg text-sm" placeholder="0" />
              </div>
            </div>
            {msg && <p className={'text-sm mt-3 '+(msg.includes('✅')?'text-green-600':'text-red-500')}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setAddModal(false); setMsg('') }} className="flex-1 py-2 border rounded-lg text-sm">{t.btn_cancel}</button>
              <button onClick={handleAddManualAR} disabled={saving} className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? t.loading : t.ar_add_debt_confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Payment Floating Bar */}
      {selectedSales.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl"
          style={{
            transform: 'translateX(-50%)',
            backgroundColor: '#1e293b',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(12px)',
            minWidth: '320px',
            maxWidth: '90vw',
          }}>
          {/* Left - selection info */}
          <div className="flex items-center gap-2 flex-1">
            <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-orange-400 font-bold text-xs">{selectedSales.length}</span>
            </div>
            <div>
              <p className="text-white text-xs font-medium leading-none mb-0.5">ရွေးထားသည်</p>
              <p className="text-orange-400 font-bold text-sm leading-none">K {getSelectedTotal(selectedCustomerData).toLocaleString()}</p>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-white/10"/>

          {/* Clear button */}
          <button onClick={() => setSelectedSales([])}
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all text-xs">
            ✕
          </button>

          {/* Pay button */}
          <button onClick={() => setShowBatchModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              boxShadow: '0 2px 12px rgba(16,185,129,0.4)',
            }}>
            <span>💰</span>
            <span>ငွေချေမည်</span>
          </button>
        </div>
      )}

      {/* Batch Payment Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-lg mb-4">💰 Batch ငွေချေမည်</h3>
            <div className="mb-4 p-3 bg-orange-50 rounded-xl">
              <p className="text-sm text-gray-600">{selectedSales.length} ခု • စုစုပေါင်း</p>
              <p className="text-2xl font-bold text-orange-600">K {getSelectedTotal(selectedCustomerData).toLocaleString()}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([['cash','💵','Cash'],['bank','🏦','Bank'],['split','✂️','Split']] as [string,string,string][]).map(([val,icon,label]) => (
                <button key={val} onClick={() => setBatchPayMethod(val as any)}
                  className={"p-2 rounded-xl border-2 text-center text-xs font-medium transition-all " + (batchPayMethod===val ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200")}>
                  <div className="text-lg">{icon}</div>
                  {label}
                </button>
              ))}
            </div>
            {(batchPayMethod === 'bank' || batchPayMethod === 'split') && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">🏦 Bank Account</label>
                <select value={batchBankId} onChange={e => setBatchBankId(e.target.value)}
                  className="w-full p-2 border rounded-xl text-sm">
                  <option value="">ရွေးပါ</option>
                  {bankAccounts.map(b => <option key={b.id} value={b.id}>{(b.account_type as any)?.icon||'🏦'} {b.account_name}</option>)}
                </select>
              </div>
            )}
            {batchPayMethod === 'split' && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">💵 Cash ပမာဏ</label>
                <input type="number" value={batchCash} onChange={e => setBatchCash(e.target.value)}
                  className="w-full p-2 border rounded-xl text-sm" placeholder="0" />
                {batchCash && <p className="text-xs text-gray-500 mt-1">🏦 Bank: K {Math.max(0, getSelectedTotal(selectedCustomerData) - (parseFloat(batchCash)||0)).toLocaleString()}</p>}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowBatchModal(false)}
                className="flex-1 py-2 border rounded-xl text-sm">ပယ်ဖျက်</button>
              <button onClick={handleBatchPay} disabled={batchSaving}
                className="flex-1 py-2 bg-green-500 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                {batchSaving ? 'ချေနေသည်...' : '✅ ချေမည်'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
