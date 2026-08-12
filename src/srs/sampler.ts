import type { WordEntry } from '../data/types'
import { curriculumRank } from '../data/words'
import { danishStem, levenshtein, normalize } from '../engine/text'
import type { Rng } from '../engine/rng'
import { practiceNeed } from './scheduler'
import type { SrsMap } from './types'

/** How far into the unseen frontier a new word may be drawn from. */
const FRONTIER_WINDOW = 15

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
  },
  rng: Rng,
  now: number,
): WordEntry[] {
  const { totalWords, maxNewWordsPerBoard, collected } = opts
  if (all.length < totalWords) {
    throw new Error(`need at least ${totalWords} words, dataset has ${all.length}`)
  }

  const seen = all.filter((w) => w.id in srs)
  const unseen = all.filter((w) => !(w.id in srs)).sort((a, b) => curriculumRank(a) - curriculumRank(b))

  const reviewPool = seen.map((entry) => ({
    entry,
    weight: practiceNeed(srs[entry.id]!, collected?.has(entry.id) ?? false, now),
  }))
  // Reserve new-word slots only as far as the pool actually HAS unseen words.
  // Reserving them unconditionally means that once everything is seen — the
  // normal state late in a journey city — the frontier picks nothing and those
  // slots fall through to the relaxed last-resort fill below, which ignores
  // both the weighting and the same-board exclusion rules.
  const maxNew = Math.min(maxNewWordsPerBoard, totalWords, unseen.length)
  const desiredReview = Math.min(totalWords - maxNew, seen.length)
  const chosen: WordEntry[] = drawWeighted(reviewPool, desiredReview, [], rng)

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
    for (const w of [...seen, ...unseen]) {
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
