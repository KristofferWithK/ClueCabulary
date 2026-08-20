import { describe, expect, it } from 'vitest'
import { createDataset } from '../data/dataset'
import type { WordEntry } from '../data/types'
import { checkClueLegality } from '../engine/legality'
import { matchesAnswer } from '../engine/packing'
import type { BoardWord } from '../engine/types'
import { danish } from './da'
import { DEFAULT_LANGUAGE, LANGUAGES, isLanguageCode, packFor } from './index'
import { LANGUAGE_KEY, readStoredLanguage } from './active'
import type { LanguagePack } from './types'

/**
 * The seam's own suite.
 *
 * Its job is to fail if the seam is decorative — if the engine still behaves
 * like Danish when handed something that is not Danish. Every "the pack drives
 * this" claim below is written as a DIFFERENCE against a fake pack, because a
 * test that only ever passes the real one cannot tell a parameter from a
 * constant. That is the same trap the two vacuous suites in this repo's history
 * fell into.
 */

/**
 * A deliberately un-Danish language: ç is its distinctive letter, it folds to
 * "cx", it stems by chopping "-zz", its compounds link with "-q-", and its
 * article is "yo". Nothing about it is realistic; everything about it is
 * different, which is the point.
 */
const FAKE: LanguagePack = {
  code: 'de',
  name: 'Fake',
  endonym: 'Fake',
  words: [
    {
      id: 'de:blorp',
      da: 'blorp',
      en: ['widget'],
      pos: 'noun',
      gender: 'thing',
      article: 'yo',
      exampleDa: 'yo blorp',
      exampleEn: 'a widget',
      freqRank: 1,
      curriculumRank: 1,
    },
    {
      id: 'de:frimm',
      da: 'frimm',
      en: ['gadget'],
      pos: 'noun',
      gender: 'thing',
      exampleDa: 'yo frimm',
      exampleEn: 'a gadget',
      freqRank: 2,
      curriculumRank: 2,
    },
  ] satisfies WordEntry[],
  speech: { tag: 'zz-ZZ', rate: 1 },
  orthography: {
    distinctive: /ç/,
    fold: (s) => s.replace(/ç/g, 'cx'),
    unfold: (s) => s.replace(/cx/g, 'ç'),
    foldsAreSpellings: false,
  },
  morphology: {
    // Umlaut-folding plus a suffix strip — the shape German actually needs and
    // Danish does not have, so a Danish stemmer left behind anywhere shows up
    // as a difference rather than as nothing.
    stem: (w) => {
      const base = w.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
      for (const suf of ['er', 'zz']) {
        if (base.endsWith(suf) && base.length - suf.length >= 3) {
          return base.slice(0, base.length - suf.length)
        }
      }
      return base
    },
    inflections: ['zz'],
    linkers: ['', 'q'],
    legality: {
      shortInflections: new Set(['zz']),
      isDerivedForm: () => false,
      irregularPairs: [['blorp', 'blorpen']],
    },
  },
  grammar: {
    genders: { thing: { article: 'yo', short: '(th)', full: 'thing gender' } },
    isUncountable: (h) => h === 'frimm',
    answerFiller: ['yo'],
  },
  route: danish.route,
  prompts: { translateRules: 'fake', spellingRule: 'fake', functionWordNote: 'fake' },
}

