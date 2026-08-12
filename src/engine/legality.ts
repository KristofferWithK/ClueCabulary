import { danishStem, levenshtein, normalize } from './text'
import type { BoardWord } from './types'

export interface LegalityVerdict {
  legal: boolean
  reason?: string
  conflictWord?: string
}

/**
 * The general guards below all require length ≥ 4, so words like gå, år, by,
 * se would otherwise only be blocked on exact equality — 'går' would be a
 * legal clue for 'gå'. For short words, flag prefix + inflectional suffix,
 * handling Danish gemination (øl → øllet, æg → ægget).
 */
const INFLECTION_SUFFIXES = new Set([
  'r', 't', 's', 'n', 'e', 'en', 'et', 'er', 'es', 'ne',
  'ede', 'ene', 'ere', 'est', 'erne', 'hed', 'heden',
])

function isInflectionOfShort(longer: string, short: string): boolean {
  if (!longer.startsWith(short)) return false
  let rest = longer.slice(short.length)
  if (rest.length === 0) return true
  if (rest[0] === short[short.length - 1]) rest = rest.slice(1) // gemination
  return INFLECTION_SUFFIXES.has(rest)
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
      // Translations are hidden by default, so an error about a gloss must
      // name the Danish board word the player can actually see.
      const isGloss = b !== normalize(w.da)
      const what = isGloss ? `"${candidate}" — the translation of "${w.da}"` : `"${candidate}"`
      if (c === b) {
        return {
          legal: false,
          reason: isGloss
            ? `"${clue}" is the English translation of "${w.da}" on the board`
            : `"${clue}" is a word on the board`,
          conflictWord: w.da,
        }
      }
      if (b.length >= 4 && (c.includes(b) || b.includes(c))) {
        return { legal: false, reason: `"${clue}" contains or is contained in ${what}`, conflictWord: w.da }
      }
      if (cStem === danishStem(b)) {
        return { legal: false, reason: `"${clue}" is a form of ${what}`, conflictWord: w.da }
      }
      if (
        (b.length <= 3 && isInflectionOfShort(c, b)) ||
        (c.length <= 3 && isInflectionOfShort(b, c))
      ) {
        return { legal: false, reason: `"${clue}" is a form of ${what}`, conflictWord: w.da }
      }
      if (b.length >= 4 && c.length >= 4 && levenshtein(c, b) <= 1) {
        return { legal: false, reason: `"${clue}" is too close to ${what}`, conflictWord: w.da }
      }
    }
  }
  return { legal: true }
}
