// ============================================================================
// /api/voice/gemini-sale - Gemini 2.5 Flash Native Audio → Structured POS Sale
// ============================================================================
// Accepts: multipart/form-data with audio blob + company_id
// Returns: { transcript, parsed: {product_query, qty, customer_hint, payment_type, confidence}, match: {product, customer}, total_amount }
//
// Architecture:
//   1. Audio → Gemini 2.5 Flash with structured output schema (no STT step!)
//   2. Gemini returns JSON: { product_query, qty, unit, customer_hint, payment_type, raw_transcript }
//   3. Phonetic matcher resolves product_query → real Product from catalog
//   4. Phonetic matcher resolves customer_hint → real Contact (or walk-in)
//   5. Returns full preview for UI confirm card
//
// Multi-tenant: requires company_id, uses service_role to query catalogs
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { matchProduct, isAmbiguousMatch } from '@/lib/voice/product-matcher-v2'
import { matchCustomer } from '@/lib/voice/customer-matcher'

export const runtime = 'nodejs'
export const maxDuration = 30

// ---------- Gemini Schema ----------
const GEMINI_SCHEMA = {
  type: 'object',
  properties: {
    raw_transcript: {
      type: 'string',
      description: 'Verbatim transcription of the voice in Burmese',
    },
    intent: {
      type: 'string',
      enum: ['sale', 'unclear', 'cancel'],
      description: 'What the user wants: sale = recording a sale, unclear = could not understand, cancel = user wants to cancel',
    },
    product_query: {
      type: 'string',
      description: 'The product name as spoken, in Burmese (without quantity or unit)',
    },
    qty: {
      type: 'number',
      description: 'Quantity as a number (parse Burmese number words: တစ်=1, ဆယ်=10, ရာ=100, ထောင်=1000, သောင်း=10000, သိန်း=100000)',
    },
    unit: {
      type: 'string',
      nullable: true,
      description: 'Unit if mentioned (ဖာ, ခု, လုံး, ပိုက်, etc.), null otherwise',
    },
    customer_hint: {
      type: 'string',
      nullable: true,
      description: 'Customer name if mentioned (after "ဆီ" or "ကို" or similar), null if walk-in or unclear',
    },
    payment_type: {
      type: 'string',
      enum: ['cash', 'credit'],
      description: 'Payment type — credit if "အကြွေး" mentioned, cash otherwise (default cash)',
    },
    confidence: {
      type: 'number',
      description: 'Confidence in the extraction from 0.0 to 1.0',
    },
  },
  required: ['raw_transcript', 'intent', 'product_query', 'qty', 'payment_type', 'confidence'],
}

const SYSTEM_PROMPT = `သင်က Burmese mini-market/POS sale ထဲက voice command တွေကို structured data ထုတ်ပေးတဲ့ AI ဖြစ်ပါတယ်။

User က ဆိုင်ထဲက cashier ဖြစ်ပြီး မြန်မာလို pos sale တွေကို voice ပြောတယ်။ ဥပမာ:
- "ပန်းသီး ၁၀ ဖာ" → product=ပန်းသီး, qty=10, unit=ဖာ, payment=cash
- "မမ ဆီ လိမ္မော် ၅ ခု အကြွေး" → product=လိမ္မော်, qty=5, unit=ခု, customer=မမ, payment=credit  
- "ဦးထူး ဆီ စပျစ် ၂၀ ဖာ" → product=စပျစ်, qty=20, unit=ဖာ, customer=ဦးထူး, payment=cash

အရေးကြီးတဲ့ Burmese number rules:
- တစ်=1, နှစ်=2, သုံး=3, လေး=4, ငါး=5, ခြောက်=6, ခုနစ်=7, ရှစ်=8, ကိုး=9
- ဆယ်=10, ဆယ့်ငါး=15, နှစ်ဆယ်=20, နှစ်ဆယ်ငါး=25, သုံးဆယ်=30
- ရာ=100, နှစ်ရာ=200, ငါးရာ=500
- ထောင်=1,000, သောင်း=10,000, သိန်း=100,000
- ⚠️ သိန်း (100,000) နဲ့ သောင်း (10,000) မမှားရ — အလွန်အရေးကြီး

Voice က မရှင်းရင် intent=unclear ပြန်ပါ၊ မမှန်းရဲဘဲ ဖန်တီးမပစ်ပါနဲ့။
Voice က cancel/ဖျက် ပြောရင် intent=cancel။

JSON schema အတိအကျ ပြန်ပါ။`

