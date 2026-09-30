/**
 * FuzzyMatcher — Phonetic + edit-distance matching for STT correction
 *
 * Core challenge: Browser STT outputs phonetically-similar but spelling-wrong
 * Myanmar text. e.g. "ဆိုက်ဖုန်း" instead of "iPhone", or "ကျပ်ပ" instead of "ကျပ်".
 *
 * Strategy:
 * 1. Tokenize input into n-grams (1-4 word windows)
 * 2. For each window, find vocab matches via:
 *    a) Exact match (after normalize)
 *    b) Edit distance (Levenshtein) — handles minor typos
 *    c) Phonetic similarity — handles homophones
 * 3. Replace if confidence > threshold and length-ratio is sane
 */

import { getAll, normalize, detectScript, type VocabEntry } from './vocabStore'

/* ─── Edit distance ─────────────────────────────────────────────────────── */

/**
 * Levenshtein distance between two strings.
 * Operates on Unicode code points (important for Myanmar combining chars).
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  // Use Array.from to handle surrogate pairs / combining marks correctly
  const aArr = Array.from(a)
  const bArr = Array.from(b)
  const m = aArr.length
  const n = bArr.length

  // Single-row DP
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = aArr[i - 1] === bArr[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/**
 * Similarity ratio 0..1 (1 = identical). Based on edit distance.
 */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1
  const maxLen = Math.max(Array.from(a).length, Array.from(b).length)
  if (maxLen === 0) return 1
  const dist = editDistance(a, b)
  return 1 - dist / maxLen
}

/* ─── Myanmar phonetic folding ──────────────────────────────────────────── */

/**
 * Folds Myanmar characters that sound similar but are visually distinct.
 * This catches common STT confusions like ပ/ဖ, သ/ဇ, etc.
 *
 * Note: This is NOT a true phonetic transcription — just a coarse fold
 * to bucket near-homophones together.
 */
function foldMyanmar(s: string): string {
  return s
    // Tone marks - often dropped/added by STT
    .replace(/[\u102B\u102C]/g, '\u102C')   // ါ ာ -> ာ
    .replace(/[\u1037\u1038]/g, '')         // ့ း tone marks - drop
    .replace(/[\u103A]/g, '')                // ် asat - drop for fold
    .replace(/[\u1036]/g, '')                // ံ - drop
    // Vowel signs - normalize
    .replace(/\u1031/g, 'e')
    .replace(/[\u102D\u102E]/g, 'i')         // ိ ီ
    .replace(/[\u102F\u1030]/g, 'u')         // ု ူ
    // Common consonant confusions (STT often confuses these)
    .replace(/[\u1015\u1016]/g, 'p')         // ပ ဖ
    .replace(/[\u1017\u1018]/g, 'b')         // ဗ ဘ
    .replace(/[\u1010\u1011]/g, 't')         // တ ထ
    .replace(/[\u1012\u1013]/g, 'd')         // ဒ ဓ
    .replace(/[\u1000\u1001]/g, 'k')         // က ခ
    .replace(/[\u1002\u1003]/g, 'g')         // ဂ ဃ
    .replace(/[\u101E\u1007]/g, 's')         // သ ဇ
    .replace(/[\u101A\u101B]/g, 'y')         // ယ ရ
    .replace(/[\u101C\u101D]/g, 'l')         // လ ဝ
    .replace(/[\u1014\u1023]/g, 'n')         // န ဣ-ish
    .replace(/[\u1019]/g, 'm')               // မ
    // medial signs
    .replace(/[\u103B\u103C]/g, 'y')         // ြ ျ
    .replace(/[\u103D\u103E]/g, 'w')         // ွ ှ
    .replace(/\s+/g, '')
}

/**
 * Returns a phonetic key for a string. Used as a fast bucket.
 */
function phoneticKey(s: string): string {
  if (!s) return ''
  const script = detectScript(s)
  if (script === 'mm' || script === 'mixed') {
    return foldMyanmar(s)
  }
  // For Latin/Thai, just lowercase + strip vowels (very crude soundex-ish)
  return s.toLowerCase().replace(/[aeiou]/g, '').replace(/\s+/g, '')
}

/* ─── Match a single token against vocab ────────────────────────────────── */

export interface MatchResult {
  original: string
  matched: string
  confidence: number       // 0..1
  method: 'exact' | 'edit' | 'phonetic'
  entry: VocabEntry
}

interface MatcherState {
  exactMap: Map<string, VocabEntry>
  phoneticMap: Map<string, VocabEntry[]>
  byNormalized: VocabEntry[]
  builtAt: number
}

let matcherCache: MatcherState | null = null
const CACHE_TTL_MS = 5000

function buildMatcher(): MatcherState {
  if (matcherCache && Date.now() - matcherCache.builtAt < CACHE_TTL_MS) {
    return matcherCache
  }
  const all = getAll()
  const exactMap = new Map<string, VocabEntry>()
  const phoneticMap = new Map<string, VocabEntry[]>()

  for (const e of all) {
    // exact (normalized) lookup — keep highest weight
    const existing = exactMap.get(e.normalized)
    if (!existing || e.weight > existing.weight) {
      exactMap.set(e.normalized, e)
    }
    // phonetic bucket
    const pk = phoneticKey(e.term)
    if (pk) {
      if (!phoneticMap.has(pk)) phoneticMap.set(pk, [])
      phoneticMap.get(pk)!.push(e)
    }
  }
  matcherCache = {
    exactMap,
    phoneticMap,
    byNormalized: all,
    builtAt: Date.now(),
  }
  return matcherCache
}

export function invalidateMatcher() {
  matcherCache = null
}

/**
 * Find best match for a single token/phrase against the vocabulary.
 * Returns null if no good match found.
 */
