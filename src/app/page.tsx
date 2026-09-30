'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const content = {
  en: {
    tagline: 'Smart POS & ERP System',
    hero_title: 'Manage your business',
    hero_highlight: 'Smarter than ever.',
    hero_desc: 'All-in-one POS & ERP system designed for local businesses. Control stock, accounting, and sales — all in one place.',
    get_started: 'Get Started',
    learn_more: 'Learn more ↓',
    login: 'Login →',
    features_title: 'Everything you need to run your business',
    features_desc: 'Powerful features designed for local businesses',
    ai_title: 'Meet your AI Business Assistant',
    ai_desc: 'Ask your AI assistant about sales, stock, and expenses — anytime.',
    coming_soon: 'Coming Soon',
    cta_title: 'Ready to get started?',
    cta_desc: 'Join businesses already using Stillastock to manage their operations.',
    start_now: "Start Now — It's Free →",
    staff_login: 'Staff Login',
    admin_login: 'Admin Login',
    features: [
      {icon:'🛒',title:'Smart POS',desc:'Fast checkout with customer tracking, price editing, and receipt printing.'},
      {icon:'📦',title:'Inventory Control',desc:'Real-time stock tracking with GRN, damaged stock, and sales return management.'},
      {icon:'💰',title:'Finance & Accounting',desc:'Track receivables, payables, bank accounts, and expenses automatically.'},
      {icon:'👥',title:'CRM',desc:'Manage customers and suppliers with credit balance tracking.'},
      {icon:'📊',title:'Reports & Analytics',desc:'Sales reports, profit analysis, and stock alerts in real-time.'},
      {icon:'🤖',title:'AI Insights',desc:'Smart business assistant powered by AI to help you make better decisions.'},
    ],
  },
  my: {
    tagline: 'သေချာတဲ့ POS & ERP စနစ်',
    hero_title: 'သင့်စီးပွားရေးကို',
    hero_highlight: 'ပိုမိုထိရောက်စွာ စီမံပါ။',
    hero_desc: 'ဒေသခံစီးပွားရေးများအတွက် ဒီဇိုင်းထုတ်ထားသော all-in-one POS & ERP စနစ်။ ကုန်ပစ္စည်း၊ စာရင်းကိုင်၊ ရောင်းအားများကို တစ်နေရာတည်းမှ ထိန်းချုပ်ပါ။',
    get_started: 'စတင်သုံးမည်',
    learn_more: 'ပိုမိုကြည့်မည် ↓',
    login: 'ဝင်မည် →',
    features_title: 'စီးပွားရေးလုပ်ဆောင်ရန် လိုအပ်သမျှ',
    features_desc: 'ဒေသခံစီးပွားရေးများအတွက် ရည်ရွယ်ပြုလုပ်ထားသည်',
    ai_title: 'AI စီးပွားရေးအကူအညီကို တွေ့ဆုံပါ',
    ai_desc: 'ရောင်းချမှု၊ ကုန်လက်ကျန်၊ ကုန်ကျစရိတ်တွေကို AI ကနေ မေးမြန်းနိုင်ပါသည်။',
    coming_soon: 'မကြာမီလာမည်',
    cta_title: 'စတင်ရန် အဆင်သင့်ဖြစ်ပြီလား?',
    cta_desc: 'Stillastock ကို သုံးပြီး စီးပွားရေးကို ထိရောက်စွာ စီမံနေသော လုပ်ငန်းများနှင့် ပူးပေါင်းပါ။',
    start_now: 'ယခုစတင်မည် — အခမဲ့ →',
    staff_login: 'Staff ဝင်မည်',
    admin_login: 'Admin ဝင်မည်',
    features: [
      {icon:'🛒',title:'POS စနစ်',desc:'Customer tracking၊ ဈေးနှုန်းပြင်ဆင်မှုနှင့် ဘောက်ချာပုံနှိပ်ခြင်းပါ မြန်ဆန်သော checkout စနစ်။'},
      {icon:'📦',title:'ကုန်ပစ္စည်းထိန်းချုပ်မှု',desc:'GRN၊ ပျက်စီးသောကုန်ပစ္စည်းနှင့် ရောင်းအားပြန်အမ်းစနစ်ဖြင့် real-time ကုန်လက်ကျန် tracking။'},
      {icon:'💰',title:'ဘဏ္ဍာရေး & စာရင်းကိုင်',desc:'ကြွေးကျန်ငွေ၊ ပေးရမည့်ငွေ၊ ဘဏ်အကောင့်နှင့် ကုန်ကျစရိတ်တွေကို auto track လုပ်မည်။'},
      {icon:'👥',title:'ဖောက်သည်စီမံမှု',desc:'ကြွေးကျန်ငွေ tracking ဖြင့် ဖောက်သည်နှင့် ပေးသွင်းသူများ စီမံမည်။'},
      {icon:'📊',title:'အစီရင်ခံစာ & ခွဲခြမ်းစိတ်ဖြာမှု',desc:'ရောင်းအားအစီရင်ခံစာ၊ အမြတ်ခွဲခြမ်းမှုနှင့် ကုန်ပစ္စည်းသတိပေးချက်တွေ real-time ဖြင့်။'},
      {icon:'🤖',title:'AI ထိုးထွင်းသိမြင်မှု',desc:'ပိုကောင်းသော ဆုံးဖြတ်ချက်ချရန် AI မောင်းနှင်သည့် smart စီးပွားရေးကူညီသူ။'},
    ],
  },
  th: {
    tagline: 'ระบบ POS & ERP อัจฉริยะ',
    hero_title: 'จัดการธุรกิจของคุณ',
    hero_highlight: 'อย่างชาญฉลาดกว่าเดิม',
    hero_desc: 'ระบบ POS & ERP แบบครบวงจร ออกแบบมาสำหรับธุรกิจท้องถิ่น ควบคุมสต็อก บัญชี และยอดขาย ทั้งหมดในที่เดียว',
    get_started: 'เริ่มต้นใช้งาน',
    learn_more: 'เรียนรู้เพิ่มเติม ↓',
    login: 'เข้าสู่ระบบ →',
    features_title: 'ทุกสิ่งที่คุณต้องการในการดำเนินธุรกิจ',
    features_desc: 'ฟีเจอร์อันทรงพลังสำหรับธุรกิจท้องถิ่น',
    ai_title: 'พบกับ AI ผู้ช่วยธุรกิจของคุณ',
    ai_desc: 'ถาม AI เกี่ยวกับยอดขาย สต็อก และค่าใช้จ่าย ได้ทุกเมื่อ',
    coming_soon: 'เร็วๆ นี้',
    cta_title: 'พร้อมเริ่มต้นแล้วหรือยัง?',
    cta_desc: 'เข้าร่วมกับธุรกิจที่ใช้ Stillastock ในการจัดการการดำเนินงานแล้ว',
    start_now: 'เริ่มเลย — ฟรี →',
    staff_login: 'เข้าสู่ระบบพนักงาน',
    admin_login: 'เข้าสู่ระบบผู้ดูแล',
    features: [
      {icon:'🛒',title:'POS อัจฉริยะ',desc:'ชำระเงินรวดเร็วพร้อมติดตามลูกค้า แก้ไขราคา และพิมพ์ใบเสร็จ'},
      {icon:'📦',title:'ควบคุมสินค้าคงคลัง',desc:'ติดตามสต็อกแบบเรียลไทม์ด้วย GRN สินค้าเสียหาย และการจัดการคืนสินค้า'},
      {icon:'💰',title:'การเงินและบัญชี',desc:'ติดตามลูกหนี้ เจ้าหนี้ บัญชีธนาคาร และค่าใช้จ่ายโดยอัตโนมัติ'},
      {icon:'👥',title:'CRM',desc:'จัดการลูกค้าและซัพพลายเออร์พร้อมติดตามยอดเครดิต'},
      {icon:'📊',title:'รายงานและการวิเคราะห์',desc:'รายงานยอดขาย การวิเคราะห์กำไร และการแจ้งเตือนสต็อกแบบเรียลไทม์'},
      {icon:'🤖',title:'AI Insights',desc:'ผู้ช่วยธุรกิจอัจฉริยะที่ขับเคลื่อนด้วย AI เพื่อช่วยตัดสินใจได้ดีขึ้น'},
    ],
  },
}

