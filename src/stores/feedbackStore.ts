import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * A clue or a guess the player marked as bad, from the review page.
 *
 * `what` is what Cluey did, `why` is the account he gave of it — both kept,
 * because a flag with only the verdict in it is not usable feedback. The
 * reasoning is the half that says WHERE he went wrong, and it is the half he
 * can be shown next time.
 */
export interface Flag {
  /** Stable within a round: seed, clue index, and for a guess its index. */
  id: string
  kind: 'clue' | 'guess'
  /** The clue word, or the Danish board word he named. */
  what: string
  /** The clue a guess was made under. Empty for a flagged clue. */
  underClue?: string
  /** His own reasoning or rationale, if he gave one. */
  why?: string
  at: number
}

/**
 * How many flags are kept, newest first.
 *
 * They are shown back to Cluey, so this is a prompt-size budget as much as a
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
          // must not be a permanent judgement about Cluey.
          if (without.length !== s.flags.length) return { flags: without }
          return { flags: [{ ...flag, at: Date.now() }, ...without].slice(0, MAX_FLAGS) }
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
