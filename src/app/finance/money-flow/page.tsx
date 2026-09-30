'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getCompanyId } from '@/lib/getCompanyId'
import AppLayout from '@/components/layout/AppLayout'

type Entry = {
  id: string
  date: string
  source: string
  direction: 'in' | 'out'
  amount: number
  account: string
  reference: string
  note: string
}

const money = (n:number) => `K ${Number(n || 0).toLocaleString()}`

export default function MoneyFlowLedgerPage() {
  const supabase = createClient()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all'|'in'|'out'>('all')
  const [source, setSource] = useState('all')
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0,7) + '-01')
  const [to, setTo] = useState(() => new Date().toISOString().slice(0,10))
  const [openingBalances, setOpeningBalances] = useState<Record<string,number>>({})
  const [auditIssues, setAuditIssues] = useState<string[]>([])
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)
  const [issueFilter, setIssueFilter] = useState(false)
  const [resolvedIssues, setResolvedIssues] = useState<Set<string>>(new Set())

  const load = async () => {
    setLoading(true)
    const companyId = await getCompanyId()
    if (!companyId) { setEntries([]); setLoading(false); return }

    const [sales, ar, ap, expenses, returns, banks] = await Promise.all([
      supabase.from('transactions').select('id,total_amount,amount_received,created_at,trans_no').eq('company_id', companyId).gte('created_at', from+'T00:00:00').lte('created_at', to+'T23:59:59'),
      supabase.from('ar_payments').select('id,amount,payment_date,payment_method,transaction_id,bank_account_id').eq('company_id', companyId).gte('payment_date', from).lte('payment_date', to),
      supabase.from('ap_payments').select('id,amount,payment_date,payment_method,purchase_id,bank_account_id').eq('company_id', companyId).gte('payment_date', from).lte('payment_date', to),
      supabase.from('expenses').select('id,amount,expense_date,category,paid_by,ref_id').eq('company_id', companyId).gte('expense_date', from).lte('expense_date', to),
      supabase.from('sales_returns').select('id,total_amount,return_date,refund_method,bank_account_id,reason').eq('company_id', companyId).gte('return_date', from).lte('return_date', to),
      supabase.from('bank_accounts').select('id,account_name,current_balance').eq('company_id', companyId).eq('is_deleted', false),
    ])

    const queryResults = [sales, ar, ap, expenses, returns, banks]
    const queryNames = ['POS Sales','AR Payments','AP Payments','Expenses','Sales Returns','Bank Accounts']
    const issues: string[] = []
    queryResults.forEach((result:any, i:number) => { if (result.error) issues.push(queryNames[i] + ' data could not be loaded: ' + (result.error.message || 'query error')) })
    const bankMap = new Map((banks.data || []).map((b:any) => [b.id, b.account_name]))
    ;(ar.data || []).forEach((x:any) => { if (x.bank_account_id && !bankMap.has(x.bank_account_id)) issues.push('AR Payment ' + x.id.slice(0,8) + ' has a missing bank account mapping') })
    ;(ap.data || []).forEach((x:any) => { if (x.bank_account_id && !bankMap.has(x.bank_account_id)) issues.push('AP Payment ' + x.id.slice(0,8) + ' has a missing bank account mapping') })
    ;(returns.data || []).forEach((x:any) => { if (x.refund_method !== 'credit' && x.bank_account_id && !bankMap.has(x.bank_account_id)) issues.push('Sales Return ' + x.id.slice(0,8) + ' has a missing bank account mapping') })
    ;(expenses.data || []).forEach((x:any) => { if (x.paid_by === 'bank') issues.push('Expense ' + x.id.slice(0,8) + ' is marked Bank but has no account-level mapping in the current expense record') })
    setOpeningBalances(Object.fromEntries((banks.data || []).map((b:any) => [b.account_name, Number(b.current_balance || 0)])))
    const rows: Entry[] = []

    ;(sales.data || []).forEach((x:any) => {
      const received = Number(x.amount_received || 0)
      const total = Number(x.total_amount || 0)
      if (received < 0) issues.push('POS Sale ' + (x.trans_no || x.id.slice(0,8)) + ' has a negative received amount')
      if (total >= 0 && received > total) issues.push('POS Sale ' + (x.trans_no || x.id.slice(0,8)) + ' received amount exceeds total amount')
      if (received > 0) rows.push({ id:'sale-'+x.id, date:x.created_at, source:'POS Sale', direction:'in', amount:received, account:'Cash / POS', reference:x.trans_no || x.id.slice(0,8), note:'Sale payment received' })
    })
    ;(ar.data || []).forEach((x:any) => {
      const amount = Number(x.amount || 0)
      if (amount <= 0) issues.push('AR Payment ' + x.id.slice(0,8) + ' has a non-positive amount')
      if (x.payment_method === 'bank' && !x.bank_account_id) issues.push('AR Payment ' + x.id.slice(0,8) + ' uses Bank payment but has no bank account selected')
      rows.push({ id:'ar-'+x.id, date:x.payment_date, source:'AR Payment', direction:'in', amount:Number(x.amount || 0), account:x.bank_account_id ? (bankMap.get(x.bank_account_id) || 'Bank Account') : 'Cash', reference:x.transaction_id ? x.transaction_id.slice(0,8) : x.id.slice(0,8), note:'Customer receivable collected' })
    })
    ;(ap.data || []).forEach((x:any) => {
      const amount = Number(x.amount || 0)
      if (amount <= 0) issues.push('AP Payment ' + x.id.slice(0,8) + ' has a non-positive amount')
      if (x.payment_method === 'bank' && !x.bank_account_id) issues.push('AP Payment ' + x.id.slice(0,8) + ' uses Bank payment but has no bank account selected')
      rows.push({ id:'ap-'+x.id, date:x.payment_date, source:'AP Payment', direction:'out', amount:Number(x.amount || 0), account:x.bank_account_id ? (bankMap.get(x.bank_account_id) || 'Bank Account') : 'Cash', reference:x.purchase_id ? x.purchase_id.slice(0,8) : x.id.slice(0,8), note:'Supplier payable paid' })
    })
    ;(expenses.data || []).forEach((x:any) => {
      const amount = Number(x.amount || 0)
      if (amount <= 0) issues.push('Expense ' + x.id.slice(0,8) + ' has a non-positive amount')
      rows.push({ id:'expense-'+x.id, date:x.expense_date, source:'Expense', direction:'out', amount:Number(x.amount || 0), account:x.paid_by === 'bank' ? 'Bank Account' : 'Cash', reference:x.ref_id ? x.ref_id.slice(0,8) : x.id.slice(0,8), note:x.category || 'Expense' })
    })
    ;(returns.data || []).forEach((x:any) => {
      if (x.refund_method === 'credit') return
      const amount = Number(x.total_amount || 0)
      if (amount <= 0) issues.push('Sales Return ' + x.id.slice(0,8) + ' has a non-positive refund amount')
      if (x.refund_method === 'cash' && !x.bank_account_id) issues.push('Sales Return ' + x.id.slice(0,8) + ' uses cash refund route without a bank account mapping; review cash handling')
      rows.push({ id:'return-'+x.id, date:x.return_date, source:'Sales Return', direction:'out', amount:Number(x.total_amount || 0), account:x.bank_account_id ? (bankMap.get(x.bank_account_id) || 'Bank Account') : 'Cash', reference:x.id.slice(0,8), note:x.reason || 'Customer refund' })
    })

    rows.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const seen = new Set<string>()
    rows.forEach(x => {
      const key = x.source + '|' + x.reference + '|' + x.amount + '|' + String(x.date).slice(0,10)
      if (seen.has(key)) issues.push('Duplicate ledger row detected for ' + x.source + ' ' + x.reference)
      seen.add(key)
    })
    setAuditIssues(Array.from(new Set(issues)))
    setEntries(rows)
    setLastRefreshed(new Date().toLocaleString())
    setLoading(false)
  }

  useEffect(() => { load() }, [from, to])

  const filtered = useMemo(() => entries.filter(x => (filter === 'all' || x.direction === filter) && (source === 'all' || x.source === source) && (!issueFilter || auditIssues.some(i => i.toLowerCase().includes(x.source.toLowerCase()) || i.includes(x.reference) || i.includes(x.id.slice(-8))))), [entries, filter, source, issueFilter, auditIssues])
  const totalIn = filtered.filter(x=>x.direction==='in').reduce((s,x)=>s+x.amount,0)
  const totalOut = filtered.filter(x=>x.direction==='out').reduce((s,x)=>s+x.amount,0)
  const sources = Array.from(new Set(entries.map(x=>x.source)))
  const accountSummary = Array.from(new Set(entries.map(x=>x.account))).map(account => ({
    account,
    in: entries.filter(x=>x.account===account && x.direction==='in').reduce((s,x)=>s+x.amount,0),
    out: entries.filter(x=>x.account===account && x.direction==='out').reduce((s,x)=>s+x.amount,0),
    current: openingBalances[account] ?? null,
  })).sort((a,b)=>(b.in-b.out)-(a.in-a.out))

  const accountReconciliation = accountSummary.map(a => ({...a, net:a.in-a.out, expected:a.current === null ? null : a.current-a.in+a.out}))

  const issueMeta = (issue: string) => {
    const source = ['POS Sale','AR Payment','AP Payment','Expense','Sales Return'].find(s => issue.startsWith(s))
    const href: Record<string,string> = {
      'POS Sale':'/reports/sales',
      'AR Payment':'/finance/ar',
      'AP Payment':'/finance/ap',
      'Expense':'/expenses',
      'Sales Return':'/sales-return',
    }
    const type = issue.includes('could not be loaded') ? 'DATA' : issue.includes('mapping') || issue.includes('selected') ? 'MAPPING' : issue.includes('Duplicate') ? 'DUPLICATE' : 'AMOUNT'
    const severity = issue.includes('could not be loaded') || issue.includes('exceeds') || issue.includes('non-positive') ? 'HIGH' : 'REVIEW'
    return { source, href: source ? href[source] : undefined, type, severity }
  }

  const openEntry = (x: Entry) => {
    const routes: Record<string,string> = {
      'POS Sale':'/reports/sales',
      'AR Payment':'/finance/ar',
      'AP Payment':'/finance/ap',
      'Expense':'/expenses',
      'Sales Return':'/sales-return',
    }
    window.location.href = routes[x.source] || '/finance/money-flow'
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Finance • Audit</p>
            <h1 className="text-2xl md:text-3xl font-bold" style={{color:'var(--color-text)'}}>💰 Money Flow Ledger</h1>
            <p className="text-sm mt-1" style={{color:'var(--color-text-secondary)'}}>ငွေဝင် / ငွေထွက်ကို source တစ်ခုတည်းကနေ audit လုပ်ရန်</p>
          </div>
          <button onClick={load} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white active:scale-95">↻ Refresh</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div className="material-control rounded-2xl p-4" style={{background:'var(--color-card)',border:'1px solid var(--color-border)'}}>
            <label className="text-xs font-semibold" style={{color:'var(--color-text-secondary)'}}>From</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-full mt-2 p-2.5 rounded-xl" style={{background:'var(--color-bg)',color:'var(--color-text)',border:'1px solid var(--color-border)'}}/>
          </div>
          <div className="material-control rounded-2xl p-4" style={{background:'var(--color-card)',border:'1px solid var(--color-border)'}}>
            <label className="text-xs font-semibold" style={{color:'var(--color-text-secondary)'}}>To</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-full mt-2 p-2.5 rounded-xl" style={{background:'var(--color-bg)',color:'var(--color-text)',border:'1px solid var(--color-border)'}}/>
          </div>
        </div>

        <div className="rounded-2xl p-4 mb-4" style={{background:'var(--color-card)',border:'1px solid var(--color-border)'}}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-bold" style={{color:'var(--color-text)'}}>⚠️ Audit Issues</div>
              <div className="text-xs mt-1" style={{color:'var(--color-text-secondary)'}}>Data mapping / loading anomalies that need review — not a claim of accounting error.</div>
            </div>
            <button onClick={()=>setIssueFilter(v=>!v)} className={`px-2.5 py-1 rounded-full text-xs font-bold ${auditIssues.length ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>{auditIssues.filter(i=>!resolvedIssues.has(i)).length ? auditIssues.filter(i=>!resolvedIssues.has(i)).length + ' review' : '✓ Clear'}</button>
          </div>
          {auditIssues.length > 0 && <div className="mt-3 space-y-1.5">
            {auditIssues.filter(issue => !resolvedIssues.has(issue)).slice(0,6).map((issue,i)=>{
              const meta = issueMeta(issue)
              return <div key={issue} className="rounded-lg px-3 py-2 bg-orange-50 text-orange-800">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/70">{meta.severity}</span>
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/70">{meta.type}</span>
                  <span className="text-xs flex-1">{issue}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {meta.href && <button onClick={()=>{ if(meta.href) window.location.href=meta.href }} className="text-[10px] font-semibold underline">Review {meta.source}</button>}
                  <button onClick={()=>setResolvedIssues(prev=>new Set(prev).add(issue))} className="text-[10px] font-semibold opacity-70 hover:opacity-100">Mark reviewed</button>
                </div>
              </div>
            })}
            {issueFilter && auditIssues.length > 0 && <div className="mt-2 text-xs font-semibold text-blue-600">Filtered to records associated with review issues</div>}
            {auditIssues.filter(issue => !resolvedIssues.has(issue)).length > 6 && <div className="text-[10px]" style={{color:'var(--color-text-secondary)'}}>+{auditIssues.filter(issue => !resolvedIssues.has(issue)).length-6} more issues</div>}
          </div>}
          {lastRefreshed && <div className="mt-2 text-[10px]" style={{color:'var(--color-text-secondary)'}}>Last refreshed: {lastRefreshed}</div>}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <button onClick={()=>setFilter(filter==='in'?'all':'in')} className="rounded-2xl p-4 text-left border transition-all" style={{background:'linear-gradient(135deg,#f0fdf4,#dcfce7)',borderColor:'#86efac'}}>
            <div className="text-xs font-semibold text-green-700">Money In</div><div className="text-xl md:text-2xl font-bold text-green-700">{money(totalIn)}</div>
          </button>
          <button onClick={()=>setFilter(filter==='out'?'all':'out')} className="rounded-2xl p-4 text-left border transition-all" style={{background:'linear-gradient(135deg,#fff7ed,#ffedd5)',borderColor:'#fdba74'}}>
            <div className="text-xs font-semibold text-orange-700">Money Out</div><div className="text-xl md:text-2xl font-bold text-orange-700">{money(totalOut)}</div>
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          <button onClick={()=>setSource('all')} className={`px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${source==='all'?'bg-blue-600 text-white':'bg-gray-100 text-gray-600'}`}>All Sources</button>
          {sources.map(s=><button key={s} onClick={()=>setSource(s)} className={`px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${source===s?'bg-blue-600 text-white':'bg-gray-100 text-gray-600'}`}>{s}</button>)}
        </div>

        <div className="rounded-2xl p-4 mb-4" style={{background:'var(--color-card)',border:'1px solid var(--color-border)'}}>
          <div className="flex items-center justify-between mb-3">
            <div><div className="font-bold" style={{color:'var(--color-text)'}}>🏦 Account Reconciliation</div><div className="text-xs" style={{color:'var(--color-text-secondary)'}}>ရွေးထားသောကာလအတွင်း account တစ်ခုချင်းစီ၏ recorded flow ကို စစ်ရန်</div></div>
          </div>
          <div className="space-y-2">
            {accountReconciliation.map(a => <div key={a.account} className="rounded-xl px-3 py-2" style={{background:'var(--color-bg)'}}>
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold truncate">{a.account}</span><span className="text-xs whitespace-nowrap"><span className="text-green-600">+{money(a.in)}</span> · <span className="text-orange-600">-{money(a.out)}</span> · <b>Net {money(a.net)}</b></span></div>
              {a.current !== null && <div className="mt-1 text-[10px] flex justify-between" style={{color:'var(--color-text-secondary)'}}><span>Current recorded: {money(a.current)}</span><span>Derived before period: {money(a.expected!)}</span></div>}
            </div>)}
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{background:'var(--color-card)',border:'1px solid var(--color-border)'}}>
          {loading ? <div className="p-12 text-center" style={{color:'var(--color-text-secondary)'}}>Loading ledger…</div> : filtered.length===0 ? <div className="p-12 text-center" style={{color:'var(--color-text-secondary)'}}>📭 ဒီကာလအတွင်း Money Flow record မရှိပါ</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{background:'var(--color-bg)'}}><tr>
                  {['Date','Source','Flow','Amount','Account','Reference'].map(h=><th key={h} className="p-3 text-left text-xs font-semibold" style={{color:'var(--color-text-secondary)'}}>{h}</th>)}
                </tr></thead>
                <tbody>{filtered.map(x=><tr key={x.id} className="border-t" style={{borderColor:'var(--color-border)'}}>
                  <td className="p-3 whitespace-nowrap">{new Date(x.date).toLocaleString()}</td>
                  <td className="p-3 font-semibold whitespace-nowrap">{x.source}<div className="text-[10px] font-normal" style={{color:'var(--color-text-secondary)'}}>{x.note}</div></td>
                  <td className={`p-3 font-bold ${x.direction==='in'?'text-green-600':'text-orange-600'}`}>{x.direction==='in'?'IN':'OUT'}</td>
                  <td className="p-3 text-right font-bold whitespace-nowrap">{money(x.amount)}</td>
                  <td className="p-3 whitespace-nowrap">{x.account}</td>
                  <td className="p-3 font-mono text-xs"><button onClick={()=>openEntry(x)} className="underline underline-offset-2 hover:opacity-70">{x.reference}</button></td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
