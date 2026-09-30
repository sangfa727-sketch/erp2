// ============================================================================
// /api/voice/gemini-transcribe — Gemini 2.5 Flash Native Audio → Clean Text
// ============================================================================
// Generic audio transcription endpoint for ChatBubble (not sale-specific).
// Accepts: multipart/form-data with audio blob + language hint
// Returns: { transcript, language, duration_ms }
//
// Same Gemini Native Audio pattern as /api/voice/gemini-sale but produces
// plain text instead of structured sale JSON. Used by ChatBubble for general
// chat voice input.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

// ---------- Gemini Response Schema ----------
const GEMINI_SCHEMA = {
  type: 'object',
  properties: {
    transcript: {
      type: 'string',
      description:
        'Clean verbatim transcription of the audio in the appropriate script. Empty string if audio is silent/unclear.',
    },
    detected_language: {
      type: 'string',
      enum: ['my', 'en', 'th', 'other'],
      description: 'Detected language code',
    },
    is_clear: {
      type: 'boolean',
      description: 'true if audio was clear enough to transcribe confidently',
    },
  },
  required: ['transcript', 'detected_language', 'is_clear'],
}

const SYSTEM_PROMPT = `You are a high-accuracy audio transcription assistant for a Burmese-language POS/ERP chat interface.

TRANSCRIBE the audio exactly as spoken. DO NOT translate, summarize, or add commentary.

CRITICAL SCRIPT RULES:
- Burmese (my) speech → Myanmar Unicode (U+1000–U+109F) and ASCII ONLY.
- English (en) → ASCII only.
- Thai (th) → Thai Unicode and ASCII only.
- NEVER use Devanagari (U+0900–U+097F), Bengali (U+0980–U+09FF), or Sinhala (U+0D80–U+0DFF) characters.
- NEVER mix scripts within a single word. If a word does not exist in the speaker's language, use English (ASCII) instead.

BURMESE NUMBER RULES (write numbers as Myanmar digits):
- တစ်=၁, နှစ်=၂, သုံး=၃, လေး=၄, ငါး=၅, ခြောက်=၆, ခုနစ်=၇, ရှစ်=၈, ကိုး=၉
- ဆယ်=၁၀, ရာ=၁၀၀, ထောင်=၁,၀၀၀
- သောင်း=၁၀,၀၀၀ (ten thousand) vs သိန်း=၁၀၀,၀၀၀ (hundred thousand) — never confuse these
- Keep number words as digits when they form a clear quantity (e.g. "ပန်းသီး နှစ်ဖာ" → "ပန်းသီး ၂ ဖာ").

COMMON ERP/POS TERMS (use these spellings):
- ဖောက်သည် (customer), ပေးသွင်းသူ (supplier), အကြွေး (credit/debt), ငွေသား (cash)
- ပစ္စည်း (goods), စာရင်း (record/list), မှတ်ပါ (record it), ပျက်စီး (damaged)

CLARITY CHECK (CRITICAL — anti-hallucination):
- If audio is empty, just background noise (TV, fan, traffic, distant talking,
  keyboard, footsteps), or completely unintelligible: transcript="", is_clear=false.
- If the audio contains ONLY non-speech sounds (no clear human voice forming words):
  return transcript="", is_clear=false. Do NOT invent words from noise patterns.
- If only a few words are unclear inside otherwise clear speech: transcribe what you
  can, is_clear=true.
- Do NOT hallucinate words. An empty transcript is ALWAYS safer than a wrong guess.
- If a speaker is mumbling, whispering inaudibly, or the audio is too short
  (< 1 second of clear speech): return transcript="", is_clear=false.

LANGUAGE PREFERENCE:
- If a language_hint is provided in the user message, prefer that language unless the speaker clearly used a different one.
- Religious exclamations like "إن شاء الله", "الحمد لله", or English "okay"/"yes" inside a Burmese sentence are normal — preserve them but keep the surrounding text in the speaker's main language.

Output ONLY the JSON schema. No prose, no markdown.`

// ---------- Gemini API Call ----------
async function geminiTranscribe(
  audioBase64: string,
  mimeType: string,
  languageHint: string
) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const langName =
    languageHint === 'my'
      ? 'Burmese (Myanmar)'
      : languageHint === 'th'
      ? 'Thai'
      : 'English'

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          {
            text: `language_hint: ${langName}\n\nTranscribe this audio following the system rules. Return the structured JSON.`,
          },
        ],
      },
    ],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_SCHEMA,
      temperature: 0.1,
      thinkingConfig: { thinkingBudget: 512 },
      maxOutputTokens: 1024,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned empty response')
  return JSON.parse(text) as {
    transcript: string
    detected_language: string
    is_clear: boolean
  }
}

// ---------- Main Handler ----------
export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    const languageHint = (formData.get('language') as string) || 'my'

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio uploaded' }, { status: 400 })
    }
    if (audioFile.size < 500) {
      // Too short — almost certainly silence
      return NextResponse.json({
        transcript: '',
        language: languageHint,
        is_clear: false,
        duration_ms: Date.now() - startedAt,
      })
    }
    if (audioFile.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Audio too large (max 10MB)' },
        { status: 413 }
      )
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer())
    const audioBase64 = buffer.toString('base64')
    const mimeType = audioFile.type || 'audio/webm'

    const result = await geminiTranscribe(audioBase64, mimeType, languageHint)

    return NextResponse.json({
      transcript: (result.transcript || '').trim(),
      language: result.detected_language || languageHint,
      is_clear: result.is_clear,
      duration_ms: Date.now() - startedAt,
    })
  } catch (err: any) {
    console.error('[gemini-transcribe] error:', err)
    return NextResponse.json(
      {
        error: 'transcription_failed',
        detail: err?.message || 'Unknown error',
        duration_ms: Date.now() - startedAt,
      },
      { status: 500 }
    )
  }
}
