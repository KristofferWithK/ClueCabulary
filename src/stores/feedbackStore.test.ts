import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_FLAGS, clueFlagId, guessFlagId, useFeedback } from './feedbackStore'

const clue = (id: string) => ({ id, kind: 'clue' as const, what: 'køkken', why: 'kitchen things' })

describe('flagging a bad call', () => {
  beforeEach(() => useFeedback.setState({ flags: [] }))

  it('records what he did and what he said about it', () => {
    useFeedback.getState().toggleFlag(clue('c:1:0'))
    const [f] = useFeedback.getState().flags
    expect(f).toMatchObject({ id: 'c:1:0', kind: 'clue', what: 'køkken', why: 'kitchen things' })
    expect(f!.at).toBeGreaterThan(0)
  })

  /** A mis-tap on a phone must not be a permanent judgement about Cluey. */
  it('tapping it again takes it back', () => {
    const { toggleFlag } = useFeedback.getState()
    toggleFlag(clue('c:1:0'))
    toggleFlag(clue('c:1:0'))
    expect(useFeedback.getState().flags).toEqual([])
  })

  it('newest first, so the prompt shows the most recent judgement', () => {
    const { toggleFlag } = useFeedback.getState()
    toggleFlag(clue('c:1:0'))
    toggleFlag(clue('c:1:1'))
    expect(useFeedback.getState().flags.map((f) => f.id)).toEqual(['c:1:1', 'c:1:0'])
  })

  /** A prompt-size budget as much as a storage one — see the constant. */
  it('keeps only the most recent MAX_FLAGS', () => {
    const { toggleFlag } = useFeedback.getState()
    for (let i = 0; i < MAX_FLAGS + 5; i++) toggleFlag(clue(`c:1:${i}`))
    const flags = useFeedback.getState().flags
    expect(flags).toHaveLength(MAX_FLAGS)
    expect(flags[0]!.id).toBe(`c:1:${MAX_FLAGS + 4}`)
    expect(flags.some((f) => f.id === 'c:1:0')).toBe(false)
  })

  it('a guess flag carries the clue it was made under', () => {
    useFeedback.getState().toggleFlag({
      id: 'g:1:0:0',
      kind: 'guess',
      what: 'hvid',
      underClue: 'foster',
      why: 'closest thing on the board',
    })
    expect(useFeedback.getState().flags[0]).toMatchObject({ what: 'hvid', underClue: 'foster' })
  })

  /**
   * The ids are seed-scoped, so two rounds cannot collide and re-playing the
   * same seed re-uses them deliberately: the review page is showing that round.
   */
  it('ids separate a clue from a guess, and one round from another', () => {
    expect(clueFlagId(7, 0)).not.toBe(clueFlagId(8, 0))
    expect(clueFlagId(7, 0)).not.toBe(clueFlagId(7, 1))
    expect(guessFlagId(7, 0, 0)).not.toBe(guessFlagId(7, 0, 1))
    expect(guessFlagId(7, 0, 0)).not.toBe(clueFlagId(7, 0))
  })
})
