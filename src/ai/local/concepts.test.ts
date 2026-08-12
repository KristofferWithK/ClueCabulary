import { describe, expect, it } from 'vitest'
import { WORDS, conceptsOf } from '../../data/words'
import { wordsForCity } from '../../journey/progress'
import type { ConceptId } from './concepts'

/**
 * The first city is curated, and the property that makes it worth curating is
 * not "these are nice words" but "these words cluster". A board is twelve
 * drawn from a hundred; unless several of them share an everyday domain, every
 * clue is worth exactly one word and the game is a slideshow. These guard that
 * as the list changes.
 */
const city = wordsForCity(WORDS, 0)

describe('the curated first city', () => {
  it('is a full city', () => {
    expect(city.length).toBe(100)
  })

  it('tags every word', () => {
    const untagged = city.filter((w) => conceptsOf(w.id).length === 0).map((w) => w.da)
    expect(untagged).toEqual([])
  })

  it('has clusters, not a hundred unrelated words', () => {
    const counts = new Map<ConceptId, number>()
    for (const w of city) for (const c of conceptsOf(w.id)) counts.set(c, (counts.get(c) ?? 0) + 1)
    const clusters = [...counts.values()].filter((n) => n >= 4).length
    expect(clusters, `concepts with 4+ words: ${clusters}`).toBeGreaterThanOrEqual(8)
  })

  it('never leaves a concept with a single member', () => {
    // A one-member concept is a tag that can never justify a two-word clue.
    const counts = new Map<ConceptId, number>()
    for (const w of city) for (const c of conceptsOf(w.id)) counts.set(c, (counts.get(c) ?? 0) + 1)
    const lonely = [...counts.entries()].filter(([, n]) => n < 2).map(([c]) => c)
    expect(lonely).toEqual([])
  })

  it('deals an opening board worth playing', () => {
    // The sampler introduces words in curriculum order from a 15-word window,
    // so the first board a new player ever sees comes from these fifteen.
    const opening = city.slice(0, 15)
    expect(opening.every((w) => conceptsOf(w.id).length > 0)).toBe(true)
    const counts = new Map<ConceptId, number>()
    for (const w of opening) for (const c of conceptsOf(w.id)) counts.set(c, (counts.get(c) ?? 0) + 1)
    expect(Math.max(...counts.values())).toBeGreaterThanOrEqual(3)
  })
})
