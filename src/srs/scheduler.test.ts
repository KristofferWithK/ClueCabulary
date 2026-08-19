import { describe, expect, it } from 'vitest'
import { applyRoundResults, newStats, reviewWeight } from './scheduler'
import type { RoundWordResult, SrsMap } from './types'

const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000

const base = (over: Partial<ReturnType<typeof newStats>> = {}) => ({ ...newStats(NOW - 10 * DAY), ...over })

const res = (over: Partial<RoundWordResult> & { wordId: string }): RoundWordResult => ({
  guessedGreen: false,
  guessedWrong: false,
  greenByOwnClue: false,
  greenByOwnGuess: false,
  lookedUp: false,
  ...over,
})

describe('applyRoundResults', () => {
  it('promotes a clean correct guess', () => {
    const map: SrsMap = { w1: base({ box: 1 }) }
    const next = applyRoundResults(map, [res({ wordId: 'w1', guessedGreen: true })], NOW)
    expect(next.w1!.box).toBe(2)
    expect(next.w1!.correctGuesses).toBe(1)
    expect(next.w1!.lastSeenAt).toBe(NOW)
  })

  it('does not promote a correct guess that needed a lookup', () => {
    const map: SrsMap = { w1: base({ box: 1 }) }
    const next = applyRoundResults(map, [res({ wordId: 'w1', guessedGreen: true, lookedUp: true })], NOW)
    expect(next.w1!.box).toBe(1)
    expect(next.w1!.lookups).toBe(1)
  })

  // A `redemption: 'wrong'` result used to ride alongside these, and demotion
  // beat promotion when a word was guessed green and then flunked in the
  // translation challenge. The challenge is retired; a packing miss is the
  // signal that still works this way, and it is covered below.
  it('demotes a wrong guess, which wins over promotion', () => {
    const map: SrsMap = { w1: base({ box: 3 }), w2: base({ box: 2 }) }
    const next = applyRoundResults(
      map,
      [
        res({ wordId: 'w1', guessedWrong: true }),
        res({ wordId: 'w2', guessedGreen: true, packingMissed: true }),
      ],
      NOW,
    )
    expect(next.w1!.box).toBe(2)
    expect(next.w2!.box).toBe(1) // the packing miss outweighs the later green
  })

  it('clamps at the ends', () => {
    const map: SrsMap = { hi: base({ box: 4 }), lo: base({ box: 0 }) }
    const next = applyRoundResults(
      map,
      [
        res({ wordId: 'hi', guessedGreen: true }),
        res({ wordId: 'lo', guessedWrong: true }),
      ],
      NOW,
    )
    expect(next.hi!.box).toBe(4)
    expect(next.lo!.box).toBe(0)
  })

  it('lookup-only exposure keeps the word due (lastSeenAt unchanged)', () => {
    const then = NOW - 10 * DAY
    const map: SrsMap = { w1: base({ lastSeenAt: then }) }
    const next = applyRoundResults(map, [res({ wordId: 'w1', lookedUp: true })], NOW)
    expect(next.w1!.lastSeenAt).toBe(then)
    expect(next.w1!.seen).toBe(1)
  })

  it('creates stats for first-time words', () => {
    const next = applyRoundResults({}, [res({ wordId: 'new' })], NOW)
    expect(next.new).toMatchObject({ box: 0, seen: 1, lastSeenAt: NOW })
  })

  it('does not mutate the input map', () => {
    const map: SrsMap = { w1: base({ box: 1 }) }
    const snapshot = JSON.stringify(map)
    applyRoundResults(map, [res({ wordId: 'w1', guessedGreen: true })], NOW)
    expect(JSON.stringify(map)).toBe(snapshot)
  })

  it('counts each green for the side whose work earned it', () => {
    const next = applyRoundResults(
      {},
      [
        res({ wordId: 'clued', guessedGreen: true, greenByOwnClue: true }),
        res({ wordId: 'guessed', guessedGreen: true, greenByOwnGuess: true }),
        res({ wordId: 'untouched' }),
      ],
      NOW,
    )
    expect(next.clued).toMatchObject({ greenByClue: 1, greenByGuess: 0 })
    expect(next.guessed).toMatchObject({ greenByClue: 0, greenByGuess: 1 })
    expect(next.untouched).toMatchObject({ greenByClue: 0, greenByGuess: 0 })
  })

  it('directional counts only accumulate, never reset', () => {
    let map: SrsMap = {}
    for (let i = 0; i < 3; i++) {
      map = applyRoundResults(map, [res({ wordId: 'w', guessedGreen: true, greenByOwnClue: true })], NOW + i)
    }
    map = applyRoundResults(map, [res({ wordId: 'w', guessedWrong: true })], NOW + 3)
    expect(map.w).toMatchObject({ greenByClue: 3, greenByGuess: 0 })
  })
})

describe('reviewWeight', () => {
  /**
   * This used to read "box-0 words are always maximally due", and that was the
   * bug rather than the rule. Box 0 is where every word the player is currently
   * getting wrong lives, so pinning it to the maximum meant a word stayed as
   * urgent thirty seconds after being played as a week later — and boards
   * repeated themselves. Measured before the change: 4.8 of 12 words carried
   * over from one board to the next, and one word turned up on 8 boards in 10.
   */
  const MINUTE = 60_000

  it('does not treat a word played moments ago as overdue', () => {
    const justNow = reviewWeight(base({ box: 0, lastSeenAt: NOW - MINUTE }), NOW)
    const anHourAgo = reviewWeight(base({ box: 0, lastSeenAt: NOW - 60 * MINUTE }), NOW)
    expect(justNow).toBeLessThan(anHourAgo)
  })

  it('but brings it back the same evening, which is what box 0 is for', () => {
    const anHourAgo = reviewWeight(base({ box: 0, lastSeenAt: NOW - 60 * MINUTE }), NOW)
    const boxTwoOnItsDay = reviewWeight(base({ box: 2, lastSeenAt: NOW - 3 * DAY }), NOW)
    expect(anHourAgo).toBeGreaterThanOrEqual(boxTwoOnItsDay)
  })

  it('and never falls to zero, so nothing drops out of rotation', () => {
    for (const box of [0, 1, 2, 3, 4] as const) {
      expect(reviewWeight(base({ box, lastSeenAt: NOW }), NOW)).toBeGreaterThan(0)
    }
  })

  it('still ranks a struggling word above a settled one seen just as recently', () => {
    const failing = reviewWeight(base({ box: 0, lastSeenAt: NOW - 30 * MINUTE, seen: 4, misses: 3 }), NOW)
    const settled = reviewWeight(base({ box: 4, lastSeenAt: NOW - 30 * MINUTE }), NOW)
    expect(failing).toBeGreaterThan(settled)
  })

  it('overdue beats recently reviewed at the same box', () => {
    const overdue = reviewWeight(base({ box: 2, lastSeenAt: NOW - 9 * DAY }), NOW)
    const fresh = reviewWeight(base({ box: 2, lastSeenAt: NOW - 1 * DAY }), NOW)
    expect(overdue).toBeGreaterThan(fresh)
  })

  it('struggling words weigh more', () => {
    const struggling = reviewWeight(base({ box: 2, seen: 4, misses: 3 }), NOW)
    const smooth = reviewWeight(base({ box: 2, seen: 4, misses: 0 }), NOW)
    expect(struggling).toBeGreaterThan(smooth)
  })
})
