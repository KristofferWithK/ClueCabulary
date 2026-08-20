import { describe, expect, it } from 'vitest'
import { articleLabel, genderLabel } from './gender'
import { WORDS, classifyClue, looksEnglish } from './words'
import { UNCOUNTABLE, UNCOUNTABLE_CLASSES, isUncountable } from '../lang/da/grammar'

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
  it('the article, when the noun has one and can be counted', () => {
    expect(articleLabel({ pos: 'noun', article: 'en', gender: 'common' })).toBe('en')
    expect(articleLabel({ pos: 'noun', article: 'et', gender: 'neuter' })).toBe('et')
  })

  /**
   * The article in the data is the gender, recorded the only way the source
   * had. Printing it in front of a mass noun says you can count it.
   */
  it('the gender instead, when the noun cannot be counted', () => {
    expect(articleLabel({ pos: 'noun', article: 'en', gender: 'common', countable: false })).toBe(
      '(com)',
    )
    expect(articleLabel({ pos: 'noun', article: 'et', gender: 'neuter', countable: false })).toBe(
      '(neut)',
    )
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
    // 366 of the nine hundred, measured. The floor only guards against the
    // suite going vacuous on an empty or half-loaded dataset.
    expect(nouns.length).toBeGreaterThan(350)
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
   * Named rather than counted, so adding another is a deliberate act with a
   * gender decision attached rather than something that slips in. There were
   * three; briller and bukser went with the hundred words the tenth city took,
   * and penge is the one plurale tantum the nine hundred still ship.
   */
  it('the one with no article is the plural-only one', () => {
    const noArticle = nouns.filter((w) => !w.article).map((w) => w.da)
    expect(noArticle.sort()).toEqual(['penge'])
    for (const da of noArticle) {
      expect(WORDS.find((w) => w.da === da)!.gender, da).toBe('common')
    }
  })
})

/**
 * "The clue Cluey gets must be always danish. If someone types an English word
 * they are prompted to use the dictionary." (Said before the rename; Casey is
 * the same suitcase.)
 *
 * Casey is handed the clue as a bare string beside a Danish board, so an
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
    // «kind» stood here until the nine-hundred trim took it; «gift» is the
    // same trap and still shipped — English present, Danish married.
    for (const w of ['arm', 'gift', 'sky', 'mad', 'salt', 'fast', 'time', 'hold', 'land', 'hat']) {
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


/**
 * "Similarly can't you judge all nouns based on their countability/mass?
 * Trafik for example is also not really countable. You are the danish master.
 * This should not be a word by word patchwork coming from me."
 *
 * So it is a rule applied to all 366, not a list of complaints. A noun is
 * uncountable when "en X" / "et X" would be wrong or clearly odd in everyday
 * Danish — and where BOTH readings are ordinary the article stays, because
 * "en øl" and "et brød" are things Danes say and they teach the gender in the
 * form a learner meets.
 */
describe('which nouns can be counted', () => {
  const nouns = WORDS.filter((w) => w.pos === 'noun')

  it('the mass and abstract core shows its gender, not an article', () => {
    for (const da of ['mælk', 'vand', 'blod', 'kærlighed', 'viden', 'tøj', 'vejr', 'musik']) {
      const w = WORDS.find((x) => x.da === da)!
      expect(w.countable, da).toBe(false)
      expect(articleLabel(w), da).toMatch(/^\((com|neut)\)$/)
    }
  })

  /**
   * Named individually because each is a judgement, and the danger of a rule
   * like this is over-applying it: every one of these has a common, ordinary
   * indefinite singular and losing it would teach the learner less, not more.
   */
  it('and the ones that are countable in ordinary Danish keep theirs', () => {
    for (const da of ['øl', 'kaffe', 'brød', 'ost', 'hår', 'papir', 'glas', 'is', 'frugt', 'krig']) {
      const w = WORDS.find((x) => x.da === da)!
      expect(w.countable, da).not.toBe(false)
      expect(articleLabel(w), da).toMatch(/^(en|et)$/)
    }
  })

  it('every listed word is a real noun in the dataset', () => {
    const missing = [...UNCOUNTABLE].filter((da) => !nouns.some((w) => w.da === da))
    expect(missing).toEqual([])
  })

  it('and the classes together are the whole list', () => {
    const fromClasses = new Set(UNCOUNTABLE_CLASSES.flatMap(([, words]: readonly [string, readonly string[]]) => words))
    expect([...fromClasses].sort()).toEqual([...UNCOUNTABLE].sort())
  })

  it('the data agrees with the module, both ways', () => {
    for (const w of nouns) {
      expect(w.countable === false, w.da).toBe(isUncountable(w.da))
    }
  })

  /** A rule that swallowed the board would be worse than the patchwork. */
  it('leaves the great majority countable', () => {
    const uncountable = nouns.filter((w) => w.countable === false).length
    expect(uncountable / nouns.length).toBeLessThan(0.2)
    expect(uncountable).toBeGreaterThan(40)
  })
})

/**
 * "If it's ambiguous words outside of the thousand words can't the llm just
 * judge it?"
 *
 * (Asked when the dataset was a thousand words; it is nine hundred now.)
 *
 * Yes — but most clues should never need him. Danish compounds freely, so the
 * shipped nine hundred recognise far more Danish than they contain, and 'unknown'
 * is permission rather than suspicion.
 */
describe('classifying a clue without asking anybody', () => {
  it('æ, ø and å can only be Danish', () => {
    for (const w of ['kæledyr', 'øjeblik', 'århundrede', 'særlig']) {
      expect(classifyClue(w), w).toBe('target')
    }
  })

  it('an inflection of a word we ship is that word', () => {
    for (const w of ['hunden', 'huset', 'bilerne', 'skoler']) {
      expect(classifyClue(w), w).toBe('target')
    }
  })

  /**
   * Both halves have to be words we ship — «dyreliv» resolves through the
   * linking -e-, «boghandel» does not, because «handel» is outside the
   * nine hundred. That one lands in 'unknown', which is allowed, so the limit
   * costs nothing.
   */
  it('and a compound of two of them is Danish', () => {
    for (const w of ['dyreliv', 'morgenmad', 'sommerhus', 'bordben']) {
      expect(classifyClue(w), w).toBe('target')
    }
    for (const w of ['boghandel', 'huskeliste']) {
      expect(classifyClue(w), w).toBe('unknown')
    }
  })

  it('a plain English word is English', () => {
    for (const w of ['water', 'apple', 'animal', 'answer']) {
      expect(classifyClue(w), w).toBe('english')
    }
  })

  it('a word that is both stays Danish', () => {
    for (const w of ['arm', 'gift', 'sky', 'mad', 'salt', 'time', 'hold', 'land']) {
      expect(classifyClue(w), w).toBe('target')
    }
  })

  /** Where every Danish word we do not ship lives — including «trafik». */
  it('and anything else is unknown, which the clue box treats as allowed', () => {
    for (const w of ['trafik', 'zebra', 'gymnasium', 'kvalitet']) {
      expect(classifyClue(w), w).toBe('unknown')
    }
  })

  it('says nothing about an empty box', () => {
    expect(classifyClue('')).toBe('unknown')
    expect(looksEnglish('')).toBe(false)
  })
})
