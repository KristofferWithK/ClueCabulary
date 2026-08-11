import { levenshtein, normalize } from './text'
import type { BoardWord, RedemptionResult } from './types'

/** Strip filler the player might type: "to run", "a house", "the sun". */
function normalizeAnswer(s: string): string {
  let a = normalize(s).replace(/\s+/g, ' ')
  a = a.replace(/^(to|a|an|the) /, '')
  return a
}

function toleranceFor(gloss: string): number {
  if (gloss.length <= 3) return 0
  if (gloss.length <= 6) return 1
  return 2
}

export function answerMatches(answer: string, glosses: readonly string[]): string | undefined {
  const a = normalizeAnswer(answer)
  if (!a) return undefined
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
): RedemptionResult[] {
  return words.map((w) => {
    const given = answers[w.wordId] ?? ''
    const matched = answerMatches(given, w.en)
    return matched !== undefined
      ? { wordId: w.wordId, given, accepted: true, matchedGloss: matched }
      : { wordId: w.wordId, given, accepted: false }
  })
}
