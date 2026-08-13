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
 * The same test, also in ASCII spelling — because every other guard here folds
 * and this one did not, so with "dør" on the board "døren" was rejected while
 * "doeren" was legal. 41 board words are three letters or fewer and contain a
 * Danish letter, so that is not a corner: øl/oellet, æg/aegget, søn/soennen.
 *
 * Two details the obvious version gets wrong, both measured against the whole
 * thousand-word set. The fold is applied only when the SHORT word really
 * contains a Danish letter, and the length test stays on the unfolded
 * spelling — folding unconditionally lengthens the short word into a prefix it
 * never was, and blocks four real pairs: "to" swallows "tør", "ko" swallows
 * "køre", "sko" swallows "skøn", "ro" swallows "røre". Guarded this way it
 * catches all twelve ASCII forms and adds no new block anywhere in the set.
 */
function inflectionOfShort(longer: string, short: string): boolean {
  if (short.length > 3) return false
  if (isInflectionOfShort(longer, short)) return true
  const folded = foldDanish(short)
  return folded !== short && isInflectionOfShort(foldDanish(longer), folded)
}

/**
 * Danish written on an English keyboard: æ→ae, ø→oe, å→aa. Folded only here,
 * inside the legality check, and never in normalize(): legality erring strict
 * costs a model one retry, whereas folding in the shared normalizer would also
 * loosen redemption grading, where "hus" must not be accepted for "hös".
 *
 * Without this, "sovevaerelse" is a legal clue on a board holding "værelse"
 * while "soveværelse" is not — a compound clue slips through purely by being
 * typed without the Danish letters, which is exactly how a model spells it.
 */
const foldDanish = (s: string): string =>
  s.replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')

/** Does either string contain the other, in plain or ASCII-folded spelling? */
function overlaps(a: string, b: string): boolean {
  if (a.includes(b) || b.includes(a)) return true
  const fa = foldDanish(a)
  const fb = foldDanish(b)
  return fa !== a || fb !== b ? fa.includes(fb) || fb.includes(fa) : false
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
      if (c === b || (foldDanish(c) === foldDanish(b) && c !== b)) {
        return {
          legal: false,
          reason: isGloss
            ? `"${clue}" is the English translation of "${w.da}" on the board`
            : `"${clue}" is a word on the board`,
          conflictWord: w.da,
        }
      }
      if (b.length >= 4 && overlaps(c, b)) {
        return { legal: false, reason: `"${clue}" contains or is contained in ${what}`, conflictWord: w.da }
      }
      if (cStem === danishStem(b) || danishStem(foldDanish(c)) === danishStem(foldDanish(b))) {
        return { legal: false, reason: `"${clue}" is a form of ${what}`, conflictWord: w.da }
      }
      if (inflectionOfShort(c, b) || inflectionOfShort(b, c)) {
        return { legal: false, reason: `"${clue}" is a form of ${what}`, conflictWord: w.da }
      }
      if (b.length >= 4 && c.length >= 4 && levenshtein(c, b) <= 1) {
        return { legal: false, reason: `"${clue}" is too close to ${what}`, conflictWord: w.da }
      }
    }
  }
  return { legal: true }
}
