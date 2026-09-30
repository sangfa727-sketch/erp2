import { createClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = createClient()
  const { chat_id, from_name, channel, company_id, items, total_amount } = await req.json()

  const { data: conv } = await supabase
    .from('support_conversations')
    .insert({ company_id, channel, status: 'open', ai_handled: true })
    .select().single()

  if (!conv) return NextResponse.json({ error: 'conv failed' }, { status: 500 })

  const { data: order } = await supabase
    .from('support_pending_orders')
    .insert({
      company_id,
      conversation_id: conv.id,
      items,
      total_amount,
      status: 'pending'
    })
    .select().single()

  return NextResponse.json({ ok: true, order_id: order?.id, conversation_id: conv.id })
}
