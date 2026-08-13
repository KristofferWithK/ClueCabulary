import { describe, expect, it } from 'vitest'
import { boardWordFor, lookupLocal } from './lookup'

/**
 * The lookup a player uses while composing a Danish clue. It has to answer in
 * both directions from the shipped thousand, so the common case never costs a
 * request — and it has to be able to say "this is a board word", because
 * looking one up here must cost exactly what tapping ⓘ costs.
 */
describe('lookupLocal', () => {
  it('finds a Danish word', () => {
    const [hit] = lookupLocal('hund')
    expect(hit?.entry.da).toBe('hund')
    expect(hit?.matched).toBe('da')
    expect(hit?.approximate).toBe(false)
  })

  it('finds the Danish for an English word — the direction that matters', () => {
    const hits = lookupLocal('dog')
    expect(hits.map((h) => h.entry.da)).toContain('hund')
    expect(hits[0]?.matched).toBe('en')
  })

  it('ignores case, spacing and a leading article on the gloss', () => {
    for (const term of ['  DOG ', 'a dog', 'the dog']) {
      expect(lookupLocal(term).map((h) => h.entry.da)).toContain('hund')
    }
  })

  it('takes an inflected Danish form, marked as approximate', () => {
    const [hit] = lookupLocal('hunden')
    expect(hit?.entry.da).toBe('hund')
    expect(hit?.approximate).toBe(true)
  })

  it('returns every word sharing a gloss, not just one', () => {
    // Several Danish words mean "place"; showing one and hiding the rest would
    // quietly mislead someone choosing a clue.
    const hits = lookupLocal('place')
    expect(hits.length).toBeGreaterThan(1)
  })

  it('says nothing rather than guessing, when the word is outside the set', () => {
    expect(lookupLocal('helicopter')).toEqual([])
    expect(lookupLocal('')).toEqual([])
    expect(lookupLocal('   ')).toEqual([])
  })
})

describe('boardWordFor', () => {
  const board = ['da:hund', 'da:hus']

  it('recognises a board word by its Danish form', () => {
    expect(boardWordFor('hund', board)).toBe('da:hund')
  })

  it('and by its English one, which is the way round that would leak', () => {
    expect(boardWordFor('dog', board)).toBe('da:hund')
  })

  it('and through an inflection', () => {
    expect(boardWordFor('hunden', board)).toBe('da:hund')
  })

  it('but not a word that merely exists', () => {
    expect(boardWordFor('kat', board)).toBeUndefined()
  })
})
