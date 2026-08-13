import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS, REDEMPTION_AFTER_ROUND } from './config'
import {
  IllegalClueError,
  IllegalEventError,
  applyEvent,
  createGame,
  giverOf,
  isGuessable,
  remainingGreenIds,
  targetableGreenIds,
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

// Pins the opener explicitly, so these tests keep reading the same way if the
// default ever moves again. The default itself is asserted against createGame
// directly, in 'who opens the round'.
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

/**
 * Play `n` complete clue-turns, each ended by a bystander guess, and stop in a
 * clue-input phase. The way to reach a state where the last chance has opened.
 */
function burnClues(s: GameState, n: number): GameState {
  while (s.clueHistory.length < n) {
    const giver: Side = s.phase === 'playerClueInput' ? 'player' : 'ai'
    s = clue(s, giver, 1)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, giver, 'bystander') })
  }
  return s
}

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

  it('runs out of clues into sudden death, not into a loss', () => {
    let s = newGame()
    while (s.phase === 'playerClueInput' || s.phase === 'aiClueInput') {
      const giver = s.phase === 'playerClueInput' ? 'player' : 'ai'
      s = clue(s, giver, 1)
      s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, giver, 'bystander') })
    }
    // Every turn burned on a neutral, so nothing was found and the tokens are
    // gone — and the round is still alive, which is the point of the change.
    expect(s.turnsLeft).toBe(0)
    expect(s.phase).toBe('suddenDeath')
    expect(s.outcome).toBeUndefined()
    expect(remainingGreenIds(s).length).toBeGreaterThan(0)
  })

  it('forbidden word triggers redemption; correct answers redeem the game', () => {
    // Into the eligible window first: the last chance opens only after
    // REDEMPTION_AFTER_ROUND clues, so this used to fire on clue 1 and now
    // cannot.
    let s = burnClues(newGame(), REDEMPTION_AFTER_ROUND)
    s = clue(s, s.phase === 'playerClueInput' ? 'player' : 'ai', 2)
    expect(s.clueHistory.length).toBe(REDEMPTION_AFTER_ROUND + 1)
    const giver = giverOf(s.phase)
    // Reveal one green first so the prompt list excludes it.
    const green = findGuessable(s, giver, 'green')
    s = applyEvent(s, { type: 'GUESS', wordId: green })
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, giver, 'forbidden') })

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

  /**
   * "The last chance redemption should only be triggered after round 4."
   *
   * A round is a clue. Before the threshold a forbidden word ends the round
   * where it stands, with its own ending — not 'forbidden-failed', which every
   * screen describes as losing a translation challenge that in this case never
   * ran.
   */
  describe('the last chance opens only after four clues', () => {
    const hitForbidden = (s: GameState) => {
      const giver = giverOf(s.phase)
      return applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, giver, 'forbidden') })
    }

    it('ends the round on the spot on the opening clue', () => {
      const s = hitForbidden(clue(newGame(), 'player', 2))
      expect(s.phase).toBe('finished')
      expect(s.outcome).toEqual({ result: 'lost', reason: 'forbidden-hit' })
      expect(s.redemption).toBeUndefined()
    })

    it('and on the fourth, the last clue before it opens', () => {
      let s = burnClues(newGame(), REDEMPTION_AFTER_ROUND - 1)
      s = clue(s, s.phase === 'playerClueInput' ? 'player' : 'ai', 2)
      expect(s.clueHistory.length).toBe(REDEMPTION_AFTER_ROUND)
      expect(hitForbidden(s).outcome).toEqual({ result: 'lost', reason: 'forbidden-hit' })
    })

    it('opens on the fifth', () => {
      let s = burnClues(newGame(), REDEMPTION_AFTER_ROUND)
      s = clue(s, s.phase === 'playerClueInput' ? 'player' : 'ai', 2)
      expect(hitForbidden(s).phase).toBe('redemption')
    })

    /** The card is shown either way, so the debrief can name what ended it. */
    it('reveals the word whichever side of the line it falls', () => {
      const early = clue(newGame(), 'player', 2)
      const id = findGuessable(early, 'player', 'forbidden')
      expect(applyEvent(early, { type: 'GUESS', wordId: id }).reveals[id]).toEqual({
        kind: 'forbidden',
      })
    })

    /**
     * Sudden death has always ended on a wrong name and is untouched: a
     * forbidden word there is still 'sudden-death', not 'forbidden-hit', even
     * though by then far more than four clues have been given.
     */
    it('does not reach into sudden death, where the clue count is past it', () => {
      let s = burnClues(newGame(), GRID_CONFIGS.beginner.turnTokens)
      expect(s.phase).toBe('suddenDeath')
      expect(s.clueHistory.length).toBeGreaterThan(REDEMPTION_AFTER_ROUND)
      const doomed = s.words
        .map((w) => w.wordId)
        .find((id) => s.playerKey[id] === 'forbidden' && isGuessable(s, id))
      if (doomed) {
        s = applyEvent(s, { type: 'GUESS', wordId: doomed })
        expect(s.outcome).toEqual({ result: 'lost', reason: 'sudden-death' })
      }
    })
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

  it('keeps the same giver when the other side has nothing left to clue', () => {
    let s = newGame()
    // Turn 1: player clue, AI hits a bystander → normal rotation to the AI.
    s = clue(s, 'player', 1)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'bystander') })
    expect(s.phase).toBe('aiClueInput')
    // Turn 2: under the AI's clue the player finds ALL 5 AI-key greens (cap 4+1).
    s = clue(s, 'ai', 4)
    for (let i = 0; i < 5; i++) {
      s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'ai', 'green') })
    }
    expect(targetableGreenIds(s, 'ai')).toEqual([])
    expect(s.phase).toBe('playerClueInput')
    // Turn 3: player clues, AI banks one green and stops. The AI side has
    // nothing to clue, so the player must clue again — no aiClueInput dead-end.
    s = clue(s, 'player', 1)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'green') })
    s = applyEvent(s, { type: 'STOP_GUESSING' })
    expect(s.phase).toBe('playerClueInput')
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

