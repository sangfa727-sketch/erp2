// ============================================================================
// Product Fuzzy Matcher
// ============================================================================
// Matches noisy STT transcription tokens against the product catalog using
// Levenshtein distance + substring boost. Returns null if no match meets
// confidence threshold.
// ============================================================================

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = b.length, n = a.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost      // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export interface Product {
  id: string;
  name: string;
  selling_price?: number;
  unit?: string | null;
  stock_qty?: number;
}

export interface MatchResult {
  product: Product;
  score: number;       // 0..1
  matchedAs: string;   // The transcript token that matched
}

/**
 * Find best product match across all products. Returns null if no match
 * meets minimum confidence (default 0.55).
 */
export function fuzzyMatchProduct(
  query: string,
  products: Product[],
  minScore = 0.55
): MatchResult | null {
  if (!query || products.length === 0) return null;
  const q = query.trim();
  if (!q) return null;

  let best: MatchResult | null = null;

  for (const p of products) {
    const name = p.name.trim();
    if (!name) continue;

    // 1. Exact equality wins immediately
    if (name === q) {
      return { product: p, score: 1, matchedAs: q };
    }

    // 2. Substring containment is strong evidence
    let score = similarity(q.toLowerCase(), name.toLowerCase());
    if (q.includes(name) || name.includes(q)) {
      score = Math.max(score, 0.9);
    }

    if (!best || score > best.score) {
      best = { product: p, score, matchedAs: q };
    }
  }

  return best && best.score >= minScore ? best : null;
}

/**
 * Scan a free-text transcript for product name mentions.
 * Strategy: try exact substring match for each product (longest-first),
 * then fuzzy match remaining ungrouped tokens.
 */
export function findProductMentions(
  transcript: string,
  products: Product[]
): Array<{ product: Product; matchStart: number; matchEnd: number; score: number }> {
  const results: Array<{ product: Product; matchStart: number; matchEnd: number; score: number }> = [];

  // Sort longest name first to avoid partial matches eating longer ones
  const sorted = [...products].sort((a, b) => b.name.length - a.name.length);

  const consumed = new Array(transcript.length).fill(false);

  for (const p of sorted) {
    const name = p.name.trim();
    if (!name) continue;

    // Find all occurrences of this exact name
    let searchFrom = 0;
    while (searchFrom < transcript.length) {
      const idx = transcript.indexOf(name, searchFrom);
      if (idx === -1) break;
      // Make sure not already consumed
      let overlap = false;
      for (let k = idx; k < idx + name.length; k++) {
        if (consumed[k]) { overlap = true; break; }
      }
      if (!overlap) {
        results.push({
          product: p,
          matchStart: idx,
          matchEnd: idx + name.length,
          score: 1,
        });
        for (let k = idx; k < idx + name.length; k++) consumed[k] = true;
      }
      searchFrom = idx + name.length;
    }
  }

  return results.sort((a, b) => a.matchStart - b.matchStart);
}
