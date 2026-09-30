'use client'
import React, { useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'

const DAYS = ['mon','tue','wed','thu','fri','sat','sun']

const T = {
  my: {
    title:'AI & Channel ဆက်တင်',sub:'AI bot ၏ ကိုယ်ရည်ကိုယ်သွေး၊ knowledge base နှင့် channel ချိတ်ဆက်မှုများ',
    tabAI:'AI ဆက်တင်',tabCh:'Channel ချိတ်ဆက်',
    persona:'AI Persona',triggerMode:'Trigger Mode',always:'အမြဲ (Always)',offline:'Offline သာ',busy:'Busy သာ',
    personaDesc:'Persona ဖော်ပြချက်',personaPlaceholder:'AI ရဲ့ အပြောအဆိုပုံစံ ဖော်ပြပါ...',
    autoReply:'Auto-reply ဖွင့်မည်',autoReplySub:'ပိတ်ထားလျှင် agent သာ ဖြေမည်',
    shopInfo:'ဆိုင်အချက်အလက်',erpNote:'ကုန်ပစ္စည်းနှင့် စျေးနှုန်းများ — ERP မှ real-time ဆွဲယူသည်',
    shopLabel:'ဆိုင်နာမည်၊ လိပ်စာ၊ ဖွင့်ချိန်',shopPlaceholder:'ဆိုင်အမည် - Star light\nလိပ်စာ - မန္တလေး ၃၂ လမ်း\nဖွင့်ချိန် - ၉AM-9PM\nဆက်သွယ်ရန် - 09-XXXXXXXXX',
    policy:'Delivery & Return Policy',
    returnLabel:'Return / Refund',returnPlaceholder:'e.g. ၇ ရက်အတွင်း ပြန်လာနိုင်',
    deliveryMdyLabel:'Delivery (မန္တလေး)',deliveryMdyPlaceholder:'e.g. ၂-၃ ရက်',
    deliveryRegLabel:'Delivery (တိုင်းဒေသ)',deliveryRegPlaceholder:'e.g. ၅-၇ ရက်',
    paymentLabel:'Payment',paymentPlaceholder:'e.g. Cash, KBZPay, Wave',
    pricing:'AI စျေးနှုန်း ခွင့်ပြုချက်',fixedDesc:'ERP စျေးတိတိ',discountDesc:'လျော့ရောင်းခွင့်',flexDesc:'နှစ်ဖက်စလုံး',
    maxDiscount:'Max Discount',maxSurge:'Max Surge',pricingNote:'AI ကို ထပ်မံရှင်းပြချက်',pricingNotePlaceholder:'e.g. နေ့ကုန် ၄ နာရီနောက် 15% ထိ လျော့ပေးနိုင်',
    hours:'Business Hours',day:'နေ့',open:'ဖွင့်ချိန်',close:'ပိတ်ချိန်',
    days:{mon:'တနင်္လာ',tue:'အင်္ဂါ',wed:'ဗုဒ္ဓဟူး',thu:'ကြာသပတေး',fri:'သောကြာ',sat:'စနေ',sun:'တနင်္ဂနွေ'},
    faq:'FAQ',faqSub:'မေးလေ့ရှိသောမေးခွန်းများ',faqQ:'မေး',faqA:'ဖြေ',faqDel:'ဖျက်',faqAdd:'+ FAQ ထပ်ထည့်မည်',
    faqQPlaceholder:'Customer မေးလေ့ရှိသော မေးခွန်း...',faqAPlaceholder:'AI ပြန်ဖြေမည့် အဖြေ...',
    save:'💾 သိမ်းမည်',saving:'သိမ်းနေသည်...',saved:'✅ သိမ်းပြီး',
    lang:'ဘာသာစကား',active:'Active',inactive:'Inactive',
    tgConnect:'ချိတ်ဆက်မည်',tgConnecting:'ချိတ်ဆက်နေသည်...',tgConnected:'ချိတ်ဆက်ပြီး',tgFail:'ချိတ်ဆက်မရ',tgNot:'မချိတ်ဆက်ရသေး',
    comingSoon:'မကြာမီ ရနိုင်မည်',paymentSoon:'Account ထည့်ရန် (Coming Soon)',
  },
  en: {
    title:'AI & Channel Settings',sub:'Configure AI persona, knowledge base and channel connections',
    tabAI:'AI Settings',tabCh:'Channel Connect',
    persona:'AI Persona',triggerMode:'Trigger Mode',always:'Always',offline:'Offline only',busy:'Busy only',
    personaDesc:'Persona description',personaPlaceholder:'Describe how the AI should talk to customers...',
    autoReply:'Enable auto-reply',autoReplySub:'If off, only agents can reply',
    shopInfo:'Shop Information',erpNote:'Products & prices are pulled from ERP in real-time',
    shopLabel:'Shop name, address, hours',shopPlaceholder:'Shop name - Star light\nAddress - ...\nHours - 9AM-9PM\nContact - 09-XXXXXXXXX',
    policy:'Delivery & Return Policy',
    returnLabel:'Return / Refund',returnPlaceholder:'e.g. Returns within 7 days',
    deliveryMdyLabel:'Delivery (Local)',deliveryMdyPlaceholder:'e.g. 2-3 days',
    deliveryRegLabel:'Delivery (Regional)',deliveryRegPlaceholder:'e.g. 5-7 days',
    paymentLabel:'Payment',paymentPlaceholder:'e.g. Cash, KBZPay, Wave',
    pricing:'AI Pricing Permission',fixedDesc:'ERP price only',discountDesc:'Discount allowed',flexDesc:'Both directions',
    maxDiscount:'Max Discount',maxSurge:'Max Surge',pricingNote:'Extra note for AI',pricingNotePlaceholder:'e.g. After 4pm discount up to 15%',
    hours:'Business Hours',day:'Day',open:'Open',close:'Close',
    days:{mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday',sun:'Sunday'},
    faq:'FAQ',faqSub:'Frequently asked questions',faqQ:'Q',faqA:'A',faqDel:'Remove',faqAdd:'+ Add FAQ',
    faqQPlaceholder:'Question customers often ask...',faqAPlaceholder:'Answer the AI should give...',
    save:'💾 Save',saving:'Saving...',saved:'✅ Saved',
    lang:'Language',active:'Active',inactive:'Inactive',
    tgConnect:'Connect',tgConnecting:'Connecting...',tgConnected:'Connected',tgFail:'Connection failed',tgNot:'Not connected',
    comingSoon:'Coming Soon',paymentSoon:'+ Add Account (Coming Soon)',
  },
  th: {
    title:'ตั้งค่า AI & ช่องทาง',sub:'กำหนดบุคลิก AI, ฐานความรู้ และการเชื่อมต่อช่องทาง',
    tabAI:'ตั้งค่า AI',tabCh:'เชื่อมต่อช่องทาง',
    persona:'บุคลิก AI',triggerMode:'โหมดเปิดใช้งาน',always:'ตลอดเวลา',offline:'เฉพาะออฟไลน์',busy:'เฉพาะยุ่ง',
    personaDesc:'คำอธิบายบุคลิก',personaPlaceholder:'อธิบายวิธีที่ AI พูดคุยกับลูกค้า...',
    autoReply:'เปิดตอบอัตโนมัติ',autoReplySub:'หากปิด เฉพาะเจ้าหน้าที่ตอบได้',
    shopInfo:'ข้อมูลร้านค้า',erpNote:'สินค้าและราคาดึงจาก ERP แบบเรียลไทม์',
    shopLabel:'ชื่อร้าน ที่อยู่ เวลาเปิด',shopPlaceholder:'ชื่อร้าน - Star light\nที่อยู่ - ...\nเวลา - 9AM-9PM\nติดต่อ - 09-XXXXXXXXX',
    policy:'นโยบายจัดส่งและคืนสินค้า',
    returnLabel:'การคืนสินค้า',returnPlaceholder:'e.g. คืนได้ภายใน 7 วัน',
    deliveryMdyLabel:'จัดส่ง (ท้องถิ่น)',deliveryMdyPlaceholder:'e.g. 2-3 วัน',
    deliveryRegLabel:'จัดส่ง (ต่างจังหวัด)',deliveryRegPlaceholder:'e.g. 5-7 วัน',
    paymentLabel:'การชำระเงิน',paymentPlaceholder:'e.g. เงินสด, KBZPay, Wave',
    pricing:'สิทธิ์กำหนดราคา AI',fixedDesc:'ราคา ERP เท่านั้น',discountDesc:'ลดราคาได้',flexDesc:'ทั้งสองทิศทาง',
    maxDiscount:'ส่วนลดสูงสุด',maxSurge:'ราคาสูงสุด',pricingNote:'หมายเหตุเพิ่มเติม',pricingNotePlaceholder:'e.g. หลัง 4 โมง ลดได้ถึง 15%',
    hours:'เวลาทำการ',day:'วัน',open:'เปิด',close:'ปิด',
    days:{mon:'จันทร์',tue:'อังคาร',wed:'พุธ',thu:'พฤหัส',fri:'ศุกร์',sat:'เสาร์',sun:'อาทิตย์'},
    faq:'FAQ',faqSub:'คำถามที่พบบ่อย',faqQ:'ถาม',faqA:'ตอบ',faqDel:'ลบ',faqAdd:'+ เพิ่ม FAQ',
    faqQPlaceholder:'คำถามที่ลูกค้ามักถาม...',faqAPlaceholder:'คำตอบที่ AI ควรให้...',
    save:'💾 บันทึก',saving:'กำลังบันทึก...',saved:'✅ บันทึกแล้ว',
    lang:'ภาษา',active:'ใช้งาน',inactive:'ปิดใช้งาน',
    tgConnect:'เชื่อมต่อ',tgConnecting:'กำลังเชื่อมต่อ...',tgConnected:'เชื่อมต่อแล้ว',tgFail:'เชื่อมต่อล้มเหลว',tgNot:'ยังไม่ได้เชื่อมต่อ',
    comingSoon:'เร็วๆ นี้',paymentSoon:'+ เพิ่มบัญชี (เร็วๆ นี้)',
  }
}

type LangKey = 'my'|'en'|'th'
type FAQ = {q:string;a:string}

function getAppLang(): LangKey {
  if (typeof window === 'undefined') return 'my'
  const stored = localStorage.getItem('app_lang') || 'my'
  if (stored === 'en') return 'en'
  if (stored === 'th') return 'th'
  return 'my'
}

export default function AIConfigPage() {
  const [lang, setLang] = useState<LangKey>('my')
  const t = T[lang]
  const [tab, setTab] = useState<'ai'|'channel'>('ai')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tgConnecting, setTgConnecting] = useState(false)
  const [tgStatus, setTgStatus] = useState<'idle'|'ok'|'fail'>('idle')
  const [tgBotName, setTgBotName] = useState('')
  const [tgToken, setTgToken] = useState('8322534796:AAGrsJyahPhPjwWnYdZcpw2ZOPMtmxpPoBU')
  const [faqs, setFaqs] = useState<FAQ[]>([{q:'',a:''},{q:'',a:''}])
  const [policy, setPolicy] = useState({ret:'',mdy:'',reg:'',pay:''})

  const [form, setForm] = useState({
    persona:'',language:'myanmar',
    knowledge_base:{shop:'',policy:'',faq:''},
    trigger_mode:'always',
    business_hours:{} as Record<string,{open:string|null,close:string|null}>,
    is_active:true,pricing_mode:'fixed',
    discount_pct_max:0,surge_pct_max:0,pricing_note:'', 
    telegram_bot_token: '',
    telegram_bot_username: '',
  })

  useEffect(() => {
    setLang(getAppLang())
    const onStorage = () => setLang(getAppLang())
    window.addEventListener('storage', onStorage)
    const interval = setInterval(() => setLang(getAppLang()), 300)
    return () => { window.removeEventListener('storage', onStorage); clearInterval(interval) }
  }, [])

  useEffect(() => {
    fetch('/api/support/ai-config').then(r=>r.json()).then(d => {
      if (d.config) {
        const c = d.config
        const kb = typeof c.knowledge_base==='string' ? JSON.parse(c.knowledge_base) : c.knowledge_base||{}
        setForm(f=>({...f,...c,knowledge_base:{shop:kb.shop||'',policy:kb.policy||'',faq:kb.faq||''}}))
        if (kb.policy && kb.policy.includes('|')) {
          const parts = kb.policy.split('|')
          setPolicy({ret:parts[0]||'',mdy:parts[1]||'',reg:parts[2]||'',pay:parts[3]||''})
        }
        if (kb.faq) {
          try { const p=JSON.parse(kb.faq); if(Array.isArray(p)) setFaqs(p) } catch {}
        }
      }
      setLoading(false)
    })
  }, [])

  const syncPolicy = (next:{ret:string,mdy:string,reg:string,pay:string}) => {
    setPolicy(next)
    setForm(f=>({...f,knowledge_base:{...f.knowledge_base,policy:[next.ret,next.mdy,next.reg,next.pay].join('|')}}))
  }
  const setKb = (key:string,val:string) => setForm(f=>({...f,knowledge_base:{...f.knowledge_base,[key]:val}}))
  const setHours = (day:string,field:'open'|'close',val:string) =>
    setForm(f=>({...f,business_hours:{...f.business_hours,[day]:{...(f.business_hours[day]||{}),[field]:val||null}}}))
  const setFaq = (i:number,field:'q'|'a',val:string) => {
    const next=faqs.map((f,idx)=>idx===i?{...f,[field]:val}:f)
    setFaqs(next); setKb('faq',JSON.stringify(next))
  }
  const addFaq = () => setFaqs(f=>[...f,{q:'',a:''}])
  const removeFaq = (i:number) => { const next=faqs.filter((_,idx)=>idx!==i); setFaqs(next); setKb('faq',JSON.stringify(next)) }

  const save = async () => {
    setSaving(true)
    await fetch('/api/support/ai-config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2500)
  }

  const connectTelegram = async () => {
    if(!tgToken.trim()) return; setTgConnecting(true)
    try {
      const wh='https://stailla.xyz/webhook/telegram-support'
      const r1=await fetch(`https://api.telegram.org/bot${tgToken}/setWebhook?url=${encodeURIComponent(wh)}`)
      const d1=await r1.json(); if(!d1.ok) throw new Error(d1.description)
      const r2=await fetch(`https://api.telegram.org/bot${tgToken}/getMe`)
      const d2=await r2.json()
      setTgBotName((d2.result?.first_name||'')+' @'+(d2.result?.username||'')); setTgStatus('ok')
      setForm(f=>({...f,telegram_bot_token:tgToken,telegram_bot_username:d2.result?.username||''}))
    } catch { setTgStatus('fail') }
    setTgConnecting(false)
  }

  const inp:React.CSSProperties={border:'1.5px solid var(--color-border)',background:'var(--color-card)',color:'var(--color-text)',boxShadow:'inset 0 2px 4px rgba(0,0,0,0.04)'}

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-4xl mb-3">⚙️</div>
          <div className="text-sm" style={{color:'var(--color-text-secondary)'}}>Loading...</div>
        </div>
      </div>
    </AppLayout>
  )

  return (
    <AppLayout>
      <div className="p-4 md:p-6 mx-auto" style={{maxWidth:1100,fontFamily:'var(--font-sans)'}}>

        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1" style={{color:'var(--color-text)'}}>{t.title}</h1>
          <p className="text-sm" style={{color:'var(--color-text-secondary)'}}>{t.sub}</p>
        </div>

        <div className="flex gap-1 mb-6 p-1 rounded-2xl w-fit" style={{background:'var(--color-card)',boxShadow:'inset 0 2px 8px rgba(0,0,0,0.08)'}}>
          {(['ai','channel'] as const).map(tb=>(
            <button key={tb} onClick={()=>setTab(tb)} className="px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200"
              style={tab===tb?{background:'#8b5cf6',color:'#fff',boxShadow:'0 4px 12px rgba(139,92,246,0.4)'}:{color:'var(--color-text-secondary)',background:'transparent'}}>
              {tb==='ai'?'🤖 '+t.tabAI:'📱 '+t.tabCh}
            </button>
          ))}
        </div>

        {tab==='ai' && (
          <div className="flex flex-col lg:flex-row gap-5">
            <div className="flex flex-col gap-4 flex-1 min-w-0">

              <Sec color="#f5f3ff" border="#e9d5ff" icon="🤖" title={t.persona} badge={form.is_active?{text:t.active,bg:'#d1fae5',color:'#065f46'}:{text:t.inactive,bg:'#fee2e2',color:'#991b1b'}}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <Fld label={t.lang}>
                    <select value={form.language} onChange={e=>setForm(f=>({...f,language:e.target.value}))} className="w-full text-sm px-3 py-2 rounded-xl" style={inp}>
                      <option value="myanmar">မြန်မာ</option><option value="english">English</option><option value="thai">Thai</option>
                    </select>
                  </Fld>
                  <Fld label={t.triggerMode}>
                    <select value={form.trigger_mode} onChange={e=>setForm(f=>({...f,trigger_mode:e.target.value}))} className="w-full text-sm px-3 py-2 rounded-xl" style={inp}>
                      <option value="always">{t.always}</option><option value="offline">{t.offline}</option><option value="busy">{t.busy}</option>
                    </select>
                  </Fld>
                </div>
                <Fld label={t.personaDesc}>
                  <textarea value={form.persona} onChange={e=>setForm(f=>({...f,persona:e.target.value}))} rows={3} placeholder={t.personaPlaceholder} className="w-full text-sm px-3 py-2 rounded-xl resize-none" style={inp}/>
                </Fld>
                <div className="flex items-center justify-between mt-4 p-3 rounded-xl" style={{background:'rgba(139,92,246,0.06)'}}>
                  <div>
                    <div className="text-sm font-medium" style={{color:'var(--color-text)'}}>{t.autoReply}</div>
                    <div className="text-xs mt-0.5" style={{color:'var(--color-text-secondary)'}}>{t.autoReplySub}</div>
                  </div>
                  <Tog on={form.is_active} onToggle={()=>setForm(f=>({...f,is_active:!f.is_active}))}/>
                </div>
              </Sec>

              <Sec color="#f0fdf4" border="#bbf7d0" icon="🏪" title={t.shopInfo}>
                <div className="px-3 py-2 rounded-xl text-xs mb-3" style={{background:'#eff6ff',border:'1px solid #bfdbfe',color:'#1d4ed8'}}>💡 {t.erpNote}</div>
                <Fld label={t.shopLabel}>
                  <textarea value={form.knowledge_base.shop} onChange={e=>setKb('shop',e.target.value)} rows={4} placeholder={t.shopPlaceholder} className="w-full text-sm px-3 py-2 rounded-xl resize-none" style={inp}/>
                </Fld>
              </Sec>

              <Sec color="#fff7ed" border="#fed7aa" icon="📋" title={t.policy}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Fld label={t.returnLabel}><input type="text" value={policy.ret} onChange={e=>syncPolicy({...policy,ret:e.target.value})} placeholder={t.returnPlaceholder} className="w-full text-sm px-3 py-2 rounded-xl" style={inp}/></Fld>
                  <Fld label={t.deliveryMdyLabel}><input type="text" value={policy.mdy} onChange={e=>syncPolicy({...policy,mdy:e.target.value})} placeholder={t.deliveryMdyPlaceholder} className="w-full text-sm px-3 py-2 rounded-xl" style={inp}/></Fld>
                  <Fld label={t.deliveryRegLabel}><input type="text" value={policy.reg} onChange={e=>syncPolicy({...policy,reg:e.target.value})} placeholder={t.deliveryRegPlaceholder} className="w-full text-sm px-3 py-2 rounded-xl" style={inp}/></Fld>
                  <Fld label={t.paymentLabel}><input type="text" value={policy.pay} onChange={e=>syncPolicy({...policy,pay:e.target.value})} placeholder={t.paymentPlaceholder} className="w-full text-sm px-3 py-2 rounded-xl" style={inp}/></Fld>
                </div>
              </Sec>

              <Sec color="#fff7ed" border="#fed7aa" icon="💰" title={t.pricing}>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {(['fixed','discount','flex'] as const).map(m=>(
                    <button key={m} onClick={()=>setForm(f=>({...f,pricing_mode:m}))} className="p-3 rounded-2xl text-center transition-all duration-200"
                      style={{border:form.pricing_mode===m?'2px solid #8b5cf6':'1.5px solid var(--color-border)',background:form.pricing_mode===m?'linear-gradient(135deg,#f5f3ff,#ede9fe)':'var(--color-card)',boxShadow:form.pricing_mode===m?'0 4px 16px rgba(139,92,246,0.2)':'0 2px 6px rgba(0,0,0,0.05)'}}>
                      <div className="text-xl mb-1">{m==='fixed'?'🔒':m==='discount'?'⬇️':'↕️'}</div>
                      <div className="text-xs font-semibold" style={{color:'var(--color-text)'}}>{m==='fixed'?'Fixed':m==='discount'?'Discount':'Flexible'}</div>
                      <div className="text-xs mt-1" style={{color:'var(--color-text-secondary)'}}>{m==='fixed'?t.fixedDesc:m==='discount'?t.discountDesc:t.flexDesc}</div>
                    </button>
                  ))}
                </div>
                {form.pricing_mode!=='fixed' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <Fld label={`${t.maxDiscount}: ${form.discount_pct_max}%`}>
                      <input type="range" min={0} max={30} step={1} value={form.discount_pct_max} onChange={e=>setForm(f=>({...f,discount_pct_max:+e.target.value}))} className="w-full" style={{accentColor:'#8b5cf6'}}/>
                    </Fld>
                    {form.pricing_mode==='flex' && (
                      <Fld label={`${t.maxSurge}: ${form.surge_pct_max}%`}>
                        <input type="range" min={0} max={20} step={1} value={form.surge_pct_max} onChange={e=>setForm(f=>({...f,surge_pct_max:+e.target.value}))} className="w-full" style={{accentColor:'#8b5cf6'}}/>
                      </Fld>
                    )}
                  </div>
                )}
                <Fld label={t.pricingNote}>
                  <input type="text" value={form.pricing_note} onChange={e=>setForm(f=>({...f,pricing_note:e.target.value}))} placeholder={t.pricingNotePlaceholder} className="w-full text-sm px-3 py-2 rounded-xl" style={inp}/>
                </Fld>
              </Sec>

              <Sec color="#eff6ff" border="#bfdbfe" icon="🕐" title={t.hours}>
                <div className="rounded-2xl overflow-hidden" style={{border:'1px solid var(--color-border)'}}>
                  <div className="grid text-xs font-semibold px-4 py-2" style={{gridTemplateColumns:'1fr 1fr 1fr',background:'var(--color-bg)',color:'var(--color-text-secondary)'}}>
                    <div>{t.day}</div><div>{t.open}</div><div>{t.close}</div>
                  </div>
                  {DAYS.map((d,i)=>(
                    <div key={d} className="grid px-4 py-2 items-center" style={{gridTemplateColumns:'1fr 1fr 1fr',background:i%2===0?'var(--color-card)':'transparent',borderTop:'1px solid var(--color-border)'}}>
                      <div className="text-xs font-medium" style={{color:'var(--color-text)'}}>{t.days[d as keyof typeof t.days]}</div>
                      <div className="pr-2"><input type="time" value={form.business_hours[d]?.open||''} onChange={e=>setHours(d,'open',e.target.value)} className="w-full text-xs px-2 py-1 rounded-lg" style={{border:'1px solid var(--color-border)',background:'var(--color-bg)',color:'var(--color-text)'}}/></div>
                      <div><input type="time" value={form.business_hours[d]?.close||''} onChange={e=>setHours(d,'close',e.target.value)} className="w-full text-xs px-2 py-1 rounded-lg" style={{border:'1px solid var(--color-border)',background:'var(--color-bg)',color:'var(--color-text)'}}/></div>
                    </div>
                  ))}
                </div>
              </Sec>

              <div className="flex justify-end pb-8">
                <button onClick={save} disabled={saving} className="px-8 py-3 rounded-2xl text-sm font-semibold text-white transition-all duration-200"
                  style={{background:saved?'#22c55e':saving?'#9ca3af':'linear-gradient(135deg,#8b5cf6,#7c3aed)',boxShadow:saved||saving?'none':'0 4px 16px rgba(139,92,246,0.4)'}}>
                  {saved?t.saved:saving?t.saving:t.save}
                </button>
              </div>
            </div>

            <div className="w-full lg:w-96 flex-shrink-0">
              <div className="rounded-3xl p-5 lg:sticky lg:top-6" style={{background:'var(--color-card)',border:'1.5px solid var(--color-border)',boxShadow:'0 8px 32px rgba(0,0,0,0.08)'}}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">💬</span>
                  <span className="text-sm font-semibold" style={{color:'var(--color-text)'}}>{t.faq}</span>
                  <span className="text-xs ml-auto" style={{color:'var(--color-text-secondary)'}}>{t.faqSub}</span>
                </div>
                <div className="flex flex-col gap-3">
                  {faqs.map((faq,i)=>(
                    <div key={i} className="rounded-2xl p-3" style={{background:'var(--color-bg)',border:'1px solid var(--color-border)'}}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-2 py-0.5 rounded-lg font-semibold" style={{background:'#ede9fe',color:'#7c3aed'}}>{t.faqQ}</span>
                        <button onClick={()=>removeFaq(i)} className="ml-auto text-xs px-2 py-0.5 rounded-lg" style={{background:'#fee2e2',color:'#dc2626'}}>{t.faqDel}</button>
                      </div>
                      <input value={faq.q} onChange={e=>setFaq(i,'q',e.target.value)} className="w-full text-xs px-3 py-2 rounded-xl mb-2" style={{border:'1px solid var(--color-border)',background:'var(--color-card)',color:'var(--color-text)'}} placeholder={t.faqQPlaceholder}/>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-2 py-0.5 rounded-lg font-semibold" style={{background:'#d1fae5',color:'#065f46'}}>{t.faqA}</span>
                      </div>
                      <textarea value={faq.a} onChange={e=>setFaq(i,'a',e.target.value)} rows={2} className="w-full text-xs px-3 py-2 rounded-xl resize-none" style={{border:'1px solid var(--color-border)',background:'var(--color-card)',color:'var(--color-text)'}} placeholder={t.faqAPlaceholder}/>
                    </div>
                  ))}
                </div>
                <button onClick={addFaq} className="w-full mt-3 py-2 rounded-2xl text-xs font-medium transition-all" style={{border:'1.5px dashed var(--color-border)',color:'var(--color-text-secondary)',background:'transparent'}}>
                  {t.faqAdd}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab==='channel' && (
          <div className="grid gap-4" style={{maxWidth:600}}>
            {[
              {icon:'✈️',bg:'#e0f2fe',name:'Telegram Bot',ready:true},
              {icon:'💬',bg:'#ede9fe',name:'Viber',ready:false},
              {icon:'📘',bg:'#dbeafe',name:'Facebook Messenger',ready:false},
            ].map(ch=>(
              <div key={ch.name} className="rounded-3xl p-5" style={{background:'var(--color-card)',border:'1.5px solid var(--color-border)',boxShadow:'0 4px 16px rgba(0,0,0,0.06)'}}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{background:ch.bg}}>{ch.icon}</div>
                  <div>
                    <div className="text-sm font-semibold" style={{color:'var(--color-text)'}}>{ch.name}</div>
                    {ch.ready?(
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{background:tgStatus==='ok'?'#22c55e':'#ef4444'}}/>
                        <span className="text-xs" style={{color:'var(--color-text-secondary)'}}>{tgStatus==='ok'?t.tgConnected+': '+tgBotName:tgStatus==='fail'?t.tgFail:t.tgNot}</span>
                      </div>
                    ):<span className="text-xs italic" style={{color:'var(--color-text-secondary)'}}>{t.comingSoon}</span>}
                  </div>
                </div>
                {ch.ready&&(
                  <>
                    <div className="text-xs mb-1.5 font-medium" style={{color:'var(--color-text-secondary)'}}>Bot Token</div>
                    <div className="flex gap-2">
                      <input type="text" value={tgToken} onChange={e=>setTgToken(e.target.value)} className="flex-1 text-xs px-3 py-2.5 rounded-xl" style={{border:'1.5px solid var(--color-border)',background:'var(--color-bg)',color:'var(--color-text)'}} placeholder="1234567890:AAG..."/>
                      <button onClick={connectTelegram} disabled={tgConnecting} className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white whitespace-nowrap"
                        style={{background:tgStatus==='ok'?'#22c55e':'linear-gradient(135deg,#8b5cf6,#7c3aed)',boxShadow:'0 4px 12px rgba(139,92,246,0.3)'}}>
                        {tgConnecting?t.tgConnecting:tgStatus==='ok'?'✅ '+t.tgConnected:t.tgConnect}
                      </button>
                    </div>
                    <div className="mt-3 px-3 py-2 rounded-xl text-xs" style={{background:'#eff6ff',border:'1px solid #bfdbfe',color:'#1d4ed8'}}>
                      Webhook: <code className="text-xs" style={{background:'#dbeafe',padding:'1px 5px',borderRadius:4}}>https://stailla.xyz/webhook/telegram-support</code>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function Sec({color,border,icon,title,badge,children}:{color:string,border:string,icon:string,title:string,badge?:{text:string,bg:string,color:string},children:React.ReactNode}) {
  return (
    <div className="rounded-3xl p-5" style={{background:color,border:`1.5px solid ${border}`,boxShadow:'0 4px 20px rgba(0,0,0,0.05)'}}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-semibold" style={{color:'var(--color-text)'}}>{title}</span>
        {badge&&<span className="ml-auto text-xs px-2.5 py-0.5 rounded-full font-medium" style={{background:badge.bg,color:badge.color}}>{badge.text}</span>}
      </div>
      {children}
    </div>
  )
}

function Fld({label,children}:{label:string,children:React.ReactNode}) {
  return <div><div className="text-xs font-medium mb-1.5" style={{color:'var(--color-text-secondary)'}}>{label}</div>{children}</div>
}

function Tog({on,onToggle}:{on:boolean,onToggle:()=>void}) {
  return (
    <button onClick={onToggle} className="relative flex-shrink-0 transition-all duration-300" style={{width:48,height:26,borderRadius:13,background:on?'linear-gradient(135deg,#8b5cf6,#7c3aed)':'var(--color-border)',border:'none',cursor:'pointer',boxShadow:on?'0 4px 12px rgba(139,92,246,0.4)':'none'}}>
      <div className="absolute top-1 rounded-full bg-white transition-all duration-300" style={{width:18,height:18,left:on?26:4,boxShadow:'0 2px 6px rgba(0,0,0,0.2)'}}/>
    </button>
  )
}
