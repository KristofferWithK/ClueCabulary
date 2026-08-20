import type { ConceptId } from '../ai/local/concepts'
import { isConceptId } from '../ai/local/concepts'
import type { LanguagePack } from '../lang/types'
import type { WordEntry } from './types'

/**
 * The indexes over one language's word list, built from a pack.
 *
 * Split out from `words.ts` so the seam can be tested against a fake language
 * — `words.ts` is the same thing bound to whichever pack is active, and is what
 * the app imports.
 */

/** The language a clue was written in, as far as the dataset can tell. */
export type ClueLanguage = 'target' | 'english' | 'unknown'

export interface Dataset {
  words: readonly WordEntry[]
  wordById(id: string): WordEntry | undefined
  conceptsOf(id: string): readonly ConceptId[]
  isKnownGloss(normalized: string): boolean
  normalizeGloss(s: string): string
  /** One of the shipped nine hundred, as a headword in the target language. */
  isHeadword(normalized: string): boolean
  classifyClue(raw: string): ClueLanguage
}

/** The normalization the gloss index is built with, so callers can match it. */
export const normalizeGloss = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(to|a|an|the) /, '')

export function createDataset(pack: LanguagePack): Dataset {
  const words = pack.words
  const byId = new Map(words.map((w) => [w.id, w]))

  const concepts: ReadonlyMap<string, ConceptId[]> = new Map(
    words.map((w) => [w.id, (w.concepts ?? []).filter(isConceptId)]),
  )

  /**
   * Every English gloss in the dataset, normalized. Grading consults this so a
   * fuzzy match can never accept one real word in place of another: "year" is a
   * word, so it is never marked correct for "hear".
   */
  const glosses: ReadonlySet<string> = new Set(
    words.flatMap((w) => w.en.map(normalizeGloss)),
  )

  const headwords: ReadonlySet<string> = new Set(words.map((w) => w.da.toLowerCase()))

  const { distinctive } = pack.orthography
  const { inflections, linkers } = pack.morphology

  const isInflection = (n: string): boolean =>
    inflections.some((suffix) => {
      if (!n.endsWith(suffix) || n.length - suffix.length < 3) return false
      const stem = n.slice(0, n.length - suffix.length)
      // "hus" -> "huset", and "cykle" -> "cyklede" where the stem lost its -e.
      return headwords.has(stem) || headwords.has(`${stem}e`)
    })

  const isCompound = (n: string): boolean => {
    for (let i = 3; i <= n.length - 3; i++) {
      const head = n.slice(0, i)
      if (!headwords.has(head) && !headwords.has(`${head}e`)) continue
      for (const link of linkers) {
        const tail = n.slice(i)
        if (tail.startsWith(link) && tail.length - link.length >= 3) {
          const rest = tail.slice(link.length)
          if (headwords.has(rest) || isInflection(rest)) return true
        }
      }
    }
    return false
  }

  /**
   * The target language, English, or not decidable from the shipped nine
   * hundred.
   *
   * The old check was a single test — an English gloss that is not a headword —
   * which is right about the obvious cases and silent about everything else.
   * Everything else is most good clues: Danish compounds freely, so «dyreliv»,
   * «morgenmad» and «huskeliste» are all outside the nine hundred.
   *
   * So this recognises the target language first, three ways, and only then
   * asks whether the word looks English:
   *
   *  - a letter only this language has (æ, ø, å) settles it outright;
   *  - an inflection of a headword is the headword (hunden, husene, cyklede);
   *  - a compound of two headwords counts (dyre+liv, morgen+mad), with the
   *    linking morphemes the language puts between the halves.
   *
   * All three come from the pack, so the shape holds for German — where the
   * compound test matters more, not less. 'unknown' is a real answer and the
   * caller must treat it as permission: it is where every word of the language
   * we do not ship lives. Casey settles those.
   */
  function classifyClue(raw: string): ClueLanguage {
    const n = normalizeGloss(raw)
    if (n.length === 0) return 'unknown'
    if (distinctive.test(n)) return 'target'
    if (headwords.has(n)) return 'target'
    if (isInflection(n) || isCompound(n)) return 'target'
    if (glosses.has(n)) return 'english'
    return 'unknown'
  }

  return {
    words,
    wordById: (id) => byId.get(id),
    conceptsOf: (id) => concepts.get(id) ?? [],
    isKnownGloss: (normalized) => glosses.has(normalized),
    normalizeGloss,
    isHeadword: (normalized) => headwords.has(normalized),
    classifyClue,
  }
}

/**
 * Teaching order, which is what the journey slices into cities. Distinct from
 * freqRank: the first city is curated so its words can actually be clued.
 */
export const curriculumRank = (w: WordEntry): number => w.curriculumRank ?? w.freqRank
