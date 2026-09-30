import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { items, customer_id, payment_type = 'cash', amount_received, company_id } = body

    if (!items || items.length === 0)
      return NextResponse.json({ error: 'No items' }, { status: 400 })
    if (!company_id)
      return NextResponse.json({ error: 'No company_id' }, { status: 400 })

    // resolve product names to IDs
    const resolvedItems = await Promise.all(items.map(async (item: any) => {
      if (item.product_id) return item
      const { data: products } = await supabase
        .from('products')
        .select('id, selling_price, name')
        .eq('company_id', company_id)
        .eq('is_deleted', false)
        .ilike('name', '%' + item.product + '%')
        .limit(1)
      if (!products || products.length === 0)
        throw new Error('Product not found: ' + item.product)
      return {
        product_id: products[0].id,
        qty: item.qty || 1,
        unit_price: item.price || products[0].selling_price,
      }
    }))

    const grandTotal = resolvedItems.reduce((s: number, i: any) => s + i.qty * i.unit_price, 0)
    const amountPaid = payment_type === 'credit' ? 0 : (amount_received || grandTotal)
    const requestId = crypto.randomUUID()

    const draft = {
      occurred_at: new Date().toISOString(),
      parties: { customer_id: customer_id || '', staff_profile_id: '' },
      references: { external_ref: 'ai-chat' },
      totals: { grand_total: grandTotal, amount_paid: amountPaid },
      lines: resolvedItems.map((i: any) => ({
        product_id: i.product_id, qty: i.qty, unit_price: i.unit_price,
      })),
    }

    await supabase.rpc('set_staff_company', { p_company_id: company_id })

    const { data: rpcResult, error } = await supabase.rpc('rpc_post_pos_sale_from_draft', {
      p_request_id: requestId,
      p_idempotency_key: requestId + '-ai',
      p_draft: draft,
    })

    if (error) {
      if (error.message.includes('stock') || error.message.includes('Stock'))
        return NextResponse.json({ error: 'ကုန်ပစ္စည်း မလုံလောက်ပါ', code: 'STOCK_OUT' }, { status: 400 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      transaction_id: rpcResult?.transaction_id || requestId,
      total: grandTotal,
      items: resolvedItems,
    })

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
