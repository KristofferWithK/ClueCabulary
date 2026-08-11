import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS } from '../engine/config'
import { applyEvent, createGame, currentClue, isGuessable } from '../engine/game'
import { checkClueLegality } from '../engine/legality'
import type { BoardWord, GameState } from '../engine/types'
import { MockCompanion } from './mock/mockCompanion'
import { buildAiClueView, buildAiGuessView } from './projections'
import { planGuessExecution } from './companion'

const words = (n: number): BoardWord[] =>
  Array.from({ length: n }, (_, i) => ({
    wordId: `w${i}`,
    da: `dansk${i}ord${i}`,
    en: [`gloss${i}word${i}`],
    pos: 'noun',
  }))

function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return h >>> 0
}

/** A crude but legal player: hash-based guesses, generated legal clues. */
function playerClue(state: GameState, turn: number): string {
  for (let i = 0; i < 50; i++) {
    const candidate = `klods${turn}x${i}`
    if (checkClueLegality(candidate, state.words).legal) return candidate
  }
  throw new Error('could not produce a legal player clue')
}

async function playOneGame(seed: number, grid: 'beginner' | 'standard'): Promise<GameState> {
  const companion = new MockCompanion()
  let s = createGame({ config: GRID_CONFIGS[grid], words: words(GRID_CONFIGS[grid].totalWords), seed })
  let safety = 200

  while (s.phase !== 'finished' && safety-- > 0) {
    switch (s.phase) {
      case 'playerClueInput': {
        s = applyEvent(s, {
          type: 'SUBMIT_CLUE',
          by: 'player',
          text: playerClue(s, s.clueHistory.length),
          number: 1 + (hash(`n${seed}${s.clueHistory.length}`) % 3),
        })
        break
      }
      case 'aiGuessing': {
        const res = await companion.getGuesses(buildAiGuessView(s, 'en'))
        const plan = planGuessExecution(res.guesses, currentClue(s)!.number)
        for (const g of plan) {
          if (s.phase !== 'aiGuessing') break
          if (!isGuessable(s, g.wordId)) continue
          s = applyEvent(s, { type: 'GUESS', wordId: g.wordId })
        }
        if (s.phase === 'aiGuessing') s = applyEvent(s, { type: 'STOP_GUESSING' })
        break
      }
      case 'aiClueInput': {
        const clue = await companion.getClue(buildAiClueView(s, 'en'))
        s = applyEvent(s, {
          type: 'SUBMIT_CLUE',
          by: 'ai',
          text: clue.clue,
          number: clue.number,
          targets: clue.targetWordIds,
          rationale: clue.rationale,
        })
        break
      }
      case 'playerGuessing': {
        const clue = currentClue(s)!
        const open = s.words.filter((w) => isGuessable(s, w.wordId))
        const pick = open[hash(`${seed}${clue.text}${clue.guesses.length}`) % open.length]!
        s = applyEvent(s, { type: 'GUESS', wordId: pick.wordId })
        if (s.phase === 'playerGuessing' && hash(`stop${seed}${clue.guesses.length}`) % 2 === 0) {
          s = applyEvent(s, { type: 'STOP_GUESSING' })
        }
        break
      }
      case 'redemption': {
        // Half the games ace the translation quiz, half flunk one word.
        const flunk = seed % 2 === 0
        const prompted = s.words.filter((w) => s.redemption!.promptWordIds.includes(w.wordId))
        const answers = Object.fromEntries(
          prompted.map((w, i) => [w.wordId, flunk && i === 0 ? 'wrong' : w.en[0]!]),
        )
        s = applyEvent(s, { type: 'SUBMIT_REDEMPTION', answers })
        break
      }
    }
  }
  expect(safety).toBeGreaterThan(0)
  return s
}

describe('self-play: engine + mock companion never reach an illegal state', () => {
  it.each(['beginner', 'standard'] as const)('50 full %s games all terminate', async (grid) => {
    const outcomes: Record<string, number> = {}
    for (let seed = 1; seed <= 50; seed++) {
      const end = await playOneGame(seed, grid)
      expect(end.outcome).toBeDefined()
      const key = `${end.outcome!.result}:${end.outcome!.reason}`
      outcomes[key] = (outcomes[key] ?? 0) + 1
    }
    // Random-ish play must at least produce game-overs of more than one kind.
    expect(Object.keys(outcomes).length).toBeGreaterThan(1)
  })
})
