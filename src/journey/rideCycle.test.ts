import { describe, expect, it } from 'vitest'
import { RIDE_CYCLE, nextPass } from './rideCycle'

describe('the ride cycle', () => {
  it('says each sentence Danish, English, slow Danish, Danish', () => {
    // The order is the whole feature, and it is easy to write from memory in
    // the wrong order — the slow pass belongs AFTER the translation, so the
    // learner hears it taken apart already knowing what it means.
    expect(RIDE_CYCLE.map((s) => s.variant)).toEqual(['normal', 'en', 'slow', 'normal'])
    expect(RIDE_CYCLE.map((s) => s.side)).toEqual(['da', 'en', 'da', 'da'])
  })

  it('ends on the ordinary reading rather than the slow one', () => {
    expect(RIDE_CYCLE[RIDE_CYCLE.length - 1]).toEqual({ variant: 'normal', side: 'da' })
  })

  it('walks every pass of a sentence before starting the next', () => {
    const walked: string[] = []
    let atRow = { sentence: 0, step: 0 }
    for (let i = 0; i < 8; i++) {
      walked.push(`${atRow.sentence}:${RIDE_CYCLE[atRow.step]!.variant}`)
      atRow = nextPass(atRow.sentence, atRow.step)
    }
    expect(walked).toEqual([
      '0:normal',
      '0:en',
      '0:slow',
      '0:normal',
      '1:normal',
      '1:en',
      '1:slow',
      '1:normal',
    ])
  })
})
