import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS, assertConfigConsistent, type GridConfig } from './config'
import { distinctGreenIds, generateKeys } from './keygen'
import { mulberry32 } from './rng'
import type { CardRole } from './types'

const wordIds = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`)

function countRoles(key: Record<string, CardRole>) {
  const counts = { green: 0, bystander: 0, forbidden: 0 }
  for (const role of Object.values(key)) counts[role]++
  return counts
}

describe.each(Object.entries(GRID_CONFIGS))('keygen %s', (_name, config: GridConfig) => {
  it('config is internally consistent', () => {
    expect(() => assertConfigConsistent(config)).not.toThrow()
  })

  it('holds all invariants across 300 seeds', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const ids = wordIds(config.totalWords)
      const keys = generateKeys(config, ids, mulberry32(seed))

      for (const key of [keys.playerKey, keys.aiKey]) {
        expect(Object.keys(key).sort()).toEqual([...ids].sort())
        const counts = countRoles(key)
        expect(counts.green).toBe(config.greensPerSide)
        expect(counts.forbidden).toBe(config.forbiddenPerSide)
      }

      const overlap = ids.filter(
        (id) => keys.playerKey[id] === 'green' && keys.aiKey[id] === 'green',
      )
      expect(overlap.length).toBe(config.greenOverlap)

      // Cross-side identity of each side's forbidden words.
      for (const [own, other] of [
        [keys.playerKey, keys.aiKey],
        [keys.aiKey, keys.playerKey],
      ] as const) {
        const forbidden = ids.filter((id) => own[id] === 'forbidden')
        const onOther = { green: 0, bystander: 0, forbidden: 0 }
        for (const id of forbidden) onOther[other[id]!]++
        expect(onOther.forbidden).toBe(config.forbiddenBothSides)
        expect(onOther.green).toBe(config.forbiddenVsGreen)
        expect(onOther.bystander).toBe(config.forbiddenVsBystander)
      }

      expect(distinctGreenIds(keys).length).toBe(2 * config.greensPerSide - config.greenOverlap)
    }
  })

  it('shuffles: different seeds give different keys', () => {
    const ids = wordIds(config.totalWords)
    const a = generateKeys(config, ids, mulberry32(1))
    const b = generateKeys(config, ids, mulberry32(2))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
})

it('rejects wrong word count', () => {
  expect(() => generateKeys(GRID_CONFIGS.beginner, wordIds(11), mulberry32(1))).toThrow()
})

describe('SRS-biased dealing', () => {
  const config = GRID_CONFIGS.standard
  const ids = wordIds(config.totalWords)
  /** The first five words are ones the player keeps forgetting. */
  const WEAK = ids.slice(0, 5)
  const weakBias = {
    need: Object.fromEntries(ids.map((id) => [id, WEAK.includes(id) ? 6 : 0.3])),
  }

  it('holds every invariant under an arbitrary bias', () => {
    for (let seed = 1; seed <= 300; seed++) {
      // A different random need map each seed, to catch weight-shape bugs.
      const rngForNeed = mulberry32(seed * 7919)
      const bias = { need: Object.fromEntries(ids.map((id) => [id, rngForNeed() * 10])) }
      const keys = generateKeys(config, ids, mulberry32(seed), bias)

      for (const key of [keys.playerKey, keys.aiKey]) {
        expect(Object.keys(key).sort()).toEqual([...ids].sort())
        const counts = countRoles(key)
        expect(counts.green).toBe(config.greensPerSide)
        expect(counts.forbidden).toBe(config.forbiddenPerSide)
      }
      expect(
        ids.filter((id) => keys.playerKey[id] === 'green' && keys.aiKey[id] === 'green').length,
      ).toBe(config.greenOverlap)

      for (const [own, other] of [
        [keys.playerKey, keys.aiKey],
        [keys.aiKey, keys.playerKey],
      ] as const) {
        const onOther = { green: 0, bystander: 0, forbidden: 0 }
        for (const id of ids.filter((id) => own[id] === 'forbidden')) onOther[other[id]!]++
        expect(onOther.forbidden).toBe(config.forbiddenBothSides)
        expect(onOther.green).toBe(config.forbiddenVsGreen)
        expect(onOther.bystander).toBe(config.forbiddenVsBystander)
      }
    }
  })

  it('steers weak words into recall practice and away from hazards', () => {
    const rounds = 400
    let weakRecall = 0
    let weakHazard = 0
    let strongRecall = 0
    let strongHazard = 0

    for (let seed = 1; seed <= rounds; seed++) {
      const keys = generateKeys(config, ids, mulberry32(seed), weakBias)
      for (const id of ids) {
        // Recall = green on the AI's key: the player has to guess it.
        const recall = keys.aiKey[id] === 'green'
        const hazard = keys.playerKey[id] === 'forbidden' || keys.aiKey[id] === 'forbidden'
        if (WEAK.includes(id)) {
          if (recall) weakRecall++
          if (hazard) weakHazard++
        } else {
          if (recall) strongRecall++
          if (hazard) strongHazard++
        }
      }
    }

    const weakRecallRate = weakRecall / (rounds * WEAK.length)
    const strongRecallRate = strongRecall / (rounds * (ids.length - WEAK.length))
    const weakHazardRate = weakHazard / (rounds * WEAK.length)
    const strongHazardRate = strongHazard / (rounds * (ids.length - WEAK.length))

    // Unbiased, every word would sit at 7/20 recall and 4/20 hazard.
    expect(weakRecallRate).toBeGreaterThan(0.6)
    expect(weakRecallRate).toBeGreaterThan(strongRecallRate * 1.5)
    expect(weakHazardRate).toBeLessThan(strongHazardRate)
  })

  it('still varies the board — bias is a lean, not a rule', () => {
    const signatures = new Set<string>()
    for (let seed = 1; seed <= 100; seed++) {
      const keys = generateKeys(config, ids, mulberry32(seed), weakBias)
      signatures.add(ids.map((id) => keys.aiKey[id]).join())
    }
    expect(signatures.size).toBeGreaterThan(80)
  })

  it('is deterministic for a given seed and need map', () => {
    const a = generateKeys(config, ids, mulberry32(42), weakBias)
    const b = generateKeys(config, ids, mulberry32(42), weakBias)
    expect(a).toEqual(b)
  })

  it('shows no tier preference when every word is equally needed', () => {
    const flat = { need: Object.fromEntries(ids.map((id) => [id, 1])) }
    const recallCounts = new Map(ids.map((id) => [id, 0]))
    const rounds = 600
    for (let seed = 1; seed <= rounds; seed++) {
      const keys = generateKeys(config, ids, mulberry32(seed), flat)
      for (const id of ids) if (keys.aiKey[id] === 'green') recallCounts.set(id, recallCounts.get(id)! + 1)
    }
    const rates = [...recallCounts.values()].map((n) => n / rounds)
    // Expected 7/20 = 0.35 for every word; allow sampling noise.
    for (const rate of rates) expect(Math.abs(rate - 0.35)).toBeLessThan(0.08)
  })
})
