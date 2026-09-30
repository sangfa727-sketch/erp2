import { createClient as createAnonClient } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Service role client — RLS bypass
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { chat_id, text, from_name, from_username, channel, company_id } = await req.json()

  if (!chat_id || !text) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const COMPANY_ID = company_id || '38e7b287-fd4e-4354-a1d1-9efae0b09eb9'

  let { data: conv } = await supabaseAdmin
    .from('support_conversations')
    .select('id')
    .eq('external_ref_id', String(chat_id))
    .eq('channel', channel)
    .maybeSingle()

  if (!conv) {
    let contactId: string | null = null
    if (from_name) {
      const { data: existing } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('company_id', COMPANY_ID)
        .ilike('contact_name', from_name)
        .maybeSingle()

      if (existing) {
        contactId = existing.id
      } else {
        const { data: newContact } = await supabaseAdmin
          .from('contacts')
          .insert({
            company_id: COMPANY_ID,
            contact_name: from_name,
            contact_type: 'Customer',
            internal_remarks: `Telegram: @${from_username || ''} | chat_id: ${chat_id}`,
          })
          .select('id')
          .single()
        contactId = newContact?.id || null
      }
    }

    const { data: newConv, error: convErr } = await supabaseAdmin
      .from('support_conversations')
      .insert({
        company_id: COMPANY_ID,
        channel,
        status: 'open',
        ai_handled: true,
        contact_id: contactId,
        external_ref_id: String(chat_id),
      })
      .select('id')
      .single()

    if (convErr || !newConv) {
      console.error('Conv error:', convErr)
      return NextResponse.json({ error: 'Failed to create conversation', detail: convErr?.message }, { status: 500 })
    }
    conv = newConv
  }

  await supabaseAdmin.from('support_messages').insert({
    conversation_id: conv.id,
    sender_type: 'customer',
    content: text,
  })

  return NextResponse.json({ conversation_id: conv.id, ok: true })
}
