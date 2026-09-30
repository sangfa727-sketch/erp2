'use client'
import { getCompanyId } from '@/lib/getCompanyId'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { toEnglishNumber } from '@/lib/utils'

const EMPTY = {
  id: '', ref_type: 'standalone', carrier_type: 'road',
  carrier_name: '', vehicle_number: '', tracking_number: '',
  origin: '', destination: '', charge_type: 'fixed',
  charge_rate: 0, quantity: 0, weight_kg: 0,
  total_charge: 0, notes: '', status: 'pending',
  shipment_date: new Date().toISOString().split('T')[0]
}
const STATUS_COLORS: Record<string,string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  in_transit: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700'
}
const getStatusLabels = (t: any) => ({
  pending: t.ship_status_pending,
  in_transit: t.ship_status_in_transit,
  delivered: t.ship_status_delivered,
  cancelled: t.ship_status_cancelled,
})
const getCarrierLabels = (t: any) => ({
  road: t.ship_carrier_road,
  sea: t.ship_carrier_sea,
  air: t.ship_carrier_air,
  express: t.ship_carrier_express,
})

export default function ShipmentsPage() {
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS
  const { t } = useI18n()
  const CARRIER_LABELS = getCarrierLabels(t)
  const STATUS_LABELS = getStatusLabels(t)
  const [shipments, setShipments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [expandedId, setExpandedId] = useState<string|null>(null)
  const [confirmState, setConfirmState] = useState<{open:boolean;msg:string;cb:()=>void}>({open:false,msg:'',cb:()=>{}})
  const showConfirm = (msg:string,cb:()=>void) => setConfirmState({open:true,msg,cb})
  const hideConfirm = () => setConfirmState(s=>({...s,open:false}))

  const fetchAll = async () => {
    setLoading(true)
    const cid = await getCompanyId()
    let q = supabase.from('shipments').select('*').order('shipment_date',{ascending:false})
    if (cid) q = q.eq('company_id', cid)
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data } = await q
    setShipments(data || [])
    setLoading(false)
  }
  useEffect(()=>{fetchAll()},[filterStatus])

  const calcTotal = (d:any) => {
    const rate = Number(d.charge_rate||0)
    if (d.charge_type==='fixed') return rate
    if (d.charge_type==='per_unit') return rate * Number(d.quantity||0)
    if (d.charge_type==='per_weight') return rate * Number(d.weight_kg||0)
    return 0
  }

  const autoAddExpense = async (ship:any, companyId:string) => {
    const exists = await supabase.from('expenses').select('id').eq('ref_type','shipment').eq('ref_id',ship.id).maybeSingle()
    if (exists.data) return
    await supabase.from('expenses').insert({
      company_id: companyId,
      expense_date: ship.shipment_date || new Date().toISOString().split('T')[0],
      category: 'သယ်ယူကုန်ကျ',
      description: `သယ်ယူကုန်ကျ - ${ship.carrier_name||''} ${ship.destination?'→ '+ship.destination:''}`,
      amount: Number(ship.total_charge||0),
      paid_by: 'cash', ref_type: 'shipment', ref_id: ship.id,
    })
  }

  const handleSave = async () => {
    const d = modal
    if (!d.carrier_name) { setMsg(t.ship_err_carrier); return }
    if (!d.destination) { setMsg(t.ship_err_destination); return }
    setSaving(true); setMsg('')
    const { data: profileData } = await supabase.from('profiles').select('company_id')
    const companyId = profileData?.[0]?.company_id
    if (!companyId) { setMsg(t.ship_err_company); setSaving(false); return }

    const total = calcTotal(d)
    const payload = {
      company_id: companyId, ref_type: d.ref_type, carrier_type: d.carrier_type,
      carrier_name: d.carrier_name, vehicle_number: d.vehicle_number||null,
      tracking_number: d.tracking_number||null, origin: d.origin||null,
      destination: d.destination, charge_type: d.charge_type,
      charge_rate: Number(d.charge_rate||0),
      quantity: d.charge_type==='per_unit' ? Number(d.quantity||0) : null,
      weight_kg: d.charge_type==='per_weight' ? Number(d.weight_kg||0) : null,
      total_charge: total, notes: d.notes||null,
      status: d.status, shipment_date: d.shipment_date,
    }

    if (!d.id) {
      const { data: newShip, error } = await supabase.from('shipments').insert(payload).select().single()
      if (error) { setMsg('❌ '+error.message); setSaving(false); return }
      if (payload.status==='delivered' && total>0) await autoAddExpense(newShip, companyId)
    } else {
      const { error } = await supabase.from('shipments').update(payload).eq('id', d.id)
      if (error) { setMsg('❌ '+error.message); setSaving(false); return }
      const old = shipments.find(s=>s.id===d.id)
      if (payload.status==='delivered' && old?.status!=='delivered' && total>0)
        await autoAddExpense({...payload, id:d.id}, companyId)
    }

    setMsg('✅ သိမ်းပြီး')
    await fetchAll()
    setTimeout(()=>setModal(null), 800)
    setSaving(false)
  }

  const handleDelete = (id:string) => {
    showConfirm('Shipment ဖျက်မှာ သေချာလား?', async()=>{
      await supabase.from('shipments').delete().eq('id',id)
      await fetchAll()
    })
  }

  const filtered = shipments.filter(s =>
    (s.carrier_name||'').toLowerCase().includes(search.toLowerCase()) ||
    (s.destination||'').toLowerCase().includes(search.toLowerCase()) ||
    (s.tracking_number||'').toLowerCase().includes(search.toLowerCase())
  )
  const totalCharge = filtered.reduce((s,x)=>s+Number(x.total_charge||0),0)

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">🚚 {t.page_shipments}</h1>
          <button onClick={()=>setModal({...EMPTY})} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">{t.ship_add_btn}</button>
        </div>

        {/* Status filter */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {Object.entries(STATUS_LABELS).map(([key,label])=>{
            const count = shipments.filter(s=>s.status===key).length
            return (
              <button key={key} onClick={()=>setFilterStatus(filterStatus===key?'':key)}
                className={`p-2.5 rounded-xl border text-left transition-all ${filterStatus===key?'ring-2 ring-blue-500':''} ${STATUS_COLORS[key]}`}>
                <div className="font-bold text-lg">{count}</div>
                <div className="text-xs">{label}</div>
              </button>
            )
          })}
        </div>

        <div className="flex gap-2 mb-4">
          <input type="text" placeholder={t.ship_search} value={search} onChange={e=>setSearch(e.target.value)}
            className="flex-1 p-2 border rounded-lg text-sm" />
          {filterStatus && <button onClick={()=>setFilterStatus('')} className="px-3 py-2 bg-gray-200 rounded-lg text-sm">{t.ship_filter_clear}</button>}
        </div>

        {filtered.length>0 && (
          <p className="text-sm text-gray-600 mb-3">
            စုစုပေါင်း {filtered.length} ခု — ကုန်ကျ <span className="font-bold text-blue-700">K {totalCharge.toLocaleString()}</span>
          </p>
        )}

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {loading ? <p className="text-center text-gray-400 py-8">{t.loading}</p>
          : filtered.length===0 ? <p className="text-center text-gray-400 py-8">{t.no_data}</p>
          : filtered.map(s=>{
            const expanded = expandedId===s.id
            return (
              <div key={s.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-4" onClick={()=>setExpandedId(expanded?null:s.id)}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-gray-800">{s.carrier_name}</p>
                      <p className="text-xs text-gray-500">{CARRIER_LABELS[s.carrier_type as keyof typeof CARRIER_LABELS]} · {s.shipment_date}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[s.status]}`}>{STATUS_LABELS[s.status as keyof typeof STATUS_LABELS]}</span>
                      <p className="font-bold text-blue-700 mt-1">K {Number(s.total_charge).toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {s.origin && <span>{s.origin} → </span>}{s.destination}
                  </p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-gray-400">{expanded?'▲':'▼ အသေးစိတ်'}</span>
                    <div className="flex gap-2">
                      <button onClick={e=>{e.stopPropagation();setModal({...s})}} className="px-3 py-1 bg-yellow-500 text-white rounded text-xs">ပြင်</button>
                      <button onClick={e=>{e.stopPropagation();handleDelete(s.id)}} className="px-3 py-1 bg-red-500 text-white rounded text-xs">ဖျက်</button>
                    </div>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t px-4 pb-3 bg-gray-50 text-xs space-y-1">
                    {s.vehicle_number && <p>🚗 {s.vehicle_number}</p>}
                    {s.tracking_number && <p>📦 {s.tracking_number}</p>}
                    {s.notes && <p>📝 {s.notes}</p>}
                    <p>ကုန်ကျ: {s.charge_type==='fixed'?'Fixed':s.charge_type==='per_unit'?'Per Unit':'Per Weight'} — K {Number(s.charge_rate).toLocaleString()}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-600">{t.col_date}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{t.ship_col_carrier}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{t.ship_col_location}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{t.ship_col_vehicle}</th>
                <th className="text-right p-3 font-semibold text-gray-600">{t.ship_col_charge}</th>
                <th className="text-center p-3 font-semibold text-gray-600">{t.col_status}</th>
                <th className="text-center p-3 font-semibold text-gray-600">{t.col_action}</th>
              </tr>
            </thead>
            <tbody>
              {loading?(<tr><td colSpan={7} className="text-center p-8 text-gray-400">{t.loading}</td></tr>)
              :filtered.length===0?(<tr><td colSpan={7} className="text-center p-8 text-gray-400">{t.no_data}</td></tr>)
              :filtered.map(s=>(
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-xs text-gray-500">{s.shipment_date}</td>
                  <td className="p-3">
                    <p className="font-medium">{s.carrier_name}</p>
                    <p className="text-xs text-gray-400">{CARRIER_LABELS[s.carrier_type as keyof typeof CARRIER_LABELS]}</p>
                  </td>
                  <td className="p-3 text-xs">{s.origin&&<span className="text-gray-400">{s.origin} → </span>}{s.destination}</td>
                  <td className="p-3 text-xs text-gray-500">
                    {s.vehicle_number&&<div>🚗 {s.vehicle_number}</div>}
                    {s.tracking_number&&<div>📦 {s.tracking_number}</div>}
                  </td>
                  <td className="p-3 text-right font-bold text-blue-700">K {Number(s.total_charge).toLocaleString()}</td>
                  <td className="p-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[s.status]}`}>{STATUS_LABELS[s.status as keyof typeof STATUS_LABELS]}</span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button onClick={()=>setModal({...s})} className="px-2 py-1 bg-yellow-500 text-white rounded text-xs">ပြင်</button>
                      <button onClick={()=>handleDelete(s.id)} className="px-2 py-1 bg-red-500 text-white rounded text-xs">ဖျက်</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-5 w-full md:max-w-lg shadow-xl max-h-[95vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{modal.id ? t.ship_modal_title_edit : t.ship_modal_title_add}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.ship_field_type}</label>
                  <select value={modal.ref_type} onChange={e=>setModal({...modal,ref_type:e.target.value})}
                    className="w-full p-2.5 border rounded-lg text-sm">
                    <option value="standalone">{t.ship_ref_standalone}</option>
                    <option value="purchase">ဝယ်ယူမှု</option>
                    <option value="sale">ရောင်းချမှု</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.ship_carrier_label}</label>
                  <select value={modal.carrier_type} onChange={e=>setModal({...modal,carrier_type:e.target.value})}
                    className="w-full p-2.5 border rounded-lg text-sm">
                    <option value="road">{t.ship_carrier_road}</option>
                    <option value="sea">{t.ship_carrier_sea}</option>
                    <option value="air">{t.ship_carrier_air}</option>
                    <option value="express">{t.ship_carrier_express}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.ship_carrier_name} *</label>
                <input type="text" value={modal.carrier_name||''} onChange={e=>setModal({...modal,carrier_name:e.target.value})}
                  className="w-full p-2.5 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{(t as any).ship_origin || 'ထွက်ရာ'}</label>
                  <input type="text" value={modal.origin||''} onChange={e=>setModal({...modal,origin:e.target.value})}
                    className="w-full p-2.5 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.ship_destination} *</label>
                  <input type="text" value={modal.destination||''} onChange={e=>setModal({...modal,destination:e.target.value})}
                    className="w-full p-2.5 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.ship_vehicle}</label>
                  <input type="text" value={modal.vehicle_number||''} onChange={e=>setModal({...modal,vehicle_number:e.target.value})}
                    className="w-full p-2.5 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.ship_tracking_label}</label>
                  <input type="text" value={modal.tracking_number||''} onChange={e=>setModal({...modal,tracking_number:e.target.value})}
                    className="w-full p-2.5 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.ship_charge_type}</label>
                <div className="flex gap-2">
                  {[['fixed','Fixed'],['per_unit','Per Unit'],['per_weight','Per KG']].map(([v,l])=>(
                    <button key={v} onClick={()=>setModal({...modal,charge_type:v})}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border ${modal.charge_type===v?'bg-blue-600 text-white border-blue-600':'bg-white'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {modal.charge_type==='fixed'?t.ship_charge_fixed:modal.charge_type==='per_unit'?t.ship_charge_per_unit:t.ship_charge_per_kg}
                  </label>
                  <input type="text" value={modal.charge_rate||''} onChange={e=>{const v=toEnglishNumber(e.target.value);if(/^\d*$/.test(v))setModal({...modal,charge_rate:Number(v)})}}
                    className="w-full p-2.5 border rounded-lg text-sm" />
                </div>
                {modal.charge_type==='per_unit' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">အရေအတွက်</label>
                    <input type="text" value={modal.quantity||''} onChange={e=>{const v=toEnglishNumber(e.target.value);if(/^\d*$/.test(v))setModal({...modal,quantity:Number(v)})}}
                      className="w-full p-2.5 border rounded-lg text-sm" />
                  </div>
                )}
                {modal.charge_type==='per_weight' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">အလေးချိန် (KG)</label>
                    <input type="text" value={modal.weight_kg||''} onChange={e=>{const v=toEnglishNumber(e.target.value);if(/^\d*\.?\d*$/.test(v))setModal({...modal,weight_kg:Number(v)})}}
                      className="w-full p-2.5 border rounded-lg text-sm" />
                  </div>
                )}
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-sm font-bold text-blue-700">
                {t.ship_charge_total}: K {calcTotal(modal).toLocaleString()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.col_date}</label>
                  <input type="date" value={modal.shipment_date||''} onChange={e=>setModal({...modal,shipment_date:e.target.value})}
                    className="w-full p-2.5 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t.col_status}</label>
                  <select value={modal.status} onChange={e=>setModal({...modal,status:e.target.value})}
                    className="w-full p-2.5 border rounded-lg text-sm">
                    <option value="pending">⏳ Pending</option>
                    <option value="in_transit">🚚 In Transit</option>
                    <option value="delivered">✅ Delivered</option>
                    <option value="cancelled">❌ Cancelled</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{(t as any).col_remarks || 'မှတ်ချက်'}</label>
                <textarea value={modal.notes||''} onChange={e=>setModal({...modal,notes:e.target.value})}
                  className="w-full p-2.5 border rounded-lg text-sm" rows={2} />
              </div>
            </div>
            {msg&&<p className={'text-sm mt-3 '+(msg.includes('✅')?'text-green-600':'text-red-500')}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={()=>setModal(null)} className="flex-1 py-2.5 border rounded-lg text-sm">{t.btn_cancel}</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
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
