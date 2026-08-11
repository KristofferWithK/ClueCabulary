import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS } from './config'
import {
  IllegalClueError,
  IllegalEventError,
  applyEvent,
  createGame,
  isGuessable,
  remainingGreenIds,
} from './game'
import type { BoardWord, CardRole, GameState, Side } from './types'

// Word forms chosen so simple test clues never collide with legality checks.
const makeWords = (n: number): BoardWord[] =>
  Array.from({ length: n }, (_, i) => ({
    wordId: `w${i}`,
    da: `xq${i}`,
    en: [`zz${i}`],
    pos: 'noun',
  }))

const newGame = (grid: 'beginner' | 'standard' = 'beginner', seed = 7, firstGiver: Side = 'player') =>
  createGame({
    config: GRID_CONFIGS[grid],
    words: makeWords(GRID_CONFIGS[grid].totalWords),
    seed,
    firstGiver,
  })

const keyOf = (s: GameState, side: Side) => (side === 'player' ? s.playerKey : s.aiKey)

/** A guessable word with the given role on the current giver's key. */
function findGuessable(s: GameState, giver: Side, role: CardRole): string {
  const key = keyOf(s, giver)
  const id = Object.keys(key).find((w) => key[w] === role && isGuessable(s, w))
  if (!id) throw new Error(`no guessable ${role} word for ${giver}`)
  return id
}

const clue = (s: GameState, by: Side, number: number) =>
  applyEvent(s, { type: 'SUBMIT_CLUE', by, text: 'klods', number })

describe('full game flows', () => {
  it('wins by finding all distinct greens', () => {
    let s = newGame()
    let safety = 50
    while (s.phase !== 'finished' && safety-- > 0) {
      const giver = s.phase === 'playerClueInput' ? 'player' : 'ai'
      s = clue(s, giver, 4)
      // Guesser plays perfectly: only giver-key greens, up to the cap.
      while (s.phase === 'aiGuessing' || s.phase === 'playerGuessing') {
        const key = keyOf(s, giver)
        const target = Object.keys(key).find((w) => key[w] === 'green' && isGuessable(s, w))
        if (!target) {
          s = applyEvent(s, { type: 'STOP_GUESSING' })
          break
        }
        s = applyEvent(s, { type: 'GUESS', wordId: target })
      }
    }
    expect(s.outcome).toEqual({ result: 'won', reason: 'all-greens' })
    expect(remainingGreenIds(s)).toEqual([])
    expect(s.turnsLeft).toBeGreaterThan(0)
  })

  it('loses by timeout when every turn hits a bystander', () => {
    let s = newGame()
    while (s.phase !== 'finished') {
      const giver = s.phase === 'playerClueInput' ? 'player' : 'ai'
      s = clue(s, giver, 1)
      s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, giver, 'bystander') })
    }
    expect(s.outcome).toEqual({ result: 'lost', reason: 'timeout' })
    expect(s.turnsLeft).toBe(0)
  })

  it('forbidden word triggers redemption; correct answers redeem the game', () => {
    let s = clue(newGame(), 'player', 2)
    // Reveal one green first so the prompt list excludes it.
    const green = findGuessable(s, 'player', 'green')
    s = applyEvent(s, { type: 'GUESS', wordId: green })
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'forbidden') })

    expect(s.phase).toBe('redemption')
    expect(s.redemption!.promptWordIds).not.toContain(green)
    expect(s.redemption!.promptWordIds.length).toBe(s.config.totalWords - 1)

    const answers = Object.fromEntries(
      s.words.filter((w) => s.redemption!.promptWordIds.includes(w.wordId)).map((w) => [w.wordId, w.en[0]!]),
    )
    const won = applyEvent(s, { type: 'SUBMIT_REDEMPTION', answers })
    expect(won.outcome).toEqual({ result: 'won', reason: 'redeemed' })

    const lost = applyEvent(s, {
      type: 'SUBMIT_REDEMPTION',
      answers: { ...answers, [s.redemption!.promptWordIds[0]!]: 'utterly wrong' },
    })
    expect(lost.outcome).toEqual({ result: 'lost', reason: 'forbidden-failed' })
    expect(lost.redemption!.results!.some((r) => !r.accepted)).toBe(true)
  })

  it('bystander reveals are directional: blocked for one giver, guessable for the other', () => {
    // standard grid guarantees words that are bystander on the player key but green on the AI key
    let s = newGame('standard')
    const target = Object.keys(s.playerKey).find(
      (w) => s.playerKey[w] === 'bystander' && s.aiKey[w] === 'green',
    )!
    s = clue(s, 'player', 1)
    s = applyEvent(s, { type: 'GUESS', wordId: target })
    expect(s.reveals[target]).toEqual({ kind: 'bystander', against: ['player'] })
    expect(s.phase).toBe('aiClueInput')

    // Under the AI's clue the same word is guessable — and green.
    s = clue(s, 'ai', 1)
    expect(isGuessable(s, target)).toBe(true)
    s = applyEvent(s, { type: 'GUESS', wordId: target })
    expect(s.reveals[target]).toEqual({ kind: 'green' })

    // A double-bystander revealed under the AI's clue blocks only that direction…
    const blocked = Object.keys(s.playerKey).find(
      (w) => s.playerKey[w] === 'bystander' && s.aiKey[w] === 'bystander' && isGuessable(s, w),
    )!
    s = applyEvent(s, { type: 'GUESS', wordId: blocked }) // bystander vs aiKey, ends the turn
    s = clue(s, 'player', 1)
    expect(isGuessable(s, blocked)).toBe(true) // …so it stays open under the player's clue
    s = applyEvent(s, { type: 'GUESS', wordId: blocked }) // bystander vs playerKey too
    expect(s.reveals[blocked]).toEqual({ kind: 'bystander', against: ['ai', 'player'] })
    s = clue(s, 'ai', 1)
    expect(isGuessable(s, blocked)).toBe(false) // now blocked in both directions
  })

  it('caps guesses at number + 1', () => {
    let s = clue(newGame(), 'player', 1)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'green') })
    expect(s.phase).toBe('aiGuessing')
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'green') })
    // Two guesses on a "1" clue: turn ends automatically.
    expect(s.phase).toBe('aiClueInput')
    expect(s.turnsLeft).toBe(s.config.turnTokens - 1)
  })
})