describe('the language registry', () => {
  it('ships Danish and only Danish', () => {
    expect(Object.keys(LANGUAGES)).toEqual(['da'])
    expect(DEFAULT_LANGUAGE).toBe('da')
  })

  it('falls back to the default for a code with no pack behind it', () => {
    // `de` is a valid LanguageCode with nothing registered — H2's slot. Asking
    // for it must give a playable app rather than undefined.
    expect(packFor('de')).toBe(danish)
    expect(packFor('da')).toBe(danish)
  })

  it('reads a stored language, and survives every way it can be absent', () => {
    const store = (v: string | null) => ({ getItem: () => v })
    expect(readStoredLanguage(store('da'))).toBe('da')
    expect(readStoredLanguage(store('de'))).toBe('de')
    expect(readStoredLanguage(store(null))).toBe('da')
    expect(readStoredLanguage(store('klingon'))).toBe('da')
    expect(readStoredLanguage(undefined)).toBe('da')
    expect(
      readStoredLanguage({
        getItem: () => {
          throw new Error('private mode')
        },
      }),
    ).toBe('da')
  })

  it('keeps the language key out of the store keys it must not collide with', () => {
    expect(LANGUAGE_KEY).toBe('cluecab-language')
    for (const taken of [
      'cluecab-settings-v1',
      'cluecab-game-v1',
      'cluecab-journey-v2',
      'cluecab-srs-v1',
      'cluecab-feedback-v1',
    ]) {
      expect(LANGUAGE_KEY).not.toBe(taken)
    }
  })

  it('recognises exactly the codes the seam knows', () => {
    expect(isLanguageCode('da')).toBe(true)
    expect(isLanguageCode('de')).toBe(true)
    expect(isLanguageCode('en')).toBe(false)
    expect(isLanguageCode(null)).toBe(false)
    expect(isLanguageCode(7)).toBe(false)
  })
})

/**
 * The claim the whole store design rests on: word ids carry their language, so
 * anything keyed by word id is already partitioned and must NOT be namespaced
 * again. If this ever fails, `srsStore.stats` and `journeyStore.wrapped` are
 * no longer safe to share and the namespacing note in `index.ts` is wrong.
 */
describe('word ids are namespaced by language', () => {
  it('prefixes every shipped word with its own code', () => {
    expect(danish.words.length).toBe(900)
    const wrong = danish.words.filter((w) => !w.id.startsWith(`${danish.code}:`))
    expect(wrong.map((w) => w.id)).toEqual([])
  })

  it('cannot collide with another language, even on an identical headword', () => {
    // "Hus" is a word in both languages. The ids are not.
    expect(`da:hus`).not.toBe(`de:hus`)
    const daIds = new Set(danish.words.map((w) => w.id))
    for (const w of FAKE.words) expect(daIds.has(w.id)).toBe(false)
  })

  it('reads the audio directory out of the same prefix', () => {
    // Pinned in speak.test.ts too; repeated here because it is the second
    // thing the prefix is load-bearing for.
    expect(danish.words[0]!.id.split(':')[0]).toBe(danish.code)
  })
})

describe('the engine reads its rules off the pack', () => {
  const board: BoardWord[] = [
    { wordId: 'w1', da: 'hus', en: ['house'], pos: 'noun' },
    { wordId: 'w2', da: 'haus', en: ['house'], pos: 'noun' },
  ]

  it('applies the pack stemmer, not a Danish one', () => {
    // "huset" is an inflection of "hus" under Danish's -et rule and nothing at
    // all under the fake's. Same clue, same board, different verdict: the rule
    // is genuinely a parameter.
    expect(checkClueLegality('huset', board, danish).legal).toBe(false)
    expect(checkClueLegality('huset', board, FAKE).legal).toBe(true)
    // And the other way round, so neither result is an accident of the board.
    // "häuser" is the umlaut plural of "haus": the fake folds the vowel and
    // catches it, Danish has no such rule and lets it through. Note that
    // neither string contains the other, which is deliberate — the containment
    // guard is language-neutral and would otherwise decide this before the
    // stemmer ever ran, and an earlier draft of this test proved only that.
    expect(checkClueLegality('häuser', board, FAKE).legal).toBe(false)
    expect(checkClueLegality('häuser', board, danish).legal).toBe(true)
  })

  it('applies the pack folding, not æ/ø/å', () => {
    const oe: BoardWord[] = [{ wordId: 'w1', da: 'øl', en: ['beer'], pos: 'noun' }]
    // Danish folds ø to oe, so "oellet" is caught. The fake folds nothing of
    // the sort and lets it through.
    expect(checkClueLegality('oellet', oe, danish).legal).toBe(false)
    expect(checkClueLegality('oellet', oe, FAKE).legal).toBe(true)
  })

  it('applies the pack irregular pairs', () => {
    const mand: BoardWord[] = [{ wordId: 'w1', da: 'mand', en: ['man'], pos: 'noun' }]
    expect(checkClueLegality('mænd', mand, danish).legal).toBe(false)
    expect(checkClueLegality('mænd', mand, FAKE).legal).toBe(true)
  })

  it('applies the pack derived-form rule, which the fake does not have', () => {
    const verb: BoardWord[] = [{ wordId: 'w1', da: 'køre', en: ['drive'], pos: 'verb' }]
    // Danish's past-tense rule catches "kørte"; the fake declines every
    // derived form, and the stem and containment guards do not reach this one.
    expect(checkClueLegality('kørte', verb, danish).legal).toBe(false)
    expect(checkClueLegality('kørte', verb, FAKE).legal).toBe(true)
  })
})

