'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { toEnglishNumber } from '@/lib/utils'

const EMPTY = {
  id: '', full_name: '', position: '', phone: '',
  join_date: new Date().toISOString().split('T')[0],
  base_salary: '', notes: '', is_active: true
}

export default function EmployeesPage() {
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS
  const { t } = useI18n()
  const tAny = t as any
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<any>(null)
  const [salaryModal, setSalaryModal] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [search, setSearch] = useState('')
  const [confirmState, setConfirmState] = useState<{open:boolean;msg:string;cb:()=>void}>({open:false,msg:'',cb:()=>{}})
  const showConfirm = (m:string,cb:()=>void) => setConfirmState({open:true,msg:m,cb})
  const hideConfirm = () => setConfirmState(s=>({...s,open:false}))

  const fetchAll = async () => {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*').order('full_name')
    setEmployees(data||[])
    setLoading(false)
  }
  useEffect(()=>{fetchAll()},[])

  const handleSave = async () => {
    if (!modal.full_name) { setMsg(tAny.emp_err_name); return }
    setSaving(true); setMsg('')
    const { data: prof } = await supabase.from('profiles').select('company_id').maybeSingle()
    const payload = {
      company_id: prof?.company_id,
      full_name: modal.full_name,
      position: modal.position||null,
      phone: modal.phone||null,
      join_date: modal.join_date||null,
      base_salary: Number(modal.base_salary||0),
      notes: modal.notes||null,
      is_active: modal.is_active,
    }
    if (modal.id) {
      await supabase.from('employees').update(payload).eq('id', modal.id)
    } else {
      await supabase.from('employees').insert(payload)
    }
    setMsg('✅ ' + tAny.emp_saved)
    await fetchAll()
    setTimeout(()=>{ setModal(null); setMsg('') }, 600)
    setSaving(false)
  }

  const handleDelete = (id:string) => {
    showConfirm(tAny.emp_delete_confirm, async()=>{
      await supabase.from('employees').delete().eq('id', id)
      await fetchAll()
    })
  }

  const handlePaySalary = async () => {
    if (!salaryModal) return
    const amt = Number(salaryModal.amount||0)
    if (amt <= 0) { setMsg(tAny.emp_err_amount); return }
    setSaving(true); setMsg('')
    const { data: prof } = await supabase.from('profiles').select('company_id').maybeSingle()
    const desc = `${salaryModal.type==='salary'?tAny.emp_pay_salary:salaryModal.type==='bonus'?tAny.emp_pay_bonus:tAny.emp_pay_deduction} - ${salaryModal.emp_name}${salaryModal.note?' ('+salaryModal.note+')':''}`
    const { error } = await supabase.from('expenses').insert({
      company_id: prof?.company_id,
      expense_date: salaryModal.date,
      category: salaryModal.type==='salary' ? (tAny.exp_cat_salary||'လစာ') : salaryModal.type==='bonus' ? 'Bonus' : 'ဒဏ်ကြေး/နုတ်',
      description: desc,
      amount: amt,
      paid_by: salaryModal.paid_by||'cash',
      ref_type: 'employee',
    })
    if (error) { setMsg('❌ '+error.message); setSaving(false); return }
    setMsg('✅ ' + tAny.emp_pay_confirm)
    setTimeout(()=>{ setSalaryModal(null); setMsg('') }, 1000)
    setSaving(false)
  }

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (e.position||'').toLowerCase().includes(search.toLowerCase())
  )
  const activeCount = employees.filter(e=>e.is_active).length

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">👥 {tAny.page_employees}</h1>
            <p className="text-xs text-gray-500 mt-1">{tAny.emp_subtitle} {activeCount} ဦး</p>
          </div>
          <button onClick={()=>setModal({...EMPTY})}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">{tAny.emp_add_btn}</button>
        </div>

        <div className="mb-4">
          <input type="text" placeholder={tAny.search_placeholder||'ရှာပါ...'} value={search}
            onChange={e=>setSearch(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
        </div>

        {msg&&<p className={'mb-3 text-sm '+(msg.includes('✅')?'text-green-600':'text-red-500')}>{msg}</p>}

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {loading ? <p className="text-center text-gray-400 py-8">{t.loading}</p>
          : filtered.length===0 ? <p className="text-center text-gray-400 py-8">{tAny.emp_no_data}</p>
          : filtered.map(e=>(
            <div key={e.id} className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${e.is_active?'border-green-400':'border-gray-300'}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-bold text-gray-800">{e.full_name}</p>
                  <p className="text-xs text-gray-500">{e.position||'-'}</p>
                  {e.phone&&<p className="text-xs text-gray-400">📞 {e.phone}</p>}
                </div>
                <div className="text-right">
                  {e.base_salary>0&&<p className="text-sm font-bold text-blue-600">K {Number(e.base_salary).toLocaleString()}</p>}
                  {!e.is_active&&<span className="text-xs text-red-500">{tAny.emp_inactive}</span>}
                </div>
              </div>
              {e.join_date&&<p className="text-xs text-gray-400 mb-2">📅 {e.join_date}</p>}
              {e.notes&&<p className="text-xs text-gray-500 mb-2">📝 {e.notes}</p>}
              <div className="flex gap-2">
                <button onClick={()=>setSalaryModal({emp_id:e.id,emp_name:e.full_name,amount:String(e.base_salary||''),type:'salary',date:new Date().toISOString().split('T')[0],paid_by:'cash',note:''})}
                  className="flex-1 py-1.5 bg-green-500 text-white rounded-lg text-xs">{tAny.emp_pay_btn}</button>
                <button onClick={()=>setModal({...e,base_salary:String(e.base_salary||'')})}
                  className="flex-1 py-1.5 bg-yellow-500 text-white rounded-lg text-xs">{t.btn_edit}</button>
                <button onClick={()=>handleDelete(e.id)}
                  className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs">{t.btn_delete}</button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-600">{t.col_name}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{tAny.emp_position}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{tAny.emp_phone}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{tAny.emp_join_date}</th>
                <th className="text-right p-3 font-semibold text-gray-600">{tAny.emp_salary}</th>
                <th className="text-center p-3 font-semibold text-gray-600">{tAny.emp_status}</th>
                <th className="text-center p-3 font-semibold text-gray-600">{t.col_action}</th>
              </tr>
            </thead>
            <tbody>
              {loading?(<tr><td colSpan={7} className="text-center p-8 text-gray-400">{t.loading}</td></tr>)
              :filtered.length===0?(<tr><td colSpan={7} className="text-center p-8 text-gray-400">{tAny.emp_no_data}</td></tr>)
              :filtered.map(e=>(
                <tr key={e.id} className={`border-b hover:bg-gray-50 ${!e.is_active?'opacity-50':''}`}>
                  <td className="p-3 font-medium">
                    {e.full_name}
                    {e.notes&&<p className="text-xs text-gray-400 truncate max-w-32">{e.notes}</p>}
                  </td>
                  <td className="p-3 text-gray-600">{e.position||'-'}</td>
                  <td className="p-3 text-gray-600">{e.phone||'-'}</td>
                  <td className="p-3 text-xs text-gray-500">{e.join_date||'-'}</td>
                  <td className="p-3 text-right font-bold text-blue-600">
                    {e.base_salary>0?'K '+Number(e.base_salary).toLocaleString():'-'}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${e.is_active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
                      {e.is_active?tAny.emp_active:tAny.emp_inactive}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button onClick={()=>setSalaryModal({emp_id:e.id,emp_name:e.full_name,amount:String(e.base_salary||''),type:'salary',date:new Date().toISOString().split('T')[0],paid_by:'cash',note:''})}
                        className="px-2 py-1 bg-green-500 text-white rounded text-xs">💰</button>
                      <button onClick={()=>setModal({...e,base_salary:String(e.base_salary||'')})}
                        className="px-2 py-1 bg-yellow-500 text-white rounded text-xs">{t.btn_edit}</button>
                      <button onClick={()=>handleDelete(e.id)}
                        className="px-2 py-1 bg-red-500 text-white rounded text-xs">{t.btn_delete}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Modal */}
      {modal&&(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-5 w-full md:max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{modal.id?tAny.emp_edit_title:tAny.emp_add_title}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.col_name} *</label>
                <input type="text" value={modal.full_name||''} onChange={e=>setModal({...modal,full_name:e.target.value})}
                  className="w-full p-2.5 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.emp_position}</label>
                  <input type="text" value={modal.position||''} onChange={e=>setModal({...modal,position:e.target.value})}
                    className="w-full p-2.5 border rounded-lg text-sm" placeholder="e.g. Cashier" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.emp_phone}</label>
                  <input type="text" value={modal.phone||''} onChange={e=>setModal({...modal,phone:toEnglishNumber(e.target.value)})}
                    className="w-full p-2.5 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.emp_join_date}</label>
                  <input type="date" value={modal.join_date||''} onChange={e=>setModal({...modal,join_date:e.target.value})}
                    className="w-full p-2.5 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.emp_salary} (K)</label>
                  <input type="text" value={modal.base_salary||''} onChange={e=>{const v=toEnglishNumber(e.target.value);if(/^\d*$/.test(v))setModal({...modal,base_salary:v})}}
                    className="w-full p-2.5 border rounded-lg text-sm" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.emp_notes}</label>
                <textarea value={modal.notes||''} onChange={e=>setModal({...modal,notes:e.target.value})}
                  className="w-full p-2.5 border rounded-lg text-sm" rows={2} />
              </div>
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={modal.is_active} onChange={e=>setModal({...modal,is_active:e.target.checked})}
                  className="w-4 h-4" />
                <span className="text-sm">{tAny.emp_active_label}</span>
              </label>
            </div>
            {msg&&<p className={'text-sm mt-3 '+(msg.includes('✅')?'text-green-600':'text-red-500')}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={()=>{setModal(null);setMsg('')}} className="flex-1 py-2.5 border rounded-lg text-sm">{t.btn_cancel}</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving?t.settings_saving:'✅ '+t.btn_save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Salary Modal */}
      {salaryModal&&(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-5 w-full md:max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-1">💰 {salaryModal.emp_name}</h2>
            <p className="text-xs text-gray-500 mb-4">{tAny.emp_pay_subtitle}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">{tAny.emp_pay_type}</label>
                <div className="flex gap-2">
                  {(['salary','bonus','deduction'] as const).map(v=>(
                    <button key={v} onClick={()=>setSalaryModal({...salaryModal,type:v})}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border ${salaryModal.type===v?'bg-blue-600 text-white border-blue-600':'bg-white'}`}>
                      {v==='salary'?tAny.emp_pay_salary:v==='bonus'?tAny.emp_pay_bonus:tAny.emp_pay_deduction}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.col_date}</label>
                  <input type="date" value={salaryModal.date} onChange={e=>setSalaryModal({...salaryModal,date:e.target.value})}
                    className="w-full p-2.5 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.emp_pay_amount}</label>
                  <input type="text" value={salaryModal.amount} onChange={e=>{const v=toEnglishNumber(e.target.value);if(/^\d*$/.test(v))setSalaryModal({...salaryModal,amount:v})}}
                    className="w-full p-2.5 border rounded-lg text-sm" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">{tAny.emp_pay_method}</label>
                <div className="flex gap-2">
                  {(['cash','bank'] as const).map(v=>(
                    <button key={v} onClick={()=>setSalaryModal({...salaryModal,paid_by:v})}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border ${salaryModal.paid_by===v?'bg-green-600 text-white border-green-600':'bg-white'}`}>
                      {v==='cash'?tAny.emp_pay_cash:tAny.emp_pay_bank}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.emp_pay_note}</label>
                <input type="text" value={salaryModal.note||''} onChange={e=>setSalaryModal({...salaryModal,note:e.target.value})}
                  className="w-full p-2.5 border rounded-lg text-sm" placeholder={tAny.emp_pay_note_ph} />
              </div>
            </div>
            {msg&&<p className={'text-sm mt-3 '+(msg.includes('✅')?'text-green-600':'text-red-500')}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={()=>{setSalaryModal(null);setMsg('')}} className="flex-1 py-2.5 border rounded-lg text-sm">{t.btn_cancel}</button>
              <button onClick={handlePaySalary} disabled={saving} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving?t.settings_saving:tAny.emp_pay_confirm}
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
