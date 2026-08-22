import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Outcome } from '../engine/types'
import { LEARN_REPS } from '../journey/progress'
import { WRAP_UP_BANK_CAP, bankAfterRound, type RoundMode } from '../journey/wrapup'
import { applyRoundResults } from '../srs/scheduler'
import type { RoundWordResult, SrsMap, WordStats } from '../srs/types'

export interface GamesTally {
  played: number
  won: number
  /**
   * Frozen at whatever it reached. Winning by translating the whole board back
   * — the last chance after a forbidden word — is retired, so nothing adds to
   * this. Kept rather than dropped because it is persisted and part of the
   * backup format, and because it counts rounds that really happened.
   */
  redeemed: number
  lost: number
}

const EMPTY_TALLY: GamesTally = { played: 0, won: 0, redeemed: 0, lost: 0 }

interface SrsState {
  stats: SrsMap
  games: GamesTally
  /**
   * Earned, unspent wrap-up rounds.
   *
   * It lives here rather than beside the wrapped ledger in journeyStore
   * because earning it must be ATOMIC with counting the win: `recordGame` is
   * the one call that learns a round ended and how, and a bank kept in the
   * other store would need a second call from `finishRound` that could be
   * forgotten, ordered wrongly, or skipped on one of the paths into it — and
   * the two counters would then disagree with no way to tell which was right.
   * Here the invariant is structural: `games.won` going up and the bank going
   * up are the same `set`. The other half of the argument is `reset`, which
   * wipes the tally — tokens earned by wins that no longer exist should go
   * with them, and here they do so by construction.
   */
  wrapUpsBanked: number
  /**
   * Won normal rounds since the last token was earned — three buy one (W1).
   *
   * Beside the bank rather than derived from `games.won`, because it has to
   * survive spending: the bank goes down and this must not, and `won % 3`
   * cannot express "three more wins from HERE" once the cap has held the
   * counter at zero. Same `set` as the bank and the tally, for the reason
   * above.
   */
  winsTowardWrapUp: number
  recordRound: (results: RoundWordResult[], now: number) => void
  /** `mode` is what keeps a wrap-up win from earning another wrap-up. */
  recordGame: (outcome: Outcome, mode?: RoundMode) => void
  /** Spend one, if there is one. Returns whether there was. */
  spendWrapUp: () => boolean
  reset: () => void
}

/**
 * v1 -> v2: `greenByClue` / `greenByGuess` did not exist. They cannot be
 * reconstructed — a v1 save only knows a word ended rounds green, not whose
 * work earned it — so the seed is the fairest monotonic reading: a word the
 * old model called learned (correctGuesses >= LEARN_REPS) is credited one
 * green each way and arrives *collected*; anything short of that arrives with
 * zeroes and must earn both interactions in play. Nothing can regress: the
 * old states map to equal-or-better new ones.
 *
 * v2 -> v3: wrap-up rounds have to be earned now, and every save written
 * before this build holds none. Seeding zero would take something away from a
 * player mid-journey — they could open a wrap-up yesterday and could not
 * today — so the bank is seeded from the wins they already have: the bank
 * they WOULD hold if the rule had always existed and they had never spent
 * one, which is the most generous reading that is still earned. Every token
 * handed out here is a win that really happened. A player who has never won
 * arrives at zero and meets the unlock as the tutorial beat it is meant to be,
 * which is the same place a fresh install starts.
 *
 * v3 -> v4: a token costs three won rounds instead of one (W1), so the store
 * gains `winsTowardWrapUp` and every save written before this build lacks it.
 * The bump exists because of the trap CLAUDE.md's point 3 records: `persist`
 * merges `{...initial, ...persisted}`, and a NEW field with a new default is
 * exactly the case a default change is not — a save that lacks it would take
 * the initial 0 anyway. What actually needs saying is the OTHER half, and it
 * is a policy decision rather than a mechanical one: the counter seeds at 0
 * and **the bank is kept untouched**. A player mid-journey holding two tokens
 * earned under the old one-win rule keeps both; the new price applies from the
 * next win onward. Generous over strict — R1's precedent, and the same
 * reasoning as v2 -> v3 above: nothing already earned is taken back. Seeding
 * the counter from `games.won % 3` was the alternative and was rejected: that
 * number counts wins already paid out under the old rule, so it would hand
 * over up to two thirds of a fourth token for wins that had already bought
 * three.
 *
 * Exported so it can be tested directly: under vitest there is no
 * localStorage, persist quietly becomes a passthrough, and a test reaching
 * through the middleware would be testing nothing.
 */
export function migrateSrs(persisted: unknown, from: number): unknown {
  if (from >= 4) return persisted
  let p = (persisted ?? {}) as {
    stats?: Record<string, Omit<WordStats, 'greenByClue' | 'greenByGuess'>>
    games?: Partial<GamesTally>
    wrapUpsBanked?: number
  }
  if (from < 2) {
    const seeded = Object.fromEntries(
      Object.entries(p.stats ?? {}).map(([id, s]) => [
        id,
        {
          ...s,
          greenByClue: s.correctGuesses >= LEARN_REPS ? 1 : 0,
          greenByGuess: s.correctGuesses >= LEARN_REPS ? 1 : 0,
        },
      ]),
    )
    p = { ...p, stats: seeded }
  }
  if (from < 3) {
    p = { ...p, wrapUpsBanked: Math.min(p.games?.won ?? 0, WRAP_UP_BANK_CAP) }
  }
  return { ...p, winsTowardWrapUp: 0 }
}

export const useSrs = create<SrsState>()(
  persist(
    (set, get) => ({
      stats: {},
      games: EMPTY_TALLY,
      wrapUpsBanked: 0,
      winsTowardWrapUp: 0,
      recordRound: (results, now) =>
        set((s) => ({ stats: applyRoundResults(s.stats, results, now) })),
      recordGame: (outcome, mode = 'normal') =>
        set((s) => {
          // Same set as the tally it is earned by — see wrapUpsBanked above.
          const bank = bankAfterRound(
            { banked: s.wrapUpsBanked, wins: s.winsTowardWrapUp },
            outcome.result,
            mode,
          )
          return {
            games: {
              played: s.games.played + 1,
              won: s.games.won + (outcome.result === 'won' ? 1 : 0),
              redeemed: s.games.redeemed,
              lost: s.games.lost + (outcome.result === 'lost' ? 1 : 0),
            },
            wrapUpsBanked: bank.banked,
            winsTowardWrapUp: bank.wins,
          }
        }),
      spendWrapUp: () => {
        if (get().wrapUpsBanked <= 0) return false
        set((s) => ({ wrapUpsBanked: s.wrapUpsBanked - 1 }))
        return true
      },
      reset: () =>
        set({ stats: {}, games: EMPTY_TALLY, wrapUpsBanked: 0, winsTowardWrapUp: 0 }),
    }),
    { name: 'cluecab-srs-v1', version: 4, migrate: migrateSrs },
  ),
)
