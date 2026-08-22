import { checkClueLegality } from '../../engine/legality'
import type { BoardWord } from '../../engine/types'
import { ACTIVE } from '../../lang/active'
import { wordById } from '../../data/words'
import { aiTargetableIds, type AiClueView } from '../projections'
import { engineTrapIds, type Evaluator } from './evaluator'

/**
 * The search of the clue engine (docs/clue-engine.md §6 Stage 3): enumerate
 * legal candidate clues from the opening book, score each against every
 * subset of Casey's unrevealed greens it can carry, and keep the one with the
 * most coverage whose margin clears θ.
 */

/**
 * θ — the margin a clue must clear: min sim over its targets minus max sim
 * over the traps, on the evaluator's 0–3 scale.
 *
 * MEASURED, not chosen, the way every number in `src/engine/config.ts` is —
 * and re-measured by E4 on a different instrument, because the one that first
 * chose it does not work. Read the retired numbers below before the live ones;
 * they are kept for the same reason E1 kept the `conflicts ≥ 2` rule it
 * deleted (docs/clue-engine.md §6), which is that a wrong measurement nobody
 * wrote down gets made again.
 *
 * ── THE RETIRED SWEEP (E3). DO NOT RESTORE IT AS EVIDENCE. ────────────────
 *
 *   θ                  0.0    0.5    1.0    1.5    2.0
 *   win %             91.0   99.0   97.5   59.0   21.3
 *
 * Engine-vs-engine: both seats cluing and guessing through this search and the
 * SAME `sim`. E4 showed that measures nothing about clue quality. Replace
 * `sim` with a djb2 hash, give both seats the same hash, and the row scores
 * **100%** — better than every honest row in E4's table — because the search
 * picks whatever the shared function ranks high on its targets and low on its
 * traps and the guesser reads it straight back off that same function. A
 * shared arbitrary function is a private code between the seats. Salt the two
 * seats differently and the same engine falls to the floor. So the sweep above
 * ranked θ on how well the search encodes into a code the guesser already
 * shares, not on whether the clue is any good.
 *
 * ── THE LIVE MEASUREMENT (E4): CROSS-MODEL. ───────────────────────────────
 *
 * The book and the matrix were authored twice, and the votes are committed per
 * model, so `src/ai/local/engine-selfplay.test.ts` rebuilds an Opus-only and a
 * Fable-only evaluator and lets one clue while the other guesses. Neither seat
 * shares the other's judgement. Reproduce with
 *
 *   ENGINE_THETA_CROSS=1 ENGINE_SELFPLAY_GAMES=200 \
 *     npx vitest run --reporter=verbose src/ai/local/engine-selfplay.test.ts
 *
 * (the `--reporter=verbose` is load-bearing: vitest 4 swallows a passing
 * test's console output). 200 seeded city-1 boards a cell, **board cleared
 * inside the tokens %**, with hits/number beside it:
 *
 *   θ                    0.0     0.5     1.0     1.5     2.0
 *   Opus→Fable clear    28.0    51.5    42.0    11.0     0.0
 *              hits    0.408   0.623   0.731   0.912   0.966
 *   Fable→Opus clear    36.5    59.5    41.0     9.5     0.5
 *              hits    0.444   0.701   0.786   0.866   0.855
 *   coverage/clue       3.3     2.4     2.0     1.5     1.2
 *
 * θ = 0.5 stands — but for a different reason than the retired sweep gave, and
 * the objective had to change with the instrument.
 *
 * 1. **READ THE BOARDS CLEARED, NOT THE HIT RATE.** hits/number rises
 *    monotonically with θ, all the way to 0.966 at θ = 2.0 — a bar that high
 *    gives clues so safe they are nearly always read correctly and so narrow
 *    that **no board is ever finished**. Optimising a clue engine on hit rate
 *    alone picks the setting that never wins. Win rate is no good either: both
 *    seats being the engine means the engine also plays sudden death, a phase
 *    it never plays in the app. What is left, and what is right, is how often
 *    the board is cleared while the tokens last.
 * 2. **θ = 0 is worse than E3 thought, not better.** It lets a clue TIE its
 *    strongest trap, and a guesser who does NOT share the clue-giver's priors
 *    is far likelier to take the trap than one who does: the void sweep put
 *    θ = 0 eight points behind, the cross-model one puts it 23 points behind.
 * 3. **Above 0.5 the guesser DOES redeem some of the lost coverage** — E3 said
 *    it never does, and cross-model that is wrong: hits/number climbs from
 *    0.623 to 0.731 between 0.5 and 1.0. It simply does not redeem enough. The
 *    clue drops from 2.4 words to 2.0 and the board stops getting finished.
 * 4. The grid is EXHAUSTIVE, not a sample: `sim` returns multiples of 0.5, so
 *    every margin is one too and a bar of 0.75 admits exactly what 1.0 admits.
 *
 * **The one comparison that needed a bigger sample**, and the reason this
 * comment quotes two of them: at 200 games θ = 0.5 beats θ = 1.0 by 9.5 and
 * 18.5 points, but at the suite's 40-game default one direction FLIPS (55.0
 * against 57.5). That is CLAUDE.md's trap — fixed seeds are reproducible, not
 * independent of n. Settled at **400 games a cell**, both directions agreeing:
 *
 *   θ                  0.5     1.0
 *   Opus→Fable clear  48.5    39.8      hits 0.607 / 0.721
 *   Fable→Opus clear  53.8    38.5      hits 0.680 / 0.776
 *
 * So `engine-selfplay.test.ts` pins only what survives every sample size —
 * 0.5 over 0 and over 1.5, in both directions — and leaves 0.5-over-1.0 to
 * this record rather than pretending to re-decide it in twenty seconds.
 *
 * What would move θ: a probe or a ledger measuring a HUMAN reading these
 * clues. Every number above is still one model reading another model, and a
 * person is confusable in ways neither of them is.
 */
