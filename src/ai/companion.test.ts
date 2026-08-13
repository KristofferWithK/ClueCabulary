import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiError, type AiSettings } from './client'
import { OllamaCompanion, planGuessExecution } from './companion'
import type { AiClueView, AiGuessView } from './projections'
import type { ChatMessage } from './prompts'

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
  flagged: [],
}

const guessView: AiGuessView = {
  kind: 'ai-guess',
  clueLanguage: 'en',
  turnsLeft: 5,
  words: clueView.words.map(({ roleOnMyKey: _role, ...w }) => w),
  currentClue: { text: 'husdyr', number: 2 },
  history: [],
  flagged: [],
}

// Args are declared so a test can inspect what was actually sent — the
// corrective retry's text is the interesting part of a rejected reply.
const respondWith = (...replies: unknown[]) => {
  let i = 0
  return async (_settings: AiSettings, _messages: ChatMessage[], _opts?: unknown) => {
    if (i >= replies.length) throw new Error('unexpected extra AI call')
    return replies[i++]
  }
}

/**
 * A model that never corrects itself, however often it is asked. One more reply
 * than there are attempts, so "it gave up too early" fails as loudly as "it kept
 * going" — running out of replies throws a plain Error, not the AiError the
 * give-up tests assert.
 */
const refuseForever = (reply: unknown) => Array<unknown>(8).fill(reply)

// Giving up logs the validator's own words for whoever is debugging. Silenced
// here so a passing suite stays readable; one test reads the spy instead.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('planGuessExecution', () => {
  const g = (wordId: string, confidence: number) => ({ wordId, confidence, reasoning: '' })

  it('orders by confidence and caps at the number', () => {
    const plan = planGuessExecution([g('a', 0.5), g('c', 0.95), g('b', 0.8), g('d', 0.9)], 2)
    expect(plan.map((x) => x.wordId)).toEqual(['c', 'd'])
  })

  /**
   * There is no bonus guess any more — the engine ends the turn on the number-th
   * correct one — so planning a third here would only queue a guess the engine
   * refuses, in a phase that has already moved on.
   */
  it('plans no guess past the number, however sure', () => {
    const plan = planGuessExecution([g('a', 0.99), g('b', 0.99), g('c', 0.99)], 1)
    expect(plan.map((x) => x.wordId)).toEqual(['a'])
  })

  it('stops at the first guess under 0.35', () => {
    const plan = planGuessExecution([g('a', 0.9), g('b', 0.2), g('c', 0.1)], 3)
    expect(plan.map((x) => x.wordId)).toEqual(['a'])
  })

  /**
   * The rules require a guess every turn — the engine refuses STOP_GUESSING
   * before one has been made — so there is nowhere for a refusal to go and the
   * top-ranked word is played whatever confidence it carries.
   *
   * This is correct, and for a long time the prompt said the opposite: "under
   * 0.35: do not guess this", to a model whose 0.05 pick was named on the board
   * anyway. A player asked why Klaus answered «hvid» to the clue «foster», and
   * the answer is that he did not think they were related — he was made to say
   * it. The prompt now tells him the ranking is the decision.
   */
  it('always guesses at least once, however unsure — the ranking is the decision', () => {
    expect(planGuessExecution([g('a', 0.05)], 3).map((x) => x.wordId)).toEqual(['a'])
    expect(planGuessExecution([g('a', 0)], 1).map((x) => x.wordId)).toEqual(['a'])
    // Even when a later word is over the floor: order decides, not the floor.
    expect(planGuessExecution([g('a', 0.1), g('b', 0.05)], 2).map((x) => x.wordId)).toEqual(['a'])
  })
})

