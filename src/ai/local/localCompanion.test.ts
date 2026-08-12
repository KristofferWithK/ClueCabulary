import { describe, expect, it } from 'vitest'
import type { CardRole, Reveal } from '../../engine/types'
import type { AiClueView, AiGuessView } from '../projections'
import type { ConceptId } from './concepts'
import { LocalCompanion } from './localCompanion'

/**
 * The offline companion is what makes the game playable with no key, no
 * network and no model — so the rules that keep it from being embarrassing
 * matter: never clue into your own forbidden word, prefer covering two words
 * to one, and when a human's clue means nothing to you, say so quietly rather
 * than guessing into a loss.
 */
interface W {
  id: string
  da: string
  en: string[]
  role?: CardRole
  reveal?: Reveal
  concepts?: ConceptId[]
}

const tagsFrom = (words: W[]) => (id: string) => words.find((w) => w.id === id)?.concepts ?? []

const clueView = (words: W[], clueLanguage: 'da' | 'en' = 'en'): AiClueView => ({
  kind: 'ai-clue',
  clueLanguage,
  turnsLeft: 5,
  words: words.map((w) => ({
    id: w.id,
    da: w.da,
    en: w.en,
    pos: 'noun',
    reveal: w.reveal ?? { kind: 'hidden' },
    roleOnMyKey: w.role ?? 'bystander',
  })),
  history: [],
})

const guessView = (words: W[], clue: string, number = 2): AiGuessView => ({
  kind: 'ai-guess',
  clueLanguage: 'en',
  turnsLeft: 5,
  words: words.map((w) => ({
    id: w.id,
    da: w.da,
    en: w.en,
    pos: 'noun',
    reveal: w.reveal ?? { kind: 'hidden' },
  })),
  currentClue: { text: clue, number },
  history: [],
})

const play = (words: W[]) => new LocalCompanion(tagsFrom(words))

describe('LocalCompanion: giving a clue', () => {
  it('covers two of its own words with one concept', async () => {
    const words: W[] = [
      { id: 'a', da: 'brød', en: ['bread'], role: 'green', concepts: ['food'] },
      { id: 'b', da: 'ost', en: ['cheese'], role: 'green', concepts: ['food'] },
      { id: 'c', da: 'stol', en: ['chair'], role: 'bystander', concepts: ['furniture'] },
    ]
    const res = await play(words).getClue(clueView(words))
    expect(res.targetWordIds.sort()).toEqual(['a', 'b'])
    expect(res.number).toBe(2)
    expect(res.clue).toBeTruthy()
  })

  it('will not give a clue that also points at its own forbidden word', async () => {
    const words: W[] = [
      { id: 'a', da: 'brød', en: ['bread'], role: 'green', concepts: ['food'] },
      { id: 'b', da: 'ost', en: ['cheese'], role: 'green', concepts: ['food'] },
      { id: 'x', da: 'kage', en: ['cake'], role: 'forbidden', concepts: ['food'] },
      { id: 'c', da: 'stol', en: ['chair'], role: 'green', concepts: ['furniture'] },
    ]
    const res = await play(words).getClue(clueView(words))
    // FOOD covers two greens but would drag in the forbidden word; FURNITURE
    // covers one and is safe. Caution beats greed.
    expect(res.targetWordIds).toEqual(['c'])
  })

  it('accepts a neutral in the blast radius rather than clue only one word', async () => {
    const words: W[] = [
      { id: 'a', da: 'brød', en: ['bread'], role: 'green', concepts: ['food'] },
      { id: 'b', da: 'ost', en: ['cheese'], role: 'green', concepts: ['food'] },
      { id: 'n', da: 'kage', en: ['cake'], role: 'bystander', concepts: ['food'] },
      { id: 'c', da: 'stol', en: ['chair'], role: 'green', concepts: ['furniture'] },
    ]
    const res = await play(words).getClue(clueView(words))
    expect(res.targetWordIds.sort()).toEqual(['a', 'b'])
  })

  it('never gives a clue the engine would reject', async () => {
    // "måltid" is the first FOOD name; a board holding it forces the fallback.
    const words: W[] = [
      { id: 'a', da: 'måltid', en: ['meal'], role: 'green', concepts: ['food'] },
      { id: 'b', da: 'ost', en: ['cheese'], role: 'green', concepts: ['food'] },
    ]
    const res = await play(words).getClue(clueView(words))
    expect(res.clue).not.toBe('måltid')
    expect(res.clue).not.toBe('meal')
    expect(res.clue).toBeTruthy()
  })

  it('ignores words already turned green', async () => {
    const words: W[] = [
      { id: 'a', da: 'brød', en: ['bread'], role: 'green', reveal: { kind: 'green' }, concepts: ['food'] },
      { id: 'b', da: 'ost', en: ['cheese'], role: 'green', concepts: ['food'] },
    ]
    const res = await play(words).getClue(clueView(words))
    expect(res.targetWordIds).toEqual(['b'])
  })

  it('refuses when it has nothing left to clue', async () => {
    const words: W[] = [{ id: 'a', da: 'brød', en: ['bread'], role: 'bystander', concepts: ['food'] }]
    await expect(play(words).getClue(clueView(words))).rejects.toThrow(/nothing|no words/i)
  })
})

describe('LocalCompanion: reading a clue', () => {
  const board: W[] = [
    { id: 'a', da: 'brød', en: ['bread'], concepts: ['food'] },
    { id: 'b', da: 'ost', en: ['cheese'], concepts: ['food'] },
    { id: 'c', da: 'stol', en: ['chair'], concepts: ['furniture'] },
    { id: 'y', da: 'år', en: ['year'], concepts: ['time'] },
  ]

  it('follows a concept name it knows', async () => {
    const res = await play(board).getGuesses(guessView(board, 'meal'))
    expect(res.guesses[0]!.confidence).toBeGreaterThan(0.7)
    expect(['a', 'b']).toContain(res.guesses[0]!.wordId)
  })

  it('follows a clue that is simply what a word means', async () => {
    const res = await play(board).getGuesses(guessView(board, 'chair'))
    expect(res.guesses[0]!.wordId).toBe('c')
  })

  it('does not fire on a word merely contained in another', async () => {
    // "ear" sits inside "year"; a substring match would guess it confidently.
    const res = await play(board).getGuesses(guessView(board, 'ear'))
    expect(res.guesses.every((g) => g.confidence < 0.35)).toBe(true)
  })

  it('admits when a clue means nothing to it, quietly enough to stop', async () => {
    const res = await play(board).getGuesses(guessView(board, 'zeppelin'))
    // planGuessExecution stops below 0.35 after the first guess, so a shrug
    // costs one guess, not the round.
    expect(res.guesses.every((g) => g.confidence < 0.35)).toBe(true)
    expect(res.guesses.length).toBeGreaterThan(0)
  })

  it('never proposes a word that is already revealed', async () => {
    const revealed: W[] = board.map((w) => (w.id === 'a' ? { ...w, reveal: { kind: 'green' } } : w))
    const res = await play(revealed).getGuesses(guessView(revealed, 'meal'))
    expect(res.guesses.map((g) => g.wordId)).not.toContain('a')
  })
})
