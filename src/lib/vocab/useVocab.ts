/**
 * useVocab — React hook that wires up vocab system for components
 *
 * Auto-starts DOM observer on mount, exposes correction & stats.
 */

'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { addTerms, getStats, confirmTerm, reset, type VocabSource } from './vocabStore'
import { correctSentence, invalidateMatcher, type CorrectionResult } from './fuzzyMatcher'
import { startObserver, scanNow } from './domScanner'

export interface UseVocabOptions {
  autoObserve?: boolean       // default: true
  scanIntervalMs?: number     // periodic re-scan (default: 30000)
}

export function useVocab(opts: UseVocabOptions = {}) {
  const autoObserve = opts.autoObserve ?? true
  const scanInterval = opts.scanIntervalMs ?? 30000
  const [stats, setStats] = useState(() => getStats())

  // Start observer + periodic scan
  useEffect(() => {
    if (!autoObserve) return
    const stop = startObserver()
    setStats(getStats())

    const tick = setInterval(() => {
      scanNow()
      setStats(getStats())
    }, scanInterval)

    return () => {
      stop()
      clearInterval(tick)
    }
  }, [autoObserve, scanInterval])

  const correct = useCallback((text: string, options?: { minConfidence?: number; maxWindow?: number }): CorrectionResult => {
    return correctSentence(text, options)
  }, [])

  const addLearned = useCallback((terms: string[], category?: string, source: VocabSource = 'custom') => {
    addTerms(terms, source, category)
    invalidateMatcher()
    setStats(getStats())
  }, [])

  const confirm = useCallback((term: string, category?: string) => {
    confirmTerm(term, category)
    invalidateMatcher()
    setStats(getStats())
  }, [])

  const resetAll = useCallback(() => {
    reset()
    invalidateMatcher()
    setStats(getStats())
  }, [])

  const refresh = useCallback(() => {
    scanNow()
    setStats(getStats())
  }, [])

  return useMemo(() => ({
    stats,
    correct,
    addLearned,
    confirm,
    reset: resetAll,
    refresh,
  }), [stats, correct, addLearned, confirm, resetAll, refresh])
}
