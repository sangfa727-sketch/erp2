'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getCompanyId } from '@/lib/getCompanyId'
import { getDb } from '@/lib/db'
import AppLayout from '@/components/layout/AppLayout'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { toEnglishNumber } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

const STATUS_COLORS: Record<string,string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  posted: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-600',
}
// STATUS_LABELS moved to component

export default function DamagedStockPage() {
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS
  const { t } = useI18n()
  const tAny = t as any
  const STATUS_LABELS: Record<string,string> = {
    pending: tAny.dmg_status_pending || '⏳ Pending',
    posted: tAny.dmg_status_posted || '✅ Posted',
    void: tAny.dmg_status_void || '❌ Void',
  }
  const [items, setItems] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmState, setConfirmState] = useState<{open:boolean;msg:string;cb:()=>void}>({open:false,msg:'',cb:()=>{}})
  const showConfirm = (msg:string,cb:()=>void) => setConfirmState({open:true,msg,cb})
  const hideConfirm = () => setConfirmState(s=>({...s,open:false}))

  const fetchAll = async () => {
    const cid = await getCompanyId()
    setLoading(true)
    const [{ data: dmg },{ data: prods },{ data: sups }] = await Promise.all([
      supabase.from('damaged_stock').select('*,product:product_id(name,unit),supplier:supplier_id(contact_name)').order('created_at',{ascending:false}),
      supabase.from('products').select('id,name,unit').eq('is_deleted',false).eq('company_id',cid).order('name'),
      supabase.from('contacts').select('id,contact_name').in('contact_type',['Supplier','Both']).eq('company_id',cid).order('contact_name'),
    ])
    setItems(dmg||[])
    setProducts(prods||[])
    setSuppliers(sups||[])
    setLoading(false)
  }
  useEffect(()=>{fetchAll()},[])

  const save = async () => {
    if (!modal.product_id||!modal.qty||!modal.unit_cost){setMsg('❌ ' + tAny.dmg_err_required);return}
    setSaving(true);setMsg('')
    const { data: prof } = await supabase.from('profiles').select('company_id,id').maybeSingle()
    const payload = {
      company_id: prof?.company_id,
      product_id: modal.product_id,
      supplier_id: modal.supplier_id||null,
      qty: Number(modal.qty),
      unit_cost: Number(modal.unit_cost),
      note: modal.note||null,
      status: modal.status,
      created_by: prof?.id,
    }
    if (modal.id) {
      await supabase.from('damaged_stock').update(payload).eq('id',modal.id)
    } else {
      await supabase.from('damaged_stock').insert(payload)
    }
    // AP posting — supplier balance update
    if (modal.supplier_id && modal.status==='posted' && !modal.ap_posted) {
      const total = Number(modal.qty) * Number(modal.unit_cost)
      const { data: fs } = await supabase.from('contacts').select('current_balance').eq('id', modal.supplier_id).maybeSingle()
      await supabase.from('contacts').update({ current_balance: Number(fs?.current_balance||0) + total }).eq('id', modal.supplier_id)
      if (modal.id) await supabase.from('damaged_stock').update({ ap_posted: true }).eq('id', modal.id)
    }
    setModal(null);await fetchAll();setSaving(false)
    setMsg('✅ ' + tAny.dmg_saved);setTimeout(()=>setMsg(''),2500)
  }

  const totalLoss = items.reduce((s,i)=>s+Number(i.total_cost||0),0)

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">{tAny.dmg_title}</h1>
            <p className="text-xs text-gray-500 mt-1">{tAny.dmg_subtitle}</p>
          </div>
          <button onClick={()=>setModal({product_id:'',supplier_id:'',qty:'',unit_cost:'',note:'',status:'pending'})}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium">{tAny.dmg_add_btn}</button>
        </div>

        {msg&&<p className={'mb-4 text-sm '+(msg.includes('✅')?'text-green-600':'text-red-500')}>{msg}</p>}

        {/* Summary */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-red-700">{tAny.dmg_total_loss} — <span className="font-bold text-lg">K {totalLoss.toLocaleString()}</span></p>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {loading?<p className="text-center text-gray-400 py-8">{t.loading}</p>
          :items.length===0?<p className="text-center text-gray-400 py-8">{tAny.dmg_no_records}</p>
          :items.map(item=>(
            <div key={item.id} className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-red-400">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-bold text-gray-800">{item.product?.name} <span className="text-xs text-gray-400">{item.product?.unit}</span></p>
                  <p className="text-xs text-gray-500">{item.supplier?.contact_name||'-'}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[item.status]||''}`}>{tAny['dmg_status_'+item.status]||item.status}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">{tAny.dmg_qty}: {item.qty} × K {Number(item.unit_cost).toLocaleString()}</span>
                <span className="font-bold text-red-600">K {Number(item.total_cost||0).toLocaleString()}</span>
              </div>
              {item.note&&<p className="text-xs text-gray-500 mb-2">📝 {item.note}</p>}
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleDateString()}</span>
                <button onClick={()=>setModal({...item})} className="px-3 py-1 bg-yellow-500 text-white rounded text-xs">{tAny.dmg_edit_btn}</button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-600">{tAny.dmg_product}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{tAny.dmg_supplier}</th>
                <th className="text-right p-3 font-semibold text-gray-600">{tAny.dmg_qty}</th>
                <th className="text-right p-3 font-semibold text-gray-600">{tAny.dmg_unit_cost}</th>
                <th className="text-right p-3 font-semibold text-gray-600">{tAny.dmg_total_cost}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{tAny.dmg_status}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{tAny.dmg_date}</th>
                <th className="text-center p-3 font-semibold text-gray-600">{t.col_action}</th>
              </tr>
            </thead>
            <tbody>
              {loading?(<tr><td colSpan={8} className="text-center p-8 text-gray-400">{t.loading}</td></tr>)
              :items.length===0?(<tr><td colSpan={8} className="text-center p-8 text-gray-400">{tAny.dmg_no_records}</td></tr>)
              :items.map(item=>(
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{item.product?.name} <span className="text-xs text-gray-400">{item.product?.unit}</span></td>
                  <td className="p-3 text-gray-600">{item.supplier?.contact_name||'-'}</td>
                  <td className="p-3 text-right">{item.qty}</td>
                  <td className="p-3 text-right">K {Number(item.unit_cost).toLocaleString()}</td>
                  <td className="p-3 text-right font-bold text-red-600">K {Number(item.total_cost||0).toLocaleString()}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[item.status]||''}`}>{tAny['dmg_status_'+item.status]||item.status}</span>
                  </td>
                  <td className="p-3 text-xs text-gray-500">{new Date(item.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-center">
                    <button onClick={()=>setModal({...item})} className="px-2 py-1 bg-yellow-500 text-white rounded text-xs">{tAny.dmg_edit_btn}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal&&(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-5 w-full md:max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{modal.id ? tAny.dmg_edit_title : tAny.dmg_add_title}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.dmg_product} *</label>
                <select value={modal.product_id||''} onChange={e=>setModal({...modal,product_id:e.target.value})}
                  className="w-full p-2.5 border rounded-lg text-sm">
                  <option value="">{tAny.dmg_select_product}</option>
                  {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.dmg_supplier}</label>
                <select value={modal.supplier_id||''} onChange={e=>setModal({...modal,supplier_id:e.target.value})}
                  className="w-full p-2.5 border rounded-lg text-sm">
                  <option value="">{t.pur_no_supplier}</option>
                  {suppliers.map(s=><option key={s.id} value={s.id}>{s.contact_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.dmg_qty} *</label>
                  <input type="text" value={modal.qty||''} onChange={e=>{const v=toEnglishNumber(e.target.value);if(/^\d*\.?\d*$/.test(v))setModal({...modal,qty:v})}}
                    className="w-full p-2.5 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.dmg_unit_cost_label} *</label>
                  <input type="text" value={modal.unit_cost||''} onChange={e=>{const v=toEnglishNumber(e.target.value);if(/^\d*$/.test(v))setModal({...modal,unit_cost:v})}}
                    className="w-full p-2.5 border rounded-lg text-sm" />
                </div>
              </div>
              {modal.qty&&modal.unit_cost&&(
                <div className="p-3 bg-red-50 rounded-lg text-sm font-bold text-red-700">
                  {tAny.dmg_loss_preview}: K {(Number(modal.qty)*Number(modal.unit_cost)).toLocaleString()}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.dmg_status}</label>
                <div className="flex gap-2">
                  {Object.entries(STATUS_LABELS).map(([v,l])=>(
                    <button key={v} onClick={()=>setModal({...modal,status:v})}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border ${modal.status===v?STATUS_COLORS[v]+' border-current':'bg-white'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{tAny.dmg_note}</label>
                <textarea value={modal.note||''} onChange={e=>setModal({...modal,note:e.target.value})}
                  className="w-full p-2.5 border rounded-lg text-sm" rows={2} />
              </div>
            </div>
            {msg&&<p className={'text-sm mt-3 '+(msg.includes('✅')?'text-green-600':'text-red-500')}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={()=>setModal(null)} className="flex-1 py-2.5 border rounded-lg text-sm">{t.btn_cancel}</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? t.settings_saving : '✅ ' + t.btn_save}
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
