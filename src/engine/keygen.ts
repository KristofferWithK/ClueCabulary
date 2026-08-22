import { assertConfigConsistent, type GridConfig } from './config'
import { shuffle, type Rng } from './rng'
import type { CardRole } from './types'

export interface KeyPair {
  playerKey: Record<string, CardRole>
  aiKey: Record<string, CardRole>
}

/**
 * Per-word appetite for practice (higher = the player needs this word more).
 * Purely a number to the engine; the caller decides what it means.
 */
export interface KeyBias {
  need: Readonly<Record<string, number>>
}

/**
 * What a slot asks of the player, which decides who should get it:
 * - `recall`  green on the AI's key — the PLAYER guesses it. Retrieval
 *             practice, the strongest way to fix a word in memory.
 * - `produce` green only on the player's key — the player must clue it, which
 *             needs enough command of the word to find an association.
 * - `filler`  neutral to both sides; no practice either way.
 *
 * There was a fourth, `hazard`: forbidden to someone, and filled last so the
 * words the player knew best became the traps they could knowingly steer
 * around. Forbidden words are gone, so that channel is simply gone with them —
 * a well-known word now lands in `filler` and asks nothing. The SRS bias still
 * steers high-need words into `recall`, which was always the half that taught.
 */
export type SlotTier = 'recall' | 'produce' | 'filler'

interface Slot {
  player: CardRole
  ai: CardRole
  tier: SlotTier
}

/** Fill order: the highest-need words go to `recall`, the best-known to `filler`. */
const TIER_ORDER: SlotTier[] = ['recall', 'produce', 'filler']

function tierOf(player: CardRole, ai: CardRole): SlotTier {
  if (ai === 'green') return 'recall'
  if (player === 'green') return 'produce'
  return 'filler'
}

/** The exact role pairs a config calls for — the source of every invariant. */
function buildSlots(config: GridConfig): Slot[] {
  // Each side's greens = overlap + own-only greens.
  const onlyGreens = config.greensPerSide - config.greenOverlap
  const slots: Slot[] = []
  const add = (n: number, player: CardRole, ai: CardRole) => {
    for (let i = 0; i < n; i++) slots.push({ player, ai, tier: tierOf(player, ai) })
  }

  add(config.greenOverlap, 'green', 'green')
  add(onlyGreens, 'green', 'bystander')
  add(onlyGreens, 'bystander', 'green')
  add(config.totalWords - slots.length, 'bystander', 'bystander')
  return slots
}

/**
 * Weighted random permutation (Efraimidis–Spirakis): key = u^(1/w), sorted
 * descending. Heavier words tend toward the front without ever being certain,
 * so a board is biased but never predictable.
 */
function weightedOrder(wordIds: readonly string[], need: KeyBias['need'], rng: Rng): string[] {
  return wordIds
    .map((id) => {
      const weight = Math.max(need[id] ?? 1, 1e-6)
      return { id, key: Math.pow(rng(), 1 / weight) }
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.id)
}

/**
 * Constructive dual-key dealing: build the exact slots the config calls for,
 * then hand them out. Invariants hold by construction; tests verify them over
 * hundreds of seeds anyway.
 *
 * Without a bias this is a plain random deal. With one, words the player most
 * needs to practise are steered toward the AI's greens, so the player has to
 * recall them; words they know best drift to the back of the order and land in
 * whatever is left, which is now bystanders.
 *
 * `greenPool` is a RULE where `bias` is only a lean, and W1 needed exactly
 * that distinction. A wrap-up board is topped up with words that cannot be
 * wrapped, and a green slot spent on one of those is a green the round cannot
 * bank — so "collected words take the greens" has to hold on every seed, not
 * on most of them. `weightedOrder` is a weighted shuffle: give the collected
 * words a huge `need` and they usually lead, which is a probability. So the
 * pool is applied AFTER the order is drawn, as a stable partition — pool
 * members keep their drawn order among themselves and simply all come first,
 * and since `TIER_ORDER` fills every green slot (`recall`, then `produce`)
 * before the first `filler`, the greens are pool members for as long as the
 * pool lasts. Nothing else about the deal changes: with a pool at least as
 * large as the board's distinct greens no non-member is green, and with a
 * smaller one non-members fill exactly the green slots left over.
 */
export function generateKeys(
  config: GridConfig,
  wordIds: readonly string[],
  rng: Rng,
  bias?: KeyBias,
  greenPool?: ReadonlySet<string>,
): KeyPair {
  assertConfigConsistent(config)
  if (wordIds.length !== config.totalWords) {
    throw new Error(`expected ${config.totalWords} words, got ${wordIds.length}`)
  }

  const slots = buildSlots(config)
  const drawn = bias ? weightedOrder(wordIds, bias.need, rng) : shuffle(wordIds, rng)
  const ordered = greenPool
    ? [...drawn.filter((id) => greenPool.has(id)), ...drawn.filter((id) => !greenPool.has(id))]
    : drawn

  const playerKey: Record<string, CardRole> = {}
  const aiKey: Record<string, CardRole> = {}
  let cursor = 0
  for (const tier of TIER_ORDER) {
    for (const slot of slots) {
      if (slot.tier !== tier) continue
      const id = ordered[cursor++]!
      playerKey[id] = slot.player
      aiKey[id] = slot.ai
    }
  }

  return { playerKey, aiKey }
}

/** Words that are green on at least one key — all must be found to win. */
export function distinctGreenIds(keys: KeyPair): string[] {
  const ids = new Set<string>()
  for (const [id, role] of Object.entries(keys.playerKey)) if (role === 'green') ids.add(id)
  for (const [id, role] of Object.entries(keys.aiKey)) if (role === 'green') ids.add(id)
  return [...ids]
}
