'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'

interface ReceiptItem { name: string; quantity: number; unit_price: number; subtotal: number }
interface ReceiptData {
  transactionId: string; companyName: string; companyAddress?: string; companyPhone?: string
  items: ReceiptItem[]; totalAmount: number; amountPaid: number; customerName?: string; createdAt: string; createdAtMs?: number
}

export default function ReceiptPage() {
  const { t } = useI18n()
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [printSize, setPrintSize] = useState('receipt')
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const data = localStorage.getItem('pos_last_receipt')
    if (data) setReceipt(JSON.parse(data))
    const size = localStorage.getItem('print_size') || 'receipt'
    setPrintSize(size)
  }, [searchParams])

  if (!receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>{t.receipt_no_data}{' '}
          <a href="/pos" className="text-blue-600">{t.receipt_back_pos}</a>
        </p>
      </div>
    )
  }

  const change = receipt.amountPaid - receipt.totalAmount
  const isInvoice = printSize === 'a4' || printSize === 'letter' || printSize === 'legal'
  const pageSize = printSize === 'a4' ? 'A4' : printSize === 'letter' ? 'letter' : printSize === 'legal' ? 'legal' : 'auto'

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { size: ${pageSize}; margin: ${isInvoice ? '15mm' : '0'}; }
        }
      `}} />
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="fixed top-4 right-4 no-print flex gap-2 z-10">
          {['receipt','a4','letter','legal'].map(s => (
            <button key={s} onClick={() => { setPrintSize(s); localStorage.setItem('print_size', s) }}
              className={`px-3 py-1 rounded text-xs font-medium border ${printSize === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
              {s === 'receipt' ? '🧾 Receipt' : s.toUpperCase()}
            </button>
          ))}
        </div>

        {!isInvoice && (
          <div className="bg-white w-80 p-6 font-mono text-sm shadow-lg">
            <h1 className="text-center font-bold text-lg mb-1">{receipt.companyName}</h1>
            {receipt.companyAddress && <p className="text-center text-xs mb-1">{receipt.companyAddress}</p>}
            {receipt.companyPhone && <p className="text-center text-xs mb-1">Ph: {receipt.companyPhone}</p>}
            <p className="text-center text-xs mb-4">{receipt.createdAtMs ? new Date(receipt.createdAtMs).toLocaleString() : new Date().toLocaleString()}</p>
            <p className="text-xs mb-1">Receipt#: {receipt.transactionId}</p>
            {receipt.customerName && <p className="text-xs mb-2">Customer: {receipt.customerName}</p>}
            <div className="border-t border-dashed border-gray-400 my-2" />
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="w-40">{t.receipt_item}</span>
              <span className="w-10 text-center">{t.receipt_qty}</span>
              <span className="w-20 text-right">{t.receipt_amount}</span>
            </div>
            <div className="border-t border-dashed border-gray-400 mb-2" />
            {receipt.items.map((item, i) => (
              <div key={i} className="flex justify-between text-xs mb-1">
                <span className="w-40 truncate">{item.name}</span>
                <span className="w-10 text-center">{item.quantity}</span>
                <span className="w-20 text-right">K {(item.subtotal ?? item.quantity * item.unit_price).toLocaleString()}</span>
              </div>
            ))}
            <div className="border-t border-dashed border-gray-400 my-2" />
            <div className="flex justify-between font-bold text-sm">
              <span>{t.receipt_total}</span>
              <span>K {receipt.totalAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span>{t.receipt_paid}</span>
              <span>K {receipt.amountPaid.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span>{t.receipt_change}</span>
              <span>K {change.toLocaleString()}</span>
            </div>
            <div className="border-t border-dashed border-gray-400 my-3" />
            <p className="text-center text-xs">{t.receipt_thank_you}</p>
            <div className="flex gap-2 mt-4 no-print">
              <button onClick={() => window.print()} className="flex-1 bg-blue-600 text-white py-2 rounded text-xs">🖨️ {t.receipt_print}</button>
              <button onClick={() => router.push('/pos')} className="flex-1 bg-gray-600 text-white py-2 rounded text-xs">{t.receipt_new_sale}</button>
            </div>
          </div>
        )}

        {isInvoice && (
          <div className="bg-white shadow-lg p-10 w-full max-w-3xl">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">{receipt.companyName}</h1>
                {receipt.companyAddress && <p className="text-gray-500 text-sm mt-1">{receipt.companyAddress}</p>}
                {receipt.companyPhone && <p className="text-gray-500 text-sm">Ph: {receipt.companyPhone}</p>}
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold text-blue-600">INVOICE</h2>
                <p className="text-gray-500 text-sm mt-1">#{receipt.transactionId}</p>
                <p className="text-gray-500 text-sm">{receipt.createdAtMs ? new Date(receipt.createdAtMs).toLocaleDateString() : new Date().toLocaleDateString()}</p>
              </div>
            </div>
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{t.receipt_bill_to}</p>
              <p className="font-medium text-gray-800">{receipt.customerName || t.receipt_walkin}</p>
            </div>
            <table className="w-full mb-6">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="text-left p-3 text-sm">{t.receipt_item}</th>
                  <th className="text-center p-3 text-sm w-20">{t.receipt_qty}</th>
                  <th className="text-right p-3 text-sm w-32">{t.col_price}</th>
                  <th className="text-right p-3 text-sm w-32">{t.receipt_amount}</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="p-3 text-sm">{item.name}</td>
                    <td className="p-3 text-sm text-center">{item.quantity}</td>
                    <td className="p-3 text-sm text-right">K {item.unit_price.toLocaleString()}</td>
                    <td className="p-3 text-sm text-right">K {(item.subtotal ?? item.quantity * item.unit_price).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end mb-8">
              <div className="w-64">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600 text-sm">{t.receipt_subtotal}</span>
                  <span className="text-sm">K {receipt.totalAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600 text-sm">{t.receipt_amount_paid}</span>
                  <span className="text-sm">K {receipt.amountPaid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="font-bold text-gray-800">{t.receipt_change}</span>
                  <span className="font-bold text-green-600">K {change.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-3 bg-blue-600 text-white px-3 rounded-lg mt-2">
                  <span className="font-bold">{t.receipt_total}</span>
                  <span className="font-bold">K {receipt.totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="border-t pt-4 text-center text-gray-500 text-xs">
              <p>{t.receipt_thank_you}</p>
            </div>
            <div className="flex gap-3 mt-6 no-print">
              <button onClick={() => window.print()} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm">🖨️ {t.receipt_print_invoice}</button>
              <button onClick={() => router.push('/pos')} className="flex-1 bg-gray-600 text-white py-2 rounded-lg text-sm">{t.receipt_new_sale}</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
