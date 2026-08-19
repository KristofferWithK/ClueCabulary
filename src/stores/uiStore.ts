import { create } from 'zustand'

export type Screen = 'home' | 'game' | 'settings' | 'suitcase' | 'map'

interface UiState {
  screen: Screen
  /** Word id shown in the dictionary bottom sheet, if open. */
  sheetWordId: string | null
  translationsOn: boolean
  /** Fixed board seed from the ?seed= URL param (dev/e2e). */
  pendingSeed: number | null
  /** Dev switch only: ?first=player starts the round with the player cluing. */
  pendingFirstGiver: 'player' | 'ai' | null
  howToOpen: boolean
  goTo: (screen: Screen) => void
  openSheet: (wordId: string) => void
  closeSheet: () => void
  toggleTranslations: () => void
  resetTranslations: () => void
  openHowTo: () => void
  closeHowTo: () => void
}

/**
 * Bumped when a rule in the dialog changes, because this dialog opens itself
 * exactly once ever and there is no other moment the app states the rules.
 *
 * v2: a forbidden word ended the round outright until four clues had been
 * given. Without the bump, everyone who had already played kept "hit a
 * forbidden word and one chance remains" as the last thing the app told them,
 * and then lost a round to a rule no screen ever showed them.
 *
 * v3: the whole meta-game changed — collect by cluing AND guessing, wrap in
 * wrap-up rounds, travel on a packed suitcase. Everyone gets the rules once
 * more.
 *
 * v4: forbidden words and the last chance are gone entirely — the two rules v2
 * existed for. A player still on v3 has been told about a mechanic that is no
 * longer in the game, which is the same failure v2 was bumped to avoid, in the
 * other direction. One bump per release: the overlay's copy is being rewritten
 * properly on top of this, and that rewrite ships with this key, not another.
 */
const HOWTO_KEY = 'cluecab-howto-v4'

/**
 * Each screen/overlay pushes a history entry so the Android back gesture (and
 * browser back) closes the sheet or returns home instead of quitting the
 * installed PWA. App.tsx handles popstate.
 */
/** Entries this app has pushed and not yet consumed. */
let depth = 0
/** Set while unwinding an entry ourselves, so App's popstate handler stands down. */
let selfPop = false

const pushHistory = () => {
  try {
    history.pushState({ cluecab: true }, '')
    depth++
  } catch {
    // History can be unavailable in exotic embeds — navigation still works.
  }
}

/**
 * Closing a layer from inside the app must consume the entry that opening it
 * pushed. Without this the entry is orphaned and the next system Back press is
 * swallowed unwinding it — the user taps Back and nothing happens.
 */
const popHistory = () => {
  if (depth === 0) return
  depth--
  selfPop = true
  try {
    history.back()
  } catch {
    selfPop = false
  }
}

/** Returning home consumes every entry the screens above it pushed. */
const unwindToFloor = () => {
  if (depth === 0) return
  const steps = depth
  depth = 0
  selfPop = true
  try {
    history.go(-steps)
  } catch {
    selfPop = false
  }
}

/** True when the popstate now firing is one we asked for; clears on read. */
export function consumeSelfPop(): boolean {
  const was = selfPop
  selfPop = false
  if (!was) depth = Math.max(0, depth - 1)
  return was
}

export const useUi = create<UiState>((set, get) => ({
  screen: 'home',
  sheetWordId: null,
  translationsOn: false,
  pendingSeed: null,
  pendingFirstGiver: null,
  howToOpen: false,
  goTo: (screen) => {
    const from = get().screen
    // Home is the floor. Hopping screen to screen used to push a second entry
    // and returning home popped only one, so the strays piled up and a system
    // Back press went to unwinding them instead of leaving the app.
    if (screen === 'home') unwindToFloor()
    else if (from === 'home') pushHistory()
    set({ screen, sheetWordId: null })
  },
  openSheet: (wordId) => {
    if (!get().sheetWordId) pushHistory()
    set({ sheetWordId: wordId })
  },
  closeSheet: () => {
    if (get().sheetWordId) popHistory()
    set({ sheetWordId: null })
  },
  toggleTranslations: () => set((s) => ({ translationsOn: !s.translationsOn })),
  resetTranslations: () => set({ translationsOn: false }),
  openHowTo: () => {
    if (!get().howToOpen) pushHistory()
    set({ howToOpen: true })
  },
  closeHowTo: () => {
    localStorage.setItem(HOWTO_KEY, 'seen')
    if (get().howToOpen) popHistory()
    set({ howToOpen: false })
  },
}))

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', ''])

/**
 * Whether the ?city / ?learned / ?seed switches are honoured. They rewrite the
 * collection without asking, which is right for a test and wrong for a link
 * someone was sent. Dev server, Playwright drives and a local preview qualify;
 * a deployed origin never does.
 */
export function devSwitchesAllowed(): boolean {
  if (typeof window === 'undefined') return false
  if (import.meta.env.DEV) return true
  return LOCAL_HOSTS.has(window.location.hostname)
}

/** First visit: show the rules once, NYT-style. */
export function shouldShowHowTo(): boolean {
  return localStorage.getItem(HOWTO_KEY) === null
}