describe('OllamaCompanion.getClue', () => {
  /**
   * This test used to assert the trimming — "filters targets to its own
   * unrevealed greens" — and the trimming was the bug. Dropping w2, w3 and
   * "nonsense" while keeping the word "dyreliv" leaves a clue chosen for five
   * words pointing at two, with three of the five sitting on the board
   * scoring nothing. Rejected now, and the retry is the fix.
   */
  it('refuses a clue whose targets are not all its own unrevealed greens', async () => {
    const bad = {
      clue: 'dyreliv',
      number: 3,
      targetWordIds: ['w0', 'w1', 'w2', 'w3', 'nonsense'],
      rationale: 'animals',
    }
    const good = { clue: 'kæledyr', number: 2, targetWordIds: ['w0', 'w1'], rationale: 'pets' }
    const chat = vi.fn(respondWith(bad, good))
    const clue = await new OllamaCompanion(settings, chat).getClue(clueView)
    expect(clue.clue).toBe('kæledyr')
    expect(clue.targetWordIds).toEqual(['w0', 'w1'])
    expect(clue.number).toBe(2)
    expect(chat).toHaveBeenCalledTimes(2)
  })

  it('accepts one whose targets are all its own, first time', async () => {
    const companion = new OllamaCompanion(
      settings,
      respondWith({ clue: 'kæledyr', number: 2, targetWordIds: ['w0', 'w1'], rationale: 'pets' }),
    )
    const clue = await companion.getClue(clueView)
    expect(clue.targetWordIds).toEqual(['w0', 'w1'])
    expect(clue.number).toBe(2)
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

  it('throws a typed error once the corrections are spent', async () => {
    const companion = new OllamaCompanion(settings, respondWith(...refuseForever({ nope: true })))
    await expect(companion.getClue(clueView)).rejects.toThrowError(AiError)
  })

  /**
   * Reported with a screenshot: the round stopped on "The AI kept answering
   * invalidly: w1 (bog) is not an unrevealed GREEN word on your key…".
   *
   * Every word of that is written for the model. The player is not writing the
   * prompt and cannot act on any of it — they are told their game is stuck in
   * the vocabulary of the thing that got stuck. The detail still exists; it goes
   * to the console, where whoever is debugging can read it.
   */
  it('tells the player what happened to their game, not what the validator said', async () => {
    const companion = new OllamaCompanion(
      settings,
      respondWith(
        ...refuseForever({ clue: 'dyr', number: 1, targetWordIds: ['w2'], rationale: 'x' }),
      ),
    )
    const err = await companion.getClue(clueView).then(
      () => null,
      (e: unknown) => e as AiError,
    )
    expect(err).toBeInstanceOf(AiError)
    expect(err!.message).toBe('Klaus could not settle on a clue for the words he is holding.')
    expect(err!.message).not.toMatch(/GREEN|wordId|JSON|schema|invalid/i)
    // …but the diagnostic is not thrown away.
    expect(vi.mocked(console.warn).mock.calls[0]![0]).toContain('bil')
  })

  /**
   * One retry was not enough on the boards where the check actually fires: the
   * strongest association belongs to a word that is not Klaus's, so his second
   * answer tends to be his first answer again. The third and fourth attempts
   * are the ones that land.
   */
  it('keeps correcting past the second attempt instead of failing the turn', async () => {
    const notHis = { clue: 'køretøj', number: 1, targetWordIds: ['w2'], rationale: 'x' }
    const his = { clue: 'kæledyr', number: 2, targetWordIds: ['w0', 'w1'], rationale: 'x' }
    const chat = vi.fn(respondWith(notHis, notHis, notHis, his))
    const clue = await new OllamaCompanion(settings, chat).getClue(clueView)
    expect(clue.clue).toBe('kæledyr')
    expect(chat).toHaveBeenCalledTimes(4)
  })

  it('lets the later attempts wander further than the first', async () => {
    const notHis = { clue: 'køretøj', number: 1, targetWordIds: ['w2'], rationale: 'x' }
    const his = { clue: 'kæledyr', number: 2, targetWordIds: ['w0', 'w1'], rationale: 'x' }
    const chat = vi.fn(respondWith(notHis, notHis, his))
    await new OllamaCompanion(settings, chat).getClue(clueView)
    const tempOf = (i: number) => (chat.mock.calls[i]![2] as { temperature: number }).temperature
    // The first correction repeats the question as asked; only once that has
    // failed too is repeating the question the thing that must change.
    expect(tempOf(1)).toBe(tempOf(0))
    expect(tempOf(2)).toBeGreaterThan(tempOf(1))
  })

  it('shows the model its own rejected replies, not just a complaint', async () => {
    const notHis = { clue: 'køretøj', number: 1, targetWordIds: ['w2'], rationale: 'x' }
    const his = { clue: 'kæledyr', number: 2, targetWordIds: ['w0', 'w1'], rationale: 'x' }
    const chat = vi.fn(respondWith(notHis, notHis, his))
    await new OllamaCompanion(settings, chat).getClue(clueView)
    const third = chat.mock.calls[2]![1] as ChatMessage[]
    expect(third.filter((m) => m.role === 'assistant')).toHaveLength(2)
    expect(JSON.stringify(third)).toContain('køretøj')
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

/**
 * Reported from a real game: "Klaus clued ocean twice and each time I took
 * something obvious like water or fish and it was wrong."
 *
 * He had named water, fish and beach as his targets; only beach was green on
 * his key. getClue used to silently drop the other two, keep the word "ocean",
 * and rewrite the number to 1 — so the player was shown «ocean» (1) on a board
 * where water and fish are the two most obvious ocean words and neither scores.
 * The clue pointed away from the only word it could pay for.
 *
 * This is not a corner case. The deal makes Klaus's greens the words the player
 * knows least and the hazards the ones they know best, so the obvious referent
 * of a clue is disproportionately not his to give.
 */
describe('a clue is only as good as the targets it was chosen for', () => {
  const ocean: AiClueView = {
    kind: 'ai-clue',
    clueLanguage: 'en',
    turnsLeft: 5,
    words: [
      { id: 'w0', da: 'vand', en: ['water'], pos: 'noun', reveal: { kind: 'hidden' }, roleOnMyKey: 'bystander' },
      { id: 'w1', da: 'fisk', en: ['fish'], pos: 'noun', reveal: { kind: 'hidden' }, roleOnMyKey: 'bystander' },
      { id: 'w2', da: 'strand', en: ['beach'], pos: 'noun', reveal: { kind: 'hidden' }, roleOnMyKey: 'green' },
      { id: 'w3', da: 'stol', en: ['chair'], pos: 'noun', reveal: { kind: 'hidden' }, roleOnMyKey: 'green' },
    ],
    history: [],
    flagged: [],
  }
  const oceanReply = {
    clue: 'ocean',
    number: 3,
    targetWordIds: ['w0', 'w1', 'w2'],
    rationale: 'Water, fish and the beach are all the sea.',
  }

  it('refuses the reply instead of quietly keeping the word and dropping the words', async () => {
    const good = { clue: 'sand', number: 1, targetWordIds: ['w2'], rationale: 'A beach is sand.' }
    const chat = vi.fn(respondWith(oceanReply, good))
    const res = await new OllamaCompanion(settings, chat).getClue(ocean)
    expect(res.clue).toBe('sand')
    expect(res.targetWordIds).toEqual(['w2'])
    expect(chat).toHaveBeenCalledTimes(2)
  })

  it('and tells him which word was not his, by name, so the retry can fix it', async () => {
    const good = { clue: 'sand', number: 1, targetWordIds: ['w2'], rationale: 'x' }
    const chat = vi.fn(respondWith(oceanReply, good))
    await new OllamaCompanion(settings, chat).getClue(ocean)
    const retry = JSON.stringify(chat.mock.calls[1]![1])
    expect(retry).toContain('vand')
    expect(retry).toContain('fisk')
    // And what he may have instead.
    expect(retry).toContain('strand')
  })

  it('gives up rather than serving a clue whose targets it had to invent', async () => {
    const chat = vi.fn(respondWith(...refuseForever(oceanReply)))
    await expect(new OllamaCompanion(settings, chat).getClue(ocean)).rejects.toThrow(AiError)
  })

  it('accepts a reply whose targets are all his, and counts them itself', async () => {
    const reply = { clue: 'sidde', number: 1, targetWordIds: ['w2', 'w3'], rationale: 'x' }
    const res = await new OllamaCompanion(settings, respondWith(reply)).getClue(ocean)
    // Number follows the targets, not the model's arithmetic.
    expect(res.number).toBe(2)
    expect(res.targetWordIds).toEqual(['w2', 'w3'])
  })

  it('still collapses a duplicate id without calling it an error', async () => {
    const reply = { clue: 'sand', number: 2, targetWordIds: ['w2', 'w2'], rationale: 'x' }
    const res = await new OllamaCompanion(settings, respondWith(reply)).getClue(ocean)
    expect(res.targetWordIds).toEqual(['w2'])
    expect(res.number).toBe(1)
  })
})
