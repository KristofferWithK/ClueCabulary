import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * THE CLUE LEDGER (docs/clue-engine.md §6 "Stage 4", item 3).
 *
 * One row per clue Casey gives: how many words he asked for, how many the
 * player actually found under it, which arm answered, and whether that arm's
 * first reply was refused by the app's own validator.
 *
 * It exists for one number. `proxy/README.md` records that `r` — how often the
 * cheap tier is refused — is "the one number in all of this that has never been
 * measured", and the whole cascade arithmetic turns on it: the cascade saves
 * money unless `r` exceeds `1 − p/P`. `askValidated` already knows the answer
 * every time it retries (a retry IS a refusal, and it is the retry that asks
 * the proxy for the better model); nothing was ever writing it down. Now
 * `runAiClue` does.
 *
 * The second thing it measures falls out for free. `arm` is the model alias the
 * request asked for, or `engine` when the local clue engine answered, or `mock`
 * when even the engine had no board to work from. With the alias table's blind
 * A/B (`proxy/wrangler.toml` — three names, three models, nothing on screen
 * saying which) that makes this a like-for-like hit-rate comparison on real
 * boards, which is the one measurement `engine-selfplay.test.ts` cannot be: a
 * self-play harness can only ever ask how well the engine agrees with itself.
 *
 * WHAT IT DELIBERATELY DOES NOT HOLD. No clue text, no word ids, no board, no
 * key — the owner declined "a ledger schema designed as future training data"
 * (§3), and four small integers cannot become one by accident. It is a counter
 * per arm, not a log: a hundred rounds add nothing to its size.
 *
 * NEW STORE, so `version: 1` with no migrate — there is no device that has
 * written an older shape. (A default CHANGED in a persisted store is the trap
 * CLAUDE.md #3 describes; a store created at 1 is not.)
 */

/** Everything the ledger knows about one arm. */
export interface ArmTally {
  /** Clues given by this arm and resolved. */
  clues: number
  /** Sum of the numbers announced. */
  asked: number
  /** Greens the player found under those clues, on Casey's key. */
  hits: number
  /**
   * Clues whose FIRST reply the app's validator refused — not JSON, schema
   * rejected, illegal clue, or a target that is not one of Casey's unrevealed
   * greens. This is `r`. Always 0 for the offline arms, which have no
   * validator loop to lose.
   */
  refused: number
}

const EMPTY: ArmTally = { clues: 0, asked: 0, hits: 0, refused: 0 }

export interface LedgerEntry {
  number: number
  hits: number
  arm: string
  /** True when the arm's first reply was refused and the call was retried. */
  refused: boolean
}

interface LedgerStore {
  /** arm -> tally. Arms appear the first time one answers. */
  arms: Record<string, ArmTally>
  record: (entry: LedgerEntry) => void
  clear: () => void
}

export const useLedger = create<LedgerStore>()(
  persist(
    (set) => ({
      arms: {},
      record: ({ number, hits, arm, refused }) =>
        set((s) => {
          const prior = s.arms[arm] ?? EMPTY
          return {
            arms: {
              ...s.arms,
              [arm]: {
                clues: prior.clues + 1,
                asked: prior.asked + number,
                hits: prior.hits + hits,
                refused: prior.refused + (refused ? 1 : 0),
              },
            },
          }
        }),
      clear: () => set({ arms: {} }),
    }),
    { name: 'cluecab-ledger-v1', version: 1 },
  ),
)

export interface ArmReading {
  arm: string
  tally: ArmTally
  /**
   * Greens found per word asked for — the same metric
   * `engine-selfplay.test.ts` prints as `hits/number` and
   * `e2e/engine-probe.mjs` prints per round, so the three are directly
   * comparable. Null until the arm has been asked for anything.
   */
  hitsPerNumber: number | null
  /** `r`: the share of this arm's clues whose first reply was refused. */
  refusalRate: number | null
}

/**
 * The ledger as Settings prints it: busiest arm first. Pure and exported, so a
 * test reads it without a store and the screen holds no arithmetic.
 */
export function readLedger(arms: Record<string, ArmTally>): ArmReading[] {
  return Object.entries(arms)
    .map(([arm, tally]) => ({
      arm,
      tally,
      hitsPerNumber: tally.asked > 0 ? tally.hits / tally.asked : null,
      refusalRate: tally.clues > 0 ? tally.refused / tally.clues : null,
    }))
    .sort((a, b) => b.tally.clues - a.tally.clues || a.arm.localeCompare(b.arm))
}
