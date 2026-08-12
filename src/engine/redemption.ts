import { levenshtein, normalize } from './text'
import type { BoardWord, RedemptionResult } from './types'

/** Strip filler the player might type: "to run", "a house", "the sun". */
function normalizeAnswer(s: string): string {
  let a = normalize(s).replace(/\s+/g, ' ')
  a = a.replace(/^(to|a|an|the) /, '')
  return a
}

/**
 * How far a typo may stray. Short words get no slack at all: at one edit,
 * four-letter English is a dense minefield — hear/year, here/there, know/now,
 * food/good — and every one of those pairs is a different word, not a slip.
 */
function toleranceFor(gloss: string): number {
  if (gloss.length <= 4) return 0
  if (gloss.length <= 7) return 1
  return 2
}

/**
 * A word the player might have meant instead. Fuzzy matching exists to forgive
 * a slip of the thumb, never to accept a different answer — so if what they
 * typed is itself a real English word for something else, only an exact match
 * counts. Passing this is what stops "year" being marked correct for hear.
 */
export type KnownWord = (normalized: string) => boolean

export function answerMatches(
  answer: string,
  glosses: readonly string[],
  isKnownWord?: KnownWord,
): string | undefined {
  const a = normalizeAnswer(answer)
  if (!a) return undefined

  const exact = glosses.find((g) => normalizeAnswer(g) === a)
  if (exact !== undefined) return exact
  // A real word that is not one of ours is a wrong answer, however close.
  if (isKnownWord?.(a)) return undefined

  for (const gloss of glosses) {
    const g = normalizeAnswer(gloss)
    if (levenshtein(a, g) <= toleranceFor(g)) return gloss
  }
  return undefined
}

/** Pure grading of the redemption round: every prompted word must match. */
export function gradeRedemption(
  answers: Record<string, string>,
  words: readonly BoardWord[],
  isKnownWord?: KnownWord,
): RedemptionResult[] {
  return words.map((w) => {
    const given = answers[w.wordId] ?? ''
    const matched = answerMatches(given, w.en, isKnownWord)
    return matched !== undefined
      ? { wordId: w.wordId, given, accepted: true, matchedGloss: matched }
      : { wordId: w.wordId, given, accepted: false }
  })
}
