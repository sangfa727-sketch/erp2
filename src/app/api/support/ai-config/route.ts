import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COMPANY_ID = '38e7b287-fd4e-4354-a1d1-9efae0b09eb9'

export async function GET() {
  try {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', COMPANY_ID)
      .single()

    const { data: config, error } = await supabase
      .from('ai_config')
      .select('*')
      .eq('company_id', COMPANY_ID)
      .single()

    if (error) throw error

const kb = typeof config.knowledge_base === 'string' ? JSON.parse(config.knowledge_base) : config.knowledge_base || {}
    const knowledge_text = [
      kb.shop ? `=== ဆိုင်အချက်အလက် ===\n${kb.shop}` : '',
      kb.products ? `=== ကုန်ပစ္စည်း/စျေးနှုန်း ===\n${kb.products}` : '',
      kb.policy ? `=== Policy ===\n${kb.policy}` : '',
      kb.faq ? `=== FAQ ===\n${kb.faq}` : '',
    ].filter(Boolean).join('\n\n')

    const pricing_rule = config.pricing_mode === 'fixed'
      ? 'စျေးနှုန်းသည် ERP မှ selling_price တိတိဖြစ်သည်။ negotiate မပြုလုပ်ရ။'
      : config.pricing_mode === 'discount'
      ? `ERP selling_price မှ အများဆုံး ${config.discount_pct_max}% ထိသာ လျော့ပေးနိုင်သည်။ ထိုထက်ကျော်သောတောင်းဆိုမှုတွင် "Agent ကိုဆက်သွယ်ပေးမည်" ဟုပြောရမည်။`
      : `ERP selling_price မှ အများဆုံး ${config.discount_pct_max}% ထိ လျော့၍ ${config.surge_pct_max}% ထိ တင်ရောင်းနိုင်သည်။ range ကျော်လျှင် agent ကို refer ပေးရမည်။`

    const system_prompt = `${config.persona}

${knowledge_text ? `--- သတင်းအချက်အလက် ---\n${knowledge_text}\n---` : ''}

--- စျေးနှုန်းမူဝါဒ ---
${pricing_rule}
${config.pricing_note ? `မှတ်ချက်: ${config.pricing_note}` : ''}

--- လုပ်ဆောင်ချက် ---
- Customer order ယူလိုသောအခါ product name, qty, agreed price တောင်းယူပြီး pending order တင်ပေးရမည်
- မသေချာသောအချက်တွင် agent ကို refer ပေးရမည်
- ဘာသာစကား: ${config.language}`

    return NextResponse.json({
      system_prompt,
      company_name: company?.name || 'Star light',
      config: {
        persona: config.persona,
        language: config.language,
knowledge_base: typeof config.knowledge_base === 'string' ? JSON.parse(config.knowledge_base) : config.knowledge_base || { shop: '', products: '', policy: '', faq: '' },
        trigger_mode: config.trigger_mode,
        business_hours: config.business_hours,
        is_active: config.is_active,
        pricing_mode: config.pricing_mode || 'fixed',
        discount_pct_max: config.discount_pct_max || 0,
        surge_pct_max: config.surge_pct_max || 0,   
        pricing_note: config.pricing_note || '',
        telegram_bot_token: config.telegram_bot_token || '',
        telegram_bot_username: config.telegram_bot_username || '',
      }
    })
  } catch (err) {
    console.error('ai-config GET error:', err)
    return NextResponse.json({ error: 'Failed to load config' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const {
      persona,
      language,
      knowledge_base,
      trigger_mode,
      business_hours,
      is_active,
      pricing_mode,
      discount_pct_max,
      surge_pct_max,
      pricing_note,
    } = body

    const { error } = await supabase
      .from('ai_config')
      .update({
        persona,
        language,
        knowledge_base,
        trigger_mode,
        business_hours,
        is_active,
        pricing_mode,
        discount_pct_max,
        surge_pct_max,
        pricing_note,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', COMPANY_ID)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('ai-config POST error:', err)
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }
}