const LANGS = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'my', label: 'မြန်မာ', flag: '🇲🇲' },
  { code: 'th', label: 'ไทย', flag: '🇹🇭' },
]

const FEATURE_COLORS = [
  'bg-blue-50 border-blue-100',
  'bg-green-50 border-green-100',
  'bg-yellow-50 border-yellow-100',
  'bg-purple-50 border-purple-100',
  'bg-red-50 border-red-100',
  'bg-slate-50 border-slate-200',
]

export default function LandingPage() {
  const [lang, setLang] = useState<'en'|'my'|'th'>('my')
  const c = content[lang]

  useEffect(() => {
    const saved = localStorage.getItem('app_lang') as 'en'|'my'|'th'|null
    if (saved && ['en','my','th'].includes(saved)) setLang(saved)
    const root = document.documentElement
    root.setAttribute('data-theme', 'light')
    root.style.colorScheme = 'light'
  }, [])

  const switchLang = (l: 'en'|'my'|'th') => {
    setLang(l)
    localStorage.setItem('app_lang', l)
  }

  return (
    <div className="min-h-screen font-sans" style={{colorScheme:'light', backgroundColor:'#f8fafc', color:'#0f172a'}}>

      {/* Nav */}
      <nav className="flex justify-between items-center px-4 md:px-8 py-4 shadow-sm sticky top-0 z-50" style={{backgroundColor:'#ffffff'}}>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">S</div>
          <span className="text-xl font-bold text-slate-800">Stillastock</span>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {/* Lang switcher */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {LANGS.map(l => (
              <button key={l.code} onClick={() => switchLang(l.code as any)}
                className={"px-2 py-1 rounded-lg text-xs font-semibold transition-all " + (lang === l.code ? "bg-white shadow text-blue-600" : "text-slate-500 hover:text-slate-700")}>
                <span className="mr-1">{l.flag}</span>
                <span className="hidden sm:inline">{l.label}</span>
              </button>
            ))}
          </div>
          <Link href="/signup" className="hidden sm:block text-slate-600 hover:text-blue-600 text-sm font-medium transition-colors">{c.get_started}</Link>
          <Link href="/login" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-sm">
            {c.login}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-20 flex flex-col md:flex-row items-center gap-8 md:gap-12">
        <div className="md:w-1/2 space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-200">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
            {c.tagline}
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 leading-tight">
            {c.hero_title}{' '}
            <span className="text-blue-600">{c.hero_highlight}</span>
          </h1>
          <p className="text-lg text-slate-500 leading-relaxed">{c.hero_desc}</p>
          <div className="flex items-center gap-4 pt-2">
            <Link href="/signup" className="px-8 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl hover:bg-blue-700 transition-all">
              {c.get_started} →
            </Link>
            <Link href="#features" className="px-6 py-4 text-slate-600 font-medium hover:text-blue-600 transition-colors">
              {c.learn_more}
            </Link>
          </div>
        </div>
        <div className="md:w-1/2">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden p-4">
            <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                <div className="flex-1 bg-slate-700 rounded-full h-5 ml-2"></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {label:'Revenue',val:'K 632,000',color:'bg-blue-500'},
                  {label:'Products',val:'124 SKUs',color:'bg-green-500'},
                  {label:'Receivables',val:'K 120,000',color:'bg-yellow-500'},
                  {label:'Expenses',val:'K 2,099',color:'bg-red-500'},
                ].map((card,i) => (
                  <div key={i} className="bg-slate-700 rounded-xl p-3">
                    <div className={"w-6 h-1 " + card.color + " rounded-full mb-2"}></div>
                    <p className="text-slate-400 text-xs">{card.label}</p>
                    <p className="text-white font-bold text-sm mt-1">{card.val}</p>
                  </div>
                ))}
              </div>
              <div className="bg-slate-700 rounded-xl p-3 mt-2">
                <p className="text-slate-400 text-xs mb-2">Top Products</p>
                {['Product A','Product B','Product C'].map((p,i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 bg-slate-600 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{width:`${80-i*20}%`}}></div>
                    </div>
                    <span className="text-slate-400 text-xs w-16 text-right">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20" style={{backgroundColor:'#ffffff'}}>
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-14">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">{c.features_title}</h2>
            <p className="text-slate-500">{c.features_desc}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {c.features.map((f,i) => (
              <div key={i} className={"p-6 rounded-2xl border hover:shadow-md transition-all " + FEATURE_COLORS[i]}>
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-bold text-slate-800 mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Section */}
      <section className="py-20 bg-gradient-to-br from-blue-600 to-blue-800">
        <div className="max-w-4xl mx-auto px-4 md:px-8 text-center">
          <div className="text-5xl mb-6">🤖</div>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">{c.ai_title}</h2>
          <p className="text-blue-200 text-lg mb-8 leading-relaxed">{c.ai_desc}</p>
          <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/20 text-white rounded-full text-sm font-medium border border-white/30">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            {c.coming_soon}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20" style={{backgroundColor:'#f8fafc'}}>
        <div className="max-w-2xl mx-auto px-4 md:px-8 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">{c.cta_title}</h2>
          <p className="text-slate-500 mb-8">{c.cta_desc}</p>
          <Link href="/signup" className="inline-block px-10 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl hover:bg-blue-700 transition-all text-lg">
            {c.start_now}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-slate-400 py-10 px-8" style={{backgroundColor:'#0f172a'}}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">S</div>
            <span className="text-white font-semibold">Stillastock</span>
          </div>
          <p className="text-sm">© 2026 Stillastock. Smart POS & ERP for Local Businesses.</p>
          <div className="flex gap-6 text-sm">
            <Link href="/staff-login" className="hover:text-white transition-colors">{c.staff_login}</Link>
            <Link href="/login" className="hover:text-white transition-colors">{c.admin_login}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