describe('the packing grader reads its rules off the pack', () => {
  it('strips the pack article, not "en/et/at"', () => {
    expect(matchesAnswer('et hus', 'hus', danish)).toBe(true)
    // The fake has no "et", so the filler survives and the answer is wrong.
    expect(matchesAnswer('et hus', 'hus', FAKE)).toBe(false)
    expect(matchesAnswer('yo blorp', 'blorp', FAKE)).toBe(true)
    expect(matchesAnswer('yo blorp', 'blorp', danish)).toBe(false)
  })

  it('unfolds by the pack rule, not ae/oe/aa', () => {
    expect(matchesAnswer('oel', 'øl', danish)).toBe(true)
    expect(matchesAnswer('oel', 'øl', FAKE)).toBe(false)
  })
})

describe('the dataset indexes read their rules off the pack', () => {
  const fake = createDataset(FAKE)
  const da = createDataset(danish)

  it('classifies by the pack distinctive letters', () => {
    expect(da.classifyClue('kæledyr')).toBe('target')
    // No æ in the fake's alphabet, and "kæledyr" is not one of its two words.
    expect(fake.classifyClue('kæledyr')).toBe('unknown')
    expect(fake.classifyClue('çoo')).toBe('target')
    expect(da.classifyClue('çoo')).toBe('unknown')
  })

  it('classifies compounds by the pack linkers', () => {
    // Danish links with -e-: dyre+liv. The fake links with -q-.
    expect(da.classifyClue('morgenmad')).toBe('target')
    expect(fake.classifyClue('blorpqfrimm')).toBe('target')
    expect(fake.classifyClue('blorpzfrimm')).toBe('unknown')
  })

  it('indexes only its own words', () => {
    expect(fake.wordById('de:blorp')?.da).toBe('blorp')
    expect(fake.wordById('da:mor')).toBeUndefined()
    expect(da.wordById('da:mor')?.da).toBe('mor')
    expect(da.wordById('de:blorp')).toBeUndefined()
  })
})

describe('the Danish pack is complete', () => {
  it('names a gender spec for every gender the dataset uses', () => {
    const used = new Set(danish.words.filter((w) => w.gender).map((w) => w.gender!))
    expect(used.size).toBeGreaterThan(0)
    for (const g of used) expect(danish.grammar.genders[g]).toBeDefined()
  })

  it('agrees with the dataset about which nouns cannot be counted', () => {
    // The same fact the validator checks from the outside, checked here through
    // the pack, so the seam cannot drift from the data it describes.
    for (const w of danish.words) {
      if (w.pos !== 'noun') continue
      expect(w.countable === false, w.da).toBe(danish.grammar.isUncountable(w.da))
    }
  })

  it('has a route the dataset can fill', () => {
    expect(danish.route.cities.length).toBe(9)
    expect(danish.route.map.path.length).toBeGreaterThan(1000)
  })
})
