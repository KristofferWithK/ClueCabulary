import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ACTIVE } from '../lang/active'
import { DEFAULT_LANGUAGE } from '../lang/index'
import type { LanguageCode } from '../lang/types'

/**
 * A clue or a guess the player marked as bad, from the review page.
 *
 * `what` is what Casey did, `why` is the account he gave of it — both kept,
 * because a flag with only the verdict in it is not usable feedback. The
 * reasoning is the half that says WHERE he went wrong, and it is the half he
 * can be shown next time.
 */
export interface Flag {
  /** Stable within a round: seed, clue index, and for a guess its index. */
  id: string
  kind: 'clue' | 'guess'
  /** The clue word, or the board word he named, in the language being learned. */
  what: string
  /** The clue a guess was made under. Empty for a flagged clue. */
  underClue?: string
  /** His own reasoning or rationale, if he gave one. */
  why?: string
  at: number
  /**
   * The language the round was played in.
   *
   * `what` and `underClue` are words of that language, and they are shown back
   * to Casey verbatim in a later prompt — so a Danish flag surfacing in a
   * German round would be a correction about a word that is not on the board
   * and not in the language. `flagsFor` is the filter.
   *
   * Optional because every flag written before the seam lacks it, and those
   * are all Danish. A new persisted field rather than a version bump, on the
   * `earnedWrapUp` precedent: nothing existing changes meaning, so `undefined`
   * only has to be READ correctly, which `flagsFor` does.
   */
  lang?: LanguageCode
}

/**
 * The flags worth showing Casey this round: the ones from rounds in the
 * language being played. A flag with no language on it was written before the
 * seam and is Danish.
 */
export const flagsFor = (flags: readonly Flag[], code: LanguageCode): Flag[] =>
  flags.filter((f) => (f.lang ?? DEFAULT_LANGUAGE) === code)

/**
 * How many flags are kept, newest first.
 *
 * They are shown back to Casey, so this is a prompt-size budget as much as a
 * storage one: enough that a repeated habit is visible, few enough that the
 * list never crowds out the board he is supposed to be reading.
 */
export const MAX_FLAGS = 24

interface FeedbackStore {
  flags: Flag[]
  toggleFlag: (flag: Omit<Flag, 'at'>) => void
  isFlagged: (id: string) => boolean
  clearFlags: () => void
}

export const useFeedback = create<FeedbackStore>()(
  persist(
    (set, get) => ({
      flags: [],
      toggleFlag: (flag) =>
        set((s) => {
          const without = s.flags.filter((f) => f.id !== flag.id)
          // Tapping a flagged item again takes it back — a mis-tap on a phone
          // must not be a permanent judgement about Casey.
          if (without.length !== s.flags.length) return { flags: without }
          return { flags: [{ ...flag, at: Date.now(), lang: ACTIVE.code }, ...without].slice(0, MAX_FLAGS) }
        }),
      isFlagged: (id) => get().flags.some((f) => f.id === id),
      clearFlags: () => set({ flags: [] }),
    }),
    { name: 'cluecab-feedback-v1', version: 1 },
  ),
)

/** The ids the review page flags against, so the UI and the tests agree. */
export const clueFlagId = (seed: number, clueIndex: number) => `c:${seed}:${clueIndex}`
export const guessFlagId = (seed: number, clueIndex: number, guessIndex: number) =>
  `g:${seed}:${clueIndex}:${guessIndex}`
