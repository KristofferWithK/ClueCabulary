import { describe, expect, it } from 'vitest'
import { WAGONS, boardLabel, trainLabel, wagonFills } from './TrainProgress'

describe('wagonFills', () => {
  it('leaves every wagon empty at nothing wrapped', () => {
    expect(wagonFills(0, 100)).toEqual(Array(WAGONS).fill(0))
  })

  it('fills every wagon at the goal', () => {
    expect(wagonFills(100, 100)).toEqual(Array(WAGONS).fill(1))
  })

  it('fills one wagon per ten, and part-fills the one being loaded', () => {
    // 85 of 100: eight wagons packed, the ninth half full, the tenth empty.
    expect(wagonFills(85, 100)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0])
  })

  it('clamps rather than spilling past the last wagon', () => {
    // The journey store is monotonic, but a wrapped ledger carried across a
    // dataset change could hold more than the city's hundred.
    expect(wagonFills(140, 100)).toEqual(Array(WAGONS).fill(1))
  })

  it('never goes negative', () => {
    expect(wagonFills(-5, 100).every((f) => f === 0)).toBe(true)
  })

  it('divides a goal that is not a multiple of the wagon count', () => {
    const fills = wagonFills(45, 90, 4)
    expect(fills).toHaveLength(4)
    // Half of 90 is two wagons of 22.5 exactly.
    expect(fills).toEqual([1, 1, 0, 0])
    expect(wagonFills(34, 90, 4)[1]).toBeCloseTo((34 - 22.5) / 22.5)
  })

  it('gives an empty train rather than dividing by zero', () => {
    expect(wagonFills(0, 0)).toEqual(Array(WAGONS).fill(0))
  })

  it('sums to the fraction of the goal reached', () => {
    for (const n of [0, 7, 23, 50, 99, 100]) {
      const sum = wagonFills(n, 100).reduce((a, b) => a + b, 0)
      expect(sum / WAGONS).toBeCloseTo(n / 100)
    }
  })
})

describe('trainLabel', () => {
  it('counts down to the next city', () => {
    expect(trainLabel(80, 'Ribe')).toBe(
      'You need 80 more wrapped-up words to take the train to Ribe.',
    )
  })

  it('says word, not words, at one to go', () => {
    expect(trainLabel(1, 'Ribe')).toBe(
      'You need 1 more wrapped-up word to take the train to Ribe.',
    )
  })

  it('names no city at the end of the road', () => {
    expect(trainLabel(12, null)).toBe(
      'You need 12 more wrapped-up words to finish the journey.',
    )
    expect(trainLabel(0, null)).toBe('The suitcase is packed — the journey is over.')
  })

  it('says the train is ready once the suitcase is packed', () => {
    expect(trainLabel(0, 'Ribe')).toBe('The suitcase is packed — the train to Ribe is ready.')
  })
})

describe('boardLabel', () => {
  it('names what pressing the train does, and where it goes', () => {
    expect(boardLabel('Ribe')).toBe('Board the train to Ribe')
  })

  /**
   * The readout's sentence would be a poor button name and this is the whole
   * reason there are two of them: "the train to Ribe is ready" is a state, and
   * a control is named for its action. Both screens use this one once the road
   * opens, so the door reads the same wherever it is pressed.
   */
  it('is not the readout sentence', () => {
    expect(boardLabel('Ribe')).not.toBe(trainLabel(0, 'Ribe'))
  })
})
