import { describe, expect, it } from 'vitest'
import { BOARD, TUTORIAL_CONFIG, type GridConfig } from './config'
import {
  IllegalClueError,
  IllegalEventError,
  applyEvent as applyEventIn,
  createGame,
  giverOf,
  isGuessable,
  remainingGreenIds,
  targetableGreenIds,
} from './game'
import type { BoardWord, CardRole, GameState, Side } from './types'
import { danish } from '../lang/da'

/**
 * The engine takes the language pack now (H1). Wrapped here so the suite's
 * call sites stay exactly as they were and keep pinning what they pinned.
 */
const applyEvent = (s: Parameters<typeof applyEventIn>[0], e: Parameters<typeof applyEventIn>[1]) =>
  applyEventIn(s, e, danish)

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
//
// "Every board" here means every CONFIG the app can deal, not every size:
// there are no sizes since N1. Just the board and the tutorial mode you enter
// — the wrap-up deals BOARD itself since N2, so it is not a third shape.
const CONFIGS: Record<'board' | 'tutorial', GridConfig> = {
  board: BOARD,
  tutorial: TUTORIAL_CONFIG,
}
type Grid = keyof typeof CONFIGS

const newGame = (grid: Grid = 'board', seed = 7, firstGiver: Side = 'player') =>
  createGame({
    config: CONFIGS[grid],
    words: makeWords(CONFIGS[grid].totalWords),
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
 * clue-input phase — or in sudden death, if `n` is the whole token budget.
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

  /**
   * The only three ways a round can end, now that forbidden words and the
   * translate-everything last chance are gone. Written as a sweep rather than
   * three separate cases because the thing worth pinning is the ABSENCE of a
   * fourth: a guess that is not green on the giver's key must cost the turn and
   * nothing more, on every board, at every point in the round.
   */
  it('never ends a round on a guess that is merely wrong', () => {
    let checked = 0
    for (const grid of ['board', 'tutorial'] as Grid[]) {
      for (let seed = 1; seed <= 25; seed++) {
        let s = newGame(grid, seed)
        while (s.phase === 'playerClueInput' || s.phase === 'aiClueInput') {
          const giver = giverOf(s.phase)
          s = clue(s, giver, 1)
          s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, giver, 'bystander') })
          // A wrong guess spends the turn. It never finishes the round, and it
          // never writes an outcome — the tokens running out is what does, and
          // that opens sudden death rather than closing the game.
          expect(s.outcome, `${grid}/${seed}`).toBeUndefined()
          checked++
        }
        expect(s.phase, `${grid}/${seed}`).toBe('suddenDeath')
      }
    }
    // Fails loudly rather than vacuously if the loop stops finding turns.
    expect(checked).toBeGreaterThan(300)
  })

  it('bystander reveals are directional: blocked for one giver, guessable for the other', () => {
    // The board guarantees words that are bystander on the player key but green
    // on the AI key: eight greens a side with three shared leaves five each way.
    let s = newGame('board')
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
   * The rule the whole game turns on, and the one this repo has written
   * backwards more than once: a guess is judged against the CLUE-GIVER's key
   * and nothing else.
   *
   * It used to be pinned through forbidden words, which were the loudest way to
   * get it wrong — an audit mutated the engine to the naive rule ("a forbidden
   * word is fatal to whoever names it") and 411 of 413 tests went on passing.
   * Forbidden words are gone; the rule is not, because the two keys still
   * disagree about most of the board. Every green Casey holds is a card the
   * player's own key shows as neutral, with nothing on screen to say otherwise,
   * and it scores anyway — that is now what the rule buys, and it is what these
   * pin.
   */
  describe('a guess is judged against the clue-giver key, and only that key', () => {
    /** Green for Casey, neutral for the player — the ordinary case, not a corner. */
    const onlyHis = (s: GameState) =>
      Object.keys(s.aiKey).find((w) => s.aiKey[w] === 'green' && s.playerKey[w] === 'bystander')!

    it('the player scores a word their OWN key calls neutral, under Casey clue', () => {
      let s = newGame('board', 7, 'ai')
      const card = onlyHis(s)
      expect(card).toBeDefined()
      s = clue(s, 'ai', 2)
      s = applyEvent(s, { type: 'GUESS', wordId: card })
      expect(s.reveals[card]).toEqual({ kind: 'green' })
      expect(s.outcome).toBeUndefined()
    })

    it('and the same card scores nothing when Casey names it under the PLAYER clue', () => {
      let s = newGame('board', 7, 'player')
      const card = onlyHis(s)
      s = clue(s, 'player', 2)
      s = applyEvent(s, { type: 'GUESS', wordId: card })
      // Read off the player's key, where it is neutral: burned against the
      // player only, and the turn is over.
      expect(s.reveals[card]).toEqual({ kind: 'bystander', against: ['player'] })
      expect(s.phase).toBe('aiClueInput')
      // Still Casey's green, and still there to be taken under his own clue.
      s = clue(s, 'ai', 1)
      expect(isGuessable(s, card)).toBe(true)
      s = applyEvent(s, { type: 'GUESS', wordId: card })
      expect(s.reveals[card]).toEqual({ kind: 'green' })
    })

    /**
     * Sudden death is the exception, and the only one: there is no clue-giver,
     * so a green on EITHER key counts and anything else ends it.
     */
    it('except in sudden death, which has no giver and reads both keys', () => {
      const s = burnClues(newGame(), BOARD.turnTokens)
      expect(s.phase).toBe('suddenDeath')
      const mineOnly = Object.keys(s.playerKey).find(
        (w) => s.playerKey[w] === 'green' && s.aiKey[w] !== 'green' && isGuessable(s, w),
      )!
      const hisOnly = Object.keys(s.aiKey).find(
        (w) => s.aiKey[w] === 'green' && s.playerKey[w] !== 'green' && isGuessable(s, w),
      )!
      expect(applyEvent(s, { type: 'GUESS', wordId: mineOnly }).reveals[mineOnly]).toEqual({
        kind: 'green',
      })
      expect(applyEvent(s, { type: 'GUESS', wordId: hisOnly }).reveals[hisOnly]).toEqual({
        kind: 'green',
      })
    })

    /**
     * The one that makes it un-regressable rather than seed-lucky: across every
     * board, both openers and forty deals each, a card green ONLY on the
     * non-giver's key never scores, and the same card under the other side's
     * clue always does.
     */
    it('holds across every board, both openers and forty deals', () => {
      let checked = 0
      for (const grid of ['board', 'tutorial'] as const) {
        for (const firstGiver of ['player', 'ai'] as const) {
          for (let seed = 1; seed <= 40; seed++) {
            let s = createGame({
              config: CONFIGS[grid],
              words: makeWords(CONFIGS[grid].totalWords),
              seed,
              firstGiver,
            })
            s = clue(s, firstGiver, 2)
            const giver = giverOf(s.phase)
            const giverKey = keyOf(s, giver)
            const otherKey = keyOf(s, giver === 'player' ? 'ai' : 'player')
            const theirs = Object.keys(otherKey).find(
              (w) => otherKey[w] === 'green' && giverKey[w] !== 'green' && isGuessable(s, w),
            )
            if (!theirs) continue
            const where = `${grid}/${firstGiver}/${seed}`
            const after = applyEvent(s, { type: 'GUESS', wordId: theirs })
            // Not green: it is not on the key being read. Burned against the
            // giver alone, so the other side can still take it.
            expect(after.reveals[theirs], where).toEqual({ kind: 'bystander', against: [giver] })
            expect(after.outcome, where).toBeUndefined()
            expect(after.clueHistory.at(-1)!.guesses.at(-1)!.result, where).toBe('bystander')
            checked++
          }
        }
      }
      // Fails loudly rather than vacuously if a config change removes the card.
      expect(checked).toBeGreaterThan(100)
    })
  })

  it('keeps the same giver when the other side has nothing left to clue', () => {
    // Emptying one side's key takes two clues rather than one: MAX_CLUE_NUMBER
    // is 4, there is no bonus guess to stretch it, and the board's eight greens
    // a side is exactly two full clues — which the eight tokens have room for.
    let s = newGame('board')
    // Turn 1: player clue, AI hits a bystander → normal rotation to the AI.
    s = clue(s, 'player', 1)
    s = applyEvent(s, { type: 'GUESS', wordId: findGuessable(s, 'player', 'bystander') })
    expect(s.phase).toBe('aiClueInput')
    // Turns 2 and 4: under the AI's clues the player finds all 8 AI-key greens.
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
    takeAiGreens(4)
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
   * for, before the rename, as "when you have guessed the amount of words
   * Cluey gives you the turn ends automatically", after the old rule read on a
   * phone as the turn simply not ending once you had found everything the clue
   * promised.
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
  const exhaust = (grid: Grid = 'board') => {
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
      config: BOARD,
      words: makeWords(BOARD.totalWords),
      seed: 7,
    })

  it('is the player, so the round starts on their clue rather than on waiting', () => {
    expect(bare().phase).toBe('playerClueInput')
  })

  it('but the caller can still say otherwise', () => {
    expect(newGame('board', 7, 'ai').phase).toBe('aiClueInput')
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

  /**
   * The guess that ends the round is now the one that finishes the board —
   * this used to be written against a forbidden hit, which returned from a
   * different branch of the reducer and was the one most likely to drop the
   * record on the floor. Winning returns from its own early branch too.
   */
  it('and through the one that ends the round', () => {
    let s = newGame()
    let last: string | undefined
    let safety = 50
    while (s.phase !== 'finished' && safety-- > 0) {
      const giver = giverOf(s.phase)
      s = clue(s, giver, 4)
      while (s.phase === 'aiGuessing' || s.phase === 'playerGuessing') {
        const key = keyOf(s, giver)
        const target = Object.keys(key).find((w) => key[w] === 'green' && isGuessable(s, w))
        if (!target) {
          s = applyEvent(s, { type: 'STOP_GUESSING' })
          break
        }
        last = target
        s = applyEvent(s, {
          type: 'GUESS',
          wordId: target,
          reasoning: 'the last one on the board',
          confidence: 0.11,
        })
      }
    }
    expect(s.outcome).toEqual({ result: 'won', reason: 'all-greens' })
    const winning = s.clueHistory.at(-1)!.guesses.at(-1)!
    expect(winning.wordId).toBe(last)
    expect(winning.reasoning).toBe('the last one on the board')
    expect(winning.confidence).toBe(0.11)
  })
})
