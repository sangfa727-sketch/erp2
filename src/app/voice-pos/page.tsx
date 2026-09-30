'use client'

// ============================================================================
// /voice-pos - Voice POS Page (mobile-first)
// ============================================================================
// Single-screen voice POS:
//   1. Big "Hold to Talk" button
//   2. Live wave animation when recording
//   3. Auto-stops on silence (2s)
//   4. Sends to /api/voice/gemini-sale
//   5. Shows preview card with auto-confirm countdown (high confidence)
//   6. Commits via /api/voice/commit-sale → /pos/receipt
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Mode = 'idle' | 'listening' | 'processing' | 'preview' | 'committing' | 'error'

interface PreviewData {
  transcript: string
  product: {
    id: string
    name: string
    unit_price: number
    unit: string
    stock?: number
    confidence: number
    ambiguous: boolean
    alternatives: Array<{ id: string; name: string; confidence: number }>
  }
  customer: { id: string; name: string; confidence: number } | null
  qty: number
  payment_type: 'cash' | 'credit'
  total_amount: number
  gemini_confidence: number
}

export default function VoicePosPage() {
  const router = useRouter()
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('idle')
  const [error, setError] = useState<string>('')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [countdown, setCountdown] = useState<number>(0)
  const [companyId, setCompanyId] = useState<string>('')
  const [staffId, setStaffId] = useState<string>('')
  const [companyName, setCompanyName] = useState<string>('')
  const [waveLevel, setWaveLevel] = useState<number>(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ---------- Load auth/profile ----------
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, company_id, full_name')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (!profile && mounted) {
        setError('Profile not found')
        return
      }
      if (mounted && profile) {
        setStaffId(profile.id)
        setCompanyId(profile.company_id)
        const { data: company } = await supabase
          .from('companies')
          .select('name')
          .eq('id', profile.company_id)
          .single()
        if (company && mounted) setCompanyName(company.name)
      }
    })()
    return () => {
      mounted = false
    }
  }, [router, supabase])

  // ---------- Cleanup on unmount ----------
  useEffect(() => {
    return () => {
      stopRecording()
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- Audio level monitoring (for wave viz) ----------
  const monitorAudio = useCallback(() => {
    if (!analyserRef.current) return
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    const tick = () => {
      analyserRef.current?.getByteFrequencyData(dataArray)
      const sum = dataArray.reduce((a, b) => a + b, 0)
      const avg = sum / dataArray.length
      setWaveLevel(avg / 128) // 0..2 normalized
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [])

  // ---------- Silence detection ----------
  const startSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = setTimeout(() => {
      // Auto-stop after 2.5s of silence
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }, 2500)
  }, [])

  // ---------- Start Recording ----------
  const startRecording = useCallback(async () => {
    if (!companyId) {
      setError('Profile မလုပ်ထားသေး')
      return
    }
    setError('')
    setPreview(null)
    setMode('listening')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Setup analyser for wave viz + silence detection
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      monitorAudio()

      // Setup recorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        audioChunksRef.current = []
        cleanupMedia()
        if (blob.size < 2000) {
          setMode('idle')
          setError('အသံ မရှင်းပါ — ပြန်ပြောပါ')
          return
        }
        await processSale(blob)
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      startSilenceTimer()

      // Monitor for ongoing voice activity → reset silence timer
      const checkActivity = setInterval(() => {
        if (waveLevel > 0.15) startSilenceTimer()
        if (recorder.state !== 'recording') clearInterval(checkActivity)
      }, 300)
    } catch (e: any) {
      setError(e.message || 'Microphone access denied')
      setMode('idle')
    }
  }, [companyId, monitorAudio, startSilenceTimer, waveLevel])

  const cleanupMedia = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = null
    if (audioCtxRef.current) audioCtxRef.current.close()
    audioCtxRef.current = null
    analyserRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = null
    setWaveLevel(0)
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    } else {
      cleanupMedia()
      setMode('idle')
    }
  }

  // ---------- Process Sale (call Gemini) ----------
  const processSale = async (audioBlob: Blob) => {
    setMode('processing')
    try {
      const form = new FormData()
      form.append('audio', audioBlob, 'voice.webm')
      form.append('company_id', companyId)

      const res = await fetch('/api/voice/gemini-sale', {
        method: 'POST',
        body: form,
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'အသံ ပြုပြင်ခြင်း မအောင်မြင်ပါ')
        setMode('error')
        return
      }

      if (data.intent === 'unclear') {
        setError(data.message || 'အသံ မရှင်းပါ — ပြန်ပြောပါ')
        setMode('idle')
        return
      }
      if (data.intent === 'cancel') {
        setMode('idle')
        return
      }

      // Show preview
      setPreview(data)
      setMode('preview')

      // Auto-confirm countdown if high confidence + not ambiguous + not credit
      const highConfidence =
        data.product.confidence > 0.85 &&
        data.gemini_confidence > 0.85 &&
        !data.product.ambiguous
      if (highConfidence) {
        startAutoConfirmCountdown()
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
      setMode('error')
    }
  }

  // ---------- Auto-confirm Countdown ----------
  const startAutoConfirmCountdown = () => {
    setCountdown(3)
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          countdownRef.current = null
          handleConfirm()
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  const cancelCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = null
    setCountdown(0)
  }

  // ---------- Confirm & Commit ----------
  const handleConfirm = async () => {
    if (!preview) return
    cancelCountdown()
    setMode('committing')

    try {
      const res = await fetch('/api/voice/commit-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          staff_id: staffId,
          product_id: preview.product.id,
          qty: preview.qty,
          unit_price: preview.product.unit_price,
          customer_id: preview.customer?.id || null,
          payment_type: preview.payment_type,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'အရောင်း မှတ်တင် မအောင်မြင်ပါ')
        setMode('error')
        return
      }

      // Save receipt to localStorage for /pos/receipt page
      if (typeof window !== 'undefined') {
        localStorage.setItem('pos_last_receipt', JSON.stringify(data.receipt))
      }

      // Redirect to receipt
      router.push('/pos/receipt')
    } catch (e: any) {
      setError(e.message || 'Network error')
      setMode('error')
    }
  }

  const handleCancel = () => {
    cancelCountdown()
    setPreview(null)
    setMode('idle')
  }

  // ---------- Format helpers ----------
  const fmtMoney = (n: number) => n.toLocaleString('en-US')
  const myanmarDigits = (n: number) =>
    n.toString().replace(/\d/g, (d) => '၀၁၂၃၄၅၆၇၈၉'[parseInt(d)])
  const confidenceBadge = (c: number) => {
    if (c >= 0.9) return { label: '✓', color: 'bg-emerald-500' }
    if (c >= 0.7) return { label: '~', color: 'bg-amber-500' }
    return { label: '?', color: 'bg-rose-500' }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
      {/* Header */}
      <header className="px-4 py-3 flex items-center justify-between border-b border-white/10 shrink-0">
        <button
          onClick={() => router.push('/pos')}
          className="text-white/70 hover:text-white text-sm"
        >
          ← POS
        </button>
        <div className="text-sm font-medium opacity-80">{companyName || 'Voice POS'}</div>
        <button onClick={() => router.push('/settings')} className="text-white/70 text-lg">
          ⚙
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 relative">
        {/* IDLE STATE */}
        {mode === 'idle' && !preview && (
          <div className="flex flex-col items-center text-center gap-8 max-w-sm">
            <div className="text-6xl">🎙️</div>
            <div>
              <h1 className="text-2xl font-bold mb-2">Voice POS</h1>
              <p className="text-white/60 text-sm">
                ပစ္စည်းအမည် + အရေအတွက် + customer + ငွေပေး မြန်မာလို ပြောပါ
              </p>
              <p className="text-white/40 text-xs mt-3">
                ဥပမာ — "ပန်းသီး ၁၀ ဖာ ဦးထူး ဆီ အကြွေး"
              </p>
            </div>
            {error && (
              <div className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-200 text-sm">
                ⚠ {error}
              </div>
            )}
          </div>
        )}

        {/* LISTENING STATE */}
        {mode === 'listening' && (
          <div className="flex flex-col items-center gap-6 w-full max-w-md">
            <div className="relative">
              <div
                className="w-32 h-32 rounded-full bg-rose-500 flex items-center justify-center text-5xl"
                style={{
                  transform: `scale(${1 + waveLevel * 0.3})`,
                  transition: 'transform 80ms',
                  boxShadow: `0 0 ${40 + waveLevel * 60}px rgba(244, 63, 94, 0.6)`,
                }}
              >
                🎤
              </div>
              <div className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping" />
            </div>

            {/* Wave bars */}
            <div className="flex items-end gap-1 h-16">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div
                  key={i}
                  className="w-2 bg-rose-400 rounded-full transition-all duration-100"
                  style={{
                    height: `${20 + Math.abs(Math.sin(Date.now() / 200 + i)) * 40 * Math.max(0.3, waveLevel)}px`,
                  }}
                />
              ))}
            </div>

            <p className="text-white/80">အသံ နားထောင်နေသည်…</p>
            <p className="text-white/50 text-xs">ပြောပြီးတဲ့အခါ ၂ စက္ကန့် ငြိမ်ပါ — အလိုလို ရပ်ပါမယ်</p>
          </div>
        )}

        {/* PROCESSING STATE */}
        {mode === 'processing' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full border-4 border-white/20 border-t-white animate-spin" />
            <p className="text-white/70">AI က နားလည်နေသည်…</p>
          </div>
        )}

        {/* PREVIEW STATE */}
        {mode === 'preview' && preview && (
          <div className="w-full max-w-md space-y-4">
            {/* Transcript chip */}
            <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xs text-white/40 mb-1">🎤 အသံ</div>
              <div className="text-sm">{preview.transcript}</div>
            </div>

            {/* Confirm card */}
            <div className="rounded-2xl bg-white/10 backdrop-blur border border-white/20 overflow-hidden">
              <div className="p-5 space-y-3">
                {/* Product */}
                <Row label="ပစ္စည်း">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{preview.product.name}</span>
                    <Badge {...confidenceBadge(preview.product.confidence)} />
                  </div>
                </Row>

                {/* Ambiguous alternatives */}
                {preview.product.ambiguous && preview.product.alternatives.length > 0 && (
                  <div className="ml-20 -mt-1 text-xs text-amber-300/80">
                    အခြား: {preview.product.alternatives.map((a) => a.name).join(', ')}
                  </div>
                )}

                <Row label="အရေအတွက်">
                  <span className="font-medium">
                    {myanmarDigits(preview.qty)} {preview.product.unit}
                  </span>
                </Row>

                <Row label="စျေးနှုန်း">
                  <span className="text-white/80">
                    {fmtMoney(preview.product.unit_price)} ×{' '}
                    {myanmarDigits(preview.qty)}
                  </span>
                </Row>

                {preview.customer && (
                  <Row label="Customer">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{preview.customer.name}</span>
                      <Badge {...confidenceBadge(preview.customer.confidence)} />
                    </div>
                  </Row>
                )}

                <Row label="ငွေပေး">
                  <span
                    className={
                      preview.payment_type === 'credit' ? 'text-amber-300' : 'text-emerald-300'
                    }
                  >
                    {preview.payment_type === 'credit' ? 'အကြွေး' : 'ငွေသား'}
                  </span>
                </Row>

                <div className="h-px bg-white/10 my-1" />

                <Row label="စုစုပေါင်း">
                  <span className="text-xl font-bold text-emerald-300">
                    {fmtMoney(preview.total_amount)} ကျပ်
                  </span>
                </Row>
              </div>

              {/* Action bar */}
              <div className="bg-black/30 p-3 flex gap-3">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 font-medium"
                >
                  ✗ ပယ်ဖျက်
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold relative overflow-hidden"
                >
                  ✓ အတည်ပြု
                  {countdown > 0 && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-black/30 px-2 py-0.5 rounded-full">
                      {countdown}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* COMMITTING STATE */}
        {mode === 'committing' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full border-4 border-white/20 border-t-emerald-400 animate-spin" />
            <p className="text-white/70">အရောင်း မှတ်တင်နေသည်…</p>
          </div>
        )}

        {/* ERROR STATE */}
        {mode === 'error' && (
          <div className="flex flex-col items-center gap-4 max-w-sm text-center">
            <div className="text-5xl">⚠️</div>
            <p className="text-rose-300">{error}</p>
            <button
              onClick={() => {
                setError('')
                setPreview(null)
                setMode('idle')
              }}
              className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20"
            >
              ပြန်ကြိုးစားရန်
            </button>
          </div>
        )}
      </main>

      {/* Bottom action button */}
      {(mode === 'idle' || mode === 'listening') && (
        <div className="px-6 pb-8 pt-4 shrink-0">
          {mode === 'idle' ? (
            <button
              onClick={startRecording}
              disabled={!companyId}
              className="w-full py-5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-bold shadow-lg shadow-rose-500/30 flex items-center justify-center gap-3 active:scale-95 transition-transform"
            >
              <span className="text-2xl">🎙️</span>
              <span>စပြောရန် နှိပ်ပါ</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="w-full py-5 rounded-2xl bg-white/10 hover:bg-white/20 border-2 border-rose-500/50 text-white text-lg font-bold flex items-center justify-center gap-3"
            >
              <span className="text-2xl">⏹</span>
              <span>ရပ်ရန်</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-white/50 min-w-20">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${color} text-white text-[10px] font-bold`}
    >
      {label}
    </span>
  )
}
