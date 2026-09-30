'use client'
import { getCompanyId } from '@/lib/getCompanyId'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import ConfirmModal from '@/components/ui/ConfirmModal'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'
import { toEnglishNumber } from '@/lib/utils'

interface LineItem { product_id: string; product_name: string; qty: any; unit_price: any; isNew?: boolean; newName?: string; unit?: string }

export default function PurchasesPage() {
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS
  const { t } = useI18n()
  const [purchases, setPurchases] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [uoms, setUoms] = useState<string[]>(['ခု'])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [payType, setPayType] = useState<'cash'|'credit'>('cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [lines, setLines] = useState<LineItem[]>([{product_id:'',product_name:'',qty:'',unit_price:'',unit:'ခု'}])
  const [expandedId, setExpandedId] = useState<string|null>(null)
  const [confirmState, setConfirmState] = useState<{open:boolean;msg:string;cb:()=>void}>({open:false,msg:'',cb:()=>{}})
  const showConfirm = (msg: string, cb: ()=>void) => setConfirmState({open:true,msg,cb})
  const hideConfirm = () => setConfirmState(s=>({...s,open:false}))

  const fetchAll = async () => {
    const cid = await getCompanyId()
    setLoading(true)
    const [{ data: purch },{ data: prods },{ data: sups },{ data: uomData }] = await Promise.all([
      supabase.from('purchases').select('*, supplier:supplier_id(contact_name), items:purchase_items(id,product_id,qty,unit_price,product:product_id(name,unit))').eq('company_id', cid).order('created_at',{ascending:false}),
      supabase.from('products').select('id,name,selling_price,base_cost,stock_qty,unit').eq('is_deleted',false).eq('company_id', cid).order('name'),
      supabase.from('contacts').select('id,contact_name,current_balance').eq('contact_type',t.pur_col_supplier).eq('company_id', cid).order('contact_name'),
      supabase.from('uom').select('name').order('name'),
    ])
    setPurchases(purch||[])
    setProducts(prods||[])
    setSuppliers(sups||[])
    setUoms(uomData ? uomData.map((u:any)=>u.name) : ['ခု'])
    setLoading(false)
  }
  useEffect(()=>{fetchAll()},[])

  const itemsTotal = lines.reduce((s,l)=>s+(Number(l.qty)*Number(l.unit_price)),0)
  const paidAmt = payType==='cash' ? Number(amountPaid||0) : 0
  const balance = itemsTotal - paidAmt

  const updateLine = (i:number,field:string,value:any)=>
    setLines(prev=>prev.map((item,idx)=>idx===i?{...item,[field]:value}:item))

  const openAdd = ()=>{
    setSupplierId('');setPayType('cash');setAmountPaid('')
    setLines([{product_id:'',product_name:'',qty:'',unit_price:'',unit:'ခု'}])
    setMsg('');setModal({mode:'add'})
  }

  const openEdit = (p: any)=>{
    setSupplierId(p.supplier_id||'')
    setPayType(Number(p.amount_paid)>=Number(p.grand_total)?'cash':'credit')
    setAmountPaid(String(p.amount_paid||''))
    const ls = (p.items||[]).map((it:any)=>({
      product_id: it.product_id, product_name: it.product?.name||'',
      qty: String(it.qty), unit_price: String(it.unit_price), unit: it.product?.unit||'ခု',
    }))
    setLines(ls.length>0?ls:[{product_id:'',product_name:'',qty:'',unit_price:'',unit:'ခု'}])
    setMsg('');setModal({mode:'edit',id:p.id})
  }

  const handleDelete = (id:string)=>{
    showConfirm('ဝယ်ယူမှု ဖျက်မှာ သေချာလား?', async()=>{
      await supabase.from('purchase_items').delete().eq('purchase_id',id)
      await supabase.from('purchases').delete().eq('id',id)
      await fetchAll()
    })
  }

  const handleSave = async()=>{
    if(lines.some(l=>!l.product_id&&!l.isNew)){setMsg(t.pur_product_select);return}
    if(lines.some(l=>!l.qty||Number(l.qty)<=0)){setMsg(t.pur_err_qty);return}
    setSaving(true);setMsg('')
    const {data:profileData} = await supabase.from('profiles').select('company_id')
    const companyId = profileData?.[0]?.company_id
    if(!companyId){setMsg(t.pur_err_company);setSaving(false);return}

    let purchaseId = modal.id
    if(modal.mode==='add'){
      const {data:np,error} = await supabase.from('purchases').insert({
        company_id:companyId, supplier_id:supplierId||null,
        items_total:itemsTotal, amount_paid:paidAmt, is_received:true,
      }).select().single()
      if(error){setMsg('Error: '+error.message);setSaving(false);return}
      purchaseId = np.id
    } else {
      await supabase.from('purchase_items').delete().eq('purchase_id',modal.id)
      await supabase.from('purchases').update({
        supplier_id:supplierId||null, items_total:itemsTotal, amount_paid:paidAmt,
      }).eq('id',modal.id)
    }

    const finalLines=[]
    for(const l of lines){
      if(l.isNew&&l.newName){
        const {data:np2} = await supabase.from('products').insert({
          company_id:companyId, name:l.newName,
          base_cost:Number(l.unit_price||0), selling_price:Number(l.unit_price||0),
          stock_qty:Number(l.qty||0), reorder_level:5, unit:l.unit||'ခု',
        }).select().single()
        if(np2) finalLines.push({...l,product_id:np2.id})
      } else {
        finalLines.push(l)
        if(modal.mode==='add'){
          const prod = products.find(p=>p.id===l.product_id)
          if(prod) await supabase.from('products').update({stock_qty:Number(prod.stock_qty||0)+Number(l.qty)}).eq('id',l.product_id)
        }
      }
    }

    await supabase.from('purchase_items').insert(finalLines.map(l=>({
      purchase_id:purchaseId, product_id:l.product_id,
      qty:Number(l.qty), unit_price:Number(l.unit_price),
    })))

    if(supplierId&&balance>0&&modal.mode==='add'){
      const {data:fs} = await supabase.from('contacts').select('current_balance').eq('id',supplierId).single()
      await supabase.from('contacts').update({current_balance:Number(fs?.current_balance||0)+balance}).eq('id',supplierId)
    }

    setMsg('✅ ' + t.btn_save)
    await fetchAll()
    setTimeout(()=>setModal(null),800)
    setSaving(false)
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">{'📥 ' + t.page_purchases}</h1>
          <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">{t.pur_add_btn}</button>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {loading ? <p className="text-center text-gray-400 py-8">{t.loading}</p>
          : purchases.length===0 ? <p className="text-center text-gray-400 py-8">{t.pur_no_data}</p>
          : purchases.map(p=>{
            const bal = Number(p.grand_total)-Number(p.amount_paid)
            const expanded = expandedId === p.id
            return (
              <div key={p.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-4" onClick={()=>setExpandedId(expanded?null:p.id)}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-gray-800">{p.supplier?.contact_name||'Supplier မရှိ'}</p>
                      <p className="text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-800">K {Number(p.grand_total).toLocaleString()}</p>
                      {bal > 0 && <p className="text-xs text-red-500">ကြွေး K {bal.toLocaleString()}</p>}
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-gray-400">{(p.items||[]).length} မျိုး {expanded?'▲':'▼'}</span>
                    <div className="flex gap-2">
                      <button onClick={e=>{e.stopPropagation();openEdit(p)}} className="px-3 py-1 bg-yellow-500 text-white rounded text-xs">ပြင်</button>
                      <button onClick={e=>{e.stopPropagation();handleDelete(p.id)}} className="px-3 py-1 bg-red-500 text-white rounded text-xs">ဖျက်</button>
                    </div>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t px-4 pb-3 bg-gray-50">
                    {(p.items||[]).map((it:any,i:number)=>(
                      <div key={i} className="flex justify-between text-xs py-1 border-b last:border-0">
                        <span>{it.product?.name||'?'}</span>
                        <span>{it.qty} {it.product?.unit||'ခု'} × K {Number(it.unit_price).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs mt-2 font-bold">
                      <span>{t.pur_col_paid}</span><span className="text-green-600">K {Number(p.amount_paid).toLocaleString()}</span>
                    </div>
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
                <th className="text-left p-3 font-semibold text-gray-600">{t.pur_col_supplier}</th>
                <th className="text-left p-3 font-semibold text-gray-600">{t.pur_col_items}</th>
                <th className="text-right p-3 font-semibold text-gray-600">{t.col_total}</th>
                <th className="text-right p-3 font-semibold text-gray-600">{t.pur_col_paid}</th>
                <th className="text-right p-3 font-semibold text-gray-600">{t.col_balance}</th>
                <th className="text-center p-3 font-semibold text-gray-600">{t.col_action}</th>
              </tr>
            </thead>
            <tbody>
              {loading?(<tr><td colSpan={7} className="text-center p-8 text-gray-400">{t.loading}</td></tr>)
              :purchases.length===0?(<tr><td colSpan={7} className="text-center p-8 text-gray-400">{t.pur_no_data}</td></tr>)
              :purchases.map(p=>{
                const bal=Number(p.grand_total)-Number(p.amount_paid)
                return(
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="p-3">{p.supplier?.contact_name||'-'}</td>
                    <td className="p-3 text-xs text-gray-600">
                      {(p.items||[]).map((it:any,i:number)=>(
                        <div key={i}>{it.product?.name||'?'} × {it.qty} {it.product?.unit||'ခု'}</div>
                      ))}
                    </td>
                    <td className="p-3 text-right font-bold">K {Number(p.grand_total).toLocaleString()}</td>
                    <td className="p-3 text-right text-green-600">K {Number(p.amount_paid).toLocaleString()}</td>
                    <td className="p-3 text-right font-bold text-red-500">K {bal.toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={()=>openEdit(p)} className="px-2 py-1 bg-yellow-500 text-white rounded text-xs">ပြင်</button>
                        <button onClick={()=>handleDelete(p.id)} className="px-2 py-1 bg-red-500 text-white rounded text-xs">ဖျက်</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-5 w-full md:max-w-2xl shadow-xl max-h-[95vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{modal.mode==='add'?t.pur_modal_add:t.pur_modal_edit}</h2>

            {/* Supplier */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">{t.pur_col_supplier}</label>
              <select value={supplierId} onChange={e=>setSupplierId(e.target.value)}
                className="w-full p-2.5 border rounded-lg text-sm">
                <option value="">{t.pur_no_supplier}</option>
                {suppliers.map(s=><option key={s.id} value={s.id}>{s.contact_name}</option>)}
              </select>
            </div>

            {/* Lines */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-2">{t.pur_items_label}</label>
              <div className="space-y-2">
                {lines.map((l,i)=>(
                  <div key={i} className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex gap-2 mb-2">
                      <select value={l.isNew?'__new__':l.product_id}
                        onChange={e=>{
                          if(e.target.value==='__new__'){
                            updateLine(i,'isNew',true);updateLine(i,'product_id','__new__')
                          } else {
                            const prod=products.find(p=>p.id===e.target.value)
                            updateLine(i,'isNew',false)
                            updateLine(i,'product_id',e.target.value)
                            updateLine(i,'product_name',prod?.name||'')
                            updateLine(i,'unit_price',String(prod?.base_cost||''))
                            updateLine(i,'unit',prod?.unit||'ခု')
                          }
                        }}
                        className="flex-1 p-2 border rounded text-sm">
                        <option value="">{t.pur_product_select}</option>
                        {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                        <option value="__new__">{t.pur_new_product}</option>
                      </select>
                      {lines.length>1&&(
                        <button onClick={()=>setLines(lines.filter((_,idx)=>idx!==i))}
                          className="px-2 py-1 bg-red-500 text-white rounded text-xs">✕</button>
                      )}
                    </div>
                    {l.isNew&&(
                      <input type="text" placeholder={t.pur_new_product_placeholder} value={l.newName||''}
                        onChange={e=>updateLine(i,'newName',e.target.value)}
                        className="w-full p-2 border rounded text-sm mb-2" />
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">{t.pur_qty_label}</label>
                        <input type="text" value={l.qty}
                          onChange={e=>{const v=toEnglishNumber(e.target.value);if(/^\d*\.?\d*$/.test(v))updateLine(i,'qty',v)}}
                          className="w-full p-2 border rounded text-sm" placeholder={t.pur_qty_ph} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t.pur_unit_label}</label>
                        <select value={l.unit||'ခု'} onChange={e=>updateLine(i,'unit',e.target.value)}
                          className="w-full p-2 border rounded text-sm">
                          {uoms.map(u=><option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t.pur_cost_label}</label>
                        <input type="text" value={l.unit_price}
                          onChange={e=>{const v=toEnglishNumber(e.target.value);if(/^\d*\.?\d*$/.test(v))updateLine(i,'unit_price',v)}}
                          className="w-full p-2 border rounded text-sm" placeholder={t.pur_cost_ph} />
                      </div>
                    </div>
                    <p className="text-xs text-right text-gray-500 mt-1">
                      ပေါင်း: K {(Number(l.qty||0)*Number(l.unit_price||0)).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
              <button onClick={()=>setLines([...lines,{product_id:'',product_name:'',qty:'',unit_price:'',unit:'ခု'}])}
                className="mt-2 w-full py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg text-sm hover:border-blue-400 hover:text-blue-500">
                + ကုန်ပစ္စည်း ထပ်ထည့်
              </button>
            </div>

            {/* Payment */}
            <div className="border rounded-lg p-3 bg-blue-50 mb-3">
              <p className="font-bold text-sm mb-2">💰 {t.pur_payment_section} — {t.pur_total_label}: K {itemsTotal.toLocaleString()}</p>
              <div className="flex gap-2 mb-2">
                <button onClick={()=>setPayType('cash')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${payType==='cash'?'bg-green-500 text-white':'bg-white border'}`}>
                  {t.pur_cash}
                </button>
                <button onClick={()=>setPayType('credit')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${payType==='credit'?'bg-orange-500 text-white':'bg-white border'}`}>
                  {t.pur_credit}
                </button>
              </div>
              {payType==='cash'&&(
                <div>
                  <label className="text-xs text-gray-600">{t.pur_amount_paid_label}</label>
                  <input type="text" value={amountPaid}
                    onChange={e=>{const v=toEnglishNumber(e.target.value);if(/^\d*$/.test(v))setAmountPaid(v)}}
                    className="w-full p-2 border rounded-lg text-sm mt-1" placeholder={t.pur_amount_ph} />
                  {balance>0&&<p className="text-xs text-orange-600 mt-1">{t.pur_balance_label}: K {balance.toLocaleString()}</p>}
                </div>
              )}
              {payType==='credit'&&(
                <p className="text-xs text-orange-600">အကုန်လုံး ကြွေးအဖြစ် မှတ်မည် — K {itemsTotal.toLocaleString()}</p>
              )}
            </div>

            {msg&&<p className={'text-sm mb-3 '+(msg.includes('✅')?'text-green-600':'text-red-500')}>{msg}</p>}
            <div className="flex gap-2">
              <button onClick={()=>setModal(null)} className="flex-1 py-2.5 border rounded-lg text-sm">{t.btn_cancel}</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving?t.settings_saving:'✅ ' + t.btn_save}
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
