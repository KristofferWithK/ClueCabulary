import { danishStem, levenshtein, normalize } from './text'

/**
 * Grading for the wrap-up packing phase: the card shows English, the player
 * types the Danish. The mirror of redemption.ts, with the mirror's cautions —
 * fuzz exists to forgive a slip of the thumb, never to accept a different
 * word — plus two Danish-only concerns: articles are part of how a noun is
 * learned but not part of the answer, and æ/ø/å may be typed as ae/oe/aa on a
 * keyboard that lacks them.
 */

/** Tells the grader a string is a real Danish headword for something else. */
export type IsDanish = (normalized: string) => boolean

/** Strip filler the player might type: "et hus", "en kat", "at løbe". */
function normalizeDanishAnswer(s: string): string {
  let a = normalize(s).replace(/\s+/g, ' ')
  a = a.replace(/^(en|et|at) /, '')
  return a
}

/**
 * The keyboard-less spellings, tried as a second reading of the answer. Only
 * of the ANSWER: the target comes from the dataset and is spelled properly.
 */
function foldedDanish(s: string): string {
  return s.replace(/aa/g, 'å').replace(/ae/g, 'æ').replace(/oe/g, 'ø')
}

/**
 * How far a typo may stray — redemption's scale, for the same reason. Short
 * words get no slack at all, and that is right in this direction too: at one
 * edit «sma» could pass for små, but the å IS the word.
 */
function toleranceFor(target: string): number {
  if (target.length <= 4) return 0
  if (target.length <= 7) return 1
  return 2
}

/**
 * Does the answer pack the word? Accepts the citation form, an inflection of
 * it (huset for hus — packing is a gate, not an exam), a keyboard-less
 * spelling, and a slip within tolerance. A typed string that is itself a real
 * Danish headword for something else is rejected at any distance: fuzz
 * forgives typos, never synonyms-by-accident.
 */
export function matchesDanishAnswer(
  answer: string,
  targetDa: string,
  isDanish?: IsDanish,
): boolean {
  const target = normalize(targetDa)
  const raw = normalizeDanishAnswer(answer)
  if (!raw) return false
  const folded = foldedDanish(raw)
  const candidates = raw === folded ? [raw] : [raw, folded]

  if (candidates.some((c) => c === target)) return true
  // A real Danish word that is not the target is a wrong answer, however
  // close — «lappe» is not a typo for lampe, it is a verb.
  if (candidates.some((c) => isDanish?.(c) && c !== target)) return false
  if (candidates.some((c) => stemsMatch(c, target))) return true
  return candidates.some((c) => levenshtein(c, target) <= toleranceFor(target))
}

/**
 * danishStem strips one inflectional suffix, which leaves the doubled final
 * consonant Danish inserts before one: katten stems to «katt», not kat. The
 * de-doubled stem is tried too, so the realistic inflections of short nouns
 * count as the word they are.
 */
function stemsMatch(answer: string, target: string): boolean {
  const a = danishStem(answer)
  const t = danishStem(target)
  if (a === t) return true
  const dedoubled =
    a.length >= 2 && a[a.length - 1] === a[a.length - 2] ? a.slice(0, -1) : a
  return dedoubled === t
}
