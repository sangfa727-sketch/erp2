'use client'
import { getCompanyId } from '@/lib/getCompanyId'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCache, setCache, clearCache } from '@/lib/cache'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { toEnglishNumber } from '@/lib/utils'
import AppLayout from '@/components/layout/AppLayout'
import { SkeletonPage } from '@/components/ui/Skeleton'
import { useI18n } from '@/lib/i18n'
import ConfirmModal from '@/components/ui/ConfirmModal'

interface Contact {
  id: string; contact_name: string; contact_type: string
  phone: string; address: string; current_balance: number
  credit_limit: number; credit_days: number
  internal_remarks: string; is_blacklisted: boolean
}

const EMPTY = {
  id: '', contact_name: '', contact_type: 'Customer', phone: '',
  address: '', current_balance: 0, credit_limit: 0, credit_days: 0,
  internal_remarks: '', is_blacklisted: false
}

export default function CustomersPage() {
  const { t } = useI18n()
  const supabase = createClient()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companyId, setCompanyId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showBlacklist, setShowBlacklist] = useState(false)
  const [modal, setModal] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmState, setConfirmState] = useState<{open:boolean;msg:string;cb:()=>void}>({open:false,msg:'',cb:()=>{}})
  const showConfirm = (msg: string, cb: ()=>void) => setConfirmState({open:true,msg,cb})
  const hideConfirm = () => setConfirmState(s=>({...s,open:false}))

  const fetchAll = async (force = false) => {
    if (!force) {
      const cached = getCache('customers')
      if (cached) { setContacts(cached); setLoading(false) }
    }
    setLoading(true)
    const cid = await getCompanyId()
    const query = supabase.from('contacts').select('*').eq('contact_type','Customer').eq('is_deleted',false).order('contact_name')
    const { data } = cid ? await query.eq('company_id', cid) : await query
    setContacts(data || [])
    setCache('customers', data)
    setCache('contacts_list', data || [])
    setLoading(false)
  }
  useEffect(() => { fetchAll() }, [])

  const handleSave = async () => {
    if (!modal.contact_name) { setMsg('နာမည် ထည့်ပါ'); return }
    setSaving(true); setMsg('')
    const { data: profileData } = await supabase.from('profiles').select('company_id')
    const companyId = profileData?.[0]?.company_id
    if (!companyId) { setMsg('Company မရှိပါ'); setSaving(false); return }
    const payload = {
      contact_name: modal.contact_name, contact_type: 'Customer',
      phone: modal.phone || null, address: modal.address || null,
      credit_limit: Number(modal.credit_limit || 0),
      credit_days: Number(modal.credit_days || 0),
      internal_remarks: modal.internal_remarks || null,
      is_blacklisted: modal.is_blacklisted || false,
    }
    if (modal.id) {
      const { error } = await supabase.from('contacts').update(payload).eq('id', modal.id)
      if (error) { setMsg('❌ ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('contacts').insert({ ...payload, company_id: companyId })
      if (error) { setMsg('❌ ' + error.message); setSaving(false); return }
    }
    setMsg('✅ ' + (t as any).saved || '✅ သိမ်းပြီး')
    clearCache('customers')
    await fetchAll(true)
    setTimeout(() => { setModal(null); setMsg('') }, 600)
    setSaving(false)
  }

  const toggleBlacklist = (c: Contact) => {
    const action = c.is_blacklisted ? 'Blacklist ဖြုတ်' : 'Blacklist ထည့်'
    showConfirm(c.contact_name + ' ကို ' + action + ' မှာ သေချာလား?', async () => {
      await supabase.from('contacts').update({ is_blacklisted: !c.is_blacklisted }).eq('id', c.id)
      clearCache('customers')
      await fetchAll(true)
    })
  }

  const handleDelete = (id: string) => {
    showConfirm((t as any).cust_delete_confirm || 'Customer ဖျက်မှာ သေချာလား?', async () => {
      await supabase.from('contacts').update({ is_deleted: true }).eq('id', id)
      clearCache('customers')
      await fetchAll(true)
    })
  }

  const filtered = contacts
    .filter(c => showBlacklist ? c.is_blacklisted : true)
    .filter(c => c.contact_name.toLowerCase().includes(search.toLowerCase()) || (c.phone||'').includes(search))

  // Calculate totals
  const totalBalance = filtered.reduce((sum, c) => sum + Number(c.current_balance || 0), 0)
  const totalWithDebt = filtered.filter(c => Number(c.current_balance) > 0).length

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl md:text-2xl font-bold" style={{color:'var(--color-text)'}}>👤 {t.page_customers}</h1>
          <button onClick={() => setModal({...EMPTY})}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            {t.btn_add}
          </button>
        </div>

        {/* Total Summary Card - Floating Style */}
        <div className="rounded-2xl p-5 mb-6" style={{
          background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
          border: '1px solid #bfdbfe',
          boxShadow: '0 4px 20px rgba(59,130,246,0.1), 0 1px 4px rgba(0,0,0,0.05)'
        }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-600 mb-1">👤 {(t as any).cust_total_title || 'Total Customers'}</div>
              <div className="text-3xl font-bold text-blue-700">{filtered.length} {(t as any).cust_total_unit || 'customers'}</div>
              <div className="text-xs text-blue-500 mt-1">
                {totalWithDebt > 0 && <span className="text-orange-600">{(t as any).cust_debt_count || 'With debt'} {totalWithDebt} {(t as any).cust_total_unit || 'customers'} · K {totalBalance.toLocaleString()}</span>}
                {totalWithDebt === 0 && <span>{(t as any).cust_no_debt || 'No debt'}</span>}
              </div>
            </div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
              style={{background:'rgba(59,130,246,0.15)'}}>
              👤
            </div>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <input type="text" placeholder={(t as any).search_placeholder || t.search_placeholder} value={search}
            onChange={e => setSearch(e.target.value)} 
            className="flex-1 min-w-[150px] p-2.5 rounded-xl text-sm transition-all"
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)'
            }} />
          <button onClick={() => setShowBlacklist(!showBlacklist)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              showBlacklist 
                ? 'bg-red-500 text-white shadow-md' 
                : 'border text-gray-600 hover:bg-gray-50'
            }`}
            style={!showBlacklist ? {borderColor:'var(--color-border)', color:'var(--color-text-secondary)'} : {}}>
            🚫 Blacklist {showBlacklist ? '(ပြနေသည်)' : ''}
          </button>
        </div>

        {/* Mobile Card View - Floating Style */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="rounded-2xl p-8 text-center" style={{
              background:'var(--color-card)',
              border:'1px solid var(--color-border)',
              boxShadow:'0 4px 20px rgba(0,0,0,0.06)'
            }}>
              <p style={{color:'var(--color-text-secondary)'}}>{t.loading}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{
              background:'var(--color-card)',
              border:'1px solid var(--color-border)',
              boxShadow:'0 4px 20px rgba(0,0,0,0.06)'
            }}>
              <p style={{color:'var(--color-text-secondary)'}}>{t.no_data}</p>
            </div>
          ) : filtered.map(c => (
            <div key={c.id} 
              className="rounded-2xl p-4 transition-all active:scale-[0.99]"
              style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderLeft: `4px solid ${c.is_blacklisted ? '#ef4444' : Number(c.current_balance) > 0 ? '#f59e0b' : '#22c55e'}`,
                boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)'
              }}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold" style={{color:'var(--color-text)'}}>{c.contact_name}</p>
                  <p className="text-xs mt-0.5" style={{color:'var(--color-text-secondary)'}}>{c.phone || '-'}</p>
                </div>
                {c.is_blacklisted && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">🚫 Blacklist</span>
                )}
              </div>
              <div className="flex justify-between items-center text-sm mb-3">
                <div>
                  <span className="text-xs" style={{color:'var(--color-text-secondary)'}}>{t.col_balance} </span>
                  {Number(c.current_balance) > 0 ? (
                    <Link href={`/finance/ar?customer=${c.id}`}
                      className="font-bold text-red-600 hover:text-red-800 hover:underline cursor-pointer">
                      K {Number(c.current_balance).toLocaleString()} ↗
                    </Link>
                  ) : (
                    <span className="font-bold" style={{color:'var(--color-text-secondary)'}}>K 0</span>
                  )}
                </div>
                {c.credit_limit > 0 && (
                  <div className="text-xs" style={{color:'var(--color-text-secondary)'}}>
                    Limit: K {Number(c.credit_limit).toLocaleString()}
                    {c.credit_days > 0 && <span className="ml-1">/ {c.credit_days} ရက်</span>}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setModal({...c})} 
                  className="flex-1 py-2 bg-yellow-500 text-white rounded-xl text-xs font-medium hover:bg-yellow-600 transition-colors">
                  {t.btn_edit}
                </button>
                <button onClick={() => toggleBlacklist(c)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                    c.is_blacklisted ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                  {c.is_blacklisted ? '✅ ဖြုတ်' : '🚫 Blacklist'}
                </button>
                <button onClick={() => handleDelete(c.id)} 
                  className="px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-medium hover:bg-red-600 transition-colors">
                  {t.btn_delete}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table - Floating Style */}
        <div className="hidden md:block rounded-2xl overflow-hidden" style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)'
        }}>
          <div className="p-4 border-b" style={{background:'var(--color-bg)', borderColor:'var(--color-border)'}}>
            <h2 className="font-bold" style={{color:'var(--color-text)'}}>👤 {(t as any).cust_list_title || 'Customer List'}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{background:'var(--color-bg)', borderBottom:'1px solid var(--color-border)'}}>
                <tr>
                  <th className="text-left p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.col_name}</th>
                  <th className="text-left p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.col_phone}</th>
                  <th className="text-left p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.col_address}</th>
                  <th className="text-right p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.col_balance}</th>
                  <th className="text-right p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>Credit Limit</th>
                  <th className="text-center p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.col_action}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center p-8" style={{color:'var(--color-text-secondary)'}}>{t.loading}</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center p-8" style={{color:'var(--color-text-secondary)'}}>{t.no_data}</td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} 
                    className="transition-colors cursor-pointer"
                    style={{borderBottom:'1px solid var(--color-border)', background: c.is_blacklisted ? 'rgba(239,68,68,0.05)' : 'transparent'}}
                    onMouseEnter={e => e.currentTarget.style.background = c.is_blacklisted ? 'rgba(239,68,68,0.1)' : 'var(--color-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = c.is_blacklisted ? 'rgba(239,68,68,0.05)' : 'transparent'}>
                    <td className="p-3 font-medium" style={{color:'var(--color-text)'}}>
                      {c.contact_name}
                      {c.is_blacklisted && <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">🚫</span>}
                    </td>
                    <td className="p-3" style={{color:'var(--color-text-secondary)'}}>{c.phone || '-'}</td>
                    <td className="p-3 text-xs" style={{color:'var(--color-text-secondary)'}}>{c.address || '-'}</td>
                    <td className="p-3 text-right">
                      {Number(c.current_balance) > 0 ? (
                        <Link href={`/finance/ar?customer=${c.id}`}
                          className="font-bold text-red-600 hover:text-red-800 hover:underline">
                          K {Number(c.current_balance).toLocaleString()} ↗
                        </Link>
                      ) : (
                        <span className="font-bold" style={{color:'var(--color-text-secondary)'}}>K 0</span>
                      )}
                    </td>
                    <td className="p-3 text-right" style={{color:'var(--color-text-secondary)'}}>
                      {c.credit_limit > 0 ? 'K ' + Number(c.credit_limit).toLocaleString() : '-'}
                      {c.credit_days > 0 && <span className="text-xs ml-1" style={{color:'var(--color-text-secondary)'}}> /{c.credit_days}ရက်</span>}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => setModal({...c})} 
                          className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600 transition-colors">
                          {t.btn_edit}
                        </button>
                        <button onClick={() => toggleBlacklist(c)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            c.is_blacklisted ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}>
                          {c.is_blacklisted ? 'ဖြုတ်' : '🚫'}
                        </button>
                        <button onClick={() => handleDelete(c.id)} 
                          className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition-colors">
                          {t.btn_delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal - Enhanced Style */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="w-full md:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5"
            style={{
              background: 'var(--color-card)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}>
            <h2 className="text-lg font-bold mb-4" style={{color:'var(--color-text)'}}>
              {modal.id ? '✏️ ' + t.btn_edit : '+ ' + t.page_customers}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{color:'var(--color-text-secondary)'}}>{t.col_name} *</label>
                <input type="text" value={modal.contact_name||''} onChange={e => setModal({...modal, contact_name: e.target.value})}
                  className="w-full p-2.5 rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500"
                  style={{background:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{color:'var(--color-text-secondary)'}}>{t.col_phone}</label>
                <input type="text" value={modal.phone||''} onChange={e => setModal({...modal, phone: toEnglishNumber(e.target.value)})}
                  className="w-full p-2.5 rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500"
                  style={{background:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{color:'var(--color-text-secondary)'}}>{t.col_address}</label>
                <textarea value={modal.address||''} onChange={e => setModal({...modal, address: e.target.value})}
                  className="w-full p-2.5 rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500"
                  style={{background:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{color:'var(--color-text-secondary)'}}>Credit Limit (K)</label>
                  <input type="number" value={modal.credit_limit||''} onChange={e => setModal({...modal, credit_limit: Number(e.target.value)})}
                    className="w-full p-2.5 rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500"
                    style={{background:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{color:'var(--color-text-secondary)'}}>Credit Days</label>
                  <input type="number" value={modal.credit_days||''} onChange={e => setModal({...modal, credit_days: Number(e.target.value)})}
                    className="w-full p-2.5 rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500"
                    style={{background:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{color:'var(--color-text-secondary)'}}>{t.col_remarks}</label>
                <input type="text" value={modal.internal_remarks||''} onChange={e => setModal({...modal, internal_remarks: e.target.value})}
                  className="w-full p-2.5 rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500"
                  style={{background:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} />
              </div>
              <label className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-red-50"
                style={{border:'1px solid var(--color-border)'}}>
                <input type="checkbox" checked={modal.is_blacklisted||false} onChange={e => setModal({...modal, is_blacklisted: e.target.checked})}
                  className="w-4 h-4 accent-red-500" />
                <span className="text-sm" style={{color:'var(--color-text)'}}>🚫 Blacklist</span>
              </label>
            </div>
            {msg && <p className={'text-sm mt-3 ' + (msg.includes('✅') ? 'text-green-600' : 'text-red-500')}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setModal(null); setMsg('') }} 
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{border:'1px solid var(--color-border)', color:'var(--color-text)'}}>
                {t.btn_cancel}
              </button>
              <button onClick={handleSave} disabled={saving} 
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors">
                {saving ? 'သိမ်းနေသည်...' : '✅ ' + t.btn_save}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal open={confirmState.open} message={confirmState.msg}
        onConfirm={()=>{hideConfirm();confirmState.cb()}} onCancel={hideConfirm} />
    </AppLayout>
  )
}
