'use client'
import { useEffect, useRef, useState } from 'react'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [mode, setMode] = useState<'usb' | 'camera'>('usb')
  const [usbInput, setUsbInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const streamRef = useRef<MediaStream | null>(null)
  const scannerRef = useRef<any>(null)

  // USB scanner — rapid keypress detection
  useEffect(() => {
    if (mode !== 'usb') return
    let buffer = ''
    let timer: NodeJS.Timeout

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (buffer.length > 3) {
          onScan(buffer)
          buffer = ''
        }
        return
      }
      if (e.key.length === 1) {
        buffer += e.key
        clearTimeout(timer)
        timer = setTimeout(() => { buffer = '' }, 100)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => { window.removeEventListener('keydown', handleKey); clearTimeout(timer) }
  }, [mode, onScan])

  // Camera scanner
  useEffect(() => {
    if (mode !== 'camera') return
    let active = true

    const startCamera = async () => {
      try {
        setScanning(true)
        setError('')
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        streamRef.current = stream
        if (videoRef.current && active) videoRef.current.srcObject = stream

        // Dynamic import zxing
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        scannerRef.current = reader

        if (videoRef.current && active) {
          reader.decodeFromVideoElement(videoRef.current, (result, err) => {
            if (result && active) {
              onScan(result.getText())
              active = false
            }
          })
        }
      } catch (e: any) {
        setError('Camera မရနိုင်ပါ: ' + e.message)
        setScanning(false)
      }
    }
    startCamera()

    return () => {
      active = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [mode])

  const handleManualInput = (e: React.FormEvent) => {
    e.preventDefault()
    if (usbInput.trim()) { onScan(usbInput.trim()); setUsbInput('') }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4">
      <div className="rounded-2xl p-5 w-full max-w-sm shadow-2xl"
        style={{backgroundColor: 'var(--color-card, #fff)', color: 'var(--color-text, #111827)'}}>

        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base">📷 Barcode Scanner</h3>
          <button onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); onClose() }}
            className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
            style={{backgroundColor: 'var(--color-bg, #f9fafb)'}}>✕</button>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(['usb','camera'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError('') }}
              className="py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                backgroundColor: mode === m ? 'var(--color-primary, #2563eb)' : 'var(--color-bg, #f9fafb)',
                color: mode === m ? '#fff' : 'var(--color-text-sub, #6b7280)',
                border: '1px solid var(--color-border, #e5e7eb)',
              }}>
              {m === 'usb' ? '🔌 USB Scanner' : '📷 Camera'}
            </button>
          ))}
        </div>

        {mode === 'usb' && (
          <div>
            <div className="p-4 rounded-xl mb-4 text-center"
              style={{backgroundColor: '#eff6ff', border: '1px solid #bfdbfe'}}>
              <p className="text-2xl mb-2">🔌</p>
              <p className="text-sm font-medium" style={{color: '#1d4ed8'}}>USB Scanner ချိတ်ဆက်ပြီး Barcode ဖတ်ပါ</p>
              <p className="text-xs mt-1" style={{color: '#3b82f6'}}>Keyboard input အလိုအလျောက် detect လုပ်မည်</p>
            </div>
            <form onSubmit={handleManualInput}>
              <label className="block text-xs font-medium mb-1"
                style={{color: 'var(--color-text-sub, #6b7280)'}}>သို့မဟုတ် ကိုယ်တိုင် ရိုက်ထည့်ပါ</label>
              <div className="flex gap-2">
                <input type="text" value={usbInput} onChange={e => setUsbInput(e.target.value)}
                  placeholder="Barcode နံပါတ်..."
                  className="flex-1 p-2.5 rounded-xl text-sm outline-none"
                  style={{backgroundColor: 'var(--color-bg, #f9fafb)', border: '1px solid var(--color-border, #e5e7eb)',
                    color: 'var(--color-text, #111827)'}} />
                <button type="submit"
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                  style={{backgroundColor: 'var(--color-primary, #2563eb)'}}>ရှာ</button>
              </div>
            </form>
          </div>
        )}

        {mode === 'camera' && (
          <div>
            {error ? (
              <div className="p-4 rounded-xl text-center text-sm"
                style={{backgroundColor: '#fef2f2', color: '#ef4444'}}>
                {error}
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden bg-black"
                style={{aspectRatio: '1', maxHeight: '240px'}}>
                <video ref={videoRef} autoPlay playsInline muted
                  className="w-full h-full object-cover" />
                {scanning && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-green-400 rounded-lg opacity-70" />
                  </div>
                )}
              </div>
            )}
            {scanning && !error && (
              <p className="text-xs text-center mt-2" style={{color: 'var(--color-text-sub, #6b7280)'}}>
                Barcode ကို frame အတွင်း ထားပါ...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
