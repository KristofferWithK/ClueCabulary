import { assertConfigConsistent, type GridConfig } from './config'
import { shuffle, type Rng } from './rng'
import type { CardRole } from './types'

export interface KeyPair {
  playerKey: Record<string, CardRole>
  aiKey: Record<string, CardRole>
}

/**
 * Constructive dual-key dealing: shuffle the board's word ids, then deal fixed
 * slot blocks derived from the config. Invariants hold by construction; tests
 * verify them over hundreds of seeds anyway.
 */
export function generateKeys(config: GridConfig, wordIds: readonly string[], rng: Rng): KeyPair {
  assertConfigConsistent(config)
  if (wordIds.length !== config.totalWords) {
    throw new Error(`expected ${config.totalWords} words, got ${wordIds.length}`)
  }

  const deck = shuffle(wordIds, rng)
  let cursor = 0
  const take = (n: number): string[] => {
    const slice = deck.slice(cursor, cursor + n)
    cursor += n
    return slice
  }

  const playerKey: Record<string, CardRole> = {}
  const aiKey: Record<string, CardRole> = {}
  const deal = (ids: string[], player: CardRole, ai: CardRole) => {
    for (const id of ids) {
      playerKey[id] = player
      aiKey[id] = ai
    }
  }

  // Each side's greens = overlap + (other side's forbiddenVsGreen) + own-only greens.
  const onlyGreens = config.greensPerSide - config.greenOverlap - config.forbiddenVsGreen

  deal(take(config.greenOverlap), 'green', 'green')
  deal(take(config.forbiddenBothSides), 'forbidden', 'forbidden')
  deal(take(config.forbiddenVsGreen), 'forbidden', 'green') // player's forbidden, green for AI
  deal(take(config.forbiddenVsGreen), 'green', 'forbidden') // AI's forbidden, green for player
  deal(take(config.forbiddenVsBystander), 'forbidden', 'bystander')
  deal(take(config.forbiddenVsBystander), 'bystander', 'forbidden')
  deal(take(onlyGreens), 'green', 'bystander')
  deal(take(onlyGreens), 'bystander', 'green')
  deal(deck.slice(cursor), 'bystander', 'bystander')

  return { playerKey, aiKey }
}

/** Words that are green on at least one key — all must be found to win. */
export function distinctGreenIds(keys: KeyPair): string[] {
  const ids = new Set<string>()
  for (const [id, role] of Object.entries(keys.playerKey)) if (role === 'green') ids.add(id)
  for (const [id, role] of Object.entries(keys.aiKey)) if (role === 'green') ids.add(id)
  return [...ids]
}
