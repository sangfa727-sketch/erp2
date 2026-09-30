// ============================================================================
// Sale Intent Parser
// ============================================================================
// Takes a noisy Burmese transcript + product catalog, produces structured
// sale items with confidence scores. Deterministic — NO LLM.
// ============================================================================

import { parseBurmeseNumber, normalizeBurmeseDigits, findFirstNumber } from './burmese-numbers';
import { Product, findProductMentions, fuzzyMatchProduct } from './product-matcher';

export interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  line_total: number;
  confidence: number;     // 0..1
  source_text: string;    // The portion of transcript that produced this item
}

export interface ParsedSale {
  transcript: string;
  normalized: string;
  items: SaleItem[];
  total: number;
  warnings: string[];
}

/**
 * Parse a sale from free-form Burmese transcript.
 *
 * Strategy:
 *   1. Find each product name mention in transcript
 *   2. For each mention, look in a window around it for a number (the qty)
 *   3. Default qty = 1 if no number found nearby
 *   4. Use product.selling_price as unit price
 */
export function parseSaleFromTranscript(
  transcript: string,
  products: Product[]
): ParsedSale {
  const normalized = normalizeBurmeseDigits(transcript);
  const warnings: string[] = [];

  if (!normalized.trim()) {
    return { transcript, normalized, items: [], total: 0, warnings: ['Empty transcript'] };
  }
  if (products.length === 0) {
    return { transcript, normalized, items: [], total: 0, warnings: ['No products in catalog'] };
  }

  // Step 1: Find product mentions
  const mentions = findProductMentions(normalized, products);

  if (mentions.length === 0) {
    warnings.push('ပစ္စည်းနာမည် မတွေ့ပါ');
    return { transcript, normalized, items: [], total: 0, warnings };
  }

  // Step 2: For each mention, find quantity in surrounding window
  const items: SaleItem[] = [];
  const WINDOW = 25; // chars before/after to look for qty

  for (let i = 0; i < mentions.length; i++) {
    const m = mentions[i];

    // Window boundaries — don't cross into next mention
    const prevEnd = i > 0 ? mentions[i - 1].matchEnd : 0;
    const nextStart = i + 1 < mentions.length ? mentions[i + 1].matchStart : normalized.length;

    const beforeStart = Math.max(prevEnd, m.matchStart - WINDOW);
    const afterEnd = Math.min(nextStart, m.matchEnd + WINDOW);

    const before = normalized.slice(beforeStart, m.matchStart);
    const after = normalized.slice(m.matchEnd, afterEnd);

    // Prefer number AFTER product name (more natural Burmese: "ပန်းသီး ၁၀")
    const afterNum = findFirstNumber(after);
    const beforeNum = findFirstNumber(before);

    let qty = 1;
    let confidence = 0.7; // default when no number found

    if (afterNum) {
      qty = afterNum.value;
      confidence = 1.0;
    } else if (beforeNum) {
      qty = beforeNum.value;
      confidence = 0.9;
    } else {
      warnings.push(`"${m.product.name}" အတွက် အရေအတွက် မတွေ့ပါ — ၁ ဟု ယူဆ`);
    }

    const unitPrice = Number(m.product.selling_price || 0);
    items.push({
      product_id: m.product.id,
      product_name: m.product.name,
      quantity: qty,
      unit: m.product.unit ?? null,
      unit_price: unitPrice,
      line_total: qty * unitPrice,
      confidence: confidence * m.score,
      source_text: normalized.slice(beforeStart, afterEnd).trim(),
    });

    // Warn about stock
    if (m.product.stock_qty !== undefined && qty > Number(m.product.stock_qty)) {
      warnings.push(
        `⚠️ "${m.product.name}" လက်ကျန် ${m.product.stock_qty} ${m.product.unit || ''} ပဲ ရှိပါသည် (တောင်းသည့် ${qty})`
      );
    }
  }

  const total = items.reduce((s, it) => s + it.line_total, 0);
  return { transcript, normalized, items, total, warnings };
}
