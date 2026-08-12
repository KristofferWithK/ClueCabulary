import { beforeEach, describe, expect, it } from 'vitest'
import { GATES_PER_CITY } from '../journey/cities'
import { useJourney } from './journeyStore'

/**
 * The attempt economy lives in this store and had no unit test: only a browser
 * drive covered it, and a drive that cannot run in CI is not a guard. These are
 * the rules a player's progress depends on.
 */
const NOW = 1_700_000_000_000

describe('journeyStore', () => {
  beforeEach(() => useJourney.getState().reset())

  describe('drawing a paper costs an attempt', () => {
    it('spends exactly one, every time', () => {
      const { startExam } = useJourney.getState()
      startExam(0, ['a', 'b'])
      expect(useJourney.getState().trialsSpent[0]).toBe(1)
      startExam(0, ['c', 'd'])
      expect(useJourney.getState().trialsSpent[0]).toBe(2)
    })

    it('charges the city the paper was drawn for', () => {
      const { startExam } = useJourney.getState()
      startExam(3, ['a'])
      startExam(3, ['b'])
      startExam(5, ['c'])
      expect(useJourney.getState().trialsSpent).toEqual({ 3: 2, 5: 1 })
    })

    it('replaces the open paper rather than stacking papers', () => {
      const { startExam } = useJourney.getState()
      startExam(0, ['a', 'b'])
      useJourney.getState().setExamAnswer('a', 'first')
      startExam(0, ['c', 'd'])
      const exam = useJourney.getState().activeExam!
      expect(exam.wordIds).toEqual(['c', 'd'])
      expect(exam.answers).toEqual({})
      expect(exam.gradedAt).toBeUndefined()
    })
  })

  describe('a marked paper stays marked', () => {
    it('records when it was graded', () => {
      useJourney.getState().startExam(0, ['a'])
      useJourney.getState().markExamGraded(NOW)
      expect(useJourney.getState().activeExam!.gradedAt).toBe(NOW)
    })

    it('a fresh paper is unmarked, so retrying can be graded again', () => {
      useJourney.getState().startExam(0, ['a'])
      useJourney.getState().markExamGraded(NOW)
      useJourney.getState().startExam(0, ['b'])
      expect(useJourney.getState().activeExam!.gradedAt).toBeUndefined()
    })
  })

  describe('answers', () => {
    it('are kept per word, and survive each other', () => {
      useJourney.getState().startExam(0, ['a', 'b'])
      useJourney.getState().setExamAnswer('a', 'house')
      useJourney.getState().setExamAnswer('b', 'dog')
      useJourney.getState().setExamAnswer('a', 'home')
      expect(useJourney.getState().activeExam!.answers).toEqual({ a: 'home', b: 'dog' })
    })

    it('are a no-op with no exam open, rather than inventing one', () => {
      useJourney.getState().setExamAnswer('a', 'house')
      useJourney.getState().markExamGraded(NOW)
      expect(useJourney.getState().activeExam).toBeNull()
    })
  })

  describe('awarding a stempel', () => {
    it('banks the paper and stamps the page', () => {
      useJourney.getState().awardStamp(2, ['a', 'b'], NOW)
      const s = useJourney.getState()
      expect(s.stamps[2]).toBe(1)
      expect(s.banked).toEqual({ a: NOW, b: NOW })
    })

    it('is add-only on banked words: a re-bank keeps the first time', () => {
      useJourney.getState().awardStamp(0, ['a'], NOW)
      useJourney.getState().awardStamp(0, ['a', 'b'], NOW + 5000)
      expect(useJourney.getState().banked).toEqual({ a: NOW, b: NOW + 5000 })
    })

    it('never exceeds a full passport page', () => {
      for (let i = 0; i < GATES_PER_CITY + 3; i++) useJourney.getState().awardStamp(1, [`w${i}`], NOW)
      expect(useJourney.getState().stamps[1]).toBe(GATES_PER_CITY)
    })

    it('leaves the paper up, because the results screen still needs it', () => {
      useJourney.getState().startExam(0, ['a'])
      useJourney.getState().awardStamp(0, ['a'], NOW)
      expect(useJourney.getState().activeExam).not.toBeNull()
    })
  })

  describe('travel', () => {
    it('moves one stop, records the arrival, and drops any open paper', () => {
      useJourney.getState().startExam(0, ['a'])
      useJourney.getState().travel(NOW)
      const s = useJourney.getState()
      expect(s.cityIndex).toBe(1)
      expect(s.arrivedAt[1]).toBe(NOW)
      // A paper drawn for the city behind you would stamp the wrong page.
      expect(s.activeExam).toBeNull()
    })

    it('stops at the end of the road', () => {
      for (let i = 0; i < 20; i++) useJourney.getState().travel(NOW + i)
      expect(useJourney.getState().cityIndex).toBe(9)
    })
  })
})
