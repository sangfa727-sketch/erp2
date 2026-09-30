// /opt/erp1/src/app/api/ai/execute/route.ts
// Whitelisted RPC executor for chat-driven data entry (Phase 2).
// AI agent emits CONFIRM:{tool, args} block; frontend posts here on user "ဟုတ်".
//
// v3 (2026-06-23): Sprint D1 — add rpc_create_contact + rpc_create_product
//   - Both follow rpc_record_sale pattern (SECURITY DEFINER + RAISE EXCEPTION)
//   - No special sanitizeArgs logic needed (defaults handled in SQL)
//   - translateError extended for new error patterns (duplicate, validation)
//
// v2 (2026-06-21):
//   - Inject p_staff_id (PostgREST requires exact signature match)
//   - Auto-compute p_amount_received for cash sales (RPC requires >= total)
//   - DEFAULT_STAFF_ID env var with safe fallback to owner's profile ID

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const COMPANY_ID = '38e7b287-fd4e-4354-a1d1-9efae0b09eb9'

// Saii's profile ID (owner). Overridable via env for other tenants.
const DEFAULT_STAFF_ID =
  process.env.DEFAULT_STAFF_ID || '034da14b-2bc8-491d-9df6-c56a7eb3fa60'

// ---------- RPC WHITELIST ----------
// Argument names match the live DB function signatures EXACTLY.
// PostgREST resolves overloads by exact arg list — missing args = "function not found".
const RPC_REGISTRY = {
  rpc_record_sale: {
    required: [
      'p_company_id',
      'p_customer_id',
      'p_staff_id',
      'p_items',
      'p_payment_type',
      'p_amount_received',
    ],
    optional: [],
  },
  rpc_record_expense: {
    required: ['p_company_id', 'p_amount', 'p_description', 'p_category'],
    optional: ['p_expense_date', 'p_notes'],
  },
  rpc_record_ar_payment: {
    required: ['p_company_id', 'p_customer_id', 'p_amount'],
    optional: ['p_payment_date', 'p_method', 'p_reference', 'p_notes'],
  },
  rpc_record_ap_payment: {
    required: ['p_company_id', 'p_supplier_id', 'p_amount'],
    optional: ['p_payment_date', 'p_method', 'p_reference', 'p_notes'],
  },
  rpc_record_purchase: {
    required: ['p_company_id', 'p_supplier_id', 'p_items', 'p_payment_type'],
    optional: ['p_amount_paid', 'p_transport_fee', 'p_auto_receive', 'p_notes'],
  },
  rpc_receive_purchase: {
    required: ['p_company_id', 'p_purchase_id'],
    optional: ['p_received_by'],
  },
  // ─── Sprint D1 (2026-06-23) ─────────────────────────────────────────────
  rpc_create_contact: {
    required: ['p_company_id', 'p_contact_name', 'p_contact_type'],
    optional: ['p_phone', 'p_address', 'p_credit_limit', 'p_credit_days'],
  },
  rpc_create_product: {
    required: ['p_company_id', 'p_name'],
    optional: [
      'p_unit',
      'p_sku',
      'p_selling_price',
      'p_base_cost',
      'p_stock_qty',
      'p_reorder_level',
    ],
  },
  // --- Sprint D5 (2026-07-20): contact update/deactivate ---
  rpc_update_contact: {
    required: ['p_company_id', 'p_contact_id'],
    optional: [
      'p_contact_name',
      'p_phone',
      'p_address',
      'p_credit_limit',
      'p_credit_days',
    ],
  },
  rpc_deactivate_contact: {
    required: ['p_company_id', 'p_contact_id'],
    optional: [],
  },
} as const

type RpcName = keyof typeof RPC_REGISTRY

function isWhitelistedRpc(name: string): name is RpcName {
  return Object.prototype.hasOwnProperty.call(RPC_REGISTRY, name)
}

// --- Sprint D6a (2026-07-22): server-side contact existence guards ---
// Agent can fabricate UUIDs despite prompt hard rules (FK violation
// observed 2026-07-21). Verify contact exists + correct type + not
// soft-deleted BEFORE calling RPC.
// Fail-open on guard query infra error (DB FK constraint is backstop).
const CONTACT_GUARDS: Partial<
  Record<RpcName, { param: string; ctype: 'customer' | 'supplier' }>
