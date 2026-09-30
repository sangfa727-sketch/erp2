/**
 * VocabStore — Client-side vocabulary management for STT correction
 *
 * Stores Myanmar/English/Thai terms extracted from UI for fuzzy matching
 * against Browser STT output. Persists in localStorage for offline use.
 *
 * Architecture:
 * - System vocab: pre-loaded ERP keywords (ကျပ်, သိန်း, အရောင်း, etc.)
 * - Dynamic vocab: auto-extracted from DOM as user navigates pages
 * - Custom vocab: user-confirmed corrections (learned from mistakes)
 */

const STORAGE_KEY = 'stillastock_vocab_v1'
const MAX_DYNAMIC = 5000   // cap to prevent localStorage bloat
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000   // 30 days

export type VocabSource = 'system' | 'dynamic' | 'custom'

export interface VocabEntry {
  term: string             // canonical form (what AI should see)
  normalized: string       // for matching (lowercased, stripped)
  source: VocabSource
  weight: number           // higher = preferred match (custom > system > dynamic)
  lastSeen: number         // timestamp ms
  category?: string        // 'product' | 'contact' | 'category' | 'unit' | 'amount'
}

interface VocabSnapshot {
  entries: Record<string, VocabEntry>   // keyed by normalized form
  updatedAt: number
}

/* ─── Normalization ─────────────────────────────────────────────────────── */

/**
 * Normalize a string for matching. Strips punctuation, lowercases Latin,
 * keeps Myanmar/Thai chars intact, collapses whitespace.
 */
