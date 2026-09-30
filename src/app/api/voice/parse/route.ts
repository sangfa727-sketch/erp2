// ============================================================================
// /api/voice/parse — Parse Burmese voice transcript into structured sale
// ============================================================================
// POST { transcript: string, company_id: string }
// Returns { parsed: ParsedSale }
//
// Uses service_role to bypass RLS (server-side, secure).
// ============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseSaleFromTranscript } from '@/lib/voice/sale-parser'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { transcript, company_id } = await req.json()

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid transcript' }, { status: 400 })
    }
    if (!company_id || typeof company_id !== 'string') {
      return NextResponse.json({ error: 'Missing company_id' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, selling_price, unit, stock_qty')
      .eq('company_id', company_id)
      .eq('is_deleted', false)

    if (error) {
      return NextResponse.json({ error: 'DB error: ' + error.message }, { status: 500 })
    }

    const parsed = parseSaleFromTranscript(transcript, products || [])

    return NextResponse.json({ parsed })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error: ' + (err.message || 'unknown') }, { status: 500 })
  }
}