export function findBestMatch(
  token: string,
  opts: { minConfidence?: number; maxEditDist?: number } = {}
): MatchResult | null {
  const minConfidence = opts.minConfidence ?? 0.78
  const maxEditDist = opts.maxEditDist ?? 2

  const norm = normalize(token)
  if (!norm) return null

  const m = buildMatcher()

  // 1) Exact match
  const exact = m.exactMap.get(norm)
  if (exact) {
    return {
      original: token,
      matched: exact.term,
      confidence: 1,
      method: 'exact',
      entry: exact,
    }
  }

  // 2) Phonetic bucket
  const pk = phoneticKey(token)
  const candidates: VocabEntry[] = []
  if (pk && m.phoneticMap.has(pk)) {
    candidates.push(...m.phoneticMap.get(pk)!)
  }

  // Add edit-distance candidates from anything with similar length
  const tokenLen = Array.from(norm).length
  if (tokenLen <= 8) {
    // For short tokens, scan all (cheap enough)
    for (const e of m.byNormalized) {
      const eLen = Array.from(e.normalized).length
      if (Math.abs(eLen - tokenLen) <= maxEditDist) {
        candidates.push(e)
      }
    }
  } else {
    // For long tokens, only scan similar-length entries
    for (const e of m.byNormalized) {
      const eLen = Array.from(e.normalized).length
      if (Math.abs(eLen - tokenLen) <= Math.max(maxEditDist, Math.floor(tokenLen * 0.25))) {
        candidates.push(e)
      }
    }
  }

  if (!candidates.length) return null

  let best: MatchResult | null = null
  const seen = new Set<string>()
  for (const e of candidates) {
    if (seen.has(e.normalized)) continue
    seen.add(e.normalized)

    const sim = similarity(norm, e.normalized)
    if (sim < minConfidence) continue

    // Bias toward higher-weight entries (custom > system > dynamic)
    const adjustedConf = Math.min(1, sim + (e.weight - 1) * 0.02)

    if (!best || adjustedConf > best.confidence) {
      const dist = editDistance(norm, e.normalized)
      best = {
        original: token,
        matched: e.term,
        confidence: adjustedConf,
        method: dist === 0 ? 'exact' : pk === phoneticKey(e.term) ? 'phonetic' : 'edit',
        entry: e,
      }
    }
  }

  return best
}

/* ─── Sentence-level correction ─────────────────────────────────────────── */

export interface CorrectionResult {
  original: string
  corrected: string
  changes: Array<{ from: string; to: string; confidence: number; method: string }>
}

/**
 * Tokenize a sentence respecting Myanmar word boundaries.
 * Myanmar doesn't use spaces between words, so we use a sliding window approach.
 */
function tokenizeSentence(sentence: string): string[] {
  // Split on whitespace and Myanmar punctuation, keep delimiters
  return sentence.split(/(\s+|[\u104A\u104B,.!?])/g).filter(Boolean)
}

/**
 * Correct a full sentence by sliding-window matching against vocab.
 * Tries multi-word phrases first (longer matches preferred).
 */
export function correctSentence(
  sentence: string,
  opts: { minConfidence?: number; maxWindow?: number } = {}
): CorrectionResult {
  const minConfidence = opts.minConfidence ?? 0.82
  const maxWindow = opts.maxWindow ?? 4

  if (!sentence) return { original: sentence, corrected: sentence, changes: [] }

  const tokens = tokenizeSentence(sentence)
  const wordIdx: number[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (!/^\s+$/.test(tokens[i]) && !/^[\u104A\u104B,.!?]$/.test(tokens[i])) {
      wordIdx.push(i)
    }
  }

  const replacements = new Map<number, { length: number; replacement: string; from: string; conf: number; method: string }>()
  const consumed = new Set<number>()

  // Try larger windows first (greedy longest match)
  for (let win = Math.min(maxWindow, wordIdx.length); win >= 1; win--) {
    for (let i = 0; i + win <= wordIdx.length; i++) {
      // skip if any of these word positions already consumed
      let skip = false
      for (let k = 0; k < win; k++) {
        if (consumed.has(wordIdx[i + k])) { skip = true; break }
      }
      if (skip) continue

      const startTok = wordIdx[i]
      const endTok = wordIdx[i + win - 1]
      const phrase = tokens.slice(startTok, endTok + 1).join('')
      // require minimum chars for multi-word matches
      if (win > 1 && phrase.length < 3) continue
      if (win === 1 && Array.from(phrase).length < 2) continue   // skip 1-char tokens

      // Multi-word matches need higher confidence
      const conf = win > 1 ? Math.max(minConfidence, 0.85) : minConfidence
      const match = findBestMatch(phrase, { minConfidence: conf })
      if (match && match.matched !== phrase) {
        replacements.set(startTok, {
          length: endTok - startTok + 1,
          replacement: match.matched,
          from: phrase,
          conf: match.confidence,
          method: match.method,
        })
        for (let k = 0; k < win; k++) consumed.add(wordIdx[i + k])
      } else if (match && match.matched === phrase) {
        // exact match — mark consumed but no replacement
        for (let k = 0; k < win; k++) consumed.add(wordIdx[i + k])
      }
    }
  }

  // Apply replacements
  const out: string[] = []
  const changes: CorrectionResult['changes'] = []
  let i = 0
  while (i < tokens.length) {
    const rep = replacements.get(i)
    if (rep) {
      out.push(rep.replacement)
      changes.push({ from: rep.from, to: rep.replacement, confidence: rep.conf, method: rep.method })
      i += rep.length
    } else {
      out.push(tokens[i])
      i++
    }
  }

  return {
    original: sentence,
    corrected: out.join(''),
    changes,
  }
}
