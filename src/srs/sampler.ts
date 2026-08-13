import type { WordEntry } from '../data/types'
import { curriculumRank } from '../data/words'
import { danishStem, levenshtein, normalize } from '../engine/text'
import type { Rng } from '../engine/rng'
import { practiceNeed } from './scheduler'
import type { SrsMap } from './types'

/** How far into the unseen frontier a new word may be drawn from. */
const FRONTIER_WINDOW = 15

/**
 * How many words a board may share with the one before it.
 *
 * Weighting alone could not deliver this. Overdue words are meant to come back
 * and the pool a new player has is small, so the draw kept landing on the same
 * handful and boards averaged nearly five words in common — enough that they
 * stopped feeling like new boards. This is the blunt instrument: whatever the
 * weights say, at most three words carry over.
 *
 * It outranks maxNewWordsPerBoard when the two disagree, which they do early
 * on: after the first round every seen word IS the previous board, so the only
 * way to keep the cap is to introduce more new words than the review budget
 * would like. That resolves itself within a couple of rounds, and a bigger
 * pool is what stops the problem recurring anyway.
 */
export const MAX_CARRY_OVER = 3

/**
 * Board-time exclusions: no shared stems, no near-identical Danish forms, and
 * no shared English gloss (ambiguous clues + unfair redemption grading).
 */
function conflicts(a: WordEntry, b: WordEntry): boolean {
  const aDa = normalize(a.da)
  const bDa = normalize(b.da)
  if (danishStem(aDa) === danishStem(bDa)) return true
  if (levenshtein(aDa, bDa) <= 1) return true
  const aGlosses = new Set(a.en.map(normalize))
  return b.en.some((g) => aGlosses.has(normalize(g)))
}

function fitsBoard(candidate: WordEntry, chosen: WordEntry[]): boolean {
  return chosen.every((c) => !conflicts(candidate, c))
}

/** Weighted sample without replacement; skips candidates that conflict with picks. */
function drawWeighted(
  pool: { entry: WordEntry; weight: number }[],
  count: number,
  chosen: WordEntry[],
  rng: Rng,
): WordEntry[] {
  const picks: WordEntry[] = []
  const remaining = [...pool]
  while (picks.length < count && remaining.length > 0) {
    const total = remaining.reduce((sum, c) => sum + c.weight, 0)
    let roll = rng() * total
    let idx = remaining.length - 1
    for (let i = 0; i < remaining.length; i++) {
      roll -= remaining[i]!.weight
      if (roll <= 0) {
        idx = i
        break
      }
    }
    const [candidate] = remaining.splice(idx, 1)
    if (fitsBoard(candidate!.entry, [...chosen, ...picks])) picks.push(candidate!.entry)
  }
  return picks
}

/**
 * Select the words for one board: review words weighted by SRS due-ness fill
 * most slots; up to `maxNew` never-seen words are introduced strictly along
 * the frequency ranking (sampled from a small frontier window for variety).
 * Early on, when few words have been seen, new words fill the whole board.
 */
