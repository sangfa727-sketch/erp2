// ============================================================================
// Burmese Number Parser
// ============================================================================
// Converts Myanmar number expressions to integers.
// Handles: digit words (တစ်, နှစ်, ...), multipliers (ဆယ်, ရာ, ထောင်, ...),
// Burmese digits (၁၂၃), Arabic digits, and mixed forms.
// ============================================================================

// Digit words (sorted longest-first for greedy match)
const DIGIT_TOKENS: Array<[string, number]> = [
  ['ခြောက်', 6],
  ['ခုနှစ်', 7],
  ['ခုနစ်', 7],
  ['သုံး', 3],
  ['လေး', 4],
  ['ငါး', 5],
  ['ရှစ်', 8],
  ['ကိုး', 9],
  ['တစ်', 1],
  ['နှစ်', 2],
  ['သုည', 0],
];

// Multiplier words
const MULTIPLIER_TOKENS: Array<[string, number]> = [
  ['ကုဋေ', 10000000],
  ['သန်း', 1000000],
  ['သိန်း', 100000],
  ['သောင်း', 10000],
  ['ထောင်', 1000],
  ['ရာ', 100],
  ['ဆယ်', 10],
];

const BURMESE_TO_ARABIC: Record<string, string> = {
  '၀': '0', '၁': '1', '၂': '2', '၃': '3', '၄': '4',
  '၅': '5', '၆': '6', '၇': '7', '၈': '8', '၉': '9',
};

/** Convert Burmese numeral characters (၁၂၃) to Arabic (123) */
export function normalizeBurmeseDigits(text: string): string {
  return text.replace(/[၀-၉]/g, c => BURMESE_TO_ARABIC[c] || c);
}

interface Token {
  type: 'digit' | 'multiplier' | 'number';
  value: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    // Skip whitespace and common separators
    if (/[\s,၊။]/.test(text[i])) { i++; continue; }

    // Try Arabic number
    const numMatch = text.slice(i).match(/^\d+/);
    if (numMatch) {
      tokens.push({ type: 'number', value: parseInt(numMatch[0], 10) });
      i += numMatch[0].length;
      continue;
    }

    // Try multipliers first (longer/specific words)
    let matched = false;
    for (const [tok, val] of MULTIPLIER_TOKENS) {
      if (text.startsWith(tok, i)) {
        tokens.push({ type: 'multiplier', value: val });
        i += tok.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Try digit words
    for (const [tok, val] of DIGIT_TOKENS) {
      if (text.startsWith(tok, i)) {
        tokens.push({ type: 'digit', value: val });
        i += tok.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Unknown char - skip
    i++;
  }

  return tokens;
}

function parseTokens(tokens: Token[]): number | null {
  if (tokens.length === 0) return null;

  let total = 0;
  let pending = 0;
  let hasPending = false;

  for (const t of tokens) {
    if (t.type === 'digit' || t.type === 'number') {
      // Commit any prior pending digit alone before starting new
      if (hasPending) total += pending;
      pending = t.value;
      hasPending = true;
    } else if (t.type === 'multiplier') {
      const mult = hasPending ? pending : 1;
      total += mult * t.value;
      hasPending = false;
    }
  }

  if (hasPending) total += pending;
  return total > 0 ? total : null;
}

/**
 * Main entry point — converts Burmese number expression to integer.
 * Returns null if no number found.
 *
 * Examples:
 *   parseBurmeseNumber('တစ်ဆယ်')         → 10
 *   parseBurmeseNumber('နှစ်ဆယ်ငါး')      → 25
 *   parseBurmeseNumber('တစ်သိန်းငါးသောင်း') → 150000
 *   parseBurmeseNumber('၁၀၀,၀၀၀')        → 100000
 *   parseBurmeseNumber('500')             → 500
 */
export function parseBurmeseNumber(input: string): number | null {
  if (!input) return null;
  const normalized = normalizeBurmeseDigits(input).trim();
  if (!normalized) return null;

  // Pure Arabic numeric (after Burmese digit normalization)
  const stripped = normalized.replace(/[\s,၊။]/g, '');
  if (/^\d+$/.test(stripped)) {
    return parseInt(stripped, 10);
  }

  return parseTokens(tokenize(normalized));
}

/**
 * Find the FIRST number expression in a longer text and return both the
 * value and the matched span. Useful for "ပန်းသီး ၁၀ လုံး" extraction.
 */
export function findFirstNumber(text: string): { value: number; matchStart: number; matchEnd: number } | null {
  const normalized = normalizeBurmeseDigits(text);

  // Try Arabic numbers first
  const arabicMatch = normalized.match(/\d[\d,]*/);
  if (arabicMatch && arabicMatch.index !== undefined) {
    const val = parseInt(arabicMatch[0].replace(/,/g, ''), 10);
    return {
      value: val,
      matchStart: arabicMatch.index,
      matchEnd: arabicMatch.index + arabicMatch[0].length,
    };
  }

  // Find earliest digit-word position and extract contiguous number expression
  let earliestStart = -1;
  for (const [tok] of DIGIT_TOKENS) {
    const idx = normalized.indexOf(tok);
    if (idx !== -1 && (earliestStart === -1 || idx < earliestStart)) {
      earliestStart = idx;
    }
  }
  if (earliestStart === -1) return null;

  // Greedy expand right while tokens are digit/multiplier
  let end = earliestStart;
  let cursor = earliestStart;
  while (cursor < normalized.length) {
    let advanced = false;
    for (const [tok] of [...DIGIT_TOKENS, ...MULTIPLIER_TOKENS]) {
      if (normalized.startsWith(tok, cursor)) {
        cursor += tok.length;
        end = cursor;
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      // Allow single whitespace inside number expression
      if (/\s/.test(normalized[cursor])) {
        cursor++;
        continue;
      }
      break;
    }
  }

  const span = normalized.slice(earliestStart, end);
  const val = parseBurmeseNumber(span);
  if (val === null) return null;
  return { value: val, matchStart: earliestStart, matchEnd: end };
}
