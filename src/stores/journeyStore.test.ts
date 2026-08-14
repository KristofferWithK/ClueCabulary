import { beforeEach, describe, expect, it } from 'vitest'
import { migrateJourney, useJourney } from './journeyStore'

const NOW = 1_700_000_000_000
const DAY = 86_400_000

describe('journeyStore', () => {
  beforeEach(() => useJourney.getState().reset())

  describe('wrapping words', () => {
    it('packs them with a timestamp', () => {
      useJourney.getState().wrapWords(['a', 'b'], NOW)
      expect(useJourney.getState().wrapped).toEqual({ a: NOW, b: NOW })
    })

    it('is add-only: a re-wrap keeps the first time', () => {
      useJourney.getState().wrapWords(['a'], NOW)
      useJourney.getState().wrapWords(['a', 'b'], NOW + 5000)
      expect(useJourney.getState().wrapped).toEqual({ a: NOW, b: NOW + 5000 })
    })
  })

  describe('travel', () => {
    it('moves one stop and records the arrival', () => {
      useJourney.getState().travel(NOW)
      const s = useJourney.getState()
      expect(s.cityIndex).toBe(1)
      expect(s.arrivedAt[1]).toBe(NOW)
    })

    it('stops at the end of the road', () => {
      for (let i = 0; i < 20; i++) useJourney.getState().travel(NOW + i)
      expect(useJourney.getState().cityIndex).toBe(9)
    })
  })
})

/**
 * v2 -> v3 is the exam economy ceasing to be, and it runs against real saved
 * blobs on real phones. The fixture below is the v2 shape byte-for-byte: every
 * field the store persisted, exactly as `persist` stored it. Mutation-checked:
 * dropping the `wrapped: banked` line in migrateJourney fails the first test.
 */
describe('migrateJourney (v2 -> v3)', () => {
  const v2Blob = () => ({
    cityIndex: 2,
    stamps: { 0: 5, 1: 5, 2: 1 },
    banked: { hus: NOW - DAY, kat: NOW },
    trialsSpent: { 2: 3 },
    arrivedAt: { 1: NOW - 5 * DAY, 2: NOW - DAY },
    activeExam: { cityIndex: 2, wordIds: ['hus'], answers: { hus: 'house' } },
    lastPaper: ['hus'],
  })

  it('banked words become wrapped, timestamps intact', () => {
    const out = migrateJourney(v2Blob(), 2) as { wrapped: Record<string, number> }
    expect(out.wrapped).toEqual({ hus: NOW - DAY, kat: NOW })
  })

  it('keeps the city and the travel log', () => {
    const out = migrateJourney(v2Blob(), 2) as Record<string, unknown>
    expect(out.cityIndex).toBe(2)
    expect(out.arrivedAt).toEqual({ 1: NOW - 5 * DAY, 2: NOW - DAY })
  })

  it('the exam economy has nothing to become, and is gone', () => {
    const out = migrateJourney(v2Blob(), 2) as Record<string, unknown>
    for (const dead of ['stamps', 'banked', 'trialsSpent', 'activeExam', 'lastPaper']) {
      expect(out).not.toHaveProperty(dead)
    }
  })

  it('passes a v3 blob through untouched', () => {
    const blob = { cityIndex: 1, wrapped: { hus: NOW }, arrivedAt: {} }
    expect(migrateJourney(blob, 3)).toBe(blob)
  })

  it('survives an empty or absent state', () => {
    expect(migrateJourney(undefined, 2)).toEqual({ wrapped: {} })
    expect(migrateJourney({}, 2)).toEqual({ wrapped: {} })
  })
})
