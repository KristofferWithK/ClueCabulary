import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS } from '../engine/config'
import { applyEvent, createGame } from '../engine/game'
import type { BoardWord } from '../engine/types'
import { buildAiClueView, buildAiGuessView, type FlaggedCall } from './projections'
import { buildCluePrompt, buildGuessPrompt } from './prompts'

const words = (n: number): BoardWord[] =>
  Array.from({ length: n }, (_, i) => ({
    wordId: `w${i}`,
    da: `dansk${i}ord${i}`,
    en: [`gloss${i}word${i}`],
    pos: 'noun' as const,
  }))

const start = (firstGiver: 'player' | 'ai' = 'ai') =>
  createGame({ config: GRID_CONFIGS.beginner, words: words(12), seed: 7, firstGiver })

const cluePrompt = (flagged: FlaggedCall[] = []) =>
  buildCluePrompt(buildAiClueView(start('ai'), 'da', flagged))
    .map((m) => m.content)
    .join('\n')

const guessPrompt = (flagged: FlaggedCall[] = []) => {
  const s = applyEvent(start('player'), {
    type: 'SUBMIT_CLUE',
    by: 'player',
    text: 'huskeliste',
    number: 2,
  })
  return buildGuessPrompt(buildAiGuessView(s, 'da', flagged))
    .map((m) => m.content)
    .join('\n')
}

const BAD_CLUE: FlaggedCall = {
  kind: 'clue',
  what: 'køkken',
  why: 'Both are things you find in a kitchen.',
}
const BAD_GUESS: FlaggedCall = {
  kind: 'guess',
  what: 'hvid',
  underClue: 'foster',
  why: 'It was the only one that felt close.',
}

/**
 * "There should be a way to flag bad clues or guesses in the review page where
 * the user can see the reasoning for it."
 *
 * The flag lives on the review page because that is the only screen where the
 * reasoning is visible, and a verdict on a clue is worth nothing next to a card
 * with no account attached. What makes it worth tapping is that Cluey is shown
 * the ones you flag — a flag that goes nowhere is a dead button.
 */
describe('flagged calls reach Cluey', () => {
  it('are absent from both prompts when nothing is flagged', () => {
    expect(cluePrompt()).not.toMatch(/marked as bad/i)
    expect(guessPrompt()).not.toMatch(/marked as bad/i)
  })

  it('a flagged clue is quoted back to him when he next gives one', () => {
    const text = cluePrompt([BAD_CLUE])
    expect(text).toMatch(/marked as bad/i)
    expect(text).toContain('køkken')
  })

  /** His own sentence, not a summary — being shown it is what makes it land. */
  it('with the reasoning he gave at the time', () => {
    expect(cluePrompt([BAD_CLUE])).toContain('Both are things you find in a kitchen.')
  })

  it('a flagged guess names the clue it was made under', () => {
    const text = guessPrompt([BAD_GUESS])
    expect(text).toContain('hvid')
    expect(text).toContain('foster')
  })

  it('both kinds reach both prompts, since he does both jobs', () => {
    for (const text of [cluePrompt([BAD_CLUE, BAD_GUESS]), guessPrompt([BAD_CLUE, BAD_GUESS])]) {
      expect(text).toContain('køkken')
      expect(text).toContain('hvid')
    }
  })

  /** A long history must not crowd out the board he has to read. */
  it('caps the list rather than growing without bound', () => {
    const many: FlaggedCall[] = Array.from({ length: 20 }, (_, i) => ({
      kind: 'clue',
      what: `flag${i}`,
    }))
    const text = cluePrompt(many)
    expect(text).toContain('flag0')
    expect(text).not.toContain('flag19')
  })

  it('and tells him not to bring it up with the player', () => {
    expect(cluePrompt([BAD_CLUE])).toMatch(/do not mention this list/i)
  })
})

/**
 * A flag carries a clue word, a Danish board word and Cluey's own sentence —
 * no key data at all. That is true by construction, and asserted anyway,
 * because the flag is the newest thing to cross the projection boundary and a
 * future field added to Flag would ride straight through it.
 */
describe('flags carry nothing about anybody key', () => {
  it('the projection copies named fields rather than spreading the object', () => {
    const sneaky = {
      ...BAD_CLUE,
      // Shape of something a store might grow later. The value is a sentinel
      // rather than a real role: "forbidden" appears all over the clue prompt
      // legitimately, since Cluey is shown his OWN key there.
      playerKey: { w0: 'LEAKED_PLAYER_KEY' },
      id: 'c:7:0',
      at: 1234,
    } as unknown as FlaggedCall
    const view = buildAiClueView(start('ai'), 'da', [sneaky])
    expect(Object.keys(view.flagged[0]!).sort()).toEqual(['kind', 'underClue', 'what', 'why'])
    expect(JSON.stringify(buildCluePrompt(view))).not.toContain('LEAKED_PLAYER_KEY')
    expect(JSON.stringify(buildGuessPrompt(buildAiGuessView(
      applyEvent(start('player'), { type: 'SUBMIT_CLUE', by: 'player', text: 'huskeliste', number: 2 }),
      'da',
      [sneaky],
    )))).not.toContain('LEAKED_PLAYER_KEY')
  })

  it('and the prompt is unchanged by a flag list that is empty either way', () => {
    expect(cluePrompt([])).toBe(cluePrompt())
    expect(guessPrompt([])).toBe(guessPrompt())
  })
})
