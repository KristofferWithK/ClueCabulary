import { describe, expect, it } from 'vitest'
import { answerMatches, gradeRedemption } from './redemption'
import type { BoardWord } from './types'

describe('answerMatches', () => {
  it.each([
    ['run', ['run'], true, 'exact'],
    ['Run', ['run'], true, 'case-insensitive'],
    ['to run', ['run'], true, 'leading "to" stripped'],
    ['the house', ['house'], true, 'leading article stripped'],
    ['a  house ', ['house'], true, 'whitespace collapsed'],
    ['huose', ['house'], true, 'typo within tolerance (len 5 → 1)'],
    ['colour', ['color'], true, 'BE/AE spelling within distance 1'],
    ['neighbor', ['neighbour'], true, 'distance 1 on long gloss'],
    ['quick', ['fast', 'quick'], true, 'any gloss accepted'],
    ['gp', ['go'], false, 'short gloss requires exact'],
    ['house', ['mouse'], true, 'edge: distance 1 accepted with no word list to consult'],
    ['cat', ['dog'], false, 'wrong word'],
    ['', ['dog'], false, 'empty answer'],
    ['hous', ['house'], true, 'dropped letter'],
    ['runing', ['running'], true, 'distance 1 on 7-char gloss'],
    ['year', ['hear'], false, 'four letters get no slack: a different word'],
    ['food', ['good'], false, 'four letters, one edit, different word'],
    ['now', ['know'], false, 'short gloss requires exact'],
  ])('"%s" vs %j → %s (%s)', (answer, glosses, ok) => {
    expect(answerMatches(answer, glosses) !== undefined).toBe(ok)
  })
})

describe('a near-miss must not pass one word off as another', () => {
  // Fuzzy matching exists to forgive a slip of the thumb. Without a word list
  // to consult it also forgave answering "there" for here and "now" for know,
  // and a language app that marks a wrong meaning correct teaches the wrong
  // meaning. 1783 such pairs existed across the shipped dataset.
  const words = new Set(['there', 'here', 'know', 'now', 'hear', 'year', 'good', 'food', 'three'])
  const known = (a: string) => words.has(a)

  it.each([
    ['there', ['here']],
    ['here', ['there']],
    ['now', ['know']],
    ['year', ['hear']],
    ['good', ['food']],
    ['there', ['three']],
  ])('refuses "%s" for %j', (answer, glosses) => {
    expect(answerMatches(answer, glosses, known)).toBeUndefined()
  })

  it('still forgives a typo, because a typo is not a word', () => {
    expect(answerMatches('housr', ['house'], known)).toBe('house')
    expect(answerMatches('neighbor', ['neighbour'], known)).toBe('neighbour')
  })

  it('an exact answer is always accepted, word list or not', () => {
    expect(answerMatches('here', ['here', 'there'], known)).toBe('here')
    expect(answerMatches('now', ['now'], known)).toBe('now')
  })

  it('grading threads the word list through', () => {
    const board = [{ wordId: 'w1', da: 'her', en: ['here'], pos: 'adverb' as const }]
    expect(gradeRedemption({ w1: 'there' }, board, known)[0]!.accepted).toBe(false)
    expect(gradeRedemption({ w1: 'here' }, board, known)[0]!.accepted).toBe(true)
  })
})

describe('gradeRedemption', () => {
  const words: BoardWord[] = [
    { wordId: 'w1', da: 'hund', en: ['dog'], pos: 'noun' },
    { wordId: 'w2', da: 'løbe', en: ['run', 'jog'], pos: 'verb' },
  ]

  it('accepts only when every prompted word matches', () => {
    const all = gradeRedemption({ w1: 'dog', w2: 'to run' }, words)
    expect(all.every((r) => r.accepted)).toBe(true)
    expect(all[1]!.matchedGloss).toBe('run')
  })

  it('missing answers fail', () => {
    const some = gradeRedemption({ w1: 'dog' }, words)
    expect(some.find((r) => r.wordId === 'w2')!.accepted).toBe(false)
  })
})
