'use client'
import { getCompanyId } from '@/lib/getCompanyId'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { toEnglishNumber } from '@/lib/utils'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'
import ConfirmModal from '@/components/ui/ConfirmModal'

const EMPTY = { id: '', contact_name: '', phone: '', address: '', current_balance: 0, credit_limit: 0, internal_remarks: '' }

export default function SuppliersPage() {
  const { t } = useI18n()
  const supabase = createClient()
  const [contacts, setContacts] = useState<any[]>([])
  const [companyId, setCompanyId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmState, setConfirmState] = useState<{open:boolean;msg:string;cb:()=>void}>({open:false,msg:'',cb:()=>{}})
  const showConfirm = (msg: string, cb: ()=>void) => setConfirmState({open:true,msg,cb})
  const hideConfirm = () => setConfirmState(s=>({...s,open:false}))

  const fetchAll = async (force = false) => {
    setLoading(true)
    const cid = await getCompanyId()
    const query = supabase.from('contacts').select('*').eq('contact_type','Supplier').eq('is_deleted',false).order('contact_name')
    const { data } = cid ? await query.eq('company_id', cid) : await query
    setContacts(data || [])
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
      contact_name: modal.contact_name, contact_type: 'Supplier',
      phone: modal.phone || null, address: modal.address || null,
      credit_limit: Number(modal.credit_limit || 0),
      internal_remarks: modal.internal_remarks || null,
    }
    if (modal.id) {
      const { error } = await supabase.from('contacts').update(payload).eq('id', modal.id)
      if (error) { setMsg('❌ ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('contacts').insert({ ...payload, company_id: companyId })
      if (error) { setMsg('❌ ' + error.message); setSaving(false); return }
    }
    setMsg('✅ သိမ်းပြီး')
    await fetchAll()
    setTimeout(() => { setModal(null); setMsg('') }, 600)
    setSaving(false)
  }

  const handleDelete = (id: string) => {
    showConfirm('Supplier ဖျက်မှာ သေချာလား?', async () => {
      await supabase.from('contacts').update({ is_deleted: true }).eq('id', id)
      await fetchAll()
    })
  }

  const filtered = contacts.filter(c =>
    c.contact_name.toLowerCase().includes(search.toLowerCase()) || (c.phone||'').includes(search)
  )

  // Calculate totals
  const totalBalance = filtered.reduce((sum, c) => sum + Number(c.current_balance || 0), 0)
  const totalWithDebt = filtered.filter(c => Number(c.current_balance) > 0).length

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl md:text-2xl font-bold" style={{color:'var(--color-text)'}}>🏪 {t.page_suppliers}</h1>
          <button onClick={() => setModal({...EMPTY})} 
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            {t.btn_add}
          </button>
        </div>

        {/* Total Summary Card - Floating Style (Green for Suppliers) */}
        <div className="rounded-2xl p-5 mb-6" style={{
          background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
          border: '1px solid #bbf7d0',
          boxShadow: '0 4px 20px rgba(34,197,94,0.1), 0 1px 4px rgba(0,0,0,0.05)'
        }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-green-600 mb-1">🏪 {(t as any).supp_total_title || 'Total Suppliers'}</div>
              <div className="text-3xl font-bold text-green-700">{filtered.length} {(t as any).supp_total_unit || 'suppliers'}</div>
              <div className="text-xs text-green-500 mt-1">
                {totalWithDebt > 0 && <span className="text-orange-600">{(t as any).supp_debt_count || 'Payable'} {totalWithDebt} {(t as any).supp_total_unit || 'suppliers'} · K {totalBalance.toLocaleString()}</span>}
                {totalWithDebt === 0 && <span>{(t as any).supp_no_debt || 'No payables'}</span>}
              </div>
            </div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
              style={{background:'rgba(34,197,94,0.15)'}}>
              🏪
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input type="text" placeholder={(t as any).search_placeholder || t.search_placeholder} value={search}
            onChange={e => setSearch(e.target.value)} 
            className="w-full p-2.5 rounded-xl text-sm transition-all"
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)'
            }} />
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
                borderLeft: `4px solid ${Number(c.current_balance) > 0 ? '#f59e0b' : '#22c55e'}`,
                boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)'
              }}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold" style={{color:'var(--color-text)'}}>{c.contact_name}</p>
                  <p className="text-xs mt-0.5" style={{color:'var(--color-text-secondary)'}}>{c.phone || '-'}</p>
                  {c.address && <p className="text-xs mt-0.5" style={{color:'var(--color-text-secondary)'}}>{c.address}</p>}
                </div>
                <div className="text-right">
                  <span className={`font-bold text-sm ${Number(c.current_balance) > 0 ? 'text-red-600' : ''}`}
                    style={Number(c.current_balance) <= 0 ? {color:'var(--color-text-secondary)'} : {}}>
                    K {Number(c.current_balance).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setModal({...c})} 
                  className="flex-1 py-2 bg-yellow-500 text-white rounded-xl text-xs font-medium hover:bg-yellow-600 transition-colors">
                  {t.btn_edit}
                </button>
                <button onClick={() => handleDelete(c.id)} 
                  className="flex-1 py-2 bg-red-500 text-white rounded-xl text-xs font-medium hover:bg-red-600 transition-colors">
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
            <h2 className="font-bold" style={{color:'var(--color-text)'}}>🏪 {(t as any).supp_list_title || 'Supplier List'}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{background:'var(--color-bg)', borderBottom:'1px solid var(--color-border)'}}>
                <tr>
                  <th className="text-left p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.col_name}</th>
                  <th className="text-left p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.col_phone}</th>
                  <th className="text-left p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.col_address}</th>
                  <th className="text-right p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.col_balance}</th>
                  <th className="text-center p-3 font-semibold" style={{color:'var(--color-text-secondary)'}}>{t.col_action}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center p-8" style={{color:'var(--color-text-secondary)'}}>{t.loading}</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center p-8" style={{color:'var(--color-text-secondary)'}}>{t.no_data}</td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} 
                    className="transition-colors cursor-pointer"
                    style={{borderBottom:'1px solid var(--color-border)'}}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="p-3 font-medium" style={{color:'var(--color-text)'}}>{c.contact_name}</td>
                    <td className="p-3" style={{color:'var(--color-text-secondary)'}}>{c.phone || '-'}</td>
                    <td className="p-3 text-xs" style={{color:'var(--color-text-secondary)'}}>{c.address || '-'}</td>
                    <td className={`p-3 text-right font-bold ${Number(c.current_balance) > 0 ? 'text-red-600' : ''}`}
                      style={Number(c.current_balance) <= 0 ? {color:'var(--color-text-secondary)'} : {}}>
                      K {Number(c.current_balance).toLocaleString()}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => setModal({...c})} 
                          className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600 transition-colors">
                          {t.btn_edit}
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
              {modal.id ? '✏️ ' + t.btn_edit : '+ ' + t.page_suppliers}
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
              <div>
                <label className="block text-xs font-medium mb-1" style={{color:'var(--color-text-secondary)'}}>Credit Limit (K)</label>
                <input type="number" value={modal.credit_limit||''} onChange={e => setModal({...modal, credit_limit: Number(e.target.value)})}
                  className="w-full p-2.5 rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500"
                  style={{background:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{color:'var(--color-text-secondary)'}}>{t.col_remarks}</label>
                <input type="text" value={modal.internal_remarks||''} onChange={e => setModal({...modal, internal_remarks: e.target.value})}
                  className="w-full p-2.5 rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500"
                  style={{background:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} />
              </div>
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
