'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getCompanyId } from '@/lib/getCompanyId'
import { getDb } from '@/lib/db'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'

export default function SalesReturnPage() {
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS
  const { t } = useI18n()
  const tAny = t as any
  const [returns, setReturns] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [txnSearch, setTxnSearch] = useState('')
  const [txnResult, setTxnResult] = useState<any>(null)
  const [txnLoading, setTxnLoading] = useState(false)

  const fetchAll = async () => {
    const cid = await getCompanyId()
    setLoading(true)
    const [{ data: rets },{ data: custs },{ data: bks }] = await Promise.all([
      supabase.from('sales_returns')
        .select('*,customer:customer_id(contact_name),bank_account:bank_account_id(account_name)')
        .order('created_at',{ascending:false}),
      supabase.from('contacts').select('id,contact_name').in('contact_type',['Customer','Both']).eq('company_id',cid).order('contact_name'),
      supabase.from('bank_accounts').select('id,account_name').eq('is_active',true).eq('is_deleted',false),
    ])
    setReturns(rets||[])
    setCustomers(custs||[])
    setBanks(bks||[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const searchTxn = async () => {
    if (!txnSearch.trim()) return
    setTxnLoading(true); setTxnResult(null)
    const { data } = await supabase
      .from('transactions')
      .select('id,total_amount,amount_received,created_at,customer_id,customer:customer_id(contact_name),items:transaction_items(quantity,unit_price,product:product_id(name,unit))')
      .ilike('id', txnSearch.trim()+'%')
      .maybeSingle()
    setTxnResult(data)
    setTxnLoading(false)
    if (data) {
      setModal((prev: any) => ({
        ...prev,
        original_transaction_id: data.id,
        customer_id: data.customer_id||'',
        items: (data.items||[]).map((i:any) => ({
          product_name: i.product?.name,
          unit: i.product?.unit,
          original_qty: i.quantity,
          return_qty: i.quantity,
          unit_price: i.unit_price,
        })),
        total_amount: data.total_amount,
      }))
    }
  }

  const openNew = () => {
    setTxnSearch(''); setTxnResult(null)
    setModal({ original_transaction_id:'', customer_id:'', items:[], total_amount:0, refund_method:'credit', bank_account_id:'', note:'' })
  }

  const calcTotal = (items: any[]) =>
    items.reduce((s:number,i:any) => s+(Number(i.return_qty)*Number(i.unit_price)),0)

  const save = async () => {
    if (!modal.customer_id||modal.items.length===0) {
      setMsg('❌ '+tAny.sr_customer_required); return
    }
    setSaving(true); setMsg('')
    const total = calcTotal(modal.items)
    const { data: prof } = await supabase.from('profiles').select('company_id,id').maybeSingle()
    const payload = {
      company_id: prof?.company_id,
      original_transaction_id: modal.original_transaction_id||null,
      customer_id: modal.customer_id,
      items: modal.items,
      total_amount: total,
      refund_method: modal.refund_method,
      bank_account_id: modal.refund_method==='cash'?(modal.bank_account_id||null):null,
      note: modal.note||null,
      created_by: prof?.id,
    }
    const { error } = await supabase.from('sales_returns').insert(payload)
    if (error) { setMsg('❌ '+error.message); setSaving(false); return }

    if (modal.refund_method==='credit') {
      const { data: contact } = await supabase.from('contacts').select('current_balance').eq('id',modal.customer_id).maybeSingle()
      await supabase.from('contacts').update({ current_balance: Number(contact?.current_balance||0)+total }).eq('id',modal.customer_id)
    } else if (modal.refund_method==='cash' && modal.bank_account_id) {
      const { data: ba } = await supabase.from('bank_accounts').select('current_balance').eq('id',modal.bank_account_id).maybeSingle()
      await supabase.from('bank_accounts').update({ current_balance: Number(ba?.current_balance||0)-total }).eq('id',modal.bank_account_id)
    }

    setModal(null); await fetchAll(); setSaving(false)
    setMsg('✅ '+tAny.sr_saved); setTimeout(()=>setMsg(''),3000)
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">↩️ {tAny.page_sales_return}</h1>
            <p className="text-sm text-gray-500 mt-1">{tAny.sr_return}</p>
          </div>
          <button onClick={openNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            + {tAny.sr_return}
          </button>
        </div>

        {msg && <p className={'mb-4 text-sm '+(msg.includes('✅')?'text-green-600':'text-red-500')}>{msg}</p>}

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading...</div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {returns.length===0 ? (
                <p className="text-center py-12 text-gray-400">{tAny.sr_no_records}</p>
              ) : returns.map(r => (
                <div key={r.id} className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-400">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-gray-800">{r.customer?.contact_name}</p>
                      <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                    <p className="font-bold text-blue-700">{Number(r.total_amount).toLocaleString()} Ks</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs text-gray-400">#{r.id.slice(0,8).toUpperCase()}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.refund_method==='credit'?'bg-blue-100 text-blue-700':'bg-green-100 text-green-700'}`}>
                      {r.refund_method==='credit'?'💳 '+tAny.sr_credit:'💵 '+tAny.sr_cash}
                    </span>
                  </div>
                  {r.original_transaction_id && (
                    <p className="text-xs text-blue-500 mt-1">{tAny.sr_original_voucher}: #{r.original_transaction_id.slice(0,8).toUpperCase()}</p>
                  )}
                </div>
              ))}
            </div>
            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-4 font-semibold text-gray-600">{tAny.sr_return_hash}</th>
                    <th className="text-left p-4 font-semibold text-gray-600">{tAny.sr_original_voucher}</th>
                    <th className="text-left p-4 font-semibold text-gray-600">{tAny.sr_customer}</th>
                    <th className="text-right p-4 font-semibold text-gray-600">{tAny.sr_total}</th>
                    <th className="text-left p-4 font-semibold text-gray-600">{tAny.sr_refund_method}</th>
                    <th className="text-left p-4 font-semibold text-gray-600">{tAny.dmg_date}</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.length===0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">{tAny.sr_no_records}</td></tr>
                  )}
                  {returns.map(r => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="p-4 font-mono text-xs text-gray-500">{r.id.slice(0,8).toUpperCase()}</td>
                      <td className="p-4 font-mono text-xs text-blue-600">{r.original_transaction_id?r.original_transaction_id.slice(0,8).toUpperCase():'-'}</td>
                      <td className="p-4 font-medium">{r.customer?.contact_name}</td>
                      <td className="p-4 text-right font-medium">{Number(r.total_amount).toLocaleString()} Ks</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.refund_method==='credit'?'bg-blue-100 text-blue-700':'bg-green-100 text-green-700'}`}>
                          {r.refund_method==='credit'?'💳 '+tAny.sr_credit:'💵 '+tAny.sr_cash}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl p-5 md:p-6 w-full md:max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg">↩️ {tAny.sr_modal_title}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="mb-4 p-4 bg-blue-50 rounded-xl">
              <label className="text-xs font-medium text-gray-600 mb-2 block">{tAny.sr_search_voucher}</label>
              <div className="flex gap-2">
                <input value={txnSearch} onChange={e=>setTxnSearch(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&searchTxn()}
                  className="flex-1 p-2 border rounded-xl text-sm" placeholder={tAny.sr_search_placeholder}/>
                <button onClick={searchTxn} disabled={txnLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm disabled:opacity-50">
                  {txnLoading?'...':tAny.sr_search_btn}
                </button>
              </div>
              {txnResult && (
                <div className="mt-2 p-2 bg-white rounded-lg border border-blue-200 text-xs">
                  ✅ {tAny.sr_voucher_found_msg}: {txnResult.customer?.contact_name} | Total: {Number(txnResult.total_amount).toLocaleString()} Ks
                </div>
              )}
              {txnSearch && !txnResult && !txnLoading && (
                <p className="mt-2 text-xs text-red-500">{tAny.sr_voucher_not_found}</p>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{tAny.sr_customer} *</label>
                <select value={modal.customer_id} onChange={e=>setModal({...modal,customer_id:e.target.value})}
                  className="w-full p-2 border rounded-xl text-sm">
                  <option value="">{tAny.sr_select}</option>
                  {customers.map(c=><option key={c.id} value={c.id}>{c.contact_name}</option>)}
                </select>
              </div>

              {modal.items.length>0 && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-2 block">{tAny.sr_return}</label>
                  <div className="space-y-2">
                    {modal.items.map((item:any,idx:number) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.product_name} <span className="text-xs text-gray-400">({item.unit})</span></p>
                          <p className="text-xs text-gray-500">{tAny.sr_unit_price}: {Number(item.unit_price).toLocaleString()} Ks</p>
                        </div>
                        <div className="w-24">
                          <label className="text-xs text-gray-500 block mb-1">{tAny.sr_return_qty}</label>
                          <input type="number" value={item.return_qty}
                            min={0} max={item.original_qty}
                            onChange={e=>{
                              const ni=[...modal.items]
                              ni[idx]={...item,return_qty:e.target.value}
                              setModal({...modal,items:ni,total_amount:calcTotal(ni)})
                            }}
                            className="w-full p-1.5 border rounded-lg text-sm text-center"/>
                        </div>
                        <div className="text-right w-24">
                          <p className="text-xs text-gray-500">{tAny.sr_subtotal}</p>
                          <p className="text-sm font-medium">{(Number(item.return_qty)*Number(item.unit_price)).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 p-3 bg-blue-50 rounded-xl flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">{tAny.sr_return_total}</span>
                    <span className="text-lg font-bold text-blue-700">{calcTotal(modal.items).toLocaleString()} Ks</span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">{tAny.sr_refund_label}</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {val:'credit',icon:'💳',label:tAny.sr_credit,desc:tAny.sr_credit_desc},
                    {val:'cash',  icon:'💵',label:tAny.sr_cash,  desc:tAny.sr_cash_desc},
                  ].map(opt=>(
                    <button key={opt.val} onClick={()=>setModal({...modal,refund_method:opt.val})}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${modal.refund_method===opt.val?'border-blue-500 bg-blue-50':'border-gray-200'}`}>
                      <p className="text-lg mb-1">{opt.icon}</p>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {modal.refund_method==='cash' && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Cash/Bank Account *</label>
                  <select value={modal.bank_account_id} onChange={e=>setModal({...modal,bank_account_id:e.target.value})}
                    className="w-full p-2 border rounded-xl text-sm">
                    <option value="">{tAny.sr_select}</option>
                    {banks.map(b=><option key={b.id} value={b.id}>{b.account_name}</option>)}
                  </select>
                  <p className="text-xs text-orange-500 mt-1">⚠️ {tAny.sr_cash_warning}: {calcTotal(modal.items).toLocaleString()} Ks</p>
                </div>
              )}

              {modal.refund_method==='credit' && modal.customer_id && (
                <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-700">
                  💳 {tAny.sr_credit_note}: {calcTotal(modal.items).toLocaleString()} Ks
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{tAny.sr_note}</label>
                <textarea value={modal.note} onChange={e=>setModal({...modal,note:e.target.value})}
                  className="w-full p-2 border rounded-xl text-sm" rows={2}/>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={()=>setModal(null)} className="flex-1 py-2 border rounded-xl text-sm">{tAny.sr_cancel}</button>
              <button onClick={save} disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                {saving?tAny.sr_saving:'💾 '+tAny.sr_save}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