describe('illegal events', () => {
  it('rejects clue from the wrong side or phase', () => {
    const s = newGame()
    expect(() => applyEvent(s, { type: 'SUBMIT_CLUE', by: 'ai', text: 'klods', number: 1 })).toThrow(
      IllegalEventError,
    )
  })

  it('rejects illegal clue text via legality check', () => {
    const s = newGame()
    expect(() => applyEvent(s, { type: 'SUBMIT_CLUE', by: 'player', text: 'xq3', number: 1 })).toThrow(
      IllegalClueError,
    )
  })

  it('rejects out-of-range clue numbers', () => {
    const s = newGame()
    for (const number of [0, 5, 1.5]) {
      expect(() => applyEvent(s, { type: 'SUBMIT_CLUE', by: 'player', text: 'klods', number })).toThrow(
        IllegalEventError,
      )
    }
  })

  it('rejects guessing outside guessing phases and stopping with zero guesses', () => {
    const s = newGame()
    expect(() => applyEvent(s, { type: 'GUESS', wordId: 'w0' })).toThrow(IllegalEventError)
    const afterClue = clue(s, 'player', 1)
    expect(() => applyEvent(afterClue, { type: 'STOP_GUESSING' })).toThrow(IllegalEventError)
  })

  it('rejects re-guessing revealed words', () => {
    let s = clue(newGame(), 'player', 2)
    const green = findGuessable(s, 'player', 'green')
    s = applyEvent(s, { type: 'GUESS', wordId: green })
    expect(() => applyEvent(s, { type: 'GUESS', wordId: green })).toThrow(IllegalEventError)
  })

  it('rejects redemption submission outside redemption phase', () => {
    const s = newGame()
    expect(() => applyEvent(s, { type: 'SUBMIT_REDEMPTION', answers: {} })).toThrow(IllegalEventError)
  })

  it('does not mutate the input state', () => {
    const s = newGame()
    const snapshot = JSON.stringify(s)
    clue(s, 'player', 2)
    expect(JSON.stringify(s)).toBe(snapshot)
  })
})
