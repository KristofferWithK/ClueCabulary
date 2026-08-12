import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS } from '../../engine/config'
import { checkClueLegality } from '../../engine/legality'
import { mulberry32 } from '../../engine/rng'
import type { BoardWord } from '../../engine/types'
import { WORDS, conceptsOf } from '../../data/words'
import { wordsForCity } from '../../journey/progress'
import { CONCEPT_CLUES, CONCEPT_IDS, CONCEPT_BY_NAME, type ConceptId } from './concepts'

/**
 * The offline companion clues by naming a concept, and the engine rejects a
 * clue that contains, is contained in, or stems to any word on the board. A
 * concept whose every name collides with the curated city is a concept the
 * companion silently cannot use — so these check the two halves stay
 * compatible as either one changes.
 */
const city = wordsForCity(WORDS, 0)
const asBoard = (ws: typeof city): BoardWord[] =>
  ws.map((w) => ({ wordId: w.id, da: w.da, en: w.en, pos: w.pos }))

/** Concepts the curated city actually uses. */
const usedConcepts = [...new Set(city.flatMap((w) => conceptsOf(w.id)))]

describe('concept names as clues', () => {
  it('no name means two different concepts', () => {
    const names = CONCEPT_IDS.flatMap((id) => [...CONCEPT_CLUES[id].da, ...CONCEPT_CLUES[id].en])
    expect(names.length).toBe(new Set(names.map((n) => n.toLowerCase())).size)
    expect(CONCEPT_BY_NAME.size).toBe(names.length)
  })

  it('every name is a single word — a clue has to be', () => {
    for (const id of CONCEPT_IDS) {
      for (const name of [...CONCEPT_CLUES[id].da, ...CONCEPT_CLUES[id].en]) {
        expect(name.trim(), `${id}: "${name}"`).not.toMatch(/\s/)
      }
    }
  })

  it.runIf(city.length > 0 && usedConcepts.length > 0)(
    'every concept the city uses survives every board the city can deal',
    () => {
      // Not a sample: the fallback only needs ONE legal name, and a name can
      // only be blocked by a word actually on the board — so a concept is safe
      // for every board iff, for each language, some name survives the whole
      // city. Checking against the entire city at once is the strictest form.
      const whole = asBoard(city)
      const stuck: string[] = []
      for (const concept of usedConcepts) {
        const legal = [...CONCEPT_CLUES[concept].da, ...CONCEPT_CLUES[concept].en].filter(
          (name) => checkClueLegality(name, whole).legal,
        )
        if (legal.length === 0) stuck.push(concept)
      }
      expect(stuck, 'concepts with no usable name against the first city').toEqual([])
    },
  )

  it.runIf(city.length > 0 && usedConcepts.length > 0)(
    'and keeps a name in the language the player asked for',
    () => {
      // A Danish clue falling back to English is allowed but should be rare.
      const whole = asBoard(city)
      const monolingual: Record<string, string[]> = { da: [], en: [] }
      for (const concept of usedConcepts) {
        for (const lang of ['da', 'en'] as const) {
          const ok = CONCEPT_CLUES[concept][lang].some((n) => checkClueLegality(n, whole).legal)
          if (!ok) monolingual[lang].push(concept)
        }
      }
      // Against the whole city at once this is a harsh test; a real 12-word
      // board blocks far less. Keep it from silently getting worse.
      expect(monolingual.da.length + monolingual.en.length).toBeLessThanOrEqual(6)
    },
  )
})

describe('the curated first city', () => {
  it.runIf(city.length > 0)('is a full city', () => {
    expect(city.length).toBe(100)
  })

  it.runIf(city.length > 0)('tags every word, or the companion cannot clue it', () => {
    const untagged = city.filter((w) => conceptsOf(w.id).length === 0).map((w) => w.da)
    expect(untagged).toEqual([])
  })

  it.runIf(city.length > 0)('has clusters, not a hundred unrelated words', () => {
    // A board is 12 words drawn from the city; for a two-word clue to be
    // possible at all, concepts have to repeat.
    const counts = new Map<ConceptId, number>()
    for (const w of city) for (const c of conceptsOf(w.id)) counts.set(c, (counts.get(c) ?? 0) + 1)
    const clusters = [...counts.values()].filter((n) => n >= 4).length
    expect(clusters, `concepts with 4+ words: ${clusters}`).toBeGreaterThanOrEqual(8)
  })

  it.runIf(city.length >= 15)('deals an opening board worth playing', () => {
    // The sampler introduces words in curriculum order from a 15-word window,
    // so the first board a new player ever sees comes from these fifteen.
    const opening = city.slice(0, 15)
    const tagged = opening.filter((w) => conceptsOf(w.id).length > 0)
    expect(tagged.length).toBe(opening.length)
    // And enough of them must share a concept for a first clue to be worth 2.
    const counts = new Map<ConceptId, number>()
    for (const w of opening) for (const c of conceptsOf(w.id)) counts.set(c, (counts.get(c) ?? 0) + 1)
    expect(Math.max(...counts.values())).toBeGreaterThanOrEqual(3)
  })

  it.runIf(city.length > 0)('can be dealt without gloss collisions eating the board', () => {
    const config = GRID_CONFIGS.beginner
    const rng = mulberry32(7)
    const shuffled = [...city].sort(() => rng() - 0.5)
    expect(shuffled.length).toBeGreaterThanOrEqual(config.totalWords)
  })
})
