'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { useI18n } from '@/lib/i18n'
import BarcodeScanner from './BarcodeScanner'
import { getCompanyId } from '@/lib/getCompanyId'

interface Product {
  id: string; name: string; stock_qty: number
  selling_price: number; base_cost: number; sku?: string
}

export default function ProductGrid({ onAddToCart }: { onAddToCart: (p: any) => void }) {
  const { t } = useI18n()
  const [searchTerm, setSearchTerm] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const supabase = createClient() // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS // TODO: use getDb for RLS

  useEffect(() => {
    const fetchProducts = async () => {
      const cid = await getCompanyId()
      console.log('[ProductGrid] company_id:', cid)
      let q = supabase.from('products')
        .select('id,name,stock_qty,selling_price,base_cost,sku')
        .eq('is_deleted', false)
      if (cid) q = q.eq('company_id', cid)
      const { data, error } = await q
      console.log('[ProductGrid] data count:', data?.length, 'error:', error?.message)
      if (error) setError(error.message)
      else setProducts(data || [])
      setLoading(false)
    }
    fetchProducts()
  }, [])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleBarcodeScan = (barcode: string) => {
    setShowScanner(false)
    // SKU or name match
    const found = products.find(p =>
      p.sku === barcode ||
      p.name.toLowerCase() === barcode.toLowerCase()
    )
    if (found) {
      if (found.stock_qty > 0) onAddToCart({...found, cost_price: found.base_cost})
      else alert('ကုန်ပြီ')
    } else {
      setSearchTerm(barcode)
      alert(`Barcode: ${barcode} — ကုန်ပစ္စည်း မတွေ့ပါ`)
    }
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Search + Barcode */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder={t.product_search}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 p-2.5 rounded-xl outline-none text-sm"
          style={{
            backgroundColor: 'var(--color-bg, #f9fafb)',
            border: '1px solid var(--color-border, #e5e7eb)',
            color: 'var(--color-text, #111827)',
          }}
        />
        <button
          onClick={() => setShowScanner(true)}
          title="Barcode Scanner"
          className="px-3 py-2.5 rounded-xl font-medium text-white transition-all active:scale-95"
          style={{backgroundColor: 'var(--color-primary, #2563eb)', minWidth: '44px'}}>
          📷
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 flex-1">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl animate-pulse"
              style={{backgroundColor: 'var(--color-border, #e5e7eb)'}} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-4xl mb-2 opacity-30">📦</p>
            <p className="text-sm" style={{color: 'var(--color-text-sub, #6b7280)'}}>{t.no_data}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 overflow-y-auto flex-1" style={{gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",alignContent:"start"}}>
          {filtered.map(product => (
            <button
              key={product.id}
              onClick={() => product.stock_qty > 0 && onAddToCart({...product, cost_price: product.base_cost})}
              disabled={product.stock_qty === 0}
              className="rounded-xl text-left transition-all active:scale-95 disabled:opacity-40 flex flex-col"
              style={{
                backgroundColor: 'var(--color-card, #fff)',
                border: '1px solid var(--color-border, #e5e7eb)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)',
                minHeight: '90px',
                padding: '10px',
                transition: 'box-shadow 0.15s, transform 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.13), 0 2px 6px rgba(0,0,0,0.06)'
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary, #2563eb)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)'
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border, #e5e7eb)'
              }}>
              <p className="font-semibold text-xs leading-tight mb-1 flex-1"
                style={{color: 'var(--color-text, #111827)', display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>{product.name}</p>
              <p className="font-bold text-sm" style={{color: 'var(--color-primary, #2563eb)'}}>
                K {Number(product.selling_price).toLocaleString()}
              </p>
              <p className="text-xs mt-0.5"
                style={{color: product.stock_qty <= 0 ? '#ef4444' : 'var(--color-text-sub, #6b7280)'}}>
                {product.stock_qty <= 0 ? t.product_out_of_stock : `${product.stock_qty} ကျန်`}
              </p>
            </button>
          ))}
        </div>
      )}

      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}
