import { describe, expect, it } from 'vitest'
import { checkClueLegality } from './legality'
import type { BoardWord } from './types'

const board: BoardWord[] = [
  { wordId: 'w1', da: 'hund', en: ['dog'], pos: 'noun' },
  { wordId: 'w2', da: 'løbe', en: ['run'], pos: 'verb' },
  { wordId: 'w3', da: 'vand', en: ['water'], pos: 'noun' },
  { wordId: 'w4', da: 'hus', en: ['house'], pos: 'noun' },
  { wordId: 'w5', da: 'kærlighed', en: ['love'], pos: 'noun' },
]

describe('checkClueLegality', () => {
  it.each([
    ['kat', true, 'unrelated Danish word'],
    ['dyr', true, 'semantically related but lexically distinct'],
    ['Hund', false, 'exact board word, case-insensitive'],
    ['hunden', false, 'inflected form (stem + substring)'],
    ['hundene', false, 'plural definite form'],
    ['løber', false, 'verb present tense of board verb'],
    ['løb', false, 'verb imperative/past shares stem'],
    ['vandet', false, 'definite form of vand'],
    ['water', false, 'English gloss of a board word'],
    ['huset', false, 'definite of hus'],
    ['house', false, 'gloss exact'],
    ['houses', false, 'gloss substring'],
    ['kærligheden', false, 'long compound definite'],
    ['lobe', false, 'Levenshtein 1 from løbe'],
    ['', false, 'empty'],
    ['to ord', false, 'multiword'],
  ])('clue "%s" → legal=%s (%s)', (clue, legal) => {
    expect(checkClueLegality(clue, board).legal).toBe(legal)
  })

  it('reports the conflicting board word', () => {
    const verdict = checkClueLegality('hunden', board)
    expect(verdict.legal).toBe(false)
    expect(verdict.conflictWord).toBe('hund')
  })
})

describe('short board words (≤3 letters) — general guards all skip them', () => {
  const shortBoard: BoardWord[] = [
    { wordId: 's1', da: 'gå', en: ['go', 'walk'], pos: 'verb' },
    { wordId: 's2', da: 'år', en: ['year'], pos: 'noun' },
    { wordId: 's3', da: 'by', en: ['city', 'town'], pos: 'noun' },
    { wordId: 's4', da: 'øl', en: ['beer'], pos: 'noun' },
    { wordId: 's5', da: 'æg', en: ['egg'], pos: 'noun' },
    { wordId: 's6', da: 'se', en: ['see'], pos: 'verb' },
    { wordId: 's7', da: 'ny', en: ['new'], pos: 'adjective' },
  ]

  it.each([
    ['går', false, 'present tense of gå'],
    ['gået', false, 'past participle of gå'],
    ['året', false, 'definite of år'],
    ['byen', false, 'definite of by'],
    ['byer', false, 'plural of by'],
    ['øllet', false, 'definite of øl (gemination)'],
    ['ægget', false, 'definite of æg (gemination)'],
    ['ser', false, 'present tense of se'],
    ['nyt', false, 'neuter of ny'],
    ['nye', false, 'plural of ny'],
    ['nyhed', false, 'derived from ny'],
    ['seng', true, 'starts with se but not an inflection'],
    ['bord', true, 'unrelated word'],
    ['sol', true, 'unrelated word'],
    ['gårdhave', true, 'starts with gå but not an inflection'],
  ])('clue "%s" → legal=%s (%s)', (clueText, legal) => {
    expect(checkClueLegality(clueText, shortBoard).legal).toBe(legal)
  })
})
