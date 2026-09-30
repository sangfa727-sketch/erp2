'use client'
import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { useI18n } from '@/lib/i18n'

export type CartItem = {
  id: string; name: string; quantity: number
  selling_price: number; stock_qty: number; cost_price: number
}
interface Contact { id: string; contact_name: string; phone?: string }
interface CartProps {
  items: CartItem[]
  onRemove: (id: string) => void
  onUpdateQuantity: (id: string, quantity: number) => void
  onCheckout: (customerId?: string, customerName?: string) => void
  onUpdatePrice: (id: string, price: number) => void
}

const Cart: React.FC<CartProps> = ({ items, onRemove, onUpdateQuantity, onCheckout, onUpdatePrice }) => {
  const { t } = useI18n()
  const totalAmount = items.reduce((acc, item) => acc + item.selling_price * item.quantity, 0)
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [customers, setCustomers] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [allowPriceEdit, setAllowPriceEdit] = useState(false)
  const [editingPrice, setEditingPrice] = useState<{[id: string]: string}>({})
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS

  useEffect(() => {
    const fetchSettings = async () => {
      let cid = ''
      const ss = localStorage.getItem('staff_session')
      if (ss) {
        try { const sess = JSON.parse(ss); const { data: p } = await supabase.from('profiles').select('company_id').eq('id', sess.id).maybeSingle(); cid = p?.company_id || '' } catch {}
      }
      if (!cid) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) { const { data: p } = await supabase.from('profiles').select('company_id').eq('auth_user_id', user.id).maybeSingle(); cid = p?.company_id || '' }
      }
      const q = supabase.from('companies').select('allow_price_edit')
      const { data } = cid ? await q.eq('id', cid).maybeSingle() : await q.maybeSingle()
      if (data?.allow_price_edit) setAllowPriceEdit(true)
    }
    fetchSettings()
  }, [])

  const loadCustomers = async () => {
    const { data } = await supabase.from('contacts')
      .select('id,contact_name,phone').in('contact_type', ['Customer','Both'])
      .eq('is_deleted', false).order('contact_name')
    setCustomers(data || [])
  }

  const openModal = () => {
    setSearch(''); setShowNewForm(false); setNewName(''); setNewPhone('')
    loadCustomers(); setShowModal(true)
  }
  const selectCustomer = async (c: any) => {
    setCustomerId(c.id); setCustomerName(c.contact_name); setShowModal(false)
    // Check blacklist + credit limit
    const { data } = await supabase.from('contacts')
      .select('is_blacklisted,credit_limit,current_balance').eq('id', c.id).single()
    if (data?.is_blacklisted) {
      alert('⚠️ ' + c.contact_name + ' သည် Blacklist ဖြစ်နေသည်။\nကြွေးဖြင့် ရောင်းချမည် မဟုတ်ပါ။')
    } else if (data && data.credit_limit > 0 && data.current_balance >= data.credit_limit) {
      alert('⚠️ Credit Limit ကျော်နေသည်\n' + c.contact_name + ' ၏ ကြွေးကျန်: K ' + Number(data.current_balance).toLocaleString() + '\nLimit: K ' + Number(data.credit_limit).toLocaleString())
    }
  }
  const clearCustomer = () => { setCustomerId(''); setCustomerName('') }
  const filtered = customers.filter(c =>
    c.contact_name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search))

  const handleAddNew = async () => {
    if (!newName.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('auth_user_id', user?.id).maybeSingle()
    if (!profile?.company_id) { alert(t.cart_err_no_company); setSaving(false); return }
    const { data: newC } = await supabase.from('contacts').insert({
      company_id: profile.company_id, contact_name: newName.trim(),
      phone: newPhone.trim() || null, contact_type: 'Customer',
    }).select().single()
    if (newC) { setCustomers(prev => [...prev, newC]); selectCustomer(newC) }
    setSaving(false)
  }

  return (
    <div className="flex flex-col h-full" style={{backgroundColor: 'var(--color-card, #ffffff)', color: 'var(--color-text, #111827)'}}>

      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between"
        style={{borderBottom: '1px solid var(--color-border, #e5e7eb)'}}>
        <h2 className="font-bold text-base">🛒 {t.cart_title}</h2>
        {items.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{backgroundColor: 'var(--color-primary, #2563eb)', color: '#fff'}}>
            {items.length}
          </span>
        )}
      </div>

      {/* Customer bar */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{backgroundColor: 'var(--color-bg, #f9fafb)', border: '1px solid var(--color-border, #e5e7eb)'}}>
          {customerId ? (
            <>
              <span className="text-green-500 text-base">👤</span>
              <span className="flex-1 font-medium text-xs truncate" style={{color: 'var(--color-text, #111827)'}}>{customerName}</span>
              <button onClick={() => openModal()} className="text-xs px-2 py-0.5 rounded"
                style={{color: 'var(--color-primary, #2563eb)'}}>{t.edit}</button>
              <button onClick={clearCustomer} className="text-xs" style={{color: '#ef4444'}}>✕</button>
            </>
          ) : (
            <>
              <span className="text-gray-400 text-base">👤</span>
              <span className="flex-1 text-xs" style={{color: 'var(--color-text-sub, #6b7280)'}}>{t.cart_no_customer}</span>
              <button onClick={openModal}
                className="text-xs px-3 py-1 rounded-lg font-medium text-white"
                style={{backgroundColor: 'var(--color-primary, #2563eb)'}}>
                {t.cart_select_add}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-3 space-y-2 py-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <span className="text-4xl opacity-30">🛒</span>
            <p className="text-sm" style={{color: 'var(--color-text-sub, #6b7280)'}}>{t.cart_empty}</p>
          </div>
        ) : items.map(item => (
          <div key={item.id} className="rounded-xl p-3"
            style={{
              backgroundColor: 'var(--color-bg, #f9fafb)',
              border: '1px solid var(--color-border, #e5e7eb)',
            }}>
            {/* Product name + remove */}
            <div className="flex items-start justify-between mb-2">
              <p className="font-semibold text-sm flex-1 pr-2 leading-tight"
                style={{color: 'var(--color-text, #111827)'}}>{item.name}</p>
              <button onClick={() => onRemove(item.id)}
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                style={{backgroundColor: '#fee2e2', color: '#ef4444'}}>✕</button>
            </div>

            {/* Price + qty row */}
            <div className="flex items-center justify-between">
              {/* Price (editable or static) */}
              <div className="flex items-center gap-1">
                {allowPriceEdit ? (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg"
                    style={{backgroundColor: 'var(--color-card, #fff)', border: '1px solid var(--color-primary, #2563eb)'}}>
                    <span className="text-xs font-medium" style={{color: 'var(--color-text-sub, #6b7280)'}}>K</span>
                    <input
                      type="number"
                      value={editingPrice[item.id] ?? item.selling_price}
                      onChange={e => setEditingPrice(prev => ({ ...prev, [item.id]: e.target.value }))}
                      onBlur={e => {
                        const val = parseFloat(e.target.value)
                        if (!isNaN(val) && val >= 0) onUpdatePrice(item.id, val)
                        setEditingPrice(prev => { const n = {...prev}; delete n[item.id]; return n })
                      }}
                      className="w-20 text-xs font-bold bg-transparent outline-none"
                      style={{color: 'var(--color-primary, #2563eb)'}}
                    />
                    <span className="text-xs" style={{color: 'var(--color-primary, #2563eb)'}}>✏️</span>
                  </div>
                ) : (
                  <span className="text-xs font-medium" style={{color: 'var(--color-text-sub, #6b7280)'}}>
                    K {item.selling_price.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Qty controls */}
              <div className="flex items-center gap-1">
                <button onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                  className="w-7 h-7 rounded-lg font-bold text-sm flex items-center justify-center"
                  style={{backgroundColor: 'var(--color-card, #fff)', border: '1px solid var(--color-border, #e5e7eb)', color: 'var(--color-text, #111827)'}}>−</button>
                <span className="w-8 text-center text-sm font-bold"
                  style={{color: 'var(--color-text, #111827)'}}>{item.quantity}</span>
                <button onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                  className="w-7 h-7 rounded-lg font-bold text-sm flex items-center justify-center"
                  style={{backgroundColor: 'var(--color-primary, #2563eb)', color: '#fff'}}>+</button>
              </div>

              {/* Subtotal */}
              <span className="text-sm font-bold min-w-[60px] text-right"
                style={{color: 'var(--color-text, #111827)'}}>
                K {(item.selling_price * item.quantity).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Checkout footer */}
      {items.length > 0 && (
        <div className="px-3 py-3" style={{borderTop: '1px solid var(--color-border, #e5e7eb)'}}>
          <div className="flex justify-between items-center mb-3">
            <span className="font-bold text-sm" style={{color: 'var(--color-text, #111827)'}}>{t.cart_total}</span>
            <span className="text-2xl font-bold" style={{color: 'var(--color-primary, #2563eb)'}}>
              K {totalAmount.toLocaleString()}
            </span>
          </div>
          <button
            onClick={() => onCheckout(customerId || undefined, customerName || undefined)}
            className="w-full py-3 rounded-xl font-bold text-sm text-white shadow-md transition-all active:scale-95"
            style={{backgroundColor: 'var(--color-primary, #2563eb)'}}>
            {t.cart_checkout}
          </button>
        </div>
      )}

      {/* Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-sm shadow-2xl p-5"
            style={{backgroundColor: 'var(--color-card, #fff)', color: 'var(--color-text, #111827)'}}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-base">👤 {t.cart_customer_select}</h3>
              <button onClick={() => setShowModal(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                style={{backgroundColor: 'var(--color-bg, #f9fafb)', color: 'var(--color-text-sub, #6b7280)'}}>✕</button>
            </div>
            {!showNewForm ? (
              <>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={t.cart_search_placeholder}
                  className="w-full p-2.5 rounded-xl text-sm mb-3 outline-none"
                  style={{backgroundColor: 'var(--color-bg, #f9fafb)', border: '1px solid var(--color-border, #e5e7eb)', color: 'var(--color-text, #111827)'}}
                  autoFocus />
                <div className="max-h-52 overflow-y-auto mb-3 space-y-1">
                  {filtered.length === 0 ? (
                    <p className="text-center text-sm py-4" style={{color: 'var(--color-text-sub, #6b7280)'}}>{t.cart_not_found}</p>
                  ) : filtered.map(c => (
                    <button key={c.id} onClick={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex justify-between transition-all"
                      style={{color: 'var(--color-text, #111827)'}}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg, #f9fafb)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <span className="font-medium">{c.contact_name}</span>
                      {c.phone && <span className="text-xs" style={{color: 'var(--color-text-sub, #6b7280)'}}>{c.phone}</span>}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowNewForm(true)}
                  className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed transition-all"
                  style={{borderColor: 'var(--color-primary, #2563eb)', color: 'var(--color-primary, #2563eb)'}}>
                  {t.cart_add_new_customer}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-3" style={{color: 'var(--color-text, #111827)'}}>{t.cart_new_customer}</p>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder={t.cart_name_placeholder}
                  className="w-full p-2.5 rounded-xl text-sm mb-2 outline-none"
                  style={{backgroundColor: 'var(--color-bg, #f9fafb)', border: '1px solid var(--color-border, #e5e7eb)', color: 'var(--color-text, #111827)'}}
                  autoFocus />
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                  placeholder={t.cart_phone_placeholder}
                  className="w-full p-2.5 rounded-xl text-sm mb-3 outline-none"
                  style={{backgroundColor: 'var(--color-bg, #f9fafb)', border: '1px solid var(--color-border, #e5e7eb)', color: 'var(--color-text, #111827)'}} />
                <div className="flex gap-2">
                  <button onClick={() => setShowNewForm(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm"
                    style={{border: '1px solid var(--color-border, #e5e7eb)', color: 'var(--color-text, #111827)'}}>
                    {t.cart_back}
                  </button>
                  <button onClick={handleAddNew} disabled={saving || !newName.trim()}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                    style={{backgroundColor: 'var(--color-primary, #2563eb)'}}>
                    {saving ? '...' : t.cart_add_btn}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
export default Cart
