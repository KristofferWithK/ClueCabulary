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

describe('compounds — the most-cheated clue rule in the game', () => {
  const board = [
    { wordId: 'w1', da: 'hund', en: ['dog'], pos: 'noun' as const },
    { wordId: 'w2', da: 'vand', en: ['water'], pos: 'noun' as const },
    { wordId: 'w3', da: 'barn', en: ['child'], pos: 'noun' as const },
  ]

  it.each([
    ['hundehus', 'contains hund'],
    ['jagthund', 'ends with hund'],
    ['vandfald', 'contains vand'],
    ['barnevogn', 'contains barn'],
  ])('refuses "%s" (%s)', (clue) => {
    expect(checkClueLegality(clue, board).legal).toBe(false)
  })

  it('refuses a compound built on the English gloss too, since it is on the card', () => {
    expect(checkClueLegality('waterfall', board).legal).toBe(false)
    expect(checkClueLegality('childhood', board).legal).toBe(false)
  })

  // Board words of three letters or fewer are exempt from substring
  // containment on purpose — Danish compounds make it a bad test there, and
  // the inflection check beside it is the targeted tool. Documented so the
  // exemption is a decision rather than a gap.
  it('does not apply containment to a three-letter board word', () => {
    const short = [{ wordId: 's', da: 'hus', en: ['house'], pos: 'noun' as const }]
    expect(checkClueLegality('husholdning', short).legal).toBe(true)
    expect(checkClueLegality('huset', short).legal).toBe(false)
  })

  it('names the board word the player can see, not the hidden gloss', () => {
    const verdict = checkClueLegality('waterfall', board)
    expect(verdict.legal).toBe(false)
    if (!verdict.legal) expect(verdict.conflictWord).toBe('vand')
  })

  it('still allows a clue that merely shares letters', () => {
    for (const ok of ['kæledyr', 'flod', 'bolig']) {
      expect(checkClueLegality(ok, board).legal).toBe(true)
    }
  })
})

/**
 * A model writing Danish on an English keyboard spells "soveværelse" as
 * "sovevaerelse", and the containment check compared raw strings — so the
 * ASCII spelling of an illegal compound was legal. Found by running the app's
 * real clue prompt against a model: it produced exactly this, three times out
 * of three, on a board holding "værelse".
 */
describe('Danish written without the Danish letters', () => {
  const board = [
    { wordId: 'w1', da: 'værelse', en: ['room'], pos: 'noun' },
    { wordId: 'w2', da: 'øje', en: ['eye'], pos: 'noun' },
    { wordId: 'w3', da: 'år', en: ['year'], pos: 'noun' },
  ]

  it('catches a compound that contains a board word, however it is spelled', () => {
    expect(checkClueLegality('soveværelse', board).legal).toBe(false)
    expect(checkClueLegality('sovevaerelse', board).legal).toBe(false)
  })

  it('catches the board word itself, ASCII-folded', () => {
    expect(checkClueLegality('vaerelse', board).legal).toBe(false)
    expect(checkClueLegality('oeje', board).legal).toBe(false)
  })

  it('still allows a clue that merely shares a fold with nothing on the board', () => {
    expect(checkClueLegality('koekken', board).legal).toBe(true)
    expect(checkClueLegality('sengetoej', board).legal).toBe(true)
  })
})
