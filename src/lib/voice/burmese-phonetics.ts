// ============================================================================
// Burmese Phonetic Engine
// ============================================================================
// Converts Burmese words to phonetic keys for STT-error-tolerant matching.
//
// Design goals:
//   1. STT errors should produce same/similar phonetic key as original
//      (e.g., "ပန်းသီး" mishear "ပန်ဒီး" → same key)
//   2. Genuinely distinct words must produce DIFFERENT keys
//      (e.g., "သောင်း" 10k vs "သိန်း" 100k → MUST be distinct)
//   3. No tenant-specific training required — universal Burmese phonology
//   4. Latin characters (brand names like "Coca Cola") preserved
//
// Strategy:
//   - Strip noise: finals (်), tone marks (း ႔ ႕), zero-width chars
//   - Map consonants to phonetic class (က/ခ/ဂ → K, but ပ vs ဖ vs ဒ distinct)
//   - Normalize vowel pairs (ိ/ီ → I, ု/ူ → U)
//   - Collapse consecutive duplicates
//   - Compare via Levenshtein on the resulting keys
// ============================================================================

// ========== Consonant Phonetic Map ==========
// Grouped where genuinely confusable in STT, kept separate where distinct
const CONSONANT_MAP: Record<string, string> = {
  // Velar stops: k/kh/g/gh all sound similar in STT
  'က': 'K', 'ခ': 'K', 'ဂ': 'K', 'ဃ': 'K',
  // Velar nasal: ng (distinct)
  'င': 'G',
  // Palatal sibilants: c/hs/z (similar in STT)
  'စ': 'C', 'ဆ': 'C', 'ဇ': 'C', 'ဈ': 'C',
  // Palatal nasal: ny (sounds like y/ny)
  'ည': 'Y', 'ဉ': 'Y',
  // Retroflex (rare, treated like dental)
  'ဋ': 'T', 'ဌ': 'T', 'ဍ': 'D', 'ဎ': 'D', 'ဏ': 'N',
  // Dental stops: t/ht similar; d/dh similar
  'တ': 'T', 'ထ': 'T', 'ဒ': 'D', 'ဓ': 'D',
  // Dental nasal (distinct)
  'န': 'N',
  // Bilabials: p vs ph distinct; b/bh similar to p
  'ပ': 'P', 'ဖ': 'F', 'ဗ': 'P', 'ဘ': 'P',
  // Bilabial nasal (distinct)
  'မ': 'M',
  // Approximants
  'ယ': 'Y', 'ရ': 'R',
  'လ': 'L', 'ဠ': 'L',
  'ဝ': 'W',
  // Fricatives — keep th and h distinct
  'သ': 'S', 'ဿ': 'S',
  'ဟ': 'H',
  // Glottal a (vowel carrier, drop)
  'အ': '',
}

// ========== Vowel Map ==========
const VOWEL_MAP: Record<string, string> = {
  '\u102B': 'A', // ါ
  '\u102C': 'A', // ာ
  '\u102D': 'I', // ိ
  '\u102E': 'I', // ီ
  '\u102F': 'U', // ု
  '\u1030': 'U', // ူ
  '\u1031': 'E', // ေ
  '\u1032': 'E', // ဲ
}

// ========== Medial Map ==========
const MEDIAL_MAP: Record<string, string> = {
  '\u103B': 'Y', // ျ (ya medial)
  '\u103C': 'R', // ြ (ra medial)
  '\u103D': 'W', // ွ (wa medial)
  '\u103E': '',  // ှ (ha medial — aspiration, drop for STT tolerance)
}

// ========== Strip List ==========
// 0x103A = ်  virama (final marker — STT drops these constantly)
// 0x1037 = ႔  dot below tone
// 0x1038 = း  visarga tone
// 0x1039 = ္  stack consonant
// 0x103F = ဿ stacked sa (handle as သ already)
// 0x200B-0x200D = ZWSP/ZWNJ/ZWJ
const STRIP_REGEX = /[\u103A\u1037\u1038\u1039\u200B\u200C\u200D]/g

/**
 * Normalize string: Unicode NFC + strip Burmese tones/finals.
 */
export function normalizeForPhonetic(word: string): string {
  if (!word) return ''
  let s = word.normalize('NFC')
  s = s.replace(STRIP_REGEX, '')
  return s.trim()
}

