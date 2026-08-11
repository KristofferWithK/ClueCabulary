import { describe, expect, it, vi } from 'vitest'
import { AiError, type AiSettings } from './client'
import { OllamaCompanion, planGuessExecution } from './companion'
import type { AiClueView, AiGuessView } from './projections'

const settings: AiSettings = { baseUrl: 'http://x', apiKey: 'k', model: 'm' }

const clueView: AiClueView = {
  kind: 'ai-clue',
  clueLanguage: 'en',
  turnsLeft: 5,
  words: [
    { id: 'w0', da: 'hund', en: ['dog'], pos: 'noun', reveal: { kind: 'hidden' }, roleOnMyKey: 'green' },
    { id: 'w1', da: 'kat', en: ['cat'], pos: 'noun', reveal: { kind: 'hidden' }, roleOnMyKey: 'green' },
    { id: 'w2', da: 'bil', en: ['car'], pos: 'noun', reveal: { kind: 'hidden' }, roleOnMyKey: 'bystander' },
    { id: 'w3', da: 'sol', en: ['sun'], pos: 'noun', reveal: { kind: 'green' }, roleOnMyKey: 'green' },
  ],
  history: [],
}

const guessView: AiGuessView = {
  kind: 'ai-guess',
  clueLanguage: 'en',
  turnsLeft: 5,
  words: clueView.words.map(({ roleOnMyKey: _role, ...w }) => w),
  currentClue: { text: 'husdyr', number: 2 },
  history: [],
}

const respondWith = (...replies: unknown[]) => {
  let i = 0
  return async () => {
    if (i >= replies.length) throw new Error('unexpected extra AI call')
    return replies[i++]
  }
}

describe('planGuessExecution', () => {
  const g = (wordId: string, confidence: number) => ({ wordId, confidence, reasoning: '' })

  it('orders by confidence and caps at number + 1 (bonus only when sure)', () => {
    const plan = planGuessExecution([g('a', 0.5), g('c', 0.95), g('b', 0.8), g('d', 0.9)], 2)
    expect(plan.map((x) => x.wordId)).toEqual(['c', 'd', 'b'])
  })

  it('denies the bonus guess below 0.7', () => {
    const plan = planGuessExecution([g('a', 0.9), g('b', 0.69)], 1)
    expect(plan.map((x) => x.wordId)).toEqual(['a'])
  })

  it('stops at the first guess under 0.35', () => {
    const plan = planGuessExecution([g('a', 0.9), g('b', 0.2), g('c', 0.1)], 3)
    expect(plan.map((x) => x.wordId)).toEqual(['a'])
  })

  it('always guesses at least once, however unsure', () => {
    const plan = planGuessExecution([g('a', 0.05)], 3)
    expect(plan.map((x) => x.wordId)).toEqual(['a'])
  })
})

describe('OllamaCompanion.getClue', () => {
  it('accepts a valid clue and filters targets to its own unrevealed greens', async () => {
    const companion = new OllamaCompanion(
      settings,
      respondWith({
        clue: 'dyreliv',
        number: 3,
        targetWordIds: ['w0', 'w1', 'w2', 'w3', 'nonsense'],
        rationale: 'animals',
      }),
    )
    const clue = await companion.getClue(clueView)
    expect(clue.targetWordIds).toEqual(['w0', 'w1']) // w2 not green, w3 revealed, nonsense unknown
    expect(clue.number).toBe(2) // trimmed to real target count
  })

  it('retries once on an illegal clue, then succeeds', async () => {
    const companion = new OllamaCompanion(
      settings,
      respondWith(
        { clue: 'hunden', number: 1, targetWordIds: ['w0'], rationale: 'x' }, // form of a board word
        { clue: 'dyreliv', number: 1, targetWordIds: ['w0'], rationale: 'x' },
      ),
    )
    const clue = await companion.getClue(clueView)
    expect(clue.clue).toBe('dyreliv')
  })

  it('throws a typed error after two invalid replies', async () => {
    const companion = new OllamaCompanion(
      settings,
      respondWith({ nope: true }, { still: 'wrong' }),
    )
    await expect(companion.getClue(clueView)).rejects.toThrowError(AiError)
  })

  it('dedupes duplicate target ids and fixes the announced number', async () => {
    const companion = new OllamaCompanion(
      settings,
      respondWith({ clue: 'dyreliv', number: 2, targetWordIds: ['w0', 'w0'], rationale: 'x' }),
    )
    const clue = await companion.getClue(clueView)
    expect(clue.targetWordIds).toEqual(['w0'])
    expect(clue.number).toBe(1)
  })

  it('refuses to call the model when nothing is targetable', async () => {
    const noTargets = {
      ...clueView,
      words: clueView.words.map((w) => ({ ...w, roleOnMyKey: 'bystander' as const })),
    }
    const chat = vi.fn()
    await expect(new OllamaCompanion(settings, chat).getClue(noTargets)).rejects.toThrowError(
      AiError,
    )
    expect(chat).not.toHaveBeenCalled()
  })

  it('retries after a non-JSON first reply instead of failing the turn', async () => {
    let calls = 0
    const chat = async () => {
      calls++
      if (calls === 1) throw new AiError('invalid-response', 'not json')
      return { clue: 'dyreliv', number: 1, targetWordIds: ['w0'], rationale: 'x' }
    }
    const clue = await new OllamaCompanion(settings, chat).getClue(clueView)
    expect(clue.clue).toBe('dyreliv')
    expect(calls).toBe(2)
  })
})

describe('OllamaCompanion.getGuesses', () => {
  it('filters out revealed and unknown wordIds', async () => {
    const companion = new OllamaCompanion(
      settings,
      respondWith({
        guesses: [
          { wordId: 'w3', confidence: 0.9, reasoning: 'revealed!' },
          { wordId: 'w0', confidence: 0.8, reasoning: 'dog fits' },
          { wordId: 'zz', confidence: 0.7, reasoning: 'unknown' },
        ],
      }),
    )
    const res = await companion.getGuesses(guessView)
    expect(res.guesses.map((x) => x.wordId)).toEqual(['w0'])
  })

  it('retries when every wordId is invalid', async () => {
    const companion = new OllamaCompanion(
      settings,
      respondWith(
        { guesses: [{ wordId: 'w3', confidence: 0.9, reasoning: '' }] },
        { guesses: [{ wordId: 'w1', confidence: 0.6, reasoning: '' }] },
      ),
    )
    const res = await companion.getGuesses(guessView)
    expect(res.guesses[0]!.wordId).toBe('w1')
  })
})
