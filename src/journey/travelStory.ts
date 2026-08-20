import stories from '../data/travel-stories.da.json'
import { ACTIVE } from '../lang/active'
import { storyTokens } from '../ai/companion'
import type { WordEntry } from '../data/types'

/**
 * The story a city tells on the way out of it.
 *
 * WHY THIS CAN BE FIXED CONTENT AT ALL, which is the whole reason the feature
 * is affordable: `canTravel` opens the road only when ALL of a city's words
 * are wrapped (`WRAP_TO_TRAVEL === WORDS_PER_CITY`). So at the moment anyone
 * boards, the words they packed are the city's band and nobody's set differs.
 * One story per city, written once and baked once — against a per-board story,
 * which would need live TTS through the proxy, metered and online-only.
 *
 * The sentences are the unit rather than the paragraph because Chirp3 has no
 * SSML and therefore no timing marks: sentence-level clips are the only way to
 * highlight the line being spoken, replay one, or offer it slower.
 */

export interface StorySentence {
  da: string
  en: string
}

export interface StoryChapter {
  titleDa: string
  titleEn: string
  sentences: StorySentence[]
}

export interface TravelStory {
  cityIndex: number
  titleDa: string
  titleEn: string
  chapters: StoryChapter[]
}

const BY_CITY = stories as unknown as Record<string, TravelStory>

/**
 * ---- the ride (localStorage cluecab-ride = '1', off otherwise) ----
 *
 * H9 is written but not finished: one city of nine has a story, and none of
 * the sentences are baked, so the ride speaks in whatever voice the phone
 * carries rather than in Aoede. That is a preview, not a feature, and the
 * build going to TestFlight is meant to be about the WORDS.
 *
 * So the ride is off unless the flag is set, and the switch lives here rather
 * than in MapScreen because everything downstream — the player, the bake, the
 * coverage assertions — should agree about whether a story exists at all.
 * `storyText` is the unflagged reader the coverage test uses: what is written
 * has to stay correct even while nobody can see it, or the flag becomes a
 * place for rot to hide.
 *
 * Turn it on with five taps on the build stamp in Settings, the same way the
 * keyboard ride is turned on. Delete this function and its callers' flag
 * checks when the nine stories are written and baked.
 */
export function rideEnabled(): boolean {
  try {
    return localStorage.getItem('cluecab-ride') === '1'
  } catch {
    // Private mode, or no DOM at all under vitest.
    return false
  }
}

/** The story for a city, ignoring the flag — for tests, tools and the bake. */
export function storyText(cityIndex: number): TravelStory | undefined {
  return BY_CITY[String(cityIndex)]
}

/**
 * The story the APP should show for a city: none at all while the ride is
 * flagged off, so travelling goes straight through to the arrival.
 */
export function storyForCity(cityIndex: number): TravelStory | undefined {
  return rideEnabled() ? storyText(cityIndex) : undefined
}

/** Every sentence of a story, flattened — the order they are read in. */
export function storySentences(story: TravelStory): StorySentence[] {
  return story.chapters.flatMap((c) => c.sentences)
}

/**
 * The audio slug for one sentence, and the contract between the bake and the
 * app: `scripts/make-audio.mjs --source stories` writes exactly these names,
 * and `playStorySentence` asks for exactly these names. Both sides compute it
 * from the same two numbers, so a sentence inserted in the middle renumbers
 * the clips after it — which is correct, because the manifest stamps the TEXT
 * and will re-bake every one whose words moved.
 */
export const storySlug = (cityIndex: number, sentenceIndex: number): string =>
  `${cityIndex}-${String(sentenceIndex).padStart(3, '0')}`

/**
 * Which of `words` the story never uses.
 *
 * The same two rules the round-story validator uses (`storyProblem`): a word
 * counts if it appears verbatim, or if some token in the story stems to it.
 * Definite and plural forms therefore count — «huset» IS «hus» doing its job
 * in a sentence, and demanding the bare citation form would produce Danish no
 * one speaks.
 *
 * Exported because the test is the feature: "all the words you packed" is a
 * promise to the player, and an unchecked promise is decoration.
 */
export function uncoveredWords(story: TravelStory, words: readonly WordEntry[]): string[] {
  const text = storySentences(story)
    .map((s) => s.da)
    .join(' ')
  const tokens = new Set(storyTokens(text))
  const stem = ACTIVE.morphology.stem
  const stems = new Set([...tokens].map(stem))
  return words
    .filter((w) => {
      const da = w.da.toLowerCase()
      return !tokens.has(da) && !stems.has(stem(da))
    })
    .map((w) => w.da)
}