/**
 * Generate phonetic key for a Burmese word (or mixed Burmese/Latin).
 *
 * Examples:
 *   "ပန်းသီး"  → "PNSI"   (apple)
 *   "ပန်ဒီး"   → "PNDI"   (apple mishear) — 75% similar
 *   "ဖန်တီး"   → "FNTI"   (different word) — 50% similar
 *   "သောင်း"   → "SOG"    (10000)
 *   "သိန်း"    → "SIN"    (100000) — distinct!
 */
export function burmesePhoneticKey(word: string): string {
  const normalized = normalizeForPhonetic(word)
  if (!normalized) return ''
  let result = ''
  for (const ch of normalized) {
    if (ch in CONSONANT_MAP) {
      result += CONSONANT_MAP[ch]
    } else if (ch in VOWEL_MAP) {
      result += VOWEL_MAP[ch]
    } else if (ch in MEDIAL_MAP) {
      result += MEDIAL_MAP[ch]
    } else if (/[a-zA-Z]/.test(ch)) {
      result += ch.toUpperCase()
    } else if (/\d/.test(ch)) {
      result += ch
    }
    // Skip unknown (punctuation, spaces, etc.)
  }
  // Collapse consecutive duplicates: PNNI → PNI
  result = result.replace(/(.)\1+/g, '$1')
  return result
}

// ========== Levenshtein Distance ==========
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const m = b.length, n = a.length
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/**
 * Pure phonetic similarity: 0..1 based on Levenshtein of phonetic keys.
 */
export function phoneticSimilarity(a: string, b: string): number {
  const keyA = burmesePhoneticKey(a)
  const keyB = burmesePhoneticKey(b)
  if (keyA === keyB && keyA !== '') return 1
  if (!keyA || !keyB) return 0
  const maxLen = Math.max(keyA.length, keyB.length)
  const dist = levenshtein(keyA, keyB)
  return Math.max(0, 1 - dist / maxLen)
}

/**
 * Combined similarity: phonetic (weighted) + character distance fallback.
 * Use this for product matching — more robust than either alone.
 */
export function combinedSimilarity(input: string, candidate: string): number {
  const phon = phoneticSimilarity(input, candidate)

  // Character-level fallback (on normalized form, not raw)
  const inputN = normalizeForPhonetic(input)
  const candN = normalizeForPhonetic(candidate)
  if (inputN === candN) return 1
  const charDist = levenshtein(inputN, candN)
  const charMax = Math.max(inputN.length, candN.length)
  const charScore = charMax === 0 ? 0 : Math.max(0, 1 - charDist / charMax)

  // Weighted: phonetic dominates (70%), char tie-breaks (30%)
  // But if either is very high alone, give credit
  const blended = phon * 0.7 + charScore * 0.3
  return Math.max(blended, Math.min(phon, 0.95))
}

/**
 * Find best match from a list of candidates. Returns null if best is below
 * threshold. Includes alternatives for disambiguation UI.
 */
export interface MatchResult<T> {
  best: { item: T; score: number; method: 'exact' | 'phonetic' | 'combined' }
  alternatives: Array<{ item: T; score: number }>
}

export function findBestMatch<T extends { name?: string }>(
  query: string,
  candidates: T[],
  options: { threshold?: number; getName?: (c: T) => string } = {}
): MatchResult<T> | null {
  const threshold = options.threshold ?? 0.55
  const getName = options.getName ?? ((c) => (c.name ?? ''))
  if (!query || candidates.length === 0) return null

  const scored = candidates
    .map((c) => ({
      item: c,
      score: combinedSimilarity(query, getName(c)),
      name: getName(c),
    }))
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  if (!top || top.score < threshold) return null

  // Method classification
  const phon = phoneticSimilarity(query, top.name)
  const method: 'exact' | 'phonetic' | 'combined' =
    top.score >= 0.99 ? 'exact'
    : phon >= 0.95 ? 'phonetic'
    : 'combined'

  return {
    best: { item: top.item, score: top.score, method },
    alternatives: scored
      .slice(1, 4)
      .filter((s) => s.score >= threshold * 0.85)
      .map((s) => ({ item: s.item, score: s.score })),
  }
}
