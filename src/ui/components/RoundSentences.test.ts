import { describe, expect, it } from 'vitest'
import { WORDS } from '../../data/words'
import { MAX_SENTENCES, pickSentenceWords } from './RoundSentences'

/**
 * The ordering IS the feature. A summary that showed five greens the player has
 * known for a month would look identical to a working one, so the preference —
 * met for the first time, then collected this round, then the rest — is the
 * thing worth pinning.
 */
describe('pickSentenceWords', () => {
  const board = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

  it('prefers a word met for the first time this round', () => {
    expect(pickSentenceWords(board, ['e'], [], 1)).toEqual(['e'])
  })

  it('then a word collected this round', () => {
    expect(pickSentenceWords(board, [], ['f'], 1)).toEqual(['f'])
  })

  it('puts discovered ahead of collected, and both ahead of the already-known', () => {
    expect(pickSentenceWords(board, ['g'], ['c'], 3)).toEqual(['g', 'c', 'a'])
  })

  it('counts a word that is both as discovered, not twice', () => {
    const got = pickSentenceWords(board, ['d'], ['d'], 3)
    expect(got[0]).toBe('d')
    expect(got.filter((id) => id === 'd')).toHaveLength(1)
  })

  it('keeps board order inside a rank', () => {
    expect(pickSentenceWords(board, ['f', 'b'], [], 2)).toEqual(['b', 'f'])
  })

  it('never shows more than the cap', () => {
    expect(pickSentenceWords(board, board, [], MAX_SENTENCES)).toHaveLength(MAX_SENTENCES)
    expect(MAX_SENTENCES).toBe(5)
  })

  it('shows what there is when the round greened fewer than the cap', () => {
    expect(pickSentenceWords(['a', 'b'], [], [])).toEqual(['a', 'b'])
  })

  it('is empty for a round that greened nothing — sudden death on the first name', () => {
    expect(pickSentenceWords([], ['a'], ['b'])).toEqual([])
  })

  // Preferences over words that are not on the board must not invent rows.
  it('ignores discovered and collected ids that were not green', () => {
    expect(pickSentenceWords(['a'], ['zz'], ['yy'])).toEqual(['a'])
  })
})

/**
 * The section renders `exampleDa`/`exampleEn` straight off the dataset, so a
 * word without either would render an empty row. `validate:words` covers the
 * dataset's own rules; this covers the assumption this component makes of it.
 */
describe('the dataset the sentences are drawn from', () => {
  it('gives every word both halves of an example', () => {
    const missing = WORDS.filter((w) => !w.exampleDa?.trim() || !w.exampleEn?.trim())
    expect(missing.map((w) => w.id)).toEqual([])
  })
})
