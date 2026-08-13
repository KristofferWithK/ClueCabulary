import type { WordEntry } from '../data/types'
import { curriculumRank } from '../data/words'
import { danishStem, levenshtein, normalize } from '../engine/text'
import type { Rng } from '../engine/rng'
import { practiceNeed } from './scheduler'
import type { SrsMap } from './types'

/** How far into the unseen frontier a new word may be drawn from. */
const FRONTIER_WINDOW = 15

/**
 * How many words a board shares with the one before it: three, exactly, once
 * there is a previous board and a pool big enough to fill the rest.
 *
 * It began as a ceiling — whatever the weights want, no more than three — which
 * fixed the reported problem (boards averaged nearly five words in common, and
 * one word turned up on eight boards out of ten) but overshot it. Drawing the
 * fresh words first meant the review budget was usually spent before the cap
 * was ever reached, so consecutive boards shared nothing at all, and "at most
 * three" and "three" are not the same rule. The one asked for is the simple
 * one: every board has three words from the round before.
 *
 * So the three are drawn FIRST, and by practice need, which makes them the
 * three words of the last board the player is shakiest on — the ones worth
 * seeing again while the round is still in mind. Everything else on the board
 * is either a word they have not seen for a while or one they have never seen.
 *
 * It outranks maxNewWordsPerBoard when the two disagree, which they do early
 * on: after the first round every seen word IS the previous board, so the only
 * way to keep the other nine slots off it is to introduce more new words than
 * the review budget would like. That resolves itself within a couple of rounds,
 * and a bigger pool is what stops the problem recurring anyway.
 */
export const CARRY_OVER = 3

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
     * The last boards played, newest first. Exactly CARRY_OVER words come back
     * from the newest, and the rest of the board is drawn from everything else
     * — see the constant for why weighting alone could not do either half.
     *
     * The second entry is what stops a word riding the quota: one that carried
     * over already (it is on both) has had its turn and sits this board out.
     * Without that, three words chain forward board after board, and a sitting
     * of ten put one word on seven of them — which is the complaint this whole
     * mechanism exists to answer, arriving by a different route.
     */
    recentBoards?: readonly ReadonlySet<string>[]
  },
  rng: Rng,
  now: number,
): WordEntry[] {
  const { totalWords, maxNewWordsPerBoard, collected, recentBoards } = opts
  const previousBoard = recentBoards?.[0]
  const boardBefore = recentBoards?.[1]
  if (all.length < totalWords) {
    throw new Error(`need at least ${totalWords} words, dataset has ${all.length}`)
  }

  const weigh = (entry: WordEntry) => ({
    entry,
    weight: practiceNeed(srs[entry.id], collected?.has(entry.id) ?? false, now),
  })
  const onLastBoard = (w: WordEntry) => previousBoard?.has(w.id) ?? false
  const alreadyCarried = (w: WordEntry) => onLastBoard(w) && (boardBefore?.has(w.id) ?? false)

  // The three splits below are over ALL words, not over the seen ones.
  //
  // They used to be over `seen`, and that quietly excused the rule from the
  // boards where it matters most. Early in a city almost every word is new, so
  // "the last board" was a set the sampler had no opinion about: it drew nine
  // new words from a fifteen-word frontier window, and drew them again next
  // board, and again. Measured in the app: ten of twelve words repeated, board
  // after board. The unit tests missed it because they hand the sampler an SRS
  // map where everything is already seen.
  const carryPool = all.filter((w) => onLastBoard(w) && !alreadyCarried(w)).map(weigh)
  const seen = all.filter((w) => w.id in srs && !onLastBoard(w))
  const unseen = all
    .filter((w) => !(w.id in srs) && !onLastBoard(w))
    .sort((a, b) => curriculumRank(a) - curriculumRank(b))
  const freshPool = seen.map(weigh)

  // The carry-over first, because it is a quota and not a leftover: drawn
  // second it never got a turn, since the fresh pool had already spent the
  // review budget. Weighted, so the three that come back are the three of the
  // last board the player most needs to see again.
  const chosen: WordEntry[] = drawWeighted(carryPool, Math.min(CARRY_OVER, totalWords), [], rng)

  // Reserve new-word slots only as far as the pool actually HAS unseen words.
  // Reserving them unconditionally means that once everything is seen — the
  // normal state late in a journey city — the frontier picks nothing and those
  // slots fall through to the relaxed last-resort fill below, which ignores
  // both the weighting and the same-board exclusion rules.
  const remaining = totalWords - chosen.length
  const maxNew = Math.min(maxNewWordsPerBoard, remaining, unseen.length)
  const desiredReview = Math.min(remaining - maxNew, seen.length)

  // Then the review words, all of them from boards the player has not just
  // played. Any review slot still empty falls through to the frontier loop and
  // is filled with a new word — which is how the quota outranks
  // maxNewWordsPerBoard in the early rounds, when everything seen is also
  // everything just played.
  chosen.push(...drawWeighted(freshPool, desiredReview, chosen, rng))

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
    // `seen` and `unseen` already exclude the last board, so it is only the
    // tail here: the quota is exceeded when — and only when — the pool
    // genuinely cannot fill a board without going back to it. A city of a
    // hundred words never gets here; a hand-made test dataset can.
    const lastResort = [...seen, ...unseen, ...all.filter(onLastBoard)]
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
