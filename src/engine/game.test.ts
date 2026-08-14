import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS, REDEMPTION_AFTER_ROUND, type GridSize } from './config'
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
const newGame = (grid: GridSize = 'beginner', seed = 7, firstGiver: Side = 'player') =>
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
   * "The last chance redemption should only be triggered after round 4", and
   * then "the last chance should be available after 3 rounds".
   *
   * A round is a clue. Before the threshold a forbidden word ends the round
   * where it stands, with its own ending — not 'forbidden-failed', which every
   * screen describes as losing a translation challenge that in this case never
   * ran.
   *
   * Written against the constant rather than the number, so moving it again is
   * one edit. What the number is worth is in config.ts: at 4 the first eligible
   * clue was odd, i.e. Klaus's turn to guess, and the 3x4 board has no even one
   * past it — so the player could not reach this ending at all there.
   */
  describe('the last chance opens only after three clues', () => {
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

    it('and on the third, the last clue before it opens', () => {
      let s = burnClues(newGame(), REDEMPTION_AFTER_ROUND - 1)
      s = clue(s, s.phase === 'playerClueInput' ? 'player' : 'ai', 2)
      expect(s.clueHistory.length).toBe(REDEMPTION_AFTER_ROUND)
      expect(hitForbidden(s).outcome).toEqual({ result: 'lost', reason: 'forbidden-hit' })
    })

    it('opens on the fourth', () => {
      let s = burnClues(newGame(), REDEMPTION_AFTER_ROUND)
      s = clue(s, s.phase === 'playerClueInput' ? 'player' : 'ai', 2)
      expect(hitForbidden(s).phase).toBe('redemption')
    })

    /**
     * What lowering the threshold from 4 to 3 actually bought, pinned on every
     * shipped board.
     *
     * The guessing side alternates with the clue index and the player opens, so
     * ODD clues are Klaus guessing and EVEN clues are the player. The first
     * eligible clue is therefore the player's own turn — where at 4 it was
     * Klaus's, and the 3x4 board has no even clue past the 5th, so the ending
     * the last chance exists for could not be reached there by the side it is
     * written for. This is the test that fails if the threshold goes back to an
     * even number.
     */
    it.each(['beginner', 'middle', 'standard'] as GridSize[])(
      'and on %s it is the player guessing on the first clue that can reach it',
      (grid) => {
        let s = burnClues(newGame(grid), REDEMPTION_AFTER_ROUND)
        s = clue(s, s.phase === 'playerClueInput' ? 'player' : 'ai', 1)
        expect(s.clueHistory.length).toBe(REDEMPTION_AFTER_ROUND + 1)
        expect(s.phase).toBe('playerGuessing')
        // And the board still has the clue to spare that this needs.
        expect(GRID_CONFIGS[grid].turnTokens).toBeGreaterThan(REDEMPTION_AFTER_ROUND)
        expect(hitForbidden(s).phase).toBe('redemption')
      },
    )

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

    // Under the AI's clue the same word is guessable — and green. Clued as 2 so
    // the turn survives it: the number is the whole allowance now, so a 1 would
    // end the turn on this guess and the rest of this test could not run.
    s = clue(s, 'ai', 2)
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

  /**
   * Forbidden words are directional in exactly the way bystanders are, and
   * nothing here said so. An audit mutated this engine to the naive rule — a
   * forbidden word is fatal to whoever names it — and 411 of 413 tests went on
   * passing; the two that broke did so on an unrelated fixture message. So the
   * rule the whole game turns on was, until this block, held up by nothing.
   *
   * It had to be reported by hand instead: "My forbidden word is a word he is
   * not allowed to pick when he gets my clue. But if he gives me a clue that
   * clues the forbidden word I see then that's fine, I can click that."
   *
   * That is right, and it is what these pin.
   */
  describe('a guess is judged against the clue-giver key, and only that key', () => {
    it('the player may tap a word their OWN key forbids, under Klaus clue', () => {
      let s = newGame('standard', 7, 'ai')
      const mine = Object.keys(s.playerKey).find(
        (w) => s.playerKey[w] === 'forbidden' && s.aiKey[w] !== 'forbidden',
      )!
      s = clue(s, 'ai', 2)
      s = applyEvent(s, { type: 'GUESS', wordId: mine })
      // Not fatal, not even revealed as forbidden: it is not on the key being read.
      expect(s.outcome).toBeUndefined()
      expect(s.reveals[mine]!.kind).not.toBe('forbidden')
    })

    it('and it SCORES when Klaus key calls it green', () => {
      // standard still deals forbiddenVsGreen, which is the only place this
      // card exists — the whole point being that it is a green, not a trap.
      expect(GRID_CONFIGS.standard.forbiddenVsGreen).toBe(1)
      let s = newGame('standard', 7, 'ai')
      const card = Object.keys(s.playerKey).find(
        (w) => s.playerKey[w] === 'forbidden' && s.aiKey[w] === 'green',
      )!
      expect(card).toBeDefined()
      s = clue(s, 'ai', 2)
      s = applyEvent(s, { type: 'GUESS', wordId: card })
      expect(s.reveals[card]).toEqual({ kind: 'green' })
      expect(s.outcome).toBeUndefined()
    })

    it('but Klaus OWN forbidden word, under his clue, ends the round', () => {
      let s = newGame('standard', 7, 'ai')
      const his = Object.keys(s.aiKey).find((w) => s.aiKey[w] === 'forbidden')!
      s = clue(s, 'ai', 2)
      s = applyEvent(s, { type: 'GUESS', wordId: his })
      expect(s.reveals[his]).toEqual({ kind: 'forbidden' })
      expect(s.outcome?.result).toBe('lost')
    })

    it('and the mirror: Klaus naming the player forbidden word under the player clue ends it', () => {
      let s = newGame('standard', 7, 'player')
      const mine = Object.keys(s.playerKey).find((w) => s.playerKey[w] === 'forbidden')!
      s = clue(s, 'player', 2)
      s = applyEvent(s, { type: 'GUESS', wordId: mine })
      expect(s.reveals[mine]).toEqual({ kind: 'forbidden' })
      expect(s.outcome?.result).toBe('lost')
    })

    /**
     * The one that makes it un-regressable rather than seed-lucky: across every
     * board, both openers and forty deals each, a card forbidden on the
     * NON-giver's key is never fatal and never even reveals as forbidden.
     */
    it('holds across every board, both openers and forty deals', () => {
      let checked = 0
      for (const grid of ['beginner', 'middle', 'standard'] as const) {
        for (const firstGiver of ['player', 'ai'] as const) {
          for (let seed = 1; seed <= 40; seed++) {
            let s = createGame({
              config: GRID_CONFIGS[grid],
              words: makeWords(GRID_CONFIGS[grid].totalWords),
              seed,
              firstGiver,
            })
            s = clue(s, firstGiver, 2)
            const giver = giverOf(s.phase)
            const giverKey = keyOf(s, giver)
            const otherKey = keyOf(s, giver === 'player' ? 'ai' : 'player')
            const safe = Object.keys(otherKey).find(
              (w) => otherKey[w] === 'forbidden' && giverKey[w] !== 'forbidden' && isGuessable(s, w),
            )
            if (!safe) continue
            const after = applyEvent(s, { type: 'GUESS', wordId: safe })
            expect(after.reveals[safe]!.kind, `${grid}/${firstGiver}/${seed}`).not.toBe('forbidden')
            expect(after.outcome, `${grid}/${firstGiver}/${seed}`).toBeUndefined()
            checked++
          }
        }
      }
      // Fails loudly rather than vacuously if a config change removes the card.
      expect(checked).toBeGreaterThan(100)
    })
  })

  it('keeps the same giver when the other side has nothing left to clue', () => {
    // standard, because emptying one side's key now takes two clues rather than
    // one: MAX_CLUE_NUMBER is 4 and there is no bonus guess to stretch it, and
    // beginner does not have the tokens to spare for the setup.
    let s = newGame('standard')
    // Turn 1: player clue, AI hits a bystander → normal rotation to the AI.
    s = clue(s, 'player', 1)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'bystander') })
    expect(s.phase).toBe('aiClueInput')
    // Turns 2 and 4: under the AI's clues the player finds all 7 AI-key greens.
    const takeAiGreens = (n: number) => {
      s = clue(s, 'ai', n)
      for (let i = 0; i < n; i++) {
        s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'ai', 'green') })
      }
    }
    takeAiGreens(4)
    // Turn 3: a spacer, so the AI gets the clue again.
    s = clue(s, 'player', 1)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'bystander') })
    takeAiGreens(3)
    expect(targetableGreenIds(s, 'ai')).toEqual([])
    expect(s.phase).toBe('playerClueInput')
    // Turn 5: player clues, AI banks one green and stops. The AI side has
    // nothing to clue, so the player must clue again — no aiClueInput dead-end.
    s = clue(s, 'player', 2)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'green') })
    s = applyEvent(s, { type: 'STOP_GUESSING' })
    expect(s.phase).toBe('playerClueInput')
  })

  /**
   * The number is the whole allowance: no bonus (number + 1)-th guess. Asked
   * for as "when you have guessed the amount of words Klaus gives you the turn
   * ends automatically", after the old rule read on a phone as the turn simply
   * not ending once you had found everything the clue promised.
   */
  it('ends the turn on the number-th correct guess, with no bonus', () => {
    let s = clue(newGame(), 'player', 1)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'green') })
    expect(s.phase).toBe('aiClueInput')
    expect(s.turnsLeft).toBe(s.config.turnTokens - 1)
  })

  it('and on the second of a two, not the third', () => {
    let s = clue(newGame(), 'player', 2)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'green') })
    expect(s.phase).toBe('aiGuessing')
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'green') })
    expect(s.phase).toBe('aiClueInput')
  })

  it('but stopping short is still the guesser own call', () => {
    let s = clue(newGame(), 'player', 3)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'green') })
    expect(s.phase).toBe('aiGuessing')
    s = applyEvent(s, { type: 'STOP_GUESSING' })
    expect(s.phase).toBe('aiClueInput')
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