export const THETA = 0.5

/**
 * The bar on the LAST clue, where the search prefers coverage — mirroring
 * what `prompts.ts` (paceLine, turnsLeft <= 2) already tells the model: when
 * the tokens run out the round goes to sudden death, so a green not pointed
 * at now is a green the player can never find.
 *
 * Measured equal to θ, so the branch is a no-op at the shipped bar — and the
 * measurement it used to quote rested on the same retired engine-vs-engine
 * sweep as θ did, so E4 re-ran it cross-model too. 400 seeded city-1 boards a
 * cell at θ = 0.5, board cleared inside the tokens % / hits per number:
 *
 *   last-clue bar        0.0            0.5            1.0
 *   Opus→Fable        47.8 / 0.579   48.5 / 0.607   47.0 / 0.621
 *   Fable→Opus        53.5 / 0.659   53.8 / 0.680   52.0 / 0.688
 *
 * Read that honestly: the whole spread is under two points and 0.5 wins both
 * directions by less than one. **The sweep cannot tell these three bars
 * apart**, which is the true statement, rather than "0.5 is the peak" — the
 * last clue simply does not arrive often enough on a board being cleared half
 * the time for its own bar to matter. So the number is set equal to θ because
 * there is no evidence to set it anywhere else, not because it was chosen.
 *
 * The branch stays for the two reasons that are not about this table: it is
 * the honest mirror of what `prompts.ts` already tells the model, and it bites
 * the day a human-facing measurement moves θ up — at which point this cell
 * needs re-running before the two constants are allowed to drift apart.
 */
export const LAST_CLUE_THETA = 0.5

export interface CluePlan {
  /** The clue as it will be spoken, in the view's clue language. */
  text: string
  /** The chosen target subset, in descending sim order. */
  targets: string[]
  margin: number
  coverage: number
  /** The open non-target the clue pulls hardest, for the rationale. */
  riskiest: { id: string; sim: number } | null
  /**
   * True only when NO legal candidate on the whole board cleared the bar and
   * the search fell back to the best margin it could find — the engine's
   * honest last resort, never its preference. It never fires at the shipped
   * bar: 0 clues across 400 engine-vs-engine city-1 games (E3), and 0 again
   * across E4's cross-model sweep in BOTH directions at 400 games a cell —
   * which is the version that still counts, since the seats there do not share
   * an evaluator. It starts firing the moment θ does: 52 and 36 clues at
   * θ = 1.0 (400 games a cell), 186 and 138 at θ = 2.0 (200). So the
   * acceptance test asserts it stays
   * false, and the "escalate below θ" trigger Stage 5 needs is real rather
   * than theoretical.
   */
  belowTheta: boolean
}

/** How many raw candidates legality threw away, and why — for measurement. */
export interface SearchStats {
  candidates: number
  illegal: number
  /** Of the illegal, the ones the containment arm caught via an English gloss
   * — the rule E2 measured authoring the book («te» ⊂ "water") and predicted
   * would thin the candidate list at play time. */
  illegalOnGloss: number
}

interface Candidate {
  text: string
  /** The word ids this candidate was generated FOR (its natural targets). */
  seeds: string[]
}

/**
 * Candidates, in a deterministic order (the tie-break of last resort):
 * pair clues for related target pairs first, then each target's own
 * associations, then city words off the board in curriculum order — the
 * matrix's id order, which `cityPairs()` builds from the city's words sorted
 * by rank, so an earlier word comes first.
 */
