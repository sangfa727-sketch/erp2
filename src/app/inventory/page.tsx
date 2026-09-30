'use client'
import { getCompanyId } from '@/lib/getCompanyId'
import { useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'

interface Product {
  id: string; name: string; sku: string; stock_qty: number
  reorder_level: number; selling_price: number; base_cost: number
}
interface ModalState { type: 'in' | 'adjust' | null; product: Product | null }

export default function InventoryPage() {
  const { t } = useI18n()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState>({ type: null, product: null })
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS

  const fetchProducts = async () => {
    setLoading(true)
    const cid = await getCompanyId()
    let q = supabase.from('products')
      .select('id,name,sku,stock_qty,reorder_level,selling_price,base_cost')
      .eq('is_deleted', false).order('name')
    if (cid) q = q.eq('company_id', cid)
    const { data } = await q
    setProducts(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchProducts() }, [])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  )
  const lowStock = products.filter(p => p.stock_qty <= p.reorder_level)

  const openModal = (type: 'in' | 'adjust', product: Product) => {
    setModal({ type, product }); setQty(''); setMsg('')
  }
  const closeModal = () => setModal({ type: null, product: null })

  const handleSubmit = async () => {
    if (!modal.product || !qty) return
    setSaving(true); setMsg('')
    const qtyNum = parseFloat(qty)
    if (isNaN(qtyNum) || qtyNum === 0) { setMsg(t.inv_err_qty); setSaving(false); return }
    const newQty = modal.type === 'in'
      ? modal.product.stock_qty + Math.abs(qtyNum)
      : modal.product.stock_qty + qtyNum
    if (newQty < 0) { setMsg(t.inv_err_negative); setSaving(false); return }
    const { error } = await supabase.from('products').update({ stock_qty: newQty }).eq('id', modal.product.id)
    if (error) { setMsg('Error: ' + error.message) }
    else { setMsg('✅'); await fetchProducts(); setTimeout(closeModal, 1000) }
    setSaving(false)
  }

  return (
    <AppLayout>
      <div className="p-4 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold" style={{color:'var(--color-text)'}}>📦 {t.inv_title}</h1>
          <a href="/pos" className="text-xs px-3 py-1.5 rounded-lg"
            style={{backgroundColor:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-primary)'}}>{t.inv_back_pos}</a>
        </div>

        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <div className="mb-4 p-3 rounded-xl" style={{backgroundColor:'#fef2f2', border:'1px solid #fecaca'}}>
            <p className="text-sm font-semibold text-red-700 mb-2">{t.inv_low_stock_alert} ({lowStock.length} {t.inv_items})</p>
            <div className="flex flex-wrap gap-1.5">
              {lowStock.map(p => (
                <span key={p.id} className="text-xs px-2 py-1 rounded-lg font-medium" style={{backgroundColor:'#fee2e2', color:'#dc2626'}}>
                  {p.name} ({p.stock_qty} {t.inv_remaining})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-4">
          <input type="text" placeholder={t.inv_search} value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full p-2.5 rounded-xl text-sm outline-none"
            style={{backgroundColor:'var(--color-card)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} />
        </div>

        {loading ? (
          <div className="text-center py-12" style={{color:'var(--color-text-sub)'}}>{t.loading}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12" style={{color:'var(--color-text-sub)'}}>{t.no_data}</div>
        ) : (
          <>
            {/* Mobile: Card view */}
            <div className="md:hidden space-y-3">
              {filtered.map(p => {
                const isLow = p.stock_qty <= p.reorder_level
                return (
                  <div key={p.id} className="rounded-xl p-4"
                    style={{backgroundColor:'var(--color-card)', border:`1px solid ${isLow ? '#fecaca' : 'var(--color-border)'}`, boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-semibold text-sm" style={{color:'var(--color-text)'}}>{p.name}</p>
                        <p className="text-xs mt-0.5 font-mono" style={{color:'var(--color-text-sub)'}}>{p.sku}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium`}
                        style={{backgroundColor: isLow ? '#fee2e2' : '#dcfce7', color: isLow ? '#dc2626' : '#16a34a'}}>
                        {isLow ? t.inv_status_low : t.inv_status_ok}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-lg p-2 text-center" style={{backgroundColor:'var(--color-bg)'}}>
                        <p className="text-xs" style={{color:'var(--color-text-sub)'}}>Stock</p>
                        <p className="text-lg font-bold" style={{color: isLow ? '#dc2626' : 'var(--color-text)'}}>{Number(p.stock_qty).toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg p-2 text-center" style={{backgroundColor:'var(--color-bg)'}}>
                        <p className="text-xs" style={{color:'var(--color-text-sub)'}}>Reorder</p>
                        <p className="text-lg font-bold" style={{color:'var(--color-text-sub)'}}>{Number(p.reorder_level).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => openModal('in', p)}
                        className="py-2 rounded-xl text-xs font-semibold text-white"
                        style={{backgroundColor:'var(--color-primary)'}}>
                        {t.inv_btn_stock_in}
                      </button>
                      <button onClick={() => openModal('adjust', p)}
                        className="py-2 rounded-xl text-xs font-semibold"
                        style={{backgroundColor:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}}>
                        {t.inv_btn_adjust}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop: Table view */}
            <div className="hidden md:block rounded-xl shadow-sm overflow-hidden"
              style={{backgroundColor:'var(--color-card)', border:'1px solid var(--color-border)'}}>
              <table className="w-full text-sm">
                <thead style={{backgroundColor:'var(--color-bg)', borderBottom:'1px solid var(--color-border)'}}>
                  <tr>
                    <th className="text-left p-3 font-semibold" style={{color:'var(--color-text-sub)'}}>{t.inv_col_product}</th>
                    <th className="text-left p-3 font-semibold" style={{color:'var(--color-text-sub)'}}>SKU</th>
                    <th className="text-right p-3 font-semibold" style={{color:'var(--color-text-sub)'}}>{t.inv_col_stock}</th>
                    <th className="text-right p-3 font-semibold" style={{color:'var(--color-text-sub)'}}>{t.inv_col_reorder}</th>
                    <th className="text-center p-3 font-semibold" style={{color:'var(--color-text-sub)'}}>{t.inv_col_status}</th>
                    <th className="text-center p-3 font-semibold" style={{color:'var(--color-text-sub)'}}>{t.col_action}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} style={{borderBottom:'1px solid var(--color-border)'}}>
                      <td className="p-3 font-medium" style={{color:'var(--color-text)'}}>{p.name}</td>
                      <td className="p-3" style={{color:'var(--color-text-sub)'}}>{p.sku}</td>
                      <td className="p-3 text-right font-bold" style={{color:'var(--color-text)'}}>{Number(p.stock_qty).toLocaleString()}</td>
                      <td className="p-3 text-right" style={{color:'var(--color-text-sub)'}}>{Number(p.reorder_level).toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <span className="text-xs px-2 py-1 rounded-full font-medium"
                          style={{backgroundColor: p.stock_qty <= p.reorder_level ? '#fee2e2' : '#dcfce7',
                            color: p.stock_qty <= p.reorder_level ? '#dc2626' : '#16a34a'}}>
                          {p.stock_qty <= p.reorder_level ? t.inv_status_low : t.inv_status_ok}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => openModal('in', p)} className="px-3 py-1 rounded text-xs text-white" style={{backgroundColor:'var(--color-primary)'}}>{t.inv_btn_stock_in}</button>
                          <button onClick={() => openModal('adjust', p)} className="px-3 py-1 rounded text-xs" style={{backgroundColor:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}}>{t.inv_btn_adjust}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {modal.type && modal.product && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl p-5 w-full max-w-sm shadow-xl"
            style={{backgroundColor:'var(--color-card)', color:'var(--color-text)'}}>
            <h2 className="text-lg font-bold mb-1">
              {modal.type === 'in' ? t.inv_modal_stock_in : t.inv_modal_adjust}
            </h2>
            <p className="text-sm mb-4" style={{color:'var(--color-text-sub)'}}>{modal.product.name} ({t.inv_current_stock}: {modal.product.stock_qty})</p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1" style={{color:'var(--color-text-sub)'}}>
                {modal.type === 'in' ? t.inv_field_qty_in : t.inv_field_qty_adjust}
              </label>
              <input type="number" value={qty} onChange={e => setQty(e.target.value)}
                placeholder={modal.type === 'in' ? t.inv_placeholder_in : t.inv_placeholder_adjust}
                className="w-full p-2.5 rounded-lg text-sm outline-none"
                style={{backgroundColor:'var(--color-bg)', border:'1px solid var(--color-border)', color:'var(--color-text)'}} />
            </div>
            {msg && <p className={'text-sm mb-3 ' + (msg.includes('✅') ? 'text-green-600' : 'text-red-500')}>{msg}</p>}
            <div className="flex gap-2">
              <button onClick={closeModal} className="flex-1 py-2.5 rounded-lg text-sm"
                style={{border:'1px solid var(--color-border)', color:'var(--color-text)'}}>{t.btn_cancel}</button>
              <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{backgroundColor:'var(--color-primary)'}}>
                {saving ? t.loading : t.btn_save}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