// ---------- Gemini API Call ----------
async function geminiTranscribe(audioBase64: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: 'ဒီ audio ထဲ ပြောထားတဲ့ POS sale ကို structured JSON ဖြင့် ထုတ်ပေးပါ။' },
        ],
      },
    ],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 500,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned empty response')
  return JSON.parse(text)
}

// ---------- Service Role Supabase Client ----------
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// ---------- Main Handler ----------
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    const companyId = (formData.get('company_id') as string) || null

    if (!audioFile || audioFile.size < 1000) {
      return NextResponse.json({ error: 'No audio or too short' }, { status: 400 })
    }
    if (!companyId) {
      return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })
    }

    // Convert audio to base64
    const buffer = Buffer.from(await audioFile.arrayBuffer())
    const audioBase64 = buffer.toString('base64')
    const mimeType = audioFile.type || 'audio/webm'

    // Call Gemini Native Audio
    let parsed
    try {
      parsed = await geminiTranscribe(audioBase64, mimeType)
    } catch (e: any) {
      console.error('[gemini-sale] Gemini error:', e.message)
      return NextResponse.json(
        { error: 'Voice processing failed', detail: e.message },
        { status: 502 }
      )
    }

    // Early exit for unclear/cancel
    if (parsed.intent === 'unclear' || parsed.intent === 'cancel') {
      return NextResponse.json({
        intent: parsed.intent,
        transcript: parsed.raw_transcript || '',
        message: parsed.intent === 'cancel' ? 'အသံ ဖျက်ပါပြီ' : 'အသံ မရှင်းပါ၊ ပြန်ပြောပါ',
      })
    }

    // Fetch product catalog for this company
    const sb = getServiceClient()
    const { data: products, error: prodErr } = await sb
      .from('products')
      .select('id, name, sale_price, current_stock, unit')
      .eq('company_id', companyId)
      .eq('is_active', true)

    if (prodErr || !products) {
      return NextResponse.json(
        { error: 'Failed to load product catalog', detail: prodErr?.message },
        { status: 500 }
      )
    }

    // Phonetic match product
    const productMatch = matchProduct(parsed.product_query, products as any[], 0.55)
    if (!productMatch) {
      return NextResponse.json({
        intent: 'unclear',
        transcript: parsed.raw_transcript,
        message: `"${parsed.product_query}" — ဆိုင်ထဲမှာ ဒီပစ္စည်း မရှိပါ`,
      })
    }

    // Fetch contacts for customer match (only if hint exists)
    let customerMatch = null as any
    if (parsed.customer_hint) {
      const { data: contacts } = await sb
        .from('contacts')
        .select('id, name, phone, contact_type')
        .eq('company_id', companyId)
        .in('contact_type', ['customer', 'both'])
      if (contacts && contacts.length > 0) {
        customerMatch = matchCustomer(parsed.customer_hint, contacts as any[], 0.65)
      }
    }

    // Build response
    const unitPrice = productMatch.product.sale_price
    const totalAmount = unitPrice * parsed.qty

    return NextResponse.json({
      intent: 'sale',
      transcript: parsed.raw_transcript,
      parsed,
      product: {
        id: productMatch.product.id,
        name: productMatch.product.name,
        unit_price: unitPrice,
        unit: productMatch.product.unit || parsed.unit || '',
        stock: productMatch.product.current_stock,
        confidence: productMatch.confidence,
        method: productMatch.method,
        ambiguous: isAmbiguousMatch(productMatch),
        alternatives: productMatch.alternatives.map((a) => ({
          id: a.product.id,
          name: a.product.name,
          confidence: a.confidence,
        })),
      },
      customer: customerMatch
        ? {
            id: customerMatch.contact.id,
            name: customerMatch.contact.name,
            confidence: customerMatch.confidence,
          }
        : null,
      qty: parsed.qty,
      payment_type: parsed.payment_type,
      total_amount: totalAmount,
      gemini_confidence: parsed.confidence,
    })
  } catch (err: any) {
    console.error('[gemini-sale] fatal:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal error' },
      { status: 500 }
    )
  }
}