> = {
  rpc_record_sale: { param: 'p_customer_id', ctype: 'customer' },
  rpc_record_purchase: { param: 'p_supplier_id', ctype: 'supplier' },
  rpc_record_ar_payment: { param: 'p_customer_id', ctype: 'customer' },
  rpc_record_ap_payment: { param: 'p_supplier_id', ctype: 'supplier' },
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const GUARD_MSG = {
  customer:
    '\u1016\u1031\u102c\u1000\u103a\u101e\u100a\u103a ID \u1019\u1019\u103e\u1014\u103a\u1015\u102b\u104b \u1005\u102c\u101b\u1004\u103a\u1038\u1011\u1032\u1000 \u1016\u1031\u102c\u1000\u103a\u101e\u100a\u103a\u1000\u102d\u102f \u1015\u103c\u1014\u103a\u101b\u103d\u1031\u1038\u1015\u102b\u104b',
  supplier:
    '\u1015\u1031\u1038\u101e\u103d\u1004\u103a\u1038\u101e\u1030 ID \u1019\u1019\u103e\u1014\u103a\u1015\u102b\u104b \u1005\u102c\u101b\u1004\u103a\u1038\u1011\u1032\u1000 \u1015\u1031\u1038\u101e\u103d\u1004\u103a\u1038\u101e\u1030\u1000\u102d\u102f \u1015\u103c\u1014\u103a\u101b\u103d\u1031\u1038\u1015\u102b\u104b',
} as const

async function validateContactGuard(
  rpc: RpcName,
  args: Record<string, unknown>
): Promise<string | null> {
  const guard = CONTACT_GUARDS[rpc]
  if (!guard) return null
  const id = args[guard.param]
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    console.error('[ai/execute] D6a guard: bad UUID format', rpc, id)
    return GUARD_MSG[guard.ctype]
  }
  const { data, error } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .ilike('contact_type', guard.ctype)
    .eq('is_deleted', false)
    .maybeSingle()
  if (error) {
    console.error('[ai/execute] D6a guard query failed (fail-open):', error)
    return null
  }
  if (!data) {
    console.error('[ai/execute] D6a guard: contact not found', rpc, id)
    return GUARD_MSG[guard.ctype]
  }
  return null
}

// Sum (qty * unit_price) across p_items
function computeItemsTotal(items: unknown): number {
  if (!Array.isArray(items)) return 0
  let total = 0
  for (const it of items) {
    if (it && typeof it === 'object') {
      const qty = Number((it as Record<string, unknown>).qty ?? 0)
      const unit_price = Number((it as Record<string, unknown>).unit_price ?? 0)
      if (Number.isFinite(qty) && Number.isFinite(unit_price)) {
        total += qty * unit_price
      }
    }
  }
  return total
}

// Sanitize args: drop unknown keys + hard-pin company_id + RPC-specific defaults
function sanitizeArgs(
  rpc: RpcName,
  rawArgs: Record<string, unknown>,
  ctx: { staffId?: string }
) {
  const spec = RPC_REGISTRY[rpc]
  const allowed = new Set<string>([...spec.required, ...spec.optional])
  const args: Record<string, unknown> = {}
  for (const key of Object.keys(rawArgs)) {
    if (allowed.has(key)) args[key] = rawArgs[key]
  }

  // Hard-pin company_id — never trust AI/client value
  args.p_company_id = COMPANY_ID

  // --- rpc_record_sale: inject staff_id + auto-compute amount_received ---
  if (rpc === 'rpc_record_sale') {
    // staff_id: prefer body.staff_id (from logged-in session), fallback to default
    if (!args.p_staff_id) {
      args.p_staff_id = ctx.staffId || DEFAULT_STAFF_ID
    }
    // amount_received: RPC requires >= total for cash sales
    const total = computeItemsTotal(args.p_items)
    const provided = Number(args.p_amount_received ?? 0)
    if (args.p_payment_type === 'cash') {
      // Auto-bump to total if AI omitted or undershot
      args.p_amount_received = Math.max(provided, total)
    } else {
      // credit: keep what was provided, default to 0
      args.p_amount_received = Number.isFinite(provided) ? provided : 0
    }
  }

  // Validate required
  const missing = spec.required.filter((k) => !(k in args))
  if (missing.length > 0) {
    throw new Error(`Missing required args: ${missing.join(', ')}`)
  }
  return args
}

