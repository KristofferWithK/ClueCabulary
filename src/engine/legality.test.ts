import { describe, expect, it } from 'vitest'
import { danish } from '../lang/da'
import { checkClueLegality as checkIn } from './legality'

/**
 * The rules are a parameter now (H1). Bound to Danish here so every case below
 * keeps testing exactly the language it was written against.
 */
const checkClueLegality = (clue: string, words: Parameters<typeof checkIn>[1]) =>
  checkIn(clue, words, danish)
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
    // "loebe" is caught, "lobe" is not: the fold is æ→ae, ø→oe, å→aa, which is
    // how a model and most keyboards write it. Stripping to the bare letter
    // instead would also catch this, and would collide nine pairs of real
    // words in the shipped set — far/får, tænke/tanke, blød/blod, svær/svar —
    // which is a worse trade for one nonsense string.
    ['loebe', false, 'ASCII fold of løbe'],
    ['lobe', true, 'not a Danish word, and not close enough to be worth the false blocks'],
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

/**
 * Short board words were the hole the fold above did not reach. Every other
 * guard here folds; the short-word inflection test did not, and its call site
 * passed unfolded strings — so with "dør" on the board, "døren" was rejected
 * and "doeren" was legal, which is exactly the spelling a model or a phone
 * keyboard produces. 41 words in the set are three letters or fewer and carry
 * a Danish letter, so this is not a corner of the dataset.
 */
describe('inflections of short board words, ASCII-folded', () => {
  const board = [
    { wordId: 'w1', da: 'dør', en: ['door'], pos: 'noun' },
    { wordId: 'w2', da: 'øl', en: ['beer'], pos: 'noun' },
    { wordId: 'w3', da: 'æg', en: ['egg'], pos: 'noun' },
  ]

  it('rejects the definite and plural forms however they are spelled', () => {
    for (const clue of ['døren', 'doeren', 'døre', 'doere']) {
      expect(checkClueLegality(clue, board).legal).toBe(false)
    }
  })

  it('rejects geminated forms too, which is how Danish inflects these', () => {
    for (const clue of ['øllet', 'oellet', 'ægget', 'aegget']) {
      expect(checkClueLegality(clue, board).legal).toBe(false)
    }
  })

  it('names the board word the player can see, not the folded spelling', () => {
    const v = checkClueLegality('doeren', board)
    expect(v.conflictWord).toBe('dør')
    expect(v.reason).toContain('dør')
  })

  /**
   * The obvious fix — folding both sides unconditionally — lengthens a short
   * word into a prefix it never was, and swallows four real pairs in this very
   * dataset. These are legitimate clues and must stay legal.
   */
  it('does not let a short word swallow an unrelated one it only folds into', () => {
    expect(checkClueLegality('tør', [{ wordId: 'a', da: 'to', en: ['two'], pos: 'numeral' }]).legal).toBe(true)
    expect(checkClueLegality('køre', [{ wordId: 'b', da: 'ko', en: ['cow'], pos: 'noun' }]).legal).toBe(true)
    expect(checkClueLegality('røre', [{ wordId: 'd', da: 'ro', en: ['calm'], pos: 'noun' }]).legal).toBe(true)
    // "skøn" on a board holding "sko" belongs in this list and is not in it:
    // the folded-stem guard blocks it ("skoen" stems to "sko"), and has since
    // long before the short-word fold above. Left as it is rather than
    // quietly widened here — an over-strict clue costs a re-roll, and the
    // stem guard is worth its own change with its own measurements.
    expect(checkClueLegality('skøn', [{ wordId: 'c', da: 'sko', en: ['shoe'], pos: 'noun' }]).legal).toBe(false)
  })
})

/**
 * Danish minimal pairs are not near-misses, they are different words. An
 * edit-distance rule used to block 271 such pairs across the thousand words
 * the dataset held at the time — every one a clue a person would reasonably give, and the reason
 * "mand" was refused on a board holding "mund".
 */
