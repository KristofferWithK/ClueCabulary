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

/** One of the shipped nine hundred, as a Danish headword. */
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
 * shipped nine hundred that happens to be spelled like one of our glosses would be
 * flagged wrongly. The lookup box is one tap away and says so, which is the
 * right cost for a check that stops Casey being handed a word he cannot read.
 */
/** Endings that make a Danish headword into another form of itself. */
const INFLECTIONS = ['en', 'et', 'er', 'ene', 'erne', 'e', 'r', 'ede', 'te', 's']

/** A linking morpheme between the halves of a Danish compound: hus-e-lejer. */
const LINKERS = ['', 's', 'e']

/**
 * Danish, English, or not decidable from the shipped nine hundred.
 *
 * The old check was a single test — an English gloss that is not a Danish
 * headword — which is right about the obvious cases and silent about everything
 * else. Everything else is most good clues: Danish compounds freely, so
 * «dyreliv», «morgenmad» and «huskeliste» are all outside the nine hundred.
 *
 * So this recognises Danish first, three ways, and only then asks whether the
 * word looks English:
 *
 *  - æ, ø or å can only be Danish;
 *  - an inflection of a headword is the headword (hunden, husene, cyklede);
 *  - a compound of two headwords is Danish (dyre+liv, morgen+mad), with the
 *    linking -s- and -e- Danish puts between the halves.
 *
 * 'unknown' is a real answer and the caller must treat it as permission: it is
 * where every Danish word we do not ship lives. Casey settles those.
 */
export type ClueLanguage = 'danish' | 'english' | 'unknown'

const isInflection = (n: string): boolean =>
  INFLECTIONS.some((suffix) => {
    if (!n.endsWith(suffix) || n.length - suffix.length < 3) return false
    const stem = n.slice(0, n.length - suffix.length)
    // "hus" -> "huset", and "cykle" -> "cyklede" where the stem lost its -e.
    return HEADWORDS.has(stem) || HEADWORDS.has(`${stem}e`)
  })

const isCompound = (n: string): boolean => {
  for (let i = 3; i <= n.length - 3; i++) {
    const head = n.slice(0, i)
    if (!HEADWORDS.has(head) && !HEADWORDS.has(`${head}e`)) continue
    for (const link of LINKERS) {
      const tail = n.slice(i)
      if (tail.startsWith(link) && tail.length - link.length >= 3) {
        const rest = tail.slice(link.length)
        if (HEADWORDS.has(rest) || isInflection(rest)) return true
      }
    }
  }
  return false
}

export function classifyClue(raw: string): ClueLanguage {
  const n = normalizeGloss(raw)
  if (n.length === 0) return 'unknown'
  if (/[æøå]/.test(n)) return 'danish'
  if (HEADWORDS.has(n)) return 'danish'
  if (isInflection(n) || isCompound(n)) return 'danish'
  if (GLOSSES.has(n)) return 'english'
  return 'unknown'
}

/** Kept for the tests that name it; the classifier is the thing to use. */
export const looksEnglish = (raw: string): boolean => classifyClue(raw) === 'english'
