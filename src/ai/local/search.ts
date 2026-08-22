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
 * MEASURED, not chosen, the way every number in `src/engine/config.ts` is.
 * Engine-vs-engine on real city-1 boards (both seats cluing and guessing
 * through this search and `sim`; 400 seeded games a cell; reproducible with
 *
 *   ENGINE_THETA_SWEEP=1 ENGINE_GAMES=400 npx vitest run src/ai/local/engine.test.ts
 *
 * ):
 *
 *   θ                  0.0    0.5    1.0    1.5    2.0
 *   win %             91.0   99.0   97.5   59.0   21.3
 *   coverage/clue     3.04   2.38   1.97   1.57   1.44
 *   clues below θ      0      0     49/2630  16/3148  164/3198
 *
 * 0.5 is the peak, and each neighbour loses for a legible reason. At 0 a
 * clue may TIE its strongest trap, and the guesser — ranking by the same sim
 * — takes the trap half the time; strictly outranking every trap is worth
 * eight points of win rate. Above 0.5 the search pays coverage for safety
 * the guesser never redeems (2.38 → 1.97 words a clue at 1.0), and by 1.5
 * the board runs out of clues with greens still on it. 0.5 is also the
 * smallest step sim produces, so this is the lowest bar that still means
 * "every target beats every trap outright".
 *
 * A caveat E4 must weigh before trusting the absolute numbers: self-play
 * shares one evaluator between the seats, so the guesser is confusable in
 * exactly the ways the clue-giver already priced in — 99% is the upper
 * bound §6 Stage 4 names, not a claim about a human partner, and a
 * human-facing measurement may want θ higher.
 */
export const THETA = 0.5

/**
 * The bar on the LAST clue, where the search prefers coverage — mirroring
 * what `prompts.ts` (paceLine, turnsLeft <= 2) already tells the model: when
 * the tokens run out the round goes to sudden death, so a green not pointed
 * at now is a green the player can never find.
 *
 * Measured equal to θ today, which makes the branch a no-op — the sweep
 * played last-clue bars of 0 and 0.5 at θ=0.5 to identical results (99.0%,
 * 400 games; the last clue rarely arrives at that win rate), and 0 is not
 * worth having anyway: it lets a final clue tie its own trap. The branch
 * stays because it is the honest mirror of what the prompt tells the model,
 * and it bites the day a human-facing measurement moves θ up.
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
   * honest last resort, never its preference. Measured at 0 of 2,337 clues
   * across 400 engine-vs-engine city-1 games at θ=0.5, so the acceptance
   * test asserts it stays false on those boards.
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
