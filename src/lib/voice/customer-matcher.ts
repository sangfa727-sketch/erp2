// ============================================================================
// Customer Matcher — Phonetic + Auto-Create
// ============================================================================
// Resolves a customer hint from voice (e.g., "ဦးထူး", "မမ") to an existing
// customer in contacts table, or returns null to indicate walk-in.
// ============================================================================

import { findBestMatch } from './burmese-phonetics'

export interface Contact {
  id: string
  name: string
  phone?: string
  contact_type?: string
  company_id?: string
}

export interface CustomerMatch {
  contact: Contact
  confidence: number
  isExact: boolean
}

/**
 * Match customer hint against contacts catalog.
 * Returns null if no good match (treat as walk-in customer).
 */
export function matchCustomer(
  hint: string | null | undefined,
  contacts: Contact[],
  threshold: number = 0.65
): CustomerMatch | null {
  if (!hint || hint.trim().length === 0 || contacts.length === 0) return null

  const result = findBestMatch(hint.trim(), contacts, {
    threshold,
    getName: (c) => c.name,
  })

  if (!result) return null

  return {
    contact: result.best.item,
    confidence: result.best.score,
    isExact: result.best.method === 'exact',
  }
}