/**
 * "I think the ai should always write down its reasoning for why it picked a
 * word and not any other. […] I want the debrief to show the reasoning for its
 * decisions."
 *
 * The model had always written a reason for every guess and the engine dropped
 * it: `clue.guesses.push({ wordId, result })` kept the score and threw away the
 * account. So the one question a player kept asking — why THAT word — was the
 * one thing the app had discarded on purpose.
 */
describe('a guess remembers why it was made', () => {
  it('keeps the AI reasoning and confidence on the record', () => {
    let s = clue(newGame(), 'player', 2)
    const target = findGuessable(s, 'player', 'green')
    s = applyEvent(s, {
      type: 'GUESS',
      wordId: target,
      reasoning: 'the only food word on the board',
      confidence: 0.82,
    })
    const g = s.clueHistory[0]!.guesses[0]!
    expect(g).toMatchObject({ wordId: target, result: 'green', confidence: 0.82 })
    expect(g.reasoning).toBe('the only food word on the board')
  })

  /** Nobody is asked to justify a tap, so the player's guesses carry neither. */
  it('leaves both off a guess made without them', () => {
    let s = clue(newGame(), 'player', 2)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'green') })
    const g = s.clueHistory[0]!.guesses[0]!
    expect(g.reasoning).toBeUndefined()
    expect(g.confidence).toBeUndefined()
    expect(Object.keys(g).sort()).toEqual(['result', 'wordId'])
  })

  it('carries them through a turn that ends on the guess', () => {
    let s = clue(newGame(), 'player', 1)
    s = applyEvent(s, {
      type: 'GUESS',
      wordId: findGuessable(s, 'player', 'green'),
      reasoning: 'ends the turn',
      confidence: 0.4,
    })
    expect(s.phase).toBe('aiClueInput')
    expect(s.clueHistory[0]!.guesses[0]!.reasoning).toBe('ends the turn')
  })

  it('and through the one that ends the round', () => {
    let s = clue(newGame(), 'player', 2)
    s = applyEvent(s, {
      type: 'GUESS',
      wordId: findGuessable(s, 'player', 'forbidden'),
      reasoning: 'I was not sure at all',
      confidence: 0.11,
    })
    expect(s.outcome?.result).toBe('lost')
    expect(s.clueHistory[0]!.guesses[0]!.reasoning).toBe('I was not sure at all')
    expect(s.clueHistory[0]!.guesses[0]!.confidence).toBe(0.11)
  })
})