describe('words that merely rhyme with a board word', () => {
  const one = (da: string, en: string[] = ['x']) => [{ wordId: 'w1', da, en, pos: 'noun' }]

  it('are legal clues', () => {
    for (const [clue, board] of [
      ['mand', 'mund'],
      ['hund', 'hånd'],
      ['bord', 'jord'],
      ['læse', 'næse'],
      ['lige', 'pige'],
      ['skole', 'stole'],
      ['fisk', 'frisk'],
      ['vand', 'vind'],
    ]) {
      const v = checkClueLegality(clue, one(board))
      expect(v.legal, `"${clue}" on a board holding "${board}": ${v.reason ?? ''}`).toBe(true)
    }
  })

  it('while the forms of a board word are still refused', () => {
    expect(checkClueLegality('munden', one('mund')).legal).toBe(false)
    expect(checkClueLegality('hunde', one('hund')).legal).toBe(false)
    expect(checkClueLegality('husene', one('hus')).legal).toBe(false)
    expect(checkClueLegality('soveværelse', one('værelse')).legal).toBe(false)
  })
})

/**
 * Danish inflections the stem guard does not reach.
 *
 * When the edit-distance rule was removed, the comment left in its place
 * claimed the stem and short-word guards already covered the inflections it
 * had been catching. That was asserted rather than checked, and it was wrong:
 * danishStem strips one suffix, so "køre" becomes "kør" while "kørte" becomes
 * "kørt", and containment misses it too because "kørte" does not contain
 * "køre". Of 24 real past forms tested against their own board word, 22 were
 * legal clues. 249 verbs in the shipped set are in that class.
 */
describe('past tenses and irregular plurals', () => {
  const verb = (da: string) => [{ wordId: 'w', da, en: ['x'], pos: 'verb' }]
  const noun = (da: string) => [{ wordId: 'w', da, en: ['x'], pos: 'noun' }]

  it('refuses the past tense of a board verb', () => {
    for (const [clue, board] of [
      ['kørte', 'køre'],
      ['hørte', 'høre'],
      ['spiste', 'spise'],
      ['læste', 'læse'],
      ['købte', 'købe'],
      ['elskede', 'elske'],
      ['elsket', 'elske'],
    ]) {
      const v = checkClueLegality(clue, verb(board))
      expect(v.legal, `"${clue}" on a board holding "${board}"`).toBe(false)
    }
  })

  it('refuses an irregular plural, which no suffix rule could reach', () => {
    for (const [clue, board] of [
      ['mænd', 'mand'],
      ['børn', 'barn'],
      ['hænder', 'hånd'],
      ['tænder', 'tand'],
      ['bøger', 'bog'],
      ['nætter', 'nat'],
      ['fødder', 'fod'],
    ]) {
      expect(checkClueLegality(clue, noun(board)).legal, `${clue}/${board}`).toBe(false)
    }
  })

  /**
   * The past rule is restricted to verbs, and that restriction is doing real
   * work: applied to every part of speech, the same shape blocks unrelated
   * pairs that all exist in the shipped set.
   */
  it('does not mistake a noun ending in -e plus an ending for its own past', () => {
    expect(checkClueLegality('næste', noun('næse')).legal).toBe(true)
    expect(checkClueLegality('sidde', noun('side')).legal).toBe(true)
  })

  /**
   * "stolt" (proud) on a board holding "stole" (chairs) is refused, and not by
   * the rule above — the stem guard strips the -t and the -e and lands both on
   * "stol". Pre-existing, same family as "skøn" being refused for "sko", and
   * left alone for the same reason: an over-strict clue costs a re-roll, and
   * loosening the shared stemmer is a change with its own measurements to do.
   * Asserted as it stands so the next reader sees it is known, not missed.
   */
  it('and the stem guard is separately over-strict here, which is recorded not fixed', () => {
    expect(checkClueLegality('stolt', noun('stole')).legal).toBe(false)
  })
})
