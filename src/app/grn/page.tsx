'use client'
import { getCompanyId } from '@/lib/getCompanyId'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { toEnglishNumber } from '@/lib/utils'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'
import ConfirmModal from '@/components/ui/ConfirmModal'

interface GRN {
  id: string; grn_no: string; received_date: string; received_by: string
  supplier_id: string | null; vehicle_no: string | null; carrier_name: string | null
  notes: string | null; supplier?: { contact_name: string }; items?: any[]
}
interface Product { id: string; name: string; unit: string; base_cost: number; stock_qty: number }
interface Supplier { id: string; contact_name: string }
interface LineItem {
  product_id: string; product_name: string; qty_received: any; unit_cost: any
  batch_no: string; unit: string; isNew?: boolean; newName?: string
  qty_damaged?: any
}

export default function GRNPage() {
  const { t } = useI18n()
  const [grns, setGrns] = useState<GRN[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [uoms, setUoms] = useState<string[]>(['ခု'])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmState, setConfirmState] = useState<{open:boolean;msg:string;cb:()=>void}>({open:false,msg:'',cb:()=>{}})
  const showConfirm = (msg: string, cb: ()=>void) => setConfirmState({open:true,msg,cb})
  const hideConfirm = () => setConfirmState(s=>({...s,open:false}))
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS

  const [supplierId, setSupplierId] = useState('')
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0])
  const [vehicleNo, setVehicleNo] = useState('')
  const [carrierName, setCarrierName] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItem[]>([{ product_id:'', product_name:'', qty_received:'', unit_cost:'', batch_no:'', unit:'ခု', qty_damaged:'' }])

  const fetchAll = async () => {
    const cid = await getCompanyId()
    setLoading(true)
    const [{ data: grnData }, { data: prods }, { data: sups }, { data: uomData }] = await Promise.all([
      supabase.from('grn').select('*, supplier:supplier_id(contact_name), items:grn_items(id,qty_received,unit_cost,batch_no,product:product_id(name,unit))').eq('company_id', cid).order('received_date', { ascending: false }),
      supabase.from('products').select('id,name,unit,base_cost,stock_qty').eq('is_deleted', false).eq('company_id', cid).order('name'),
      supabase.from('contacts').select('id,contact_name').in('contact_type', ['Supplier','Both']).eq('company_id', cid).order('contact_name'),
      supabase.from('uom').select('name').order('name'),
    ])
    setGrns((grnData as any) || [])
    setProducts(prods || [])
    setSuppliers(sups || [])
    setUoms(uomData ? uomData.map((u:any) => u.name) : ['ခု'])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const addLine = () => setLines([...lines, { product_id:'', product_name:'', qty_received:'', unit_cost:'', batch_no:'', unit:'ခု' }])
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: string, value: any) => {
    setLines(prev => prev.map((item, idx) => {
      if (idx !== i) return item
      if (field === 'product_id') {
        if (value === '__new__') return { ...item, isNew: true, product_id: '', product_name: '', unit_cost: '', unit: 'ခု' }
        const prod = products.find(p => p.id === value)
        return { ...item, isNew: false, product_id: value, product_name: prod?.name || '', unit_cost: prod?.base_cost?.toString() || '', unit: prod?.unit || 'ခု' }
      }
      return { ...item, [field]: value }
    }))
  }

  const totalQty = lines.reduce((s, l) => s + Number(l.qty_received || 0), 0)
  const totalCost = lines.reduce((s, l) => s + (Number(l.qty_received || 0) * Number(l.unit_cost || 0)), 0)

  const openModal = () => {
    setSupplierId(''); setReceivedDate(new Date().toISOString().split('T')[0])
    setVehicleNo(''); setCarrierName(''); setNotes('')
    setLines([{ product_id:'', product_name:'', qty_received:'', unit_cost:'', batch_no:'', unit:'ခု', qty_damaged:'' }])
    setMsg(''); setModal(true)
  }

  const handleSave = async () => {
    if (lines.some(l => !l.product_id && !l.isNew)) { setMsg(t.grn_err_select_product); return }
    if (lines.some(l => l.isNew && !l.newName)) { setMsg(t.grn_err_new_name); return }
    if (lines.some(l => !l.qty_received || Number(l.qty_received) <= 0)) { setMsg(t.grn_err_qty); return }
    setSaving(true); setMsg('')

    const { data: profileData } = await supabase.from('profiles').select('company_id, full_name')
    const companyId = profileData?.[0]?.company_id
    const userName = profileData?.[0]?.full_name || 'Admin'
    if (!companyId) { setMsg(t.grn_err_company); setSaving(false); return }

    const grnNo = 'GRN-' + Date.now().toString().slice(-6)
    const { data: newGrn, error } = await supabase.from('grn').insert({
      company_id: companyId, grn_no: grnNo, supplier_id: supplierId || null,
      received_date: receivedDate, received_by: userName,
      vehicle_no: vehicleNo || null, carrier_name: carrierName || null, notes: notes || null,
    }).select().single()

    if (error) { setMsg('Error: ' + error.message); setSaving(false); return }

    for (const l of lines) {
      let productId = l.product_id
      if (l.isNew && l.newName) {
        const { data: newProd } = await supabase.from('products').insert({
          company_id: companyId, name: l.newName,
          base_cost: Number(l.unit_cost || 0), selling_price: Number(l.unit_cost || 0),
          stock_qty: Number(l.qty_received || 0), unit: l.unit || 'ခု', reorder_level: 5,
        }).select().single()
        if (newProd) productId = newProd.id
      } else {
        const prod = products.find(p => p.id === productId)
        if (prod) {
          await supabase.from('products').update({
            stock_qty: Number(prod.stock_qty || 0) + Number(l.qty_received)
          }).eq('id', productId)
        }
      }
      await supabase.from('grn_items').insert({
        grn_id: newGrn.id, product_id: productId,
        batch_no: l.batch_no || grnNo,
        qty_received: Number(l.qty_received), unit_cost: Number(l.unit_cost || 0),
      })
    }

    setMsg('✅')
    await fetchAll()
    setTimeout(() => setModal(false), 1000)
    setSaving(false)
  }

  const handleDelete = (id: string) => {
    showConfirm(t.grn_delete_confirm, async () => {
      const grn = grns.find(g => g.id === id)
      if (grn?.items) {
        for (const item of grn.items) {
          const { data: prod } = await supabase.from('products').select('stock_qty').eq('id', item.product_id).single()
          if (prod) {
            await supabase.from('products').update({
              stock_qty: Math.max(0, Number(prod.stock_qty) - Number(item.qty_received))
            }).eq('id', item.product_id)
          }
        }
      }
      await supabase.from('grn').delete().eq('id', id)
      await fetchAll()
    })
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold" style={{color:'var(--color-text)'}}>📦 {t.page_grn}</h1>
          <button onClick={openModal} className="text-sm px-4 py-2 rounded-lg font-medium text-white" style={{backgroundColor:'var(--color-primary)'}}>{t.grn_add_btn}</button>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center p-8" style={{color:'var(--color-text-sub)'}}>{t.loading}</div>
          ) : grns.length === 0 ? (
            <div className="text-center p-8" style={{color:'var(--color-text-sub)'}}>{t.grn_no_data}</div>
          ) : grns.map(g => (
            <div key={g.id} className="rounded-xl p-4"
              style={{backgroundColor:'var(--color-card)', border:'1px solid var(--color-border)', boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-mono text-sm px-2 py-0.5 rounded font-bold" style={{backgroundColor:'#eff6ff', color:'#1d4ed8'}}>{g.grn_no}</span>
                    <span className="text-sm" style={{color:'var(--color-text-sub)'}}>📅 {g.received_date}</span>
                    {g.supplier?.contact_name && <span className="text-sm" style={{color:'var(--color-text)'}}>🏪 {g.supplier.contact_name}</span>}
                    {g.carrier_name && <span className="text-xs text-gray-500">🚚 {g.carrier_name}</span>}
                    {g.vehicle_no && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">🚗 {g.vehicle_no}</span>}
                    <span className="text-xs text-gray-400">{t.grn_received_by}: {g.received_by}</span>
                  </div>
                  <div className="space-y-1 ml-2">
                    {(g.items || []).map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
                        <span className="font-medium text-gray-800">{item.product?.name}</span>
                        <span className="text-blue-700 font-bold">× {item.qty_received} {item.product?.unit}</span>
                        <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">#{item.batch_no}</span>
                        <span className="text-gray-400 text-xs">K {Number(item.unit_cost).toLocaleString()}{t.grn_per_unit}</span>
                      </div>
                    ))}
                  </div>
                  {g.notes && <p className="text-xs text-gray-400 mt-2 ml-2">📝 {g.notes}</p>}
                </div>
                <button onClick={() => handleDelete(g.id)} className="ml-4 px-3 py-1 rounded text-xs text-white" style={{backgroundColor:'#ef4444'}}>{t.btn_delete}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl p-5 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto" style={{backgroundColor:'var(--color-card)', color:'var(--color-text)'}}>
            <h2 className="text-lg font-bold mb-4">{t.grn_modal_title}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.grn_supplier}</label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="w-full p-2.5 rounded-lg text-sm outline-none" style={{backgroundColor:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}}>
                  <option value="">{t.grn_no_supplier}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.contact_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.grn_received_date}</label>
                <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} className="w-full p-2.5 rounded-lg text-sm outline-none" style={{backgroundColor:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.grn_carrier}</label>
                <input type="text" value={carrierName} onChange={e => setCarrierName(e.target.value)}
                  className="w-full p-2.5 rounded-lg text-sm outline-none" style={{backgroundColor:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} placeholder={t.grn_carrier_placeholder} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t.grn_vehicle}</label>
                <input type="text" value={vehicleNo} onChange={e => setVehicleNo(e.target.value)}
                  className="w-full p-2.5 rounded-lg text-sm outline-none" style={{backgroundColor:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} placeholder={t.grn_vehicle_placeholder} />
              </div>
            </div>

            <div className="mb-3">
              <div className="flex justify-between mb-2">
                <label className="text-xs font-medium text-gray-700">{t.grn_items_label}</label>
                <button onClick={addLine} className="text-xs text-blue-600 hover:underline">{t.grn_add_line}</button>
              </div>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="border rounded-lg p-2 bg-gray-50">
                    <div className="flex gap-2 mb-1">
                      <div className="flex-1">
                        <select value={l.isNew ? '__new__' : l.product_id}
                          onChange={e => updateLine(i, 'product_id', e.target.value)}
                          className="w-full p-2 border rounded text-sm bg-white">
                          <option value="">{t.grn_product_select}</option>
                          <option value="__new__">{t.grn_new_product}</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                        </select>
                        {l.isNew && (
                          <div className="flex gap-1 mt-1">
                            <input type="text" value={l.newName || ''} onChange={e => updateLine(i, 'newName', e.target.value)}
                              placeholder={t.grn_new_name_placeholder} className="flex-1 p-2 border rounded text-sm border-blue-400" />
                            <select value={l.unit} onChange={e => updateLine(i, 'unit', e.target.value)}
                              className="w-20 p-2 border rounded text-sm border-blue-400">
                              {uoms.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      {lines.length > 1 && (
                        <button onClick={() => removeLine(i)} className="text-red-500 text-lg px-1">×</button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">{t.grn_qty_label} ({l.unit || 'ခု'})</label>
                        <input type="text" inputMode="numeric" value={l.qty_received}
                          onChange={e => { const v = toEnglishNumber(e.target.value); if(/^[0-9.]*$/.test(v)) updateLine(i, 'qty_received', v) }}
                          className="w-full p-2 border rounded text-sm mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t.grn_cost_label}</label>
                        <input type="text" inputMode="numeric" value={l.unit_cost}
                          onChange={e => { const v = toEnglishNumber(e.target.value); if(/^[0-9.]*$/.test(v)) updateLine(i, 'unit_cost', v) }}
                          className="w-full p-2 border rounded text-sm mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t.grn_batch_label}</label>
                        <input type="text" value={l.batch_no}
                          onChange={e => updateLine(i, 'batch_no', e.target.value)}
                          className="w-full p-2 border rounded text-sm mt-0.5" placeholder={t.grn_batch_placeholder} />
                      </div>
                    </div>
                    {/* Damaged qty */}
                    <div className="mt-2 flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
                      <span className="text-base">🗑️</span>
                      <label className="text-xs text-red-600 font-medium whitespace-nowrap">ပျက်စီးကုန်:</label>
                      <input type="text" inputMode="numeric" value={l.qty_damaged || ''}
                        onChange={e => { const v = toEnglishNumber(e.target.value); if(/^[0-9.]*$/.test(v)) updateLine(i, 'qty_damaged', v) }}
                        className="w-20 p-1.5 border border-red-300 rounded text-sm text-center text-red-700 font-medium bg-white"
                        placeholder="0" />
                      <span className="text-xs text-red-500">{l.unit || 'ခု'}</span>
                      {Number(l.qty_damaged) > 0 && (
                        <span className="text-xs text-red-600 ml-auto">→ Damaged Stock မှာ သွားမည်</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-3 mb-3 text-sm flex justify-between">
              <span>{t.grn_summary_types}: <strong>{lines.length}</strong></span>
              <span>{t.grn_summary_qty}: <strong>{totalQty}</strong></span>
              <span>{t.grn_summary_cost}: <strong className="text-blue-700">K {totalCost.toLocaleString()}</strong></span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t.grn_notes}</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full p-2.5 rounded-lg text-sm outline-none" style={{backgroundColor:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} placeholder={t.grn_notes_placeholder} />
            </div>

            {msg && <p className={'text-sm mt-3 ' + (msg.includes('✅') ? 'text-green-600' : 'text-red-500')}>{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setModal(false)} className="flex-1 py-2 border rounded-lg text-sm">{t.btn_cancel}</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? t.loading : t.grn_save_btn}
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
