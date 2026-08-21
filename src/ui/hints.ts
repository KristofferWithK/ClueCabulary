import { useEffect, useState } from 'react'

/**
 * First-encounter lines for the game's two hardest moments (O4): the first
 * time a clue is yours to write, and the first time a guess is yours to make.
 * Each speaks ONCE, in a dock hint slot that already exists — C1 froze the
 * board rect by reserving every dock's height, so a sentence here costs board
 * nothing and adds no chrome.
 *
 * One localStorage flag each — the HOWTO_KEY pattern, never a settingsStore
 * field, so there is no partialize trap and no migration (the reasoning at the
 * top of src/onboarding/flow.ts).
 *
 * Never during mode 'tutorial', structurally: the TutorialDock stands in for
 * every phase dock at once (GameScreen), so the components that carry these
 * lines do not render there and the flags stay unspent for the first REAL
 * round — which is the round that needs them, since the tutorial hands the
 * player canned clues and a narrated guess.
 */
export const HINT_KEYS = {
  /** First-ever playerClueInput: one word in the language, lookup beside it. */
  clue: 'cluecab-hint-clue',
  /** First-ever playerGuessing: it is Casey's key that counts now. */
  guess: 'cluecab-hint-guess',
} as const

export type HintKey = (typeof HINT_KEYS)[keyof typeof HINT_KEYS]

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

const local = (): Storage | undefined =>
  typeof localStorage === 'undefined' ? undefined : localStorage

/** Whether this device has never had the line — unset flag, readable storage. */
export function shouldShowHint(key: HintKey, storage: ReadableStorage | undefined = local()): boolean {
  try {
    return storage?.getItem(key) === null
  } catch {
    // Storage that throws (private mode) could never record "seen", so showing
    // would mean showing forever. Quiet over nagging: no hint.
    return false
  }
}

export function markHintSeen(key: HintKey, storage: WritableStorage | undefined = local()): void {
  try {
    storage?.setItem(key, 'seen')
  } catch {
    // Nothing to do: shouldShowHint already answers false when storage throws.
  }
}

/**
 * True on the mount that is this device's first encounter, false ever after.
 * The flag is written from an effect so the decision itself stays a pure read
 * — StrictMode's double-invoke writes 'seen' twice, which is the same write.
 */
export function useFirstTimeHint(key: HintKey): boolean {
  const [first] = useState(() => shouldShowHint(key))
  useEffect(() => {
    if (first) markHintSeen(key)
  }, [first, key])
  return first
}
