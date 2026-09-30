// ============================================================================
// Product Matcher v2 — Phonetic + Catalog Lookup
// ============================================================================
// Takes a product query (e.g., from Gemini transcript) and finds the best
// matching product in the catalog using phonetic similarity.
//
// Returns the matched product with confidence + alternatives for
// disambiguation when needed.
// ============================================================================

import { combinedSimilarity, phoneticSimilarity, findBestMatch } from './burmese-phonetics'

export interface Product {
  id: string
  name: string
  sale_price: number
  current_stock?: number
  unit?: string
  company_id?: string
}

export interface ProductMatch {
  product: Product
  confidence: number
  method: 'exact' | 'phonetic' | 'combined'
  alternatives: Array<{ product: Product; confidence: number }>
}

/**
 * Find the best matching product for a voice query.
 *
 * @param query The product name as transcribed (e.g., "ပန်ဒီး")
 * @param products Full product catalog for the company
 * @param threshold Minimum confidence to accept (default 0.55)
 */
export function matchProduct(
  query: string,
  products: Product[],
  threshold: number = 0.55
): ProductMatch | null {
  if (!query || products.length === 0) return null

  const result = findBestMatch(query, products, {
    threshold,
    getName: (p) => p.name,
  })

  if (!result) return null

  return {
    product: result.best.item,
    confidence: result.best.score,
    method: result.best.method,
    alternatives: result.alternatives.map((a) => ({
      product: a.item,
      confidence: a.score,
    })),
  }
}

/**
 * Check if the match is ambiguous — multiple products with similar scores.
 * If true, UI should ask user to disambiguate.
 */
export function isAmbiguousMatch(match: ProductMatch): boolean {
  if (match.alternatives.length === 0) return false
  const topScore = match.confidence
  const nextScore = match.alternatives[0].confidence
  // Ambiguous if top match is within 10% of the next
  return topScore - nextScore < 0.1
}

/**
 * Generate a TTS prompt for disambiguation.
 */
export function disambiguationPrompt(match: ProductMatch): string {
  const candidates = [match.product, ...match.alternatives.map((a) => a.product)]
    .slice(0, 3)
    .map((p) => p.name)
    .join('၊ ')
  return `${candidates} ထဲက ဘယ်ဟာလဲ?`
}