// Map common PostgreSQL/RPC errors to user-friendly Burmese messages
function translateError(message: string, lang: string): string {
  const m = (message || '').toLowerCase()
  if (lang === 'my') {
    // Sprint D1 — create RPC errors
    if (m.includes('already exists')) {
      if (m.includes('sku')) return 'ဒီ SKU ရှိပြီးသား ဖြစ်နေပါတယ်။ အခြား SKU သုံးပါ။'
      if (m.includes('product')) return 'ဒီ ပစ္စည်း ရှိပြီးသား ဖြစ်နေပါတယ်။'
      if (m.includes('contact')) return 'ဒီ ဖောက်သည်/ပေးသွင်းသူ ရှိပြီးသား ဖြစ်နေပါတယ်။'
      return 'ဒီ အချက်အလက် ရှိပြီးသား ဖြစ်နေပါတယ်။'
    }
    if (m.includes('contact_type must be')) {
      return 'အမျိုးအစား customer သို့ supplier ထဲက ရွေးပါ။'
    }
    if (m.includes('contact_name is required')) return 'အမည် ထည့်ပါ။'
    if (m.includes('product name is required')) return 'ပစ္စည်း အမည် ထည့်ပါ။'
    if (m.includes('selling_price must')) return 'ဈေးနှုန်း က 0 ထက် ကြီးရမယ်။'
    if (m.includes('stock_qty must')) return 'လက်ကျန် က 0 ထက် ကြီးရမယ်။'
    // Existing patterns
    if (m.includes('stock') || m.includes('insufficient'))
      return 'ပစ္စည်း လက်ကျန် မလောက်ပါ။'
    if (m.includes('not found')) return 'ရှာမတွေ့ပါ။ ID မှန်လား စစ်ပါ။'
    if (m.includes('already received')) return 'ဒီ purchase ကို receive ပြီးပြီ။'
    if (m.includes('cash purchase'))
      return 'ငွေသား purchase က ချက်ချင်း receive လုပ်ရပါမယ်။'
    if (m.includes('positive') || m.includes('negative'))
      return 'အရေအတွက်/ပမာဏ မမှန်ပါ။'
    if (m.includes('supplier')) return 'Supplier မမှန်ပါ။'
    if (m.includes('amount_received')) return 'လက်ခံ ငွေပမာဏ မလောက်ပါ။'
    return message
  }
  return message
}

