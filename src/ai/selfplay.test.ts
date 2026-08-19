import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS, WRAPUP_CONFIG } from '../engine/config'
import {
  applyEvent,
  createGame,
  currentClue,
  isGuessable,
  targetableGreenIds,
} from '../engine/game'
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

async function playOneGame(seed: number, grid: 'beginner' | 'standard' | 'wrapup'): Promise<GameState> {
  const companion = new MockCompanion()
  const config = grid === 'wrapup' ? WRAPUP_CONFIG : GRID_CONFIGS[grid]
  let s = createGame({ config, words: words(config.totalWords), seed })
  let safety = 200

  while (s.phase !== 'finished' && safety-- > 0) {
    switch (s.phase) {
      case 'playerClueInput': {
        expect(targetableGreenIds(s, 'player').length).toBeGreaterThan(0)
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
        // Engine invariant: a side is only asked to clue while it can.
        expect(targetableGreenIds(s, 'ai').length).toBeGreaterThan(0)
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
      /**
       * Clues spent, board unfinished. The player names words until the board
       * is clear or one of them is not green. Played here at random, which is
       * the point: whatever it picks, the engine must stay in a legal state
       * and the game must still terminate.
       */
      case 'suddenDeath': {
        const open = s.words.filter((w) => isGuessable(s, w.wordId))
        if (open.length === 0 || hash(`sd${seed}${open.length}`) % 7 === 0) {
          s = applyEvent(s, { type: 'STOP_GUESSING' })
          break
        }
        const pick = open[hash(`sd${seed}${open.length}`) % open.length]!
        s = applyEvent(s, { type: 'GUESS', wordId: pick.wordId })
        break
      }
      // There was a 'redemption' arm here, playing the translate-everything
      // last chance and flunking one word on half the seeds. The phase no
      // longer exists.
    }
  }
  expect(safety).toBeGreaterThan(0)
  return s
}

/**
 * The wrap-up board rides the same harness — its packing phase lives above the
 * engine, so an engine round on WRAPUP_CONFIG is just a round.
 *
 * This harness is where the boards' know-nothing forbidden rates were measured
 * (6.4% of guesses on the wrap-up board against 16.0% on standard's 4x5, which
 * is the sentence config.ts used to carry). Nothing on a board is fatal now, so
 * that measurement is retired rather than updated. What this harness should be
 * asked next is the win rate: with the only losing ending being the clock, the
 * question "are these token counts still right" is open and unmeasured.
 */
describe('self-play: engine + mock companion never reach an illegal state', () => {
  it.each(['beginner', 'standard', 'wrapup'] as const)('50 full %s games all terminate', async (grid) => {
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
