import { normalize } from '../../engine/text'
import type { LegalityRules, Morphology } from '../types'

/**
 * Regular Danish inflection is suffixing (hus/huset, løbe/løber/løbet,
 * hund/hunden/hundene). Stripping one longest-match suffix catches the
 * realistic clue/board collisions. Heuristic by design — Codenames legality
 * is human-adjudicated anyway.
 *
 * German will not fit this shape as it stands: the participle takes a ge-
 * PREFIX and the plural can umlaut the stem vowel, neither of which a suffix
 * list reaches. That is a note for H2 rather than a hole here.
 */
const SUFFIXES = ['erne', 'ene', 'ede', 'er', 'en', 'et', 'e', 'r', 's', 't']

export function danishStem(word: string): string {
  const w = normalize(word)
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      return w.slice(0, w.length - suf.length)
    }
  }
  return w
}

/** Endings that make a Danish headword into another form of itself. */
const INFLECTIONS = ['en', 'et', 'er', 'ene', 'erne', 'e', 'r', 'ede', 'te', 's']

/** A linking morpheme between the halves of a Danish compound: hus-e-lejer. */
const LINKERS = ['', 's', 'e']

/**
 * The general legality guards all require length >= 4, so words like gå, år,
 * by, se would otherwise only be blocked on exact equality — 'går' would be a
 * legal clue for 'gå'.
 */
const SHORT_INFLECTIONS = new Set([
  'r', 't', 's', 'n', 'e', 'en', 'et', 'er', 'es', 'ne',
  'ede', 'ene', 'ere', 'est', 'erne', 'hed', 'heden',
])

/**
 * The Danish past tense, which the stem guard does not reach.
 *
 * danishStem strips one suffix, so "køre" becomes "kør" while "kørte" becomes
 * "kørt" — different stems, and "kørte" does not contain "køre" either, so
 * containment misses it too. 249 verbs in the shipped set end in -e and form
 * their past this way, and of 24 real past forms tested, 22 were legal clues
 * for their own board word.
 *
 * That was noticed only after the edit-distance rule was removed, and the
 * comment written at the time — that the stem and short-word guards already
 * covered these — was wrong. Edit distance had been catching them by accident,
 * which is not the same as catching them: it also blocked 271 pairs of
 * unrelated words, and missed the past forms more than one letter away.
 *
 * Fixed at the root instead: strip the past ending from the clue and the bare
 * -e from the infinitive, and compare. It lives on the pack's `legality` rather
 * than in `stem`, which the packing grader also uses — loosening the stemmer
 * there would start accepting one real word as the answer for another.
 */
const PAST_SUFFIXES = ['ede', 'te', 'et']

/**
 * Verbs only, and that is load-bearing rather than tidiness. Applied to every
 * part of speech the same shape blocks real, unrelated pairs in this very
 * dataset — naeste/naese, sidde/side, stolt/stole — because a noun ending in
 * -e plus a past ending is often just another word. Restricted to verbs, it
 * catches all 249 of the -e verbs' pasts and blocks nothing else in the set.
 */
function isPastOf(clue: string, board: string, boardPos: string): boolean {
  if (boardPos !== 'verb') return false
  // Only infinitives: "køre", "spise", "læse".
  if (!board.endsWith('e') || board.length < 3) return false
  const stem = board.slice(0, -1)
  return PAST_SUFFIXES.some((suffix) => clue === stem + suffix)
}

/**
 * Irregular plurals, which no suffix rule reaches: the vowel changes. Only the
 * ones actually in the shipped nine hundred, so the list is checkable rather
 * than a grab-bag of Danish grammar. Stated once each; the caller tries both
 * directions, since either can be the clue.
 */
const IRREGULAR_PLURALS: ReadonlyArray<readonly [string, string]> = [
  ['mand', 'mænd'],
  ['barn', 'børn'],
  ['and', 'ænder'],
  ['hånd', 'hænder'],
  ['tand', 'tænder'],
  ['nat', 'nætter'],
  ['bog', 'bøger'],
  ['fod', 'fødder'],
  ['ko', 'køer'],
  ['datter', 'døtre'],
  ['søster', 'søstre'],
]

const legality: LegalityRules = {
  shortInflections: SHORT_INFLECTIONS,
  isDerivedForm: isPastOf,
  irregularPairs: IRREGULAR_PLURALS,
}

export const danishMorphology: Morphology = {
  stem: danishStem,
  inflections: INFLECTIONS,
  linkers: LINKERS,
  legality,
}