export function normalize(s: string): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')   // zero-width chars
    .replace(/[!-/:-@\[-`{-~]/g, ' ')         // ASCII punctuation
    .replace(/[\u104A\u104B]/g, ' ')          // Myanmar punctuation ၊ ။
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Detect script of a string. Used to bucket terms by language.
 */
export function detectScript(s: string): 'mm' | 'th' | 'latin' | 'mixed' | 'other' {
  if (!s) return 'other'
  const mm = /[\u1000-\u109F\uAA60-\uAA7F]/.test(s)
  const th = /[\u0E00-\u0E7F]/.test(s)
  const latin = /[a-zA-Z]/.test(s)
  const flags = [mm, th, latin].filter(Boolean).length
  if (flags > 1) return 'mixed'
  if (mm) return 'mm'
  if (th) return 'th'
  if (latin) return 'latin'
  return 'other'
}

/* ─── System vocabulary (pre-loaded ERP terms) ──────────────────────────── */

const SYSTEM_TERMS: Array<{ term: string; category?: string }> = [
  // Currency / amounts
  { term: 'ကျပ်', category: 'unit' },
  { term: 'သိန်း', category: 'unit' },
  { term: 'သောင်း', category: 'unit' },
  { term: 'သန်း', category: 'unit' },
  { term: 'ဒေါ်လာ', category: 'unit' },
  { term: 'ဘတ်', category: 'unit' },

  // Quantity units
  { term: 'ခု', category: 'unit' },
  { term: 'လုံး', category: 'unit' },
  { term: 'ပိဿာ', category: 'unit' },
  { term: 'ကီလို', category: 'unit' },
  { term: 'ဂရမ်', category: 'unit' },
  { term: 'ထုပ်', category: 'unit' },
  { term: 'ဘူး', category: 'unit' },
  { term: 'ပုံး', category: 'unit' },
  { term: 'ကတ်တွန်း', category: 'unit' },
  { term: 'ဒါဇင်', category: 'unit' },

  // ERP actions
  { term: 'အရောင်း', category: 'action' },
  { term: 'အဝယ်', category: 'action' },
  { term: 'ဝယ်ယူ', category: 'action' },
  { term: 'ရောင်းချ', category: 'action' },
  { term: 'စာရင်းသွင်း', category: 'action' },
  { term: 'ပြောင်း', category: 'action' },
  { term: 'ဖျက်', category: 'action' },
  { term: 'ပြ', category: 'action' },
  { term: 'ထည့်', category: 'action' },
  { term: 'နုတ်', category: 'action' },
  { term: 'ပြန်အမ်း', category: 'action' },
  { term: 'အကြွေးဆပ်', category: 'action' },

  // ERP entities
  { term: 'ပစ္စည်း', category: 'entity' },
  { term: 'ကုန်ပစ္စည်း', category: 'entity' },
  { term: 'လက်ကျန်', category: 'entity' },
  { term: 'အရောင်းစာရင်း', category: 'entity' },
  { term: 'ဝယ်ယူမှု', category: 'entity' },
  { term: 'ဖောက်သည်', category: 'entity' },
  { term: 'ဝယ်သူ', category: 'entity' },
  { term: 'ရောင်းသူ', category: 'entity' },
  { term: 'ပစ္စည်းပေးသွင်းသူ', category: 'entity' },
  { term: 'အကြွေး', category: 'entity' },
  { term: 'ငွေသွင်း', category: 'entity' },
  { term: 'ငွေထုတ်', category: 'entity' },
  { term: 'ဘဏ်', category: 'entity' },
  { term: 'ငွေသား', category: 'entity' },
  { term: 'အသုံးစရိတ်', category: 'entity' },
  { term: 'ဝန်ထမ်း', category: 'entity' },
  { term: 'ပို့ဆောင်မှု', category: 'entity' },
  { term: 'ပျက်စီးပစ္စည်း', category: 'entity' },

  // Time
  { term: 'ဒီနေ့', category: 'time' },
  { term: 'မနေ့က', category: 'time' },
  { term: 'မနက်ဖြန်', category: 'time' },
  { term: 'အပတ်', category: 'time' },
  { term: 'လ', category: 'time' },
  { term: 'နှစ်', category: 'time' },

  // Numbers (Myanmar)
  { term: 'တစ်', category: 'number' },
  { term: 'နှစ်', category: 'number' },
  { term: 'သုံး', category: 'number' },
  { term: 'လေး', category: 'number' },
  { term: 'ငါး', category: 'number' },
  { term: 'ခြောက်', category: 'number' },
  { term: 'ခုနစ်', category: 'number' },
  { term: 'ရှစ်', category: 'number' },
  { term: 'ကိုး', category: 'number' },
  { term: 'ဆယ်', category: 'number' },
  { term: 'ရာ', category: 'number' },
  { term: 'ထောင်', category: 'number' },
]

/* ─── Storage ───────────────────────────────────────────────────────────── */

let memCache: VocabSnapshot | null = null

function load(): VocabSnapshot {
  if (memCache) return memCache
  if (typeof window === 'undefined') {
    memCache = { entries: {}, updatedAt: Date.now() }
    return memCache
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as VocabSnapshot
      memCache = parsed
      return parsed
    }
  } catch {}
  // first-time: seed with system terms
  const seeded: VocabSnapshot = { entries: {}, updatedAt: Date.now() }
  for (const t of SYSTEM_TERMS) {
    const norm = normalize(t.term)
    if (!norm) continue
    seeded.entries[norm] = {
      term: t.term,
      normalized: norm,
      source: 'system',
      weight: 2,
      lastSeen: Date.now(),
      category: t.category,
    }
  }
  memCache = seeded
  persist()
  return seeded
}

function persist() {
  if (typeof window === 'undefined' || !memCache) return
  try {
    // prune if oversized
    const entries = memCache.entries
    const keys = Object.keys(entries)
    if (keys.length > MAX_DYNAMIC) {
      // drop oldest dynamic entries
      const dynamicKeys = keys
        .filter(k => entries[k].source === 'dynamic')
        .sort((a, b) => entries[a].lastSeen - entries[b].lastSeen)
      const toDrop = keys.length - MAX_DYNAMIC
      for (let i = 0; i < toDrop && i < dynamicKeys.length; i++) {
        delete entries[dynamicKeys[i]]
      }
    }
    // prune stale
    const cutoff = Date.now() - MAX_AGE_MS
    for (const k of Object.keys(entries)) {
      if (entries[k].source === 'dynamic' && entries[k].lastSeen < cutoff) {
        delete entries[k]
      }
    }
    memCache.updatedAt = Date.now()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memCache))
  } catch (e) {
    // localStorage full or disabled — silent fail
  }
}

/* ─── Public API ────────────────────────────────────────────────────────── */

/**
 * Add a single term to the vocabulary.
 */
export function addTerm(term: string, source: VocabSource = 'dynamic', category?: string) {
  if (!term) return
  const trimmed = term.trim()
  if (trimmed.length < 1 || trimmed.length > 100) return
  const norm = normalize(trimmed)
  if (!norm) return

  const snap = load()
  const existing = snap.entries[norm]
  const weight = source === 'custom' ? 3 : source === 'system' ? 2 : 1

  if (existing) {
    // upgrade weight if better source, refresh lastSeen
    existing.lastSeen = Date.now()
    if (weight > existing.weight) {
      existing.source = source
      existing.weight = weight
      if (category) existing.category = category
    }
  } else {
    snap.entries[norm] = {
      term: trimmed,
      normalized: norm,
      source,
      weight,
      lastSeen: Date.now(),
      category,
    }
  }
  persist()
}

/**
 * Bulk add terms (e.g. from a DOM scan).
 */
export function addTerms(terms: string[], source: VocabSource = 'dynamic', category?: string) {
  if (!terms?.length) return
  const snap = load()
  const weight = source === 'custom' ? 3 : source === 'system' ? 2 : 1
  let changed = false

  for (const raw of terms) {
    if (!raw) continue
    const trimmed = raw.trim()
    if (trimmed.length < 1 || trimmed.length > 100) continue
    const norm = normalize(trimmed)
    if (!norm) continue

    const existing = snap.entries[norm]
    if (existing) {
      existing.lastSeen = Date.now()
      if (weight > existing.weight) {
        existing.source = source
        existing.weight = weight
        if (category) existing.category = category
        changed = true
      }
    } else {
      snap.entries[norm] = {
        term: trimmed,
        normalized: norm,
        source,
        weight,
        lastSeen: Date.now(),
        category,
      }
      changed = true
    }
  }
  if (changed) persist()
}

/**
 * Get all entries, optionally filtered.
 */
export function getAll(filter?: { source?: VocabSource; script?: ReturnType<typeof detectScript> }): VocabEntry[] {
  const snap = load()
  let entries = Object.values(snap.entries)
  if (filter?.source) entries = entries.filter(e => e.source === filter.source)
  if (filter?.script) entries = entries.filter(e => detectScript(e.term) === filter.script)
  return entries
}

/**
 * Get count for diagnostics.
 */
export function getStats() {
  const snap = load()
  const all = Object.values(snap.entries)
  return {
    total: all.length,
    system: all.filter(e => e.source === 'system').length,
    dynamic: all.filter(e => e.source === 'dynamic').length,
    custom: all.filter(e => e.source === 'custom').length,
    updatedAt: snap.updatedAt,
  }
}

/**
 * Clear everything except system terms (re-seeds system).
 */
export function reset() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
  memCache = null
  load()   // re-seed
}

/**
 * Mark a term as user-confirmed (custom). Promotes weight.
 */
export function confirmTerm(term: string, category?: string) {
  addTerm(term, 'custom', category)
}
