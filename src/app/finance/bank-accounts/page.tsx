'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getCompanyId } from '@/lib/getCompanyId'
import { getDb } from '@/lib/db'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { toEnglishNumber } from '@/lib/utils'

interface BankAccountType { id: string; name: string; icon: string }
interface BankAccount {
  id: string; account_name: string; account_number: string
  opening_balance: number; current_balance: number; is_active: boolean
  account_type_id: string; account_type?: BankAccountType
}

const EMPTY = { id: '', account_name: '', account_number: '', opening_balance: '', account_type_id: '', is_active: true }
const EMPTY_TYPE = { id: '', name: '', icon: '🏦' }

const ICON_OPTIONS = ['🏦','💵','💳','📱','🌊','🏧','💰','🏪']

export default function BankAccountsPage() {
  const { t } = useI18n()
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [types, setTypes] = useState<BankAccountType[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; mode: 'add'|'edit'; data: any }>({ open: false, mode: 'add', data: EMPTY })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmState, setConfirmState] = useState<{open:boolean;msg:string;cb:()=>void}>({open:false,msg:'',cb:()=>{}})
  const showConfirm = (m: string, cb: ()=>void) => setConfirmState({open:true,msg:m,cb})
  const hideConfirm = () => setConfirmState(s=>({...s,open:false}))

  // Account Type modal
  const [typeModal, setTypeModal] = useState<{open:boolean;data:any}>({open:true,data:EMPTY_TYPE})
  const [typeSaving, setTypeSaving] = useState(false)
  const [typeMsg, setTypeMsg] = useState('')
  const [showTypes, setShowTypes] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: accs }, { data: tps }] = await Promise.all([
      supabase.from('bank_accounts').select('*, account_type:account_type_id(id,name,icon)').eq('is_deleted', false).not('company_id', 'is', 'null').order('account_name'),
      supabase.from('bank_account_types').select('*').eq('is_active', true).order('name'),
    ])
    setAccounts((accs as any) || [])
    setTypes(tps || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0)

  const openAdd = () => setModal({ open: true, mode: 'add', data: { ...EMPTY, account_type_id: types[0]?.id || '' } })
  const openEdit = (a: BankAccount) => setModal({ open: true, mode: 'edit', data: { ...a, opening_balance: String(a.opening_balance) } })
  const closeModal = () => { setModal({ open: false, mode: 'add', data: EMPTY }); setMsg('') }

  const handleSave = async () => {
    const d = modal.data
    if (!d.account_name.trim()) { setMsg((t as any).bank_err_name); return }
    if (!d.account_type_id) { setMsg((t as any).bank_err_type); return }
    setSaving(true); setMsg('')
    // Get company_id
    let companyId = null
    const staffSession = localStorage.getItem('staff_session')
    if (staffSession) {
      try {
        const sess = JSON.parse(staffSession)
        const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', sess.id).maybeSingle()
        companyId = prof?.company_id
      } catch {}
    }
    if (!companyId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('company_id').eq('auth_user_id', user.id).maybeSingle()
        companyId = prof?.company_id
      }
    }
    if (!companyId) { setMsg('❌ Company ID မရပါ'); setSaving(false); return }

    if (modal.mode === 'add') {
      const ob = parseFloat(toEnglishNumber(d.opening_balance)) || 0
      const { error } = await supabase.from('bank_accounts').insert({
        company_id: companyId, account_name: d.account_name,
        account_number: d.account_number || null, opening_balance: ob,
        current_balance: ob, account_type_id: d.account_type_id, is_active: d.is_active,
      })
      if (error) { setMsg('❌ ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('bank_accounts').update({
        account_name: d.account_name, account_number: d.account_number || null,
        account_type_id: d.account_type_id, is_active: d.is_active,
      }).eq('id', d.id)
      if (error) { setMsg('❌ ' + error.message); setSaving(false); return }
    }
    await fetchAll(); closeModal(); setSaving(false)
  }

  const handleDelete = (id: string) => {
    showConfirm(t.confirm_delete, async () => {
      await supabase.from('bank_accounts').update({ is_deleted: true }).eq('id', id)
      await fetchAll()
    })
  }

  // Account Type CRUD
  const saveType = async () => {
    const d = typeModal.data
    if (!d.name.trim()) { setTypeMsg('❌ Name ဖြည့်ပါ'); return }
    setTypeSaving(true); setTypeMsg('')
    let companyId2 = null
    const ss2 = localStorage.getItem('staff_session')
    if (ss2) {
      try {
        const sess = JSON.parse(ss2)
        const { data: p } = await supabase.from('profiles').select('company_id').eq('id', sess.id).maybeSingle()
        companyId2 = p?.company_id
      } catch {}
    }
    if (!companyId2) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('company_id').eq('auth_user_id', user.id).maybeSingle()
        companyId2 = p?.company_id
      }
    }
    if (d.id) {
      await supabase.from('bank_account_types').update({ name: d.name, icon: d.icon }).eq('id', d.id)
    } else {
      await supabase.from('bank_account_types').insert({ company_id: companyId2, name: d.name, icon: d.icon, is_active: true })
    }
    await fetchAll()
    setTypeModal({ open: true, data: EMPTY_TYPE })
    setTypeSaving(false)
    setTypeMsg('')
  }

  const deleteType = (id: string) => {
    showConfirm('ဒီ Account Type ကို ဖျက်မှာ သေချာပါသလား?', async () => {
      await supabase.from('bank_account_types').update({ is_active: false }).eq('id', id)
      await fetchAll()
    })
  }

  const d = modal.data

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{(t as any).bank_title}</h1>
            <p className="text-sm text-gray-500 mt-1">{(t as any).bank_subtitle}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowTypes(!showTypes)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium">
              ⚙️ Account Types
            </button>
            <button onClick={openAdd}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
              + {(t as any).bank_add}
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-2xl p-5 mb-6 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500">{(t as any).bank_total}</p>
          <p className="text-3xl font-bold mt-1 text-gray-800">{totalBalance.toLocaleString()} <span className="text-lg font-normal">Ks</span></p>
          <p className="text-sm text-gray-400 mt-1">{accounts.filter(a => a.is_active).length} {(t as any).bank_active}</p>
        </div>

        {/* Account Types Drawer */}
        {showTypes && (
          <div className="fixed inset-0 z-40 flex flex-col sm:flex-row">
            <div className="flex-1 bg-black/30" onClick={() => setShowTypes(false)}/>
            <div className="w-full sm:max-w-sm bg-white shadow-2xl flex flex-col sm:h-full max-h-[85vh] sm:max-h-full overflow-hidden rounded-t-2xl sm:rounded-none">
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h2 className="font-bold text-gray-800 text-base">⚙️ Account Types</h2>
                <button onClick={() => setShowTypes(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>

              {/* Type Form */}
              <div className="px-5 py-4 border-b bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {typeModal.data.id ? '✏️ Edit Type' : '➕ Add New Type'}
                </p>
                <div className="space-y-3">
                  <input
                    value={typeModal.data.name}
                    onChange={e => setTypeModal(m => ({ ...m, data: { ...m.data, name: e.target.value } }))}
                    className="w-full p-2 border rounded-xl text-sm"
                    placeholder="e.g. Mobile Banking"/>
                  <div className="flex gap-1.5 flex-wrap">
                    {ICON_OPTIONS.map(icon => (
                      <button key={icon} onClick={() => setTypeModal(m => ({ ...m, data: { ...m.data, icon } }))}
                        className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border-2 transition-all
                          ${typeModal.data.icon === icon ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        {icon}
                      </button>
                    ))}
                  </div>
                  {typeMsg && <p className="text-xs text-red-500">{typeMsg}</p>}
                  <div className="flex gap-2">
                    {typeModal.data.id && (
                      <button onClick={() => setTypeModal({open:false, data:EMPTY_TYPE})}
                        className="flex-1 py-2 border rounded-xl text-sm text-gray-600">
                        Cancel
                      </button>
                    )}
                    <button onClick={saveType} disabled={typeSaving}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                      {typeSaving ? 'Saving...' : typeModal.data.id ? '💾 Update' : '➕ Add'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Types List */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Existing Types ({types.length})
                </p>
                <div className="space-y-2">
                  {types.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-8">No types yet</p>
                  )}
                  {types.map(tp => (
                    <div key={tp.id}
                      className={`flex items-center justify-between p-3 border rounded-xl transition-all
                        ${typeModal.data.id === tp.id ? 'border-blue-400 bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{tp.icon}</span>
                        <span className="text-sm font-medium text-gray-800">{tp.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setTypeModal({ open: true, data: { ...tp } })}
                          className="px-2.5 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium">✏️</button>
                        <button onClick={() => deleteType(tp.id)}
                          className="px-2.5 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Accounts List */}
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading...</div>
        ) : (
          <div className="grid gap-4">
            {accounts.length === 0 && (
              <div className="text-center py-16 text-gray-400 bg-white rounded-2xl">{(t as any).bank_empty}</div>
            )}
            {accounts.map(a => (
              <div key={a.id} className={`bg-white rounded-2xl p-5 shadow-sm flex items-center justify-between ${!a.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl">
                    {(a.account_type as any)?.icon || '🏦'}
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">{a.account_name}</p>
                    <p className="text-xs text-gray-500">{(a.account_type as any)?.name}</p>
                    {a.account_number && <p className="text-xs text-gray-400">{a.account_number}</p>}
                    {!a.is_active && <span className="text-xs text-red-500">{(t as any).bank_inactive}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xl font-bold text-gray-800">{Number(a.current_balance).toLocaleString()}</p>
                    <p className="text-xs text-gray-400">Ks</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(a)} className="px-3 py-1.5 bg-yellow-500 text-white rounded-xl text-xs">{(t as any).bank_edit}</button>
                    <button onClick={() => handleDelete(a.id)} className="px-3 py-1.5 bg-red-500 text-white rounded-xl text-xs">{(t as any).bank_delete}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bank Account Modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">{modal.mode === 'add' ? t.bank_modal_add : t.bank_modal_edit}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{(t as any).bank_type}</label>
                <select value={d.account_type_id} onChange={e => setModal(m => ({ ...m, data: { ...m.data, account_type_id: e.target.value } }))}
                  className="w-full p-2 border rounded-xl text-sm">
                  <option value="">{t.ar_select}</option>
                  {types.map(tp => <option key={tp.id} value={tp.id}>{tp.icon} {tp.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{(t as any).bank_name} *</label>
                <input type="text" value={d.account_name} onChange={e => setModal(m => ({ ...m, data: { ...m.data, account_name: e.target.value } }))}
                  className="w-full p-2 border rounded-xl text-sm" placeholder="e.g. KBZ Main Account"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{(t as any).bank_number}</label>
                <input type="text" value={d.account_number} onChange={e => setModal(m => ({ ...m, data: { ...m.data, account_number: e.target.value } }))}
                  className="w-full p-2 border rounded-xl text-sm" placeholder="e.g. 0912345678"/>
              </div>
              {modal.mode === 'add' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{(t as any).bank_opening}</label>
                  <input type="text" value={d.opening_balance} onChange={e => setModal(m => ({ ...m, data: { ...m.data, opening_balance: toEnglishNumber(e.target.value) } }))}
                    className="w-full p-2 border rounded-xl text-sm" placeholder="0"/>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-700">{(t as any).bank_active}</span>
                <button onClick={() => setModal(m => ({ ...m, data: { ...m.data, is_active: !m.data.is_active } }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${d.is_active ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${d.is_active ? 'translate-x-6' : 'translate-x-1'}`}/>
                </button>
              </div>
            </div>
            {msg && <p className="mt-3 text-sm text-red-500">{msg}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={closeModal} className="flex-1 py-2 border rounded-xl text-sm">{t.cancel}</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? t.settings_saving : '💾 '+t.save}
              </button>
            </div>
          </div>
        </div>
      )}



      <ConfirmModal open={confirmState.open} message={confirmState.msg}
        onConfirm={() => { hideConfirm(); confirmState.cb() }} onCancel={hideConfirm}/>
    </AppLayout>
  )
}
