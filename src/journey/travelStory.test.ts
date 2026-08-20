import { describe, expect, it } from 'vitest'
import { WORDS } from '../data/words'
import { CITIES } from './cities'
import { wordsForCity } from './progress'
import {
  rideEnabled,
  storyForCity,
  storySentences,
  storySlug,
  storyText,
  uncoveredWords,
  type TravelStory,
} from './travelStory'

/**
 * THE CHECKER. The ride says it reads back the words you packed, and the only
 * thing that makes that true is this file.
 *
 * It uses the shipped stemmer rather than its own copy, which matters more
 * than it looks: `scripts/measure-function-words.mjs` had to duplicate the
 * inflection rules because it is a plain node script, and its own comment says
 * the two must agree. A test can import the real one, so there is nothing to
 * drift.
 */
describe('the travel story for a city', () => {
  // `storyText`, NOT `storyForCity`: the latter is gated on the ride flag, and
  // reading it here would make every assertion below vanish the moment the
  // flag went off — a suite that passes because it tests nothing. What is
  // written must stay correct while it is hidden, which is the whole point of
  // hiding it behind a flag rather than deleting it.
  const written = CITIES.map((_, i) => i).filter((i) => storyText(i))

  it('exists for at least one city, or this suite is vacuous', () => {
    expect(written.length).toBeGreaterThan(0)
  })

  describe.each(written)('city %i', (cityIndex) => {
    const story = storyText(cityIndex) as TravelStory
    const cityWords = wordsForCity(WORDS, cityIndex)

    it('uses every one of the city\'s hundred words', () => {
      // Named in the failure rather than counted, because the useful form of
      // this failure is the list to go and work into a sentence.
      expect(uncoveredWords(story, cityWords)).toEqual([])
    })

    it('covers the whole band and nothing is missing from the band itself', () => {
      expect(cityWords).toHaveLength(100)
    })

    it('carries an English gloss for every sentence', () => {
      for (const s of storySentences(story)) {
        expect(s.da.trim()).not.toBe('')
        expect(s.en.trim()).not.toBe('')
      }
    })

    it('is broken into chapters rather than one wall of text', () => {
      expect(story.chapters.length).toBeGreaterThanOrEqual(2)
      for (const c of story.chapters) expect(c.sentences.length).toBeGreaterThan(0)
    })

    it('agrees with itself about which city it is', () => {
      expect(story.cityIndex).toBe(cityIndex)
    })

    /**
     * The slug is computed in THREE places — storySlug here, the `--source
     * stories` branch of make-audio.mjs, and storyAudioUrl in speak.ts — and
     * the first two cannot import each other across the .mjs/.ts line.
     *
     * The check that they agree is NOT here, deliberately. It wants the
     * filesystem, and a test under src/ cannot have it: this project compiles
     * src with DOM libs and no node types, so an `import from 'node:fs'` here
     * passes vitest and fails `tsc -b` — the trap CLAUDE.md records, which
     * this file walked into on the way to being written. journey-drive.mjs
     * asks the BUILT app to fetch the first clip instead, which is the better
     * question anyway: dist is what ships, and a file present in the repo but
     * missing from the bundle would pass here and still be silent on a phone.
     */
    it('numbers its sentences from zero, contiguously', () => {
      const slugs = storySentences(story).map((_, i) => storySlug(cityIndex, i))
      expect(new Set(slugs).size).toBe(slugs.length)
      expect(slugs[0]).toBe(`${cityIndex}-000`)
    })
  })
})

describe('the ride flag', () => {
  // The build going to TestFlight is about the words, so the ride must be off
  // for everyone who has not asked for it. Pinned in both directions: the
  // first case is what ships, and without the second the flag could be stuck
  // off and this file would still be green.
  it('hides a written story from the app while it is off', () => {
    localStorage.removeItem('cluecab-ride')
    expect(rideEnabled()).toBe(false)
    expect(storyText(0)).toBeDefined()
    expect(storyForCity(0)).toBeUndefined()
  })

  it('shows it once the flag is set', () => {
    localStorage.setItem('cluecab-ride', '1')
    try {
      expect(rideEnabled()).toBe(true)
      expect(storyForCity(0)).toEqual(storyText(0))
    } finally {
      localStorage.removeItem('cluecab-ride')
    }
  })
})

describe('storySlug', () => {
  it('pads so the clips sort in reading order', () => {
    // Unpadded, sentence 10 sorts before sentence 2 in every file listing and
    // in the manifest, which is how a bake gets read back out of order.
    expect(storySlug(0, 2)).toBe('0-002')
    expect(storySlug(0, 10)).toBe('0-010')
    expect([storySlug(0, 10), storySlug(0, 2)].sort()).toEqual(['0-002', '0-010'])
  })

  it('separates cities', () => {
    expect(storySlug(1, 0)).not.toBe(storySlug(0, 0))
  })
})

describe('uncoveredWords', () => {
  const story: TravelStory = {
    cityIndex: 99,
    titleDa: 't',
    titleEn: 't',
    chapters: [{ titleDa: 'c', titleEn: 'c', sentences: [{ da: 'Huset er rødt.', en: 'x' }] }],
  }
  const entry = (da: string) => ({ id: `da:${da}`, da }) as never

  it('accepts an inflected form — «huset» is «hus» doing its job', () => {
    expect(uncoveredWords(story, [entry('hus')])).toEqual([])
  })

  it('accepts an adjective agreeing — «rødt» is «rød»', () => {
    expect(uncoveredWords(story, [entry('rød')])).toEqual([])
  })

  it('reports a word the story never uses', () => {
    expect(uncoveredWords(story, [entry('cykel')])).toEqual(['cykel'])
  })

  it('does not accept a word merely because another contains it', () => {
    // «er» is inside «værelse»; a substring check would pass this and quietly
    // mark words as taught that were never said.
    expect(uncoveredWords({ ...story, chapters: [{ titleDa: 'c', titleEn: 'c', sentences: [{ da: 'Værelset er stort.', en: 'x' }] }] }, [entry('vær')])).toEqual(['vær'])
  })
})