/**
 * Running out of clues no longer ends the round. Codenames Duet's ending:
 * the clues are spent, the board is still there, and you keep naming words
 * until you either finish it or name one that is not green.
 */
describe('sudden death', () => {
  /** Burn every clue token without finding anything. */
  const exhaust = (grid: 'beginner' | 'standard' = 'beginner') => {
    let s = newGame(grid)
    while (s.phase !== 'suddenDeath' && s.phase !== 'finished') {
      const giver = giverOf(s.phase)
      s = clue(s, giver, 1)
      s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, giver, 'bystander') })
    }
    return s
  }

  it('opens instead of losing when the clues run out', () => {
    const s = exhaust()
    expect(s.phase).toBe('suddenDeath')
    expect(s.outcome).toBeUndefined()
    expect(s.turnsLeft).toBe(0)
  })

  it('accepts a green on either key, and keeps going', () => {
    let s = exhaust()
    const green = remainingGreenIds(s)[0]!
    s = applyEvent(s, { type: 'GUESS', wordId: green })
    expect(s.reveals[green]).toEqual({ kind: 'green' })
    expect(s.phase).toBe('suddenDeath')
  })

  it('wins the round if the last green is named', () => {
    let s = exhaust()
    for (const id of [...remainingGreenIds(s)]) {
      s = applyEvent(s, { type: 'GUESS', wordId: id })
    }
    expect(s.outcome).toEqual({ result: 'won', reason: 'all-greens' })
  })

  it('ends it on the first word that is green on neither key', () => {
    let s = exhaust()
    const greens = new Set(remainingGreenIds(s))
    const dud = s.words.map((w) => w.wordId).find((id) => isGuessable(s, id) && !greens.has(id))!
    s = applyEvent(s, { type: 'GUESS', wordId: dud })
    expect(s.outcome).toEqual({ result: 'lost', reason: 'sudden-death' })
    // Shown for what it was, so the ending reads rather than just stops.
    expect(s.reveals[dud]!.kind).not.toBe('hidden')
  })

  it('lets a neutral burned against one side back in, since it may be the other side’s green', () => {
    const s = exhaust()
    const burned = s.words
      .map((w) => w.wordId)
      .filter((id) => s.reveals[id]!.kind === 'bystander')
    expect(burned.length).toBeGreaterThan(0)
    for (const id of burned) expect(isGuessable(s, id)).toBe(true)
  })

  it('can be walked away from, and that is a loss', () => {
    const s = applyEvent(exhaust(), { type: 'STOP_GUESSING' })
    expect(s.outcome).toEqual({ result: 'lost', reason: 'timeout' })
  })

  it('never re-opens a word already found', () => {
    let s = exhaust()
    const green = remainingGreenIds(s)[0]!
    s = applyEvent(s, { type: 'GUESS', wordId: green })
    expect(isGuessable(s, green)).toBe(false)
    expect(() => applyEvent(s, { type: 'GUESS', wordId: green })).toThrow(IllegalEventError)
  })
})

describe('who opens the round', () => {
  const bare = () =>
    createGame({
      config: GRID_CONFIGS.beginner,
      words: makeWords(GRID_CONFIGS.beginner.totalWords),
      seed: 7,
    })

  it('is the player, so the round starts on their clue rather than on waiting', () => {
    expect(bare().phase).toBe('playerClueInput')
  })

  it('but the caller can still say otherwise', () => {
    expect(newGame('beginner', 7, 'ai').phase).toBe('aiClueInput')
  })
})
