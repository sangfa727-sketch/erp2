export {
  addTerm,
  addTerms,
  confirmTerm,
  getAll,
  getStats,
  reset,
  normalize,
  detectScript,
  type VocabEntry,
  type VocabSource,
} from './vocabStore'

export {
  correctSentence,
  findBestMatch,
  similarity,
  editDistance,
  invalidateMatcher,
  type CorrectionResult,
  type MatchResult,
} from './fuzzyMatcher'

export {
  scanNow,
  startObserver,
  stopObserver,
} from './domScanner'

export { useVocab, type UseVocabOptions } from './useVocab'
