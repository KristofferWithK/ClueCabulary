import type { ConceptId } from '../ai/local/concepts'
import { isConceptId } from '../ai/local/concepts'
import type { WordEntry } from './types'
import raw from './words.da.json'

export const WORDS: WordEntry[] = raw as WordEntry[]

const byId = new Map(WORDS.map((w) => [w.id, w]))

/**
 * Teaching order, which is what the journey slices into cities. Distinct from
 * freqRank: the first city is curated so its words can actually be clued.
 */
export const curriculumRank = (w: WordEntry): number => w.curriculumRank ?? w.freqRank

const CONCEPTS: ReadonlyMap<string, ConceptId[]> = new Map(
  WORDS.map((w) => [w.id, (w.concepts ?? []).filter(isConceptId)]),
)

/** What this word is, for the offline companion. Empty for untagged words. */
export const conceptsOf = (id: string): readonly ConceptId[] => CONCEPTS.get(id) ?? []

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

/** The normalization GLOSSES was built with, so callers can match it exactly. */
export const normalizeGloss = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(to|a|an|the) /, '')

const HEADWORDS: ReadonlySet<string> = new Set(WORDS.map((w) => w.da.toLowerCase()))

/** One of the shipped thousand, as a Danish headword. */
export const isDanishWord = (normalized: string): boolean => HEADWORDS.has(normalized)

/**
 * Does this look like the player reached for English?
 *
 * True only for a word that IS one of our English glosses and is NOT one of our
 * Danish headwords — so the sixty-one words that are both (arm, kind, sky, mad,
 * salt, fast, time, hold, land…) are never flagged, which is most of what an
 * eager check would get wrong.
 *
 * It cannot be complete in the other direction: a Danish word outside the
 * shipped thousand that happens to be spelled like one of our glosses would be
 * flagged wrongly. The lookup box is one tap away and says so, which is the
 * right cost for a check that stops Klaus being handed a word he cannot read.
 */
export const looksEnglish = (raw: string): boolean => {
  const n = normalizeGloss(raw)
  return n.length > 0 && GLOSSES.has(n) && !HEADWORDS.has(n)
}
