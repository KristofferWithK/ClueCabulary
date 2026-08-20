import type { LanguagePack } from '../lang/types'
import { levenshtein, normalize } from './text'

/**
 * Grading for the wrap-up packing phase: the card shows English, the player
 * types the word in the language they are learning.
 *
 * Written as the mirror of the English-side grader in redemption.ts, which is
 * retired; this kept its cautions — fuzz exists to forgive a slip of the thumb,
 * never to accept a different word — plus two concerns that belong to the
 * language rather than to the grader, and are therefore asked of the pack:
 * articles are part of how a noun is learned but not part of the answer, and a
 * letter the keyboard lacks may be typed as its ASCII spelling.
 */

/** Tells the grader a string is a real headword for something else. */
export type IsHeadword = (normalized: string) => boolean

/** Strip filler the player might type: "et hus", "en kat", "at løbe". */
function stripFiller(s: string, filler: readonly string[]): string {
  const a = normalize(s).replace(/\s+/g, ' ')
  for (const f of filler) {
    if (a.startsWith(`${f} `)) return a.slice(f.length + 1)
  }
  return a
}

/**
 * How far a typo may stray — the same scale, for the same reason. Short
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
 * headword for something else is rejected at any distance: fuzz forgives typos,
 * never synonyms-by-accident.
 */
export function matchesAnswer(
  answer: string,
  targetWord: string,
  lang: LanguagePack,
  isHeadword?: IsHeadword,
): boolean {
  const target = normalize(targetWord)
  const raw = stripFiller(answer, lang.grammar.answerFiller)
  if (!raw) return false
  // The keyboard-less spellings, tried as a second reading of the ANSWER only:
  // the target comes from the dataset and is spelled properly.
  const unfolded = lang.orthography.unfold(raw)
  const candidates = raw === unfolded ? [raw] : [raw, unfolded]

  if (candidates.some((c) => c === target)) return true
  // A real word of this language that is not the target is a wrong answer,
  // however close — «lappe» is not a typo for lampe, it is a verb.
  //
  // In a language where the folded form is itself a correct spelling
  // (`foldsAreSpellings`), the unfolded reading is a spelling rather than a
  // guess, so it is checked against the dictionary the same way. Danish has no
  // such forms, so this changes nothing here and is a note for whoever writes
  // the German grader's tests.
  if (candidates.some((c) => isHeadword?.(c) && c !== target)) return false
  if (candidates.some((c) => stemsMatch(c, target, lang))) return true
  return candidates.some((c) => levenshtein(c, target) <= toleranceFor(target))
}

/**
 * The stemmer strips one inflectional suffix, which leaves the doubled final
 * consonant Danish inserts before one: katten stems to «katt», not kat. The
 * de-doubled stem is tried too, so the realistic inflections of short nouns
 * count as the word they are. German doubles the same way (Bett/Betten), so
 * this stayed in the shared grader rather than going into the pack.
 */
function stemsMatch(answer: string, target: string, lang: LanguagePack): boolean {
  const a = lang.morphology.stem(answer)
  const t = lang.morphology.stem(target)
  if (a === t) return true
  const dedoubled =
    a.length >= 2 && a[a.length - 1] === a[a.length - 2] ? a.slice(0, -1) : a
  return dedoubled === t
}