export async function POST(req: NextRequest) {
  let lang = 'my'
  try {
    const body = await req.json().catch(() => ({}))
    const { tool, args, language, staff_id } = body as {
      tool?: string
      args?: Record<string, unknown>
      language?: string
      staff_id?: string // optional override from frontend session
    }
    lang = language || 'my'

    if (!tool || typeof tool !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Missing tool name' },
        { status: 400 }
      )
    }
    if (!args || typeof args !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Missing args' },
        { status: 400 }
      )
    }
    if (!isWhitelistedRpc(tool)) {
      return NextResponse.json(
        { ok: false, error: `RPC '${tool}' not whitelisted` },
        { status: 403 }
      )
    }

    const safeArgs = sanitizeArgs(tool, args, { staffId: staff_id })

    // --- Sprint D6a: fabricated-UUID defense (see CONTACT_GUARDS) ---
    const guardError = await validateContactGuard(tool, safeArgs)
    if (guardError) {
      return NextResponse.json(
        { ok: false, error: guardError, tool, guard: 'contact_not_found' },
        { status: 400 }
      )
    }

    // Execute RPC
    const { data, error } = await supabase.rpc(tool, safeArgs)

    if (error) {
      console.error(`[ai/execute] RPC ${tool} failed:`, error)
      return NextResponse.json(
        {
          ok: false,
          error: translateError(error.message, lang),
          rawError: error.message,
          tool,
        },
        { status: 400 }
      )
    }

        // Sprint D2 Option A (2026-06-29): build receipt object for rpc_record_sale
    // so ChatBubble can populate localStorage before NAV to /pos/receipt.
    // Mirrors voice-pos /api/voice/commit-sale pattern (production-tested).
    let enrichedResult: any = data
    // Sprint D6f (2026-07-31): reconcile trans_no/po_no with DB post-trigger value.
    // BEFORE INSERT triggers (trg_seq_sales / trg_seq_purch -> fn_get_next_seq)
    // overwrite RPC pre-INSERT INV-/PO-YYYYMMDD- format with TR-/PO-NNNNNN.
    // Re-query so buildSuccessMessage, receipt, localStorage, and /pos/receipt
    // navigation all use the authoritative DB value.
    if (data && typeof data === 'object') {
      try {
        if (tool === 'rpc_record_sale' && (data as any).transaction_id) {
          const { data: row } = await supabase
            .from('transactions').select('trans_no')
            .eq('id', (data as any).transaction_id).maybeSingle()
          if (row?.trans_no) { (data as any).trans_no = row.trans_no }
        } else if (tool === 'rpc_record_purchase' && (data as any).purchase_id) {
          const { data: row } = await supabase
            .from('purchases').select('po_no')
            .eq('id', (data as any).purchase_id).maybeSingle()
          if (row?.po_no) { (data as any).po_no = row.po_no }
        }
      } catch (e) {
        console.error('[ai/execute D6f reconcile] failed:', e)
      }
    }
    if (tool === 'rpc_record_sale' && data && typeof data === 'object') {
      try {
        const itemsArr = Array.isArray((safeArgs as any).p_items) ? (safeArgs as any).p_items : []
        const productIds: string[] = itemsArr
          .map((i: any) => i?.product_id)
          .filter((x: any) => typeof x === 'string')
        const customerId = (safeArgs as any).p_customer_id as string | undefined
        const WALKIN_UUID = '700dc64d-5b06-4603-a55d-a12717581b47'
        const isWalkin = customerId === WALKIN_UUID

        const [companyRes, productsRes, customerRes] = await Promise.all([
          supabase.from('companies').select('name,address,phone').eq('id', COMPANY_ID).maybeSingle(),
          productIds.length > 0
            ? supabase.from('products').select('id,name').in('id', productIds)
            : Promise.resolve({ data: [] as any[] }),
          (customerId && !isWalkin)
            ? supabase.from('contacts').select('contact_name').eq('id', customerId).maybeSingle()
            : Promise.resolve({ data: null as any }),
        ])

        const nameById = new Map<string, string>()
        for (const p of ((productsRes as any).data || []) as any[]) {
          if (p?.id) nameById.set(p.id, p.name || 'Item')
        }

        const receiptItems = itemsArr.map((i: any) => {
          const qty = Number(i?.qty || 0)
          const unit_price = Number(i?.unit_price || 0)
          return {
            name: nameById.get(i?.product_id) || 'Item',
            quantity: qty,
            unit_price,
            subtotal: qty * unit_price,
          }
        })

        const totalAmount = receiptItems.reduce((s: number, x: any) => s + x.subtotal, 0)
        const amountPaid = Number((safeArgs as any).p_amount_received ?? totalAmount)
        const customerName = isWalkin
          ? ''
          : (((customerRes as any).data?.contact_name) || '')

        const receipt = {
          transactionId: (data as any).trans_no || (data as any).transaction_id || '',
          companyName: ((companyRes as any).data?.name) || 'Shop',
          companyAddress: ((companyRes as any).data?.address) || '',
          companyPhone: ((companyRes as any).data?.phone) || '',
          items: receiptItems,
          totalAmount,
          amountPaid,
          customerName,
          createdAt: new Date().toISOString(),
          createdAtMs: Date.now(),
        }

        enrichedResult = { ...(data as object), receipt }
      } catch (e) {
        // Receipt enrichment failed — log but don't fail the sale
        console.error('[ai/execute] receipt build failed:', e)
      }
    }

    return NextResponse.json({ ok: true, tool, result: enrichedResult })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[ai/execute] exception:', err)
    return NextResponse.json(
      { ok: false, error: translateError(msg, lang) },
      { status: 500 }
    )
  }
}
