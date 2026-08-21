import { describe, expect, it } from 'vitest'
import { ACTIVE } from '../lang/active'
import { CRITICAL_TIPS, clueyLines, openingLineIndex } from './cluey-tips'

/**
 * The intro window (O4): the first sessions open Casey's bubble on the
 * critical tips in priority order, one per distinct day, before the daily
 * rotation. Mutation-checked when written: with the day-advance branch
 * removed, 'a new day fronts the next tip' fails; with CRITICAL_TIPS no
 * longer leading TIPS, 'leafing onward walks them in order' fails.
 */

const fakeStorage = (seed: Record<string, string> = {}) => {
  const m = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

// Any fixed day number works; the code only compares and mods it.
const DAY = 753901
const lines = clueyLines(0)
const count = lines.length

describe('the intro window fronts the critical tips', () => {
  it('a fresh device opens on the first critical tip', () => {
    const idx = openingLineIndex(count, fakeStorage(), DAY)
    expect(lines[idx]).toBe(CRITICAL_TIPS[0])
  })

  it('and leafing onward walks them in priority order', () => {
    // Tapping the bubble is index+1 (Cluey.tsx), so the tips must LEAD the
    // list for the walk to follow the declared priority.
    const idx = openingLineIndex(count, fakeStorage(), DAY)
    for (let i = 0; i < CRITICAL_TIPS.length; i++) {
      expect(lines[(idx + i) % count]).toBe(CRITICAL_TIPS[i])
    }
  })

  it('the same day keeps the same tip, however often the app opens', () => {
    const s = fakeStorage()
    const first = openingLineIndex(count, s, DAY)
    expect(openingLineIndex(count, s, DAY)).toBe(first)
    expect(openingLineIndex(count, s, DAY)).toBe(first)
  })

  it('a new day fronts the next tip', () => {
    const s = fakeStorage()
    openingLineIndex(count, s, DAY)
    const idx = openingLineIndex(count, s, DAY + 1)
    expect(lines[idx]).toBe(CRITICAL_TIPS[1])
  })

  it('a skipped day skips no tip — days asked on, not dayKey arithmetic', () => {
    // dayKey is not day arithmetic across a month boundary (the +31/-27 seam),
    // so the cursor counts distinct days it was consulted on.
    const s = fakeStorage()
    openingLineIndex(count, s, DAY)
    const idx = openingLineIndex(count, s, DAY + 9)
    expect(lines[idx]).toBe(CRITICAL_TIPS[1])
  })

  it('after the window the daily rotation takes over', () => {
    const s = fakeStorage()
    for (let d = 0; d <= CRITICAL_TIPS.length; d++) openingLineIndex(count, s, DAY + d)
    const day = DAY + CRITICAL_TIPS.length
    expect(openingLineIndex(count, s, day)).toBe(day % count)
  })

  it('a corrupt cursor falls back to the rotation — ties toward veteran', () => {
    const s = fakeStorage({ 'cluecab-tips-intro': 'not json' })
    expect(openingLineIndex(count, s, DAY)).toBe(DAY % count)
    const wrongShape = fakeStorage({ 'cluecab-tips-intro': '{"steps":3}' })
    expect(openingLineIndex(count, wrongShape, DAY)).toBe(DAY % count)
  })

  it('storage that throws or is absent falls back to the rotation', () => {
    const throwing = {
      getItem: (): string | null => {
        throw new Error('private mode')
      },
      setItem: (): void => {
        throw new Error('private mode')
      },
    }
    expect(openingLineIndex(count, throwing, DAY)).toBe(DAY % count)
    expect(openingLineIndex(count, undefined, DAY)).toBe(DAY % count)
  })
})

describe('the tips list itself', () => {
  it('keeps every one of the pack language tips — interleaving must not drop a tail', () => {
    for (const tip of ACTIVE.copy.tips) expect(lines).toContain(tip)
  })

  it('says each critical tip exactly once', () => {
    for (const tip of CRITICAL_TIPS) {
      expect(lines.filter((l) => l === tip)).toHaveLength(1)
    }
  })
})