function generate(ev: Evaluator, view: AiClueView, targets: readonly string[]): Candidate[] {
  const wantEn = view.clueLanguage === 'en'
  const out: Candidate[] = []
  const seen = new Map<string, Candidate>()
  const add = (text: string, seeds: string[]) => {
    const prior = seen.get(text)
    if (prior) {
      for (const s of seeds) if (!prior.seeds.includes(s)) prior.seeds.push(s)
      return
    }
    const c = { text, seeds: [...seeds] }
    seen.set(text, c)
    out.push(c)
  }

  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      for (const e of ev.pairFor(targets[i]!, targets[j]!)) {
        add(wantEn ? e.en : e.da, [targets[i]!, targets[j]!])
      }
    }
  }
  for (const t of targets) {
    for (const e of ev.assocFor(t)) add(wantEn ? e.en : e.da, [t])
  }
  const onBoard = new Set(view.words.map((w) => w.id))
  for (const id of ev.ids) {
    if (onBoard.has(id)) continue
    const w = wordById(id)
    if (!w) continue
    const text = wantEn ? w.en[0] : w.da
    if (text) add(text, [])
  }
  return out
}

export interface SearchOptions {
  /** Filled in with candidate/legality counts when provided. */
  stats?: SearchStats
  /** Override θ — the sweep behind THETA's measurement uses this. */
  theta?: number
  lastClueTheta?: number
}

/**
 * Pick Casey's clue: max coverage subject to margin ≥ θ, ties to the larger
 * margin, ties to generation order. Returns null only when the board offers
 * no legal candidate with any pull toward a target at all — the caller's cue
 * to fall back to something that is not a bluff.
 */
export function searchClue(
  ev: Evaluator,
  view: AiClueView,
  opts: SearchOptions = {},
): CluePlan | null {
  const stats = opts.stats
  const targets = aiTargetableIds(view)
  if (targets.length === 0) return null
  const traps = engineTrapIds(view)
  const boardWords: BoardWord[] = view.words.map((w) => ({
    wordId: w.id,
    da: w.da,
    en: w.en,
    pos: w.pos,
  }))
  // Mirrors paceLine's last-clue branch in prompts.ts: at two tokens the pool
  // is shared, so this is the last clue Casey is likely to get.
  const bar =
    view.turnsLeft <= 2 ? (opts.lastClueTheta ?? LAST_CLUE_THETA) : (opts.theta ?? THETA)

  let best: CluePlan | null = null
  let bestFallback: CluePlan | null = null
  const better = (a: CluePlan, b: CluePlan | null): boolean =>
    !b || a.coverage > b.coverage || (a.coverage === b.coverage && a.margin > b.margin)

  for (const cand of generate(ev, view, targets)) {
    if (stats) stats.candidates++
    // Every candidate faces the same legality the player does. E2 measured the
    // gloss-containment arm as the main author-side rejector; the stats split
    // exists to say how much it costs here too.
    const verdict = checkClueLegality(cand.text, boardWords, ACTIVE)
    if (!verdict.legal) {
      if (stats) {
        stats.illegal++
        // The exact arm E2 warned about: containment firing on the English
        // gloss («te» ⊂ "water"), not merely any gloss-based rejection.
        if (/contains or is contained in .*translation/.test(verdict.reason ?? '')) {
          stats.illegalOnGloss++
        }
      }
      continue
    }

    // The best subset of size k is the top k targets by sim — any other
    // subset of that size has a weaker minimum — so subsets need not be
    // enumerated, only the sorted prefix walked.
    const ranked = targets
      .map((id) => ({ id, sim: ev.sim(cand.text, id) }))
      .sort((a, b) => b.sim - a.sim || (a.id < b.id ? -1 : 1))
    if (ranked[0]!.sim <= 0) continue
    let riskiest: { id: string; sim: number } | null = null
    for (const t of traps) {
      const s = ev.sim(cand.text, t)
      if (!riskiest || s > riskiest.sim) riskiest = { id: t, sim: s }
    }
    const trapSim = riskiest?.sim ?? 0

    const maxK = Math.min(4, ranked.length)
    for (let k = maxK; k >= 1; k--) {
      const margin = ranked[k - 1]!.sim - trapSim
      if (margin < bar) continue
      const plan: CluePlan = {
        text: cand.text,
        targets: ranked.slice(0, k).map((r) => r.id),
        margin,
        coverage: k,
        riskiest,
        belowTheta: false,
      }
      if (better(plan, best)) best = plan
      break // smaller k on the same candidate only loses coverage
    }
    if (!best) {
      // Track the least-bad single in case nothing anywhere clears the bar.
      const margin = ranked[0]!.sim - trapSim
      const plan: CluePlan = {
        text: cand.text,
        targets: [ranked[0]!.id],
        margin,
        coverage: 1,
        riskiest,
        belowTheta: true,
      }
      if (!bestFallback || plan.margin > bestFallback.margin) bestFallback = plan
    }
  }
  return best ?? bestFallback
}
