import { describe, expect, it } from 'vitest'
import { TOUR_STEPS } from './tour'

/**
 * The tour's shape and its one dangerous sentence. Whether each anchor still
 * matches a band on the LIVE SuitcaseScreen is onboarding-drive's assertion —
 * it resolves every selector on the real screen — so this file only pins what
 * a unit can: the order, and the copy's claims about the rules.
 */
describe('the suitcase tour', () => {
  it('walks the case top to bottom, the order a word travels', () => {
    // The same order E1 built the screen to read: the loose strip on the
    // table, the lid (collected), the tray (wrapped), then the button that
    // moves words from the lid down into the tray.
    expect(TOUR_STEPS.map((s) => s.anchor)).toEqual([
      '.case-loose',
      '.case-panel-lid',
      '.case-panel-tray',
      '.case-actions',
    ])
  })

  it('states the collection rule forwards: one green EACH way', () => {
    // The rule this repo has written backwards six times, and the reason the
    // lid is empty at tour time: one round gives each word exactly one way
    // (DECISIONS.md, the O2 entry). The lid's line must say both halves.
    const lid = TOUR_STEPS.find((s) => s.anchor === '.case-panel-lid')!
    expect(lid.text).toMatch(/each way/i)
    expect(lid.text).toMatch(/under your clue/i)
    expect(lid.text).toMatch(/by your guess/i)
  })

  it('explains the sleeping wrap-up button by both of its gates', () => {
    // Two conditions, different in kind (SuitcaseScreen's own comment): a win
    // to earn a round, twenty collected words to deal its board. A tour that
    // named only one would leave the other looking like a bug.
    const btn = TOUR_STEPS.find((s) => s.anchor === '.case-actions')!
    expect(btn.text).toMatch(/win a real round/i)
    expect(btn.text).toMatch(/twenty words/i)
  })
})
