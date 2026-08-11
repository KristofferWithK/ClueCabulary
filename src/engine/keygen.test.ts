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
