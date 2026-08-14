import type { RoundWordResult, SrsMap, WordStats } from './types'

export const INTERVALS_DAYS = [0, 1, 3, 7, 14] as const

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Box 0 has no interval in Leitner terms — it means "not learned yet" rather
 * than "review in N days". The sampler still needs a spacing for it, and the
 * old code supplied one by special case: interval 0 meant maximally overdue,
 * always. So a box-0 word was as due thirty seconds after you played it as a
 * week later, and box 0 is where every word you are currently getting wrong
 * lives. Boards repeated themselves because of it — measured at 4.8 of 12
 * words carried over from one board to the next, one word on 8 boards in 10.
 *
 * Twenty minutes instead: long enough that a sitting does not serve the same
 * word twice running, short enough that a word you are failing comes back the
 * same evening, which is the whole point of box 0.
 */
const BOX0_INTERVAL_DAYS = 20 / (60 * 24)

export function newStats(now: number): WordStats {
  return {
    box: 0,
    lastSeenAt: now,
    seen: 0,
    correctGuesses: 0,
    misses: 0,
    lookups: 0,
    redemptionRight: 0,
    redemptionWrong: 0,
    greenByClue: 0,
    greenByGuess: 0,
  }
}

const clampBox = (b: number): WordStats['box'] => Math.max(0, Math.min(4, b)) as WordStats['box']

/**
 * Apply one round's signals in a single batch at round end, returning a new map.
 * A looked-up word that was then guessed correctly deliberately nets out to
 * "no promotion": the lookup did the work, not memory.
 */
export function applyRoundResults(map: SrsMap, results: RoundWordResult[], now: number): SrsMap {
  const next: SrsMap = { ...map }
  for (const r of results) {
    const prev = next[r.wordId] ?? newStats(now)
    const s: WordStats = { ...prev, seen: prev.seen + 1 }

    if (r.guessedGreen) s.correctGuesses += 1
    if (r.guessedWrong) s.misses += 1
    if (r.greenByOwnClue) s.greenByClue += 1
    if (r.greenByOwnGuess) s.greenByGuess += 1
    if (r.lookedUp) s.lookups += 1
    if (r.redemption === 'right') s.redemptionRight += 1
    if (r.redemption === 'wrong') s.redemptionWrong += 1

    const demote = r.guessedWrong || r.redemption === 'wrong'
    const promote = (r.guessedGreen && !r.lookedUp) || r.redemption === 'right'
    if (demote) s.box = clampBox(s.box - 1)
    else if (promote) s.box = clampBox(s.box + 1)

    // Lookup-only exposure stays due: don't push the review date forward.
    const lookupOnly = r.lookedUp && !r.guessedGreen && !r.guessedWrong && !r.redemption
    if (!lookupOnly || !(r.wordId in map)) s.lastSeenAt = now

    next[r.wordId] = s
  }
  return next
}

/** A never-seen word wants practice as much as a box-0 one — see reviewWeight. */
const UNSEEN_NEED = 3

/**
 * How much the player needs to practise a word, used to steer key dealing:
 * high-need words become the AI's greens (the player must recall them), while
 * well-known ones become the forbidden hazards they can knowingly avoid.
 * Reuses reviewWeight's overdue × struggling × looked-up shape, then damps
 * words already collected so they drift toward hazard and filler.
 */
export function practiceNeed(
  stats: WordStats | undefined,
  collected: boolean,
  now: number,
): number {
  if (!stats) return UNSEEN_NEED
  return reviewWeight(stats, now) * (collected ? 0.4 : 1)
}

/**
 * Sampling weight for a seen word: overdue words and struggling words dominate;
 * nothing reaches zero, preserving variety.
 */
export function reviewWeight(stats: WordStats, now: number): number {
  const interval = INTERVALS_DAYS[stats.box] || BOX0_INTERVAL_DAYS
  const daysSince = Math.max(0, now - stats.lastSeenAt) / DAY_MS
  // Floor is low on purpose: a word seen minutes ago should be able to come
  // back, and should not be competing on equal terms with one seen last week.
  // At 0.25 it was — which is most of why boards repeated themselves.
  const overdue = Math.min(3, Math.max(0.1, daysSince / interval))
  const struggling = 1 + stats.misses / (stats.seen + 1)
  const lookedUp = 1 + (0.5 * Math.min(stats.lookups, 4)) / 4
  return overdue * struggling * lookedUp
}
