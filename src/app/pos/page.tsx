'use client'
import { useState, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import ProductGrid from '@/components/pos/ProductGrid'
import Cart, { CartItem } from '@/components/pos/Cart'
import PaymentModal from '@/components/pos/PaymentModal'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'

export default function POSPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string|undefined>()
  const [notification, setNotification] = useState<{msg:string;type:'success'|'error'|'info'} | null>(null)
  const showToast = (msg: string, type: 'success'|'error'|'info' = 'info') => {
    setNotification({msg, type})
    setTimeout(() => setNotification(null), 3000)
  }
  const [selectedCustomerName, setSelectedCustomerName] = useState<string|undefined>()
  const [showMobileCart, setShowMobileCart] = useState(false)

  const handleAddToCart = (product: any) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { ...product, quantity: 1 }]
    })
  }

  const handleRemoveFromCart = (id: string) => {
    setCartItems(prev => prev.filter(i => i.id !== id))
  }

  const handleUpdatePrice = (id: string, price: number) => {
    setCartItems(prev => prev.map(i => i.id === id ? { ...i, selling_price: price } : i))
  }

  const handleUpdateQuantity = (id: string, qty: number) => {
    if (qty <= 0) { handleRemoveFromCart(id); return }
    setCartItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i))
  }

  const handleCheckout = (customerId?: string, customerName?: string) => {
    if (cartItems.length === 0) { showToast('Cart ထဲတွင် ကုန်ပစ္စည်း မရှိပါ', 'error'); return }
    setSelectedCustomerId(customerId)
    setSelectedCustomerName(customerName)
    setShowPaymentModal(true)
    setShowMobileCart(false)
  }

  const handleConfirmPayment = useCallback(async (paymentData: {
    paymentType: string; amountReceived: number; payments?: { method: string; amount: number }[]
    customerId?: string; customerName?: string; bankAccountId?: string
  }) => {
    // PaymentModal ကနေ customer ရွေးထားရင် override လုပ်မယ်
    if (paymentData.customerId) {
      setSelectedCustomerId(paymentData.customerId)
      setSelectedCustomerName(paymentData.customerName)
    }
    const finalCustomerId = paymentData.customerId || selectedCustomerId
    // Credit sale မှာ customer မဖြစ်မနေ လိုတယ်
    if (paymentData.paymentType === 'credit' && !finalCustomerId) {
      showToast('အကြွေးရောင်းရန် Customer ရွေးပါ', 'error')
      return
    }
    const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS
    const requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
    const itemsToSend = cartItems.map(item => ({
      product_id: item.id, qty: item.quantity, unit_price: item.selling_price
    }))
    const grandTotal = itemsToSend.reduce((s, i) => s + i.qty * i.unit_price, 0)
    const amountPaid = paymentData.paymentType === 'credit' ? 0 : paymentData.amountReceived
    const draft = {
      occurred_at: new Date().toISOString(),
      parties: {
        customer_id: finalCustomerId || '',
        staff_profile_id: '',
      },
      references: { external_ref: '' },
      totals: {
        grand_total: grandTotal,
        amount_paid: amountPaid,
      },
      lines: itemsToSend.map(i => ({
        product_id: i.product_id, qty: i.qty, unit_price: i.unit_price
      })),
    }
    // Set company context for RLS in RPC
    const { getCompanyId } = await import('@/lib/getCompanyId')
    const posCompanyId = await getCompanyId()
    if (posCompanyId) {
      await supabase.rpc('set_staff_company', { p_company_id: posCompanyId })
    }

    const { data: rpcResult, error } = await supabase.rpc('rpc_post_pos_sale_from_draft', {
      p_request_id: requestId, p_idempotency_key: requestId + '-pos', p_draft: draft
    })
    if (error) {
      if (error.message.includes('Stock out') || error.message.includes('stock')) {
        showToast('ကုန်ပစ္စည်း မလုံလောက်ပါ', 'error')
      } else { showToast('ငွေရှင်းမှု မအောင်မြင်ပါ: ' + error.message, 'error') }
      return
    }
    const { data: companyInfo } = await supabase.from('companies').select('name,address,phone').eq('id', posCompanyId).maybeSingle()
    localStorage.setItem('pos_last_receipt', JSON.stringify({
      transactionId: rpcResult?.transaction_id || requestId,
      items: cartItems.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.selling_price, subtotal: i.selling_price * i.quantity })),
      totalAmount: cartItems.reduce((s,i) => s + i.selling_price * i.quantity, 0),
      amountPaid: paymentData.amountReceived,
      customerName: selectedCustomerName || '',
      paymentType: paymentData.paymentType,
      companyName: companyInfo?.name || 'Shop',
      companyAddress: companyInfo?.address || '',
      companyPhone: companyInfo?.phone || '',
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
    }))
    setCartItems([])
    setShowPaymentModal(false)
    showToast('ငွေရှင်းပြီးပါပြီ ✅', 'success')
    window.open('/pos/receipt', '_blank')
  }, [cartItems, selectedCustomerId, selectedCustomerName])

  const totalAmount = cartItems.reduce((acc, item) => acc + item.selling_price * item.quantity, 0)
  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0)

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row min-h-screen">

        {/* Desktop layout */}
        <div className="hidden md:block w-2/3 p-4 overflow-y-auto">
          <ProductGrid onAddToCart={handleAddToCart} />
        </div>
        <div className="hidden md:block w-1/3 p-4 border-l" style={{borderColor:'var(--color-border)'}}>
          <Cart
            items={cartItems}
            onRemove={handleRemoveFromCart}
            onCheckout={handleCheckout}
            onUpdateQuantity={handleUpdateQuantity}
            onUpdatePrice={handleUpdatePrice}
          />
        </div>

        {/* Mobile layout */}
        <div className="md:hidden flex flex-col w-full">
          {/* Mobile header with cart icon */}
          <div className="flex items-center justify-between px-4 py-3 sticky top-0 z-30 border-b"
            style={{backgroundColor:'var(--color-card)', borderColor:'var(--color-border)', zIndex: 20}}>
            <h1 className="font-bold text-lg" style={{color:'var(--color-text)'}}>🛒 POS</h1>
            <button onClick={() => setShowMobileCart(true)}
              className="relative p-2 rounded-xl"
              style={{backgroundColor:'var(--color-bg)'}}>
              <span className="text-2xl">🛒</span>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </button>
          </div>

          {/* Total bar */}
          {cartCount > 0 && (
            <div className="px-4 py-2 flex items-center justify-between"
              style={{backgroundColor:'#eff6ff', borderBottom:'1px solid #bfdbfe'}}>
              <span className="text-sm text-blue-700 font-medium">{cartCount} items</span>
              <span className="font-bold text-blue-700">K {totalAmount.toLocaleString()}</span>
            </div>
          )}

          {/* Product grid */}
          <div className="flex-1 p-3 overflow-y-auto">
            <ProductGrid onAddToCart={handleAddToCart} />
          </div>

          {/* Bottom checkout button */}
          {cartCount > 0 && (
            <div className="p-4 border-t sticky bottom-0"
              style={{backgroundColor:'var(--color-card)', borderColor:'var(--color-border)', zIndex: 20}}>
              <button onClick={() => setShowMobileCart(true)}
                className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl text-base flex items-center justify-between px-5">
                <span>🛒 Cart ကြည့်မည်</span>
                <span className="bg-white text-blue-600 px-3 py-1 rounded-xl text-sm font-bold">
                  K {totalAmount.toLocaleString()}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Mobile Cart Drawer */}
        {showMobileCart && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileCart(false)}/>
            <div className="relative rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
              style={{backgroundColor:'var(--color-card)'}}>
              {/* Drawer handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-300"/>
              </div>
              <div className="flex items-center justify-between px-5 py-2 border-b"
                style={{borderColor:'var(--color-border)'}}>
                <h2 className="font-bold text-lg" style={{color:'var(--color-text)'}}>🛒 Cart</h2>
                <button onClick={() => setShowMobileCart(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600"
                  style={{backgroundColor:'var(--color-bg)'}}>✕</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Cart
                  items={cartItems}
                  onRemove={handleRemoveFromCart}
                  onCheckout={handleCheckout}
                  onUpdateQuantity={handleUpdateQuantity}
                  onUpdatePrice={handleUpdatePrice}
                />
              </div>
            </div>
          </div>
        )}

        {showPaymentModal && (
          <PaymentModal
            totalAmount={totalAmount}
            customerId={selectedCustomerId}
            customerName={selectedCustomerName}
            onConfirm={handleConfirmPayment}
            onClose={() => setShowPaymentModal(false)}
          />
        )}
      </div>
      {/* Inline notification */}
      {notification && (
        <div style={{
          position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '10px 20px', borderRadius: '12px',
          fontSize: '14px', fontWeight: 500,
          background: notification.type === 'success' ? '#16a34a' : notification.type === 'error' ? '#dc2626' : '#2563eb',
          color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: '8px',
          animation: 'slideDown 0.2s ease',
        }}>
          {notification.type === 'success' ? '✅' : notification.type === 'error' ? '❌' : 'ℹ️'}
          {notification.msg}
        </div>
      )}
      <style>{`@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
    </AppLayout>
  )
}
