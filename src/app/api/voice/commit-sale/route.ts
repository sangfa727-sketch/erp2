// ============================================================================
// /api/voice/commit-sale - Execute confirmed voice sale via rpc_record_sale
// ============================================================================
// Accepts the preview output from /api/voice/gemini-sale (after user confirms)
// and writes to DB. Returns receipt payload for client redirect.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      company_id,
      staff_id,
      product_id,
      qty,
      unit_price,
      customer_id, // may be null = walk-in
      payment_type, // 'cash' | 'credit'
      amount_received, // optional, defaults to total for cash, 0 for credit
    } = body

    // Validation
    if (!company_id || !product_id || !qty || !unit_price || !payment_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!['cash', 'credit'].includes(payment_type)) {
      return NextResponse.json({ error: 'Invalid payment_type' }, { status: 400 })
    }
    if (qty <= 0 || unit_price <= 0) {
      return NextResponse.json({ error: 'qty and unit_price must be positive' }, { status: 400 })
    }

    const total = qty * unit_price
    const received =
      typeof amount_received === 'number'
        ? amount_received
        : payment_type === 'cash'
        ? total
        : 0

    const sb = getServiceClient()
    const { data, error } = await sb.rpc('rpc_record_sale', {
      p_company_id: company_id,
      p_customer_id: customer_id || null,
      p_staff_id: staff_id || null,
      p_items: [{ product_id, qty, unit_price }],
      p_payment_type: payment_type,
      p_amount_received: received,
    })

    if (error) {
      console.error('[commit-sale] rpc error:', error)
      return NextResponse.json(
        { error: 'Failed to record sale', detail: error.message },
        { status: 500 }
      )
    }

    // Fetch product name + customer name for receipt
    const [{ data: product }, { data: customer }, { data: company }] = await Promise.all([
      sb.from('products').select('name, unit').eq('id', product_id).single(),
      customer_id
        ? sb.from('contacts').select('name').eq('id', customer_id).single()
        : Promise.resolve({ data: null }),
      sb.from('companies').select('name').eq('id', company_id).single(),
    ])

    // Build receipt payload matching /pos/receipt page expectations
    const receipt = {
      transactionId: data.transaction_id,
      transNo: data.trans_no,
      companyName: company?.name || '',
      items: [
        {
          name: product?.name || 'ပစ္စည်း',
          quantity: qty,
          unit: product?.unit || '',
          unit_price: unit_price,
          subtotal: total,
        },
      ],
      totalAmount: total,
      amountPaid: received,
      changeDue: data.change_due || 0,
      paymentType: payment_type,
      customerName: customer?.name || '',
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
    }

    return NextResponse.json({ success: true, receipt, rpc_result: data })
  } catch (err: any) {
    console.error('[commit-sale] fatal:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