export function selectBoardWords(
  all: readonly WordEntry[],
  srs: SrsMap,
  opts: {
    totalWords: number
    maxNewWordsPerBoard: number
    /**
     * Words already banked by a passed exam. They are permanently green, so a
     * board full of them moves no counter — but dropping them outright would
     * throw away the review they still need. Damped, not excluded.
     */
    collected?: ReadonlySet<string>
    /**
     * The board just played. At most MAX_CARRY_OVER of its words come back —
     * see the constant for why weighting alone could not do this.
     */
    previousBoard?: ReadonlySet<string>
  },
  rng: Rng,
  now: number,
): WordEntry[] {
  const { totalWords, maxNewWordsPerBoard, collected, previousBoard } = opts
  if (all.length < totalWords) {
    throw new Error(`need at least ${totalWords} words, dataset has ${all.length}`)
  }

  const seen = all.filter((w) => w.id in srs)
  const unseen = all.filter((w) => !(w.id in srs)).sort((a, b) => curriculumRank(a) - curriculumRank(b))

  const weigh = (entry: WordEntry) => ({
    entry,
    weight: practiceNeed(srs[entry.id]!, collected?.has(entry.id) ?? false, now),
  })
  // Split before drawing rather than filtering after: the cap has to bound the
  // number taken, and a post-hoc filter would just leave the board short.
  const onLastBoard = (w: WordEntry) => previousBoard?.has(w.id) ?? false
  const freshPool = seen.filter((w) => !onLastBoard(w)).map(weigh)
  const carryPool = seen.filter(onLastBoard).map(weigh)
  // Reserve new-word slots only as far as the pool actually HAS unseen words.
  // Reserving them unconditionally means that once everything is seen — the
  // normal state late in a journey city — the frontier picks nothing and those
  // slots fall through to the relaxed last-resort fill below, which ignores
  // both the weighting and the same-board exclusion rules.
  const maxNew = Math.min(maxNewWordsPerBoard, totalWords, unseen.length)
  const desiredReview = Math.min(totalWords - maxNew, seen.length)

  // Words that were NOT on the last board first, then at most MAX_CARRY_OVER
  // that were. Any review slot still empty falls through to the frontier loop
  // below and is filled with a new word — which is how the cap outranks
  // maxNewWordsPerBoard in the early rounds, when everything seen is also
  // everything just played.
  const chosen: WordEntry[] = drawWeighted(freshPool, desiredReview, [], rng)
  const carryRoom = Math.min(MAX_CARRY_OVER, desiredReview - chosen.length)
  if (carryRoom > 0) chosen.push(...drawWeighted(carryPool, carryRoom, chosen, rng))

  // New words come from the front of the frontier; widen only if the review
  // pool could not fill its share (bootstrap or heavy exclusion conflicts).
  let guard = 0
  while (chosen.length < totalWords && guard++ < 3) {
    const needed = totalWords - chosen.length
    const window = unseen
      .filter((w) => !chosen.includes(w))
      .slice(0, Math.max(FRONTIER_WINDOW, needed + 3))
      .map((entry) => ({ entry, weight: 1 }))
    const picked = drawWeighted(window, needed, chosen, rng)
    chosen.push(...picked)
    if (picked.length === 0) break
  }

  // Last resort: exclusion rules made the board unfillable — relax them rather
  // than fail (duplicate glosses are unfortunate, an unplayable app is worse).
  if (chosen.length < totalWords) {
    // Last board's words go to the back of this queue too, so the cap survives
    // the relaxation and is only broken when the pool genuinely cannot fill a
    // board without them.
    const lastResort = [...seen.filter((w) => !onLastBoard(w)), ...unseen, ...seen.filter(onLastBoard)]
    for (const w of lastResort) {
      if (chosen.length === totalWords) break
      if (!chosen.includes(w)) chosen.push(w)
    }
  }

  return shuffleInPlace(chosen.slice(0, totalWords), rng)
}

function shuffleInPlace<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/**
 * Daily-challenge board: a seeded uniform draw over the WHOLE dataset (same
 * board for everyone on the same date), with the usual conflict exclusions.
 */
export function selectDailyWords(
  all: readonly WordEntry[],
  totalWords: number,
  rng: Rng,
): WordEntry[] {
  if (all.length < totalWords) {
    throw new Error(`need at least ${totalWords} words, dataset has ${all.length}`)
  }
  const pool = all.map((entry) => ({ entry, weight: 1 }))
  const chosen = drawWeighted(pool, totalWords, [], rng)
  // The exclusion rules can only starve a board in a pathological dataset.
  for (const w of all) {
    if (chosen.length === totalWords) break
    if (!chosen.includes(w)) chosen.push(w)
  }
  return shuffleInPlace(chosen.slice(0, totalWords), rng)
}
