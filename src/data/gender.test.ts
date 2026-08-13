import { describe, expect, it } from 'vitest'
import { articleLabel, genderLabel } from './gender'
import { WORDS, looksEnglish } from './words'

/**
 * "Some nouns are not countable and thus don't have an en or et. But we should
 * still signal if they are common gender or neuter gender. So a (com) (neut)"
 *
 * Three nouns in the dataset are plurale tantum — penge, bukser, briller —
 * so there is no "en penge" to print and the card printed nothing at all beside
 * them. That was the least informative card on the board: gender is what
 * decides the definite ending and every agreeing adjective, and it exists
 * whether or not the word can be counted. It comes from the singular that does
 * exist (en buks, en brille), so all three are common.
 */
describe('what gets printed in front of a noun', () => {
  it('the article, when the noun has one', () => {
    expect(articleLabel({ pos: 'noun', article: 'en', gender: 'common' })).toBe('en')
    expect(articleLabel({ pos: 'noun', article: 'et', gender: 'neuter' })).toBe('et')
  })

  it('the gender in brackets, when it has none', () => {
    expect(articleLabel({ pos: 'noun', gender: 'common' })).toBe('(com)')
    expect(articleLabel({ pos: 'noun', gender: 'neuter' })).toBe('(neut)')
  })

  it('nothing for a word that has no gender to speak of', () => {
    expect(articleLabel({ pos: 'verb' })).toBeNull()
    expect(articleLabel({ pos: 'adjective', gender: 'common' })).toBeNull()
    expect(articleLabel({ pos: 'noun' })).toBeNull()
  })

  /** Brackets are for the eye; a screen reader gets the words. */
  it('says it in full for a screen reader', () => {
    expect(genderLabel({ pos: 'noun', gender: 'common' })).toBe('common gender')
    expect(genderLabel({ pos: 'noun', gender: 'neuter' })).toBe('neuter gender')
    expect(genderLabel({ pos: 'noun', article: 'et', gender: 'neuter' })).toBe('et')
  })
})

describe('the dataset says what gender every noun is', () => {
  const nouns = WORDS.filter((w) => w.pos === 'noun')

  it('has nouns to check', () => {
    expect(nouns.length).toBeGreaterThan(400)
  })

  it('every one of them, article or not', () => {
    const silent = nouns.filter((w) => !articleLabel(w))
    expect(silent.map((w) => w.da)).toEqual([])
  })

  it('and the article never disagrees with the gender', () => {
    for (const w of nouns) {
      if (w.article === 'en') expect(w.gender, w.da).toBe('common')
      if (w.article === 'et') expect(w.gender, w.da).toBe('neuter')
    }
  })

  /**
   * Named rather than counted, so adding a fourth is a deliberate act with a
   * gender decision attached rather than something that slips in.
   */
  it('the three with no article are the plural-only ones', () => {
    const noArticle = nouns.filter((w) => !w.article).map((w) => w.da)
    expect(noArticle.sort()).toEqual(['briller', 'bukser', 'penge'])
    for (const da of noArticle) {
      expect(WORDS.find((w) => w.da === da)!.gender, da).toBe('common')
    }
  })
})

/**
 * "The clue Klaus gets must be always danish. If someone types an English word
 * they are prompted to use the dictionary."
 *
 * Klaus is handed the clue as a bare string beside a Danish board, so an
 * English word there is one he cannot place — and reaching for the Danish is
 * the point of the round. The check is deliberately narrow: a word must be one
 * of our English glosses AND not one of our Danish headwords.
 */
describe('spotting a clue the player reached for in English', () => {
  it('flags an English word that is not also Danish', () => {
    for (const w of ['water', 'apple', 'animal', 'answer', 'house']) {
      expect(looksEnglish(w), w).toBe(true)
    }
  })

  it('and normalizes the way the gloss index was built', () => {
    expect(looksEnglish('  Water ')).toBe(true)
    expect(looksEnglish('the water')).toBe(true)
    expect(looksEnglish('to answer')).toBe(true)
  })

  /**
   * The sixty-one words that are both — a Danish headword AND an English gloss
   * — are the ones an eager check gets wrong, and they are common Danish words
   * a player has every reason to clue with.
   */
  it('never flags a word that is Danish too', () => {
    for (const w of ['arm', 'kind', 'sky', 'mad', 'salt', 'fast', 'time', 'hold', 'land', 'hat']) {
      expect(looksEnglish(w), w).toBe(false)
    }
  })

  it('lets an ordinary Danish clue through', () => {
    for (const w of ['dyreliv', 'kæledyr', 'huskeliste', 'morgenmad', 'blomst']) {
      expect(looksEnglish(w), w).toBe(false)
    }
  })

  it('and says nothing about an empty box', () => {
    expect(looksEnglish('')).toBe(false)
    expect(looksEnglish('   ')).toBe(false)
  })
})
