'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getCompanyId } from '@/lib/getCompanyId'
import { getDb } from '@/lib/db'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'
import { toEnglishNumber } from '@/lib/utils'

interface CreditPurchase {
  id: string
  items_total: number
  amount_paid: number
  created_at: string
  supplier_id: string | null
  supplier?: { contact_name: string }
  items?: { qty: number; unit_price: number; product?: { name: string; unit: string } }[]
}
interface BankAccount { id: string; account_name: string; account_type?: { icon: string } }
interface APPayment {
  id: string; contact_id: string; purchase_id: string; amount: number
  payment_date: string; payment_method: string; notes: string
  contact?: { contact_name: string }
  bank_account?: { account_name: string }
}

export default function APPage() {
  const { t } = useI18n()
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS
  const [creditPurchases, setCreditPurchases] = useState<CreditPurchase[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [payments, setPayments] = useState<APPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; purchase: CreditPurchase | null }>({ open: false, purchase: null })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [amount, setAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [bankAccountId, setBankAccountId] = useState('')
  const [notes, setNotes] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [filterSupplier, setFilterSupplier] = useState('')

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: purch }, { data: banks }, { data: pays }] = await Promise.all([
      supabase.from('purchases')
        .select('id,items_total,amount_paid,created_at,supplier_id,supplier:supplier_id(contact_name),items:purchase_items(qty,unit_price,product:product_id(name,unit))')
        .order('created_at', { ascending: false }),
      supabase.from('bank_accounts').select('id,account_name,account_type:account_type_id(icon)').eq('is_active', true).eq('is_deleted', false),
      supabase.from('ap_payments').select('*,contact:contact_id(contact_name),bank_account:bank_account_id(account_name)')
        .order('created_at', { ascending: false }).limit(100),
    ])
    // credit purchases: amount_paid < items_total
    const credits = ((purch as any) || []).filter((x: any) => Number(x.amount_paid) < Number(x.items_total))
    setCreditPurchases(credits)
    setBankAccounts((banks as any) || [])
    setPayments((pays as any) || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  // Group by supplier
  const supplierMap = new Map<string, { name: string; purchases: CreditPurchase[]; totalDebt: number }>()
  creditPurchases.forEach(p => {
    const supId = p.supplier_id || 'unknown'
    const supName = (p.supplier as any)?.contact_name || 'Unknown'
    const debt = Number(p.items_total) - Number(p.amount_paid)
    if (!supplierMap.has(supId)) supplierMap.set(supId, { name: supName, purchases: [], totalDebt: 0 })
    const entry = supplierMap.get(supId)!
    entry.purchases.push(p)
    entry.totalDebt += debt
  })
  const supplierList = Array.from(supplierMap.entries()).map(([id, v]) => ({ id, ...v }))
  const totalAP = supplierList.reduce((s, c) => s + c.totalDebt, 0)

  const selectedSupplierData = filterSupplier ? supplierMap.get(filterSupplier) : null
  const filteredPayments = filterSupplier
    ? payments.filter(p => p.contact_id === filterSupplier)
    : payments

  const openPay = (purchase: CreditPurchase) => {
    const maxAmt = Number(purchase.items_total) - Number(purchase.amount_paid)
    setAmount(String(maxAmt))
    setModal({ open: true, purchase })
    setMsg('')
  }

  const handleSave = async () => {
    if (!modal.purchase) return
    if (!amount || Number(amount) <= 0) { setMsg(t.ap_err_amount); return }
    setSaving(true); setMsg('')

    const companyId = await getCompanyId()
    const payAmt = Number(amount)
    const maxAmt = Number(modal.purchase.items_total) - Number(modal.purchase.amount_paid)
    const actualAmt = Math.min(payAmt, maxAmt)

    // Insert AP payment
    const { error } = await supabase.from('ap_payments').insert({
      company_id: companyId,
      contact_id: modal.purchase.supplier_id,
      purchase_id: modal.purchase.id,
      payment_date: payDate,
      amount: actualAmt,
      payment_method: payMethod,
      bank_account_id: payMethod !== 'cash' ? bankAccountId || null : null,
      notes: notes || null,
    })
    if (error) { setMsg('Error: ' + error.message); setSaving(false); return }

    // Update purchase amount_paid
    const newPaid = Number(modal.purchase.amount_paid) + actualAmt
    await supabase.from('purchases').update({ amount_paid: newPaid }).eq('id', modal.purchase.id)

    // Update supplier balance
    if (modal.purchase.supplier_id) {
      const { data: contact } = await supabase.from('contacts').select('current_balance').eq('id', modal.purchase.supplier_id).single()
      if (contact) {
        await supabase.from('contacts').update({
          current_balance: Math.max(0, Number(contact.current_balance) - actualAmt)
        }).eq('id', modal.purchase.supplier_id)
      }
    }

    // Update bank account balance
    if (payMethod !== 'cash' && bankAccountId) {
      const { data: ba } = await supabase.from('bank_accounts').select('current_balance').eq('id', bankAccountId).single()
      if (ba) await supabase.from('bank_accounts').update({ current_balance: Math.max(0, Number(ba.current_balance) - actualAmt) }).eq('id', bankAccountId)
    }

    setMsg('✅'); await fetchAll()
    setModal({ open: false, purchase: null }); setAmount(''); setNotes(''); setBankAccountId('')
    setSaving(false)
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">📤 {t.ap}</h1>
          {filterSupplier && (
            <button onClick={() => setFilterSupplier('')} className="text-sm text-blue-600 hover:underline px-3 py-1 bg-blue-50 rounded-full border border-blue-200">
              ← {t.ap_show_all}
            </button>
          )}
        </div>

        {/* Total AP */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="text-sm text-red-600 mb-1">📤 {t.ap_total}</div>
          <div className="text-3xl font-bold text-red-700">K {totalAP.toLocaleString()}</div>
          <div className="text-xs text-red-500 mt-1">{supplierList.length} Supplier</div>
        </div>

        {!filterSupplier ? (
          /* Supplier List View */
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            <div className="p-4 border-b bg-gray-50">
              <h2 className="font-bold text-gray-700">{t.ap_supplier_list}</h2>
            </div>
            {/* Mobile */}
            <div className="md:hidden divide-y">
              {loading ? <p className="text-center p-8 text-gray-400">{t.loading}</p>
              : supplierList.length===0 ? <p className="text-center p-8 text-gray-400">{t.ap_no_debt}</p>
              : supplierList.map(s => (
                <div key={s.id} className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50" onClick={()=>setFilterSupplier(s.id)}>
                  <div>
                    <p className="font-bold text-blue-700">{s.name}</p>
                    <p className="text-xs text-gray-500">{s.purchases.length} {t.ap_col_times}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-600">K {s.totalDebt.toLocaleString()}</p>
                    <p className="text-xs text-blue-500">{t.ap_view_btn}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop */}
            <table className="hidden md:table w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-600">{t.col_name}</th>
                  <th className="text-center p-3 font-semibold text-gray-600">{t.ap_col_times}</th>
                  <th className="text-right p-3 font-semibold text-gray-600">{t.ap_col_debt}</th>
                  <th className="text-center p-3 font-semibold text-gray-600">{t.col_action}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="text-center p-8 text-gray-400">{t.loading}</td></tr>
                ) : supplierList.length === 0 ? (
                  <tr><td colSpan={4} className="text-center p-8 text-gray-400">{t.ap_no_debt}</td></tr>
                ) : supplierList.map(s => (
                  <tr key={s.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setFilterSupplier(s.id)}>
                    <td className="p-3 font-medium text-blue-700 hover:underline">{s.name}</td>
                    <td className="p-3 text-center text-gray-500">{s.purchases.length} {t.ap_col_times}</td>
                    <td className="p-3 text-right font-bold text-red-600">K {s.totalDebt.toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded text-xs">{t.ap_view_btn}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Selected Supplier Detail View */
          <div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
              <div className="p-4 border-b bg-red-50 flex justify-between items-center">
                <div>
                  <h2 className="font-bold text-gray-800 text-lg">🏪 {selectedSupplierData?.name}</h2>
                  <p className="text-sm text-red-600">{t.ap_debt_label}: <span className="font-bold">K {selectedSupplierData?.totalDebt.toLocaleString()}</span></p>
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-600">{t.col_date}</th>
                    <th className="text-left p-3 font-semibold text-gray-600">{t.ap_items}</th>
                    <th className="text-right p-3 font-semibold text-gray-600">{t.col_total}</th>
                    <th className="text-right p-3 font-semibold text-gray-600">{t.ap_paid}</th>
                    <th className="text-right p-3 font-semibold text-gray-600">{t.ap_col_debt}</th>
                    <th className="text-center p-3 font-semibold text-gray-600">{t.col_action}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSupplierData?.purchases.map(p => {
                    const debt = Number(p.items_total) - Number(p.amount_paid)
                    return (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-xs text-gray-500">
                          {new Date(p.created_at).toLocaleDateString()}<br/>
                          <span className="text-gray-400">{new Date(p.created_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>
                        </td>
                        <td className="p-3">
                          <div className="space-y-1">
                            {(p.items || []).map((item, i) => (
                              <div key={i} className="flex items-center gap-1 text-xs">
                                <span className="font-medium text-gray-800">{(item.product as any)?.name || '-'}</span>
                                <span className="text-gray-400">×</span>
                                <span className="text-blue-700 font-bold">{item.qty} {(item.product as any)?.unit || 'ခု'}</span>
                                <span className="text-gray-400">@ K {Number(item.unit_price).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-right font-bold">K {Number(p.items_total).toLocaleString()}</td>
                        <td className="p-3 text-right text-green-600">K {Number(p.amount_paid).toLocaleString()}</td>
                        <td className="p-3 text-right font-bold text-red-600">K {debt.toLocaleString()}</td>
                        <td className="p-3 text-center">
                          {debt > 0 && (
                            <button onClick={() => openPay(p)}
                              className="px-3 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600">
                              {t.ap_pay_btn}
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
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-gray-50">
                <h2 className="font-bold text-gray-700">{t.ap_history}</h2>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-600">{t.col_date}</th>
                    <th className="text-left p-3 font-semibold text-gray-600">{t.ap_col_payment}</th>
                    <th className="text-left p-3 font-semibold text-gray-600">{t.ap_notes}</th>
                    <th className="text-right p-3 font-semibold text-gray-600">{t.col_amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.length === 0 ? (
                    <tr><td colSpan={4} className="text-center p-8 text-gray-400">{t.no_data}</td></tr>
                  ) : filteredPayments.map(p => (
                    <tr key={p.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-xs text-gray-500">{p.payment_date}</td>
                      <td className="p-3 text-xs">
                        {p.payment_method === 'cash' ? t.ap_cash : `🏦 ${(p.bank_account as any)?.account_name || p.payment_method}`}
                      </td>
                      <td className="p-3 text-xs text-gray-500">{p.notes || '-'}</td>
                      <td className="p-3 text-right font-bold text-red-600">K {Number(p.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pay Modal */}
      {modal.open && modal.purchase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-5 md:p-6 w-full md:max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-2">{t.ap_modal_title}</h2>
            <div className="bg-red-50 rounded-lg p-3 mb-4 text-sm">
              <p className="font-medium text-gray-800">🏪 {(modal.purchase.supplier as any)?.contact_name}</p>
              <p className="text-red-600">{t.ap_debt_label}: <span className="font-bold">K {(Number(modal.purchase.items_total) - Number(modal.purchase.amount_paid)).toLocaleString()}</span></p>
              <div className="mt-2 space-y-0.5">
                {(modal.purchase.items || []).map((item, i) => (
                  <div key={i} className="text-xs text-gray-600 flex gap-1">
                    <span>{(item.product as any)?.name}</span>
                    <span className="text-gray-400">×{item.qty}</span>
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
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.ap_payment_method}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setPayMethod('cash')} className={`py-2 rounded-lg text-sm border ${payMethod==='cash'?'bg-blue-600 text-white':'hover:bg-gray-50'}`}>{t.ap_cash}</button>
                  <button onClick={() => setPayMethod('bank')} className={`py-2 rounded-lg text-sm border ${payMethod==='bank'?'bg-blue-600 text-white':'hover:bg-gray-50'}`}>{t.ap_bank}</button>
                </div>
              </div>
              {payMethod === 'bank' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.ap_bank_account}</label>
                  <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className="w-full p-2 border rounded-lg text-sm">
                    <option value="">{t.ap_select}</option>
                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{(b.account_type as any)?.icon} {b.account_name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.ap_amount}</label>
                <input type="text" inputMode="numeric" value={amount}
                  onChange={e => { const v = toEnglishNumber(e.target.value); if(/^[0-9.]*$/.test(v)) setAmount(v) }}
                  className="w-full p-2 border rounded-lg text-sm" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.ap_notes}</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
              </div>
            </div>
            {msg && <p className={'text-sm mt-3 ' + (msg.includes('✅')?'text-green-600':'text-red-500')}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setModal({open:false,purchase:null}); setMsg('') }} className="flex-1 py-2 border rounded-lg text-sm">{t.btn_cancel}</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? t.loading : t.ap_confirm_btn}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
