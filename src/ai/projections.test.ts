import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS } from '../engine/config'
import { applyEvent, createGame } from '../engine/game'
import type { BoardWord, CardRole, GameState } from '../engine/types'
import {
  aiGuessableIds,
  aiTargetableIds,
  buildAiClueView,
  buildAiGuessView,
  buildDebriefView,
} from './projections'
import { buildCluePrompt, buildGuessPrompt } from './prompts'

const words = (n: number): BoardWord[] =>
  Array.from({ length: n }, (_, i) => ({
    wordId: `w${i}`,
    da: `dansk${i}ord${i}`,
    en: [`gloss${i}word${i}`],
    pos: 'noun',
  }))

const game = (seed: number): GameState =>
  createGame({ config: GRID_CONFIGS.standard, words: words(20), seed })

/** Cyclically reassign the roles among words — same counts, different key. */
function permuteKey(key: Record<string, CardRole>): Record<string, CardRole> {
  const ids = Object.keys(key).sort()
  const roles = ids.map((id) => key[id]!)
  const shifted = [...roles.slice(1), roles[0]!]
  return Object.fromEntries(ids.map((id, i) => [id, shifted[i]!]))
}

/** A game paused mid-flow: player clue given (AI about to guess). */
function atAiGuessing(seed: number): GameState {
  return applyEvent(game(seed), { type: 'SUBMIT_CLUE', by: 'player', text: 'klods', number: 2 })
}

/** A game with an AI clue in history carrying secret targets + rationale. */
function withAiSecrets(seed: number): GameState {
  let s = atAiGuessing(seed)
  const bystander = Object.keys(s.playerKey).find((w) => s.playerKey[w] === 'bystander')!
  s = applyEvent(s, { type: 'GUESS', wordId: bystander })
  return applyEvent(s, {
    type: 'SUBMIT_CLUE',
    by: 'ai',
    text: 'zonk',
    number: 1,
    targets: ['w1'],
    rationale: 'SECRETRATIONALE',
  })
}

describe('firewall invariance', () => {
  it('clue prompt is byte-identical under player-key permutation (100 seeds)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = atAiGuessing(seed)
      const permuted: GameState = { ...s, playerKey: permuteKey(s.playerKey) }
      const a = JSON.stringify(buildCluePrompt(buildAiClueView(s, 'en')))
      const b = JSON.stringify(buildCluePrompt(buildAiClueView(permuted, 'en')))
      expect(b).toBe(a)
    }
  })

  it('guess prompt is byte-identical under permutation of BOTH keys (100 seeds)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = atAiGuessing(seed)
      const permuted: GameState = {
        ...s,
        playerKey: permuteKey(s.playerKey),
        aiKey: permuteKey(s.aiKey),
      }
      const a = JSON.stringify(buildGuessPrompt(buildAiGuessView(s, 'en')))
      const b = JSON.stringify(buildGuessPrompt(buildAiGuessView(permuted, 'en')))
      expect(b).toBe(a)
    }
  })

  it('mid-game prompts never contain stored AI rationale/targets or key fields', () => {
    const s = withAiSecrets(3)
    const clueText = JSON.stringify(buildCluePrompt(buildAiClueView(s, 'en')))
    expect(clueText).not.toContain('SECRETRATIONALE')
    expect(clueText).not.toContain('playerKey')
    // The player-clue guess view exists at the aiGuessing point of a fresh game.
    const guessing = atAiGuessing(3)
    const guessText = JSON.stringify(buildGuessPrompt(buildAiGuessView(guessing, 'en')))
    expect(guessText).not.toContain('SECRETRATIONALE')
    expect(guessText).not.toContain('my key')
    expect(guessText).not.toContain('playerKey')
    expect(guessText).not.toContain('FORBIDDEN on your key')
  })
})

describe('projection helpers', () => {
  it('aiTargetableIds returns exactly the unrevealed greens of the AI key', () => {
    const s = atAiGuessing(5)
    const view = buildAiClueView(s, 'en')
    const expected = Object.keys(s.aiKey).filter((id) => s.aiKey[id] === 'green')
    expect(aiTargetableIds(view).sort()).toEqual(expected.sort())
  })

  it('aiGuessableIds excludes revealed words and player-direction bystanders', () => {
    let s = atAiGuessing(5)
    const bystander = Object.keys(s.playerKey).find((w) => s.playerKey[w] === 'bystander')!
    s = applyEvent(s, { type: 'GUESS', wordId: bystander })
    // Re-enter an AI-guessing phase to build a guess view with history present.
    s = applyEvent(s, { type: 'SUBMIT_CLUE', by: 'ai', text: 'zonk', number: 1 })
    const greenOnAi = Object.keys(s.aiKey).find((w) => s.aiKey[w] === 'green')!
    s = applyEvent(s, { type: 'GUESS', wordId: greenOnAi })
    s = applyEvent(s, { type: 'STOP_GUESSING' })
    s = applyEvent(s, { type: 'SUBMIT_CLUE', by: 'player', text: 'klods', number: 1 })

    const ids = aiGuessableIds(buildAiGuessView(s, 'en'))
    expect(ids).not.toContain(bystander) // bystander revealed under a player clue
    expect(ids).not.toContain(greenOnAi) // revealed green is done
  })

  it('debrief view exposes both keys only after the game is finished', () => {
    const s = atAiGuessing(5)
    expect(() => buildDebriefView(s, [])).toThrow()
  })
})
