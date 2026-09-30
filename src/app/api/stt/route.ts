import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as Blob | null
    if (!audio) return NextResponse.json({ error: 'No audio' }, { status: 400 })
    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 500 })
    if (audio.size < 500) return NextResponse.json({ text: '' })
    const whisperForm = new FormData()
    whisperForm.append('file', audio, 'audio.webm')
    whisperForm.append('model', 'whisper-large-v3')
    whisperForm.append('language', 'my')
    whisperForm.append('response_format', 'json')
    whisperForm.append('prompt',
      'Stillastock ERP. Myanmar: ကုန်ပစ္စည်း ရောင်းချမှု ဝယ်ယူမှု ကြွေးငွေ လစာ ကုန်လက်ကျန် GRN AR AP POS သောင်း သိန်း သန်း ကျပ်'
    )
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: whisperForm,
    })
    const responseText = await res.text()
    if (!res.ok) return NextResponse.json({ error: responseText }, { status: res.status })
    const json = JSON.parse(responseText)
    return NextResponse.json({ text: json.text || '' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
