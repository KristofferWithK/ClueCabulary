import type { WordEntry } from './types'
import raw from './words.da.json'

export const WORDS: WordEntry[] = raw as WordEntry[]

const byId = new Map(WORDS.map((w) => [w.id, w]))

export function wordById(id: string): WordEntry | undefined {
  return byId.get(id)
}

/**
 * Every English gloss in the dataset, normalized. Grading consults this so a
 * fuzzy match can never accept one real word in place of another: "year" is a
 * word, so it is never marked correct for "hear".
 */
const GLOSSES: ReadonlySet<string> = new Set(
  WORDS.flatMap((w) =>
    w.en.map((g) =>
      g
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^(to|a|an|the) /, ''),
    ),
  ),
)

export const isKnownGloss = (normalized: string): boolean => GLOSSES.has(normalized)
