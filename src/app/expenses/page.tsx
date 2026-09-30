'use client'
import { getCompanyId } from '@/lib/getCompanyId'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { toEnglishNumber } from '@/lib/utils'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'
import ConfirmModal from '@/components/ui/ConfirmModal'

interface Expense {
  id: string; expense_date: string; category: string
  description: string; amount: number; paid_by: string
  ref_type: string; created_at: string
}

const EMPTY = {
  id: '', expense_date: new Date().toISOString().split('T')[0],
  category: '', description: '', amount: '', paid_by: 'cash', ref_type: 'general'
}

export default function ExpensesPage() {
  const { t } = useI18n()

  const CATEGORIES = [
    t.exp_cat_transport, t.exp_cat_office, t.exp_cat_utilities,
    t.exp_cat_salary, t.exp_cat_rent, t.exp_cat_comm,
    t.exp_cat_maintenance, t.exp_cat_ads, t.exp_cat_other,
  ]

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; mode: 'add'|'edit'; data: any }>({ open: false, mode: 'add', data: EMPTY })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))
  const [filterCategory, setFilterCategory] = useState('')
  const [customCats, setCustomCats] = useState<string[]>([])
  const [newCat, setNewCat] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const allCategories = [...CATEGORIES, ...customCats]
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS
  const [confirmState, setConfirmState] = useState<{open:boolean;msg:string;cb:()=>void}>({open:false,msg:'',cb:()=>{}})
  const showConfirm = (msg: string, cb: ()=>void) => setConfirmState({open:true,msg,cb})
  const hideConfirm = () => setConfirmState(s=>({...s,open:false}))

  const fetchAll = async () => {
    setLoading(true)
    const cid = await getCompanyId()
    const start = filterMonth + '-01'
    const end = filterMonth + '-31'
    let q = supabase.from('expenses').select('*')
      .gte('expense_date', start).lte('expense_date', end)
      .order('expense_date', { ascending: false })
    if (cid) q = q.eq('company_id', cid)
    const { data } = await q
    setExpenses(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [filterMonth])

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)

  const byCategory = allCategories.map(cat => ({
    cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0)
  })).filter(x => x.total > 0).sort((a, b) => b.total - a.total)

  // filter logic
  const filtered = filterCategory
    ? expenses.filter(e => e.category === filterCategory)
    : expenses

  const handleCategoryClick = (cat: string) => {
    setFilterCategory(prev => prev === cat ? '' : cat)
  }

  const openAdd = () => setModal({ open: true, mode: 'add', data: { ...EMPTY, category: CATEGORIES[0] } })
  const openEdit = (e: Expense) => setModal({ open: true, mode: 'edit', data: { ...e, amount: e.amount.toString() } })
  const closeModal = () => { setModal({ open: false, mode: 'add', data: EMPTY }); setMsg('') }

  const handleSave = async () => {
    const d = modal.data
    if (!d.amount || Number(d.amount) <= 0) { setMsg(t.exp_err_amount); return }
    setSaving(true); setMsg('')
    const { data: profileData } = await supabase.from('profiles').select('company_id')
    const companyId = profileData?.[0]?.company_id
    if (!companyId) { setMsg(t.exp_err_company); setSaving(false); return }
    const payload = {
      company_id: companyId, expense_date: d.expense_date, category: d.category,
      description: d.description || null, amount: Number(d.amount),
      paid_by: d.paid_by, ref_type: d.ref_type,
    }
    if (modal.mode === 'add') {
      const { error } = await supabase.from('expenses').insert(payload)
      if (error) { setMsg('Error: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('expenses').update(payload).eq('id', d.id)
      if (error) { setMsg('Error: ' + error.message); setSaving(false); return }
    }
    setMsg('✅')
    await fetchAll()
    setTimeout(closeModal, 700)
    setSaving(false)
  }

  const handleDelete = (id: string) => {
    showConfirm(t.exp_delete_confirm, async () => {
      await supabase.from('expenses').delete().eq('id', id)
      await fetchAll()
    })
  }

  const d = modal.data
  const filteredTotal = filtered.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">💸 {t.page_expenses}</h1>
          <div className="flex gap-2 flex-wrap">
            <input type="month" value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setFilterCategory('') }}
              className="p-2 border rounded-lg text-sm" />
            <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              {t.exp_add_btn}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {/* Total card */}
          <button
            onClick={() => setFilterCategory('')}
            className={`col-span-2 border rounded-xl p-4 text-left transition-all ${filterCategory === '' ? 'bg-red-100 border-red-400 ring-2 ring-red-400' : 'bg-red-50 border-red-200 hover:bg-red-100'}`}>
            <div className="text-sm text-red-600 mb-1">{t.exp_monthly_total}</div>
            <div className="text-2xl font-bold text-red-700">K {totalExpenses.toLocaleString()}</div>
            {filterCategory === '' && <div className="text-xs text-red-500 mt-1">{t.exp_filter_all}</div>}
          </button>

          {/* By category card */}
          <div className="col-span-2 bg-white rounded-xl border p-4">
            <div className="text-sm text-gray-600 mb-2">{t.exp_by_category}</div>
            {byCategory.length === 0 ? (
              <div className="text-gray-400 text-sm">{t.exp_no_data}</div>
            ) : byCategory.map(x => (
              <button key={x.cat}
                onClick={() => handleCategoryClick(x.cat)}
                className={`w-full flex justify-between text-xs mb-1 px-2 py-1 rounded transition-all ${filterCategory === x.cat ? 'bg-blue-100 text-blue-800 font-bold ring-1 ring-blue-400' : 'hover:bg-gray-100 text-gray-600'}`}>
                <span className="truncate">{x.cat}</span>
                <span className="font-bold ml-2">K {x.total.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Active filter indicator */}
        {filterCategory && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-blue-700 font-medium bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              🔍 {filterCategory}
            </span>
            <button onClick={() => setFilterCategory('')}
              className="text-xs text-gray-500 hover:text-red-500 underline">
              {t.exp_filter_all}
            </button>
          </div>
        )}

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {loading ? <p className="text-center text-gray-400 py-8">{t.loading}</p>
          : filtered.length === 0 ? <p className="text-center text-gray-400 py-8">{t.exp_no_data}</p>
          : filtered.map(e => (
            <div key={e.id} className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-red-400">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-xs font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{e.category}</span>
                  <p className="text-xs text-gray-400 mt-1">{e.expense_date} · {e.paid_by === 'cash' ? t.exp_paid_cash : t.exp_paid_bank}</p>
                </div>
                <p className="font-bold text-red-600">K {Number(e.amount).toLocaleString()}</p>
              </div>
              {e.description && <p className="text-xs text-gray-500 mb-2">{e.description}</p>}
              <div className="flex gap-2">
                <button onClick={() => openEdit(e)} className="flex-1 py-1.5 bg-yellow-500 text-white rounded-lg text-xs">{t.btn_edit}</button>
                <button onClick={() => handleDelete(e.id)} className="flex-1 py-1.5 bg-red-500 text-white rounded-lg text-xs">{t.btn_delete}</button>
              </div>
            </div>
          ))}
          {filtered.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 text-sm font-semibold flex justify-between">
              <span>{t.exp_footer_total} ({filtered.length} {t.exp_items})</span>
              <span className="text-red-600">K {filteredTotal.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-600">{t.col_date}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{t.exp_col_category}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{t.exp_col_description}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{t.exp_col_paid_by}</th>
                <th className="text-right p-3 font-semibold text-gray-600">{t.col_amount}</th>
                <th className="text-center p-3 font-semibold text-gray-600">{t.col_action}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center p-8 text-gray-400">{t.loading}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center p-8 text-gray-400">{t.exp_no_data}</td></tr>
              ) : filtered.map(e => (
                <tr key={e.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-xs text-gray-500">{e.expense_date}</td>
                  <td className="p-3 text-xs">{e.category}</td>
                  <td className="p-3 text-gray-600">{e.description || '-'}</td>
                  <td className="p-3 text-xs">{e.paid_by === 'cash' ? t.exp_paid_cash : t.exp_paid_bank}</td>
                  <td className="p-3 text-right font-bold text-red-600">K {Number(e.amount).toLocaleString()}</td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => openEdit(e)} className="px-2 py-1 bg-yellow-500 text-white rounded text-xs">{t.btn_edit}</button>
                      <button onClick={() => handleDelete(e.id)} className="px-2 py-1 bg-red-500 text-white rounded text-xs">{t.btn_delete}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={4} className="p-3 font-semibold">{t.exp_footer_total} ({filtered.length} {t.exp_items})</td>
                  <td className="p-3 text-right font-bold text-red-600">K {filteredTotal.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {modal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-5 md:p-6 w-full md:max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{modal.mode === 'add' ? t.exp_modal_add : t.exp_modal_edit}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.exp_field_date}</label>
                  <input type="date" value={d.expense_date} onChange={e => setModal(m => ({ ...m, data: { ...m.data, expense_date: e.target.value } }))}
                    className="w-full p-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.exp_field_paid_by}</label>
                  <select value={d.paid_by} onChange={e => setModal(m => ({ ...m, data: { ...m.data, paid_by: e.target.value } }))}
                    className="w-full p-2 border rounded-lg text-sm">
                    <option value="cash">{t.exp_paid_cash}</option>
                    <option value="bank">{t.exp_paid_bank}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.exp_field_category}</label>
                <div className="flex gap-1">
                  <select value={d.category} onChange={e => setModal(m => ({ ...m, data: { ...m.data, category: e.target.value } }))}
                    className="flex-1 p-2 border rounded-lg text-sm">
                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="button" onClick={() => { setShowNewCat(!showNewCat); setNewCat('') }}
                    className="px-3 py-2 bg-green-500 text-white rounded-lg text-lg font-bold hover:bg-green-600">+</button>
                  {!CATEGORIES.includes(d.category) && customCats.includes(d.category) && (
                    <button type="button" onClick={() => {
                      setCustomCats(prev => prev.filter(c => c !== d.category))
                      setModal(m => ({ ...m, data: { ...m.data, category: CATEGORIES[0] } }))
                    }} className="px-3 py-2 bg-red-500 text-white rounded-lg text-lg font-bold hover:bg-red-600">−</button>
                  )}
                </div>
              </div>

              {showNewCat && (
                <div className="flex gap-2 flex-wrap">
                  <input type="text" value={newCat} onChange={e => setNewCat(e.target.value)}
                    placeholder={t.exp_new_cat_placeholder}
                    className="flex-1 p-2 border rounded-lg text-sm border-green-400" autoFocus />
                  <button type="button" onClick={() => {
                    if (newCat.trim() && !allCategories.includes(newCat.trim())) {
                      setCustomCats(prev => [...prev, newCat.trim()])
                      setModal(m => ({ ...m, data: { ...m.data, category: newCat.trim() } }))
                    }
                    setNewCat(''); setShowNewCat(false)
                  }} className="px-3 py-2 bg-green-500 text-white rounded-lg text-sm">{t.exp_new_cat_add}</button>
                  <button type="button" onClick={() => { setNewCat(''); setShowNewCat(false) }}
                    className="px-3 py-2 bg-gray-300 rounded-lg text-sm">{t.exp_new_cat_cancel}</button>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.exp_field_description}</label>
                <input type="text" value={d.description} onChange={e => setModal(m => ({ ...m, data: { ...m.data, description: e.target.value } }))}
                  className="w-full p-2 border rounded-lg text-sm" placeholder={t.exp_desc_placeholder} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.exp_field_amount}</label>
                <input type="text" inputMode="numeric" value={d.amount}
                  onChange={e => { const v = toEnglishNumber(e.target.value); if(/^[0-9.]*$/.test(v)) setModal(m => ({ ...m, data: { ...m.data, amount: v } })) }}
                  className="w-full p-2 border rounded-lg text-sm" placeholder="0" />
              </div>
            </div>

            {msg && <p className={'text-sm mt-3 ' + (msg.includes('✅') ? 'text-green-600' : 'text-red-500')}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={closeModal} className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50">{t.btn_cancel}</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? t.loading : t.btn_save}
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
