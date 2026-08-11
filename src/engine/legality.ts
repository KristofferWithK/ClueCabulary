import { danishStem, levenshtein, normalize } from './text'
import type { BoardWord } from './types'

export interface LegalityVerdict {
  legal: boolean
  reason?: string
  conflictWord?: string
}

/**
 * A clue is illegal when it is too close to ANY board word — its Danish form or
 * any English gloss. Checked identically for the player's and the AI's clues.
 */
export function checkClueLegality(clue: string, words: readonly BoardWord[]): LegalityVerdict {
  const c = normalize(clue)
  if (!c) return { legal: false, reason: 'empty clue' }
  if (/\s/.test(c)) return { legal: false, reason: 'clue must be a single word' }

  const cStem = danishStem(c)
  for (const w of words) {
    for (const candidate of [w.da, ...w.en]) {
      const b = normalize(candidate)
      if (!b) continue
      if (c === b) {
        return { legal: false, reason: `"${clue}" is a word on the board`, conflictWord: w.da }
      }
      if (b.length >= 4 && (c.includes(b) || b.includes(c))) {
        return { legal: false, reason: `"${clue}" contains or is contained in "${candidate}"`, conflictWord: w.da }
      }
      if (cStem === danishStem(b)) {
        return { legal: false, reason: `"${clue}" is a form of "${candidate}"`, conflictWord: w.da }
      }
      if (b.length >= 4 && c.length >= 4 && levenshtein(c, b) <= 1) {
        return { legal: false, reason: `"${clue}" is too close to "${candidate}"`, conflictWord: w.da }
      }
    }
  }
  return { legal: true }
}
