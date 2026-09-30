/**
 * DomVocabScanner — Auto-extracts vocabulary terms from rendered UI
 *
 * Watches the DOM for new content (product names, customer names, etc.)
 * and feeds them into the vocab store. Uses MutationObserver for live updates.
 *
 * Selector strategy:
 * - data-vocab="..."        → explicit opt-in (preferred)
 * - data-vocab-category="X" → categorize the term
 * - Tables: scans <td> in rows with [data-vocab-row]
 * - Inputs: scans value of [data-vocab-input]
 *
 * Why opt-in selectors? Auto-scanning all text would pollute vocab with
 * UI labels, button text, etc. Opt-in keeps it clean.
 */

import { addTerms, detectScript } from './vocabStore'
import { invalidateMatcher } from './fuzzyMatcher'

interface ScanOptions {
  root?: HTMLElement | Document
  observe?: boolean
}

let observer: MutationObserver | null = null
let scanScheduled = false

/**
 * Extract terms from a given root element.
 */
function extractTermsFromRoot(root: HTMLElement | Document): Map<string, string[]> {
  const byCategory = new Map<string, string[]>()

  const push = (category: string, term: string) => {
    if (!term) return
    const trimmed = term.trim()
    if (!trimmed || trimmed.length > 100) return
    // skip pure numbers / pure punctuation
    if (/^[\d\s.,/-]+$/.test(trimmed)) return
    if (!byCategory.has(category)) byCategory.set(category, [])
    byCategory.get(category)!.push(trimmed)
  }

  // 1) Explicit data-vocab attributes
  const explicit = root.querySelectorAll<HTMLElement>('[data-vocab]')
  explicit.forEach(el => {
    const term = el.getAttribute('data-vocab') || el.textContent || ''
    const cat = el.getAttribute('data-vocab-category') || 'general'
    push(cat, term)
  })

  // 2) Vocab rows (e.g. table rows representing entities)
  const rows = root.querySelectorAll<HTMLElement>('[data-vocab-row]')
  rows.forEach(row => {
    const cat = row.getAttribute('data-vocab-row') || 'general'
    // Scan all td/th text content within
    const cells = row.querySelectorAll('td, th, [data-vocab-field]')
    cells.forEach(cell => {
      const term = (cell as HTMLElement).textContent || ''
      // only push if cell has text and isn't pure number/action button
      const t = term.trim()
      if (!t || t.length > 100) return
      // skip if cell contains buttons/inputs (action column)
      if (cell.querySelector('button, input, select, a[role="button"]')) return
      push(cat, t)
    })
  })

  // 3) Vocab input values
  const inputs = root.querySelectorAll<HTMLInputElement>('[data-vocab-input]')
  inputs.forEach(input => {
    const cat = input.getAttribute('data-vocab-input') || 'general'
    if (input.value) push(cat, input.value)
  })

  return byCategory
}

/**
 * Run a one-shot scan of the given root.
 */
export function scanNow(opts: ScanOptions = {}) {
  if (typeof window === 'undefined') return
  const root = opts.root || document
  const byCategory = extractTermsFromRoot(root)

  let total = 0
  byCategory.forEach((terms, cat) => {
    if (terms.length) {
      addTerms(terms, 'dynamic', cat)
      total += terms.length
    }
  })
  if (total > 0) {
    invalidateMatcher()
  }
  return { total, categories: Array.from(byCategory.keys()) }
}

/**
 * Schedule a debounced scan (used by mutation observer).
 */
function scheduleScan() {
  if (scanScheduled) return
  scanScheduled = true
  // Use requestIdleCallback when available — vocab scanning shouldn't block UI
  const run = () => {
    scanScheduled = false
    scanNow()
  }
  if (typeof (window as any).requestIdleCallback === 'function') {
    ;(window as any).requestIdleCallback(run, { timeout: 1500 })
  } else {
    setTimeout(run, 500)
  }
}

/**
 * Start observing DOM mutations for live vocab updates.
 * Returns a stop function.
 */
export function startObserver(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (observer) return stopObserver

  // Initial scan
  scanNow()

  observer = new MutationObserver((mutations) => {
    // Quick filter: only schedule if any mutation touched a vocab-relevant node
    for (const m of mutations) {
      if (m.type === 'childList' && m.addedNodes.length > 0) {
        for (const node of Array.from(m.addedNodes)) {
          if (node.nodeType === 1) {
            const el = node as HTMLElement
            if (
              el.matches?.('[data-vocab], [data-vocab-row], [data-vocab-input]') ||
              el.querySelector?.('[data-vocab], [data-vocab-row], [data-vocab-input]')
            ) {
              scheduleScan()
              return
            }
          }
        }
      } else if (m.type === 'attributes' && m.target.nodeType === 1) {
        const el = m.target as HTMLElement
        if (el.matches?.('[data-vocab], [data-vocab-row], [data-vocab-input]')) {
          scheduleScan()
          return
        }
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-vocab', 'data-vocab-row', 'data-vocab-input', 'value'],
  })

  return stopObserver
}

export function stopObserver() {
  if (observer) {
    observer.disconnect()
    observer = null
  }
}
