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
    ['house', ['mouse'], true, 'edge: distance 1 accepted — glosses this close must not co-occur'],
    ['cat', ['dog'], false, 'wrong word'],
    ['', ['dog'], false, 'empty answer'],
    ['hous', ['house'], true, 'dropped letter'],
    ['runing', ['running'], true, 'distance 1 on 7-char gloss'],
  ])('"%s" vs %j → %s (%s)', (answer, glosses, ok) => {
    expect(answerMatches(answer, glosses) !== undefined).toBe(ok)
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
