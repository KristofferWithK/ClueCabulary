import { create } from 'zustand'

export type Screen = 'home' | 'game' | 'settings' | 'stats' | 'map' | 'gate'

interface UiState {
  screen: Screen
  /** Word id shown in the dictionary bottom sheet, if open. */
  sheetWordId: string | null
  translationsOn: boolean
  /** Fixed board seed from the ?seed= URL param (dev/e2e). */
  pendingSeed: number | null
  howToOpen: boolean
  /** The grandmother's letter — the very first screen, and re-readable after. */
  letterOpen: boolean
  /** Which travel exam is open, when screen === 'gate'. */
  gateIndex: number | null
  goTo: (screen: Screen) => void
  openGate: (gateIndex: number) => void
  openSheet: (wordId: string) => void
  closeSheet: () => void
  toggleTranslations: () => void
  resetTranslations: () => void
  openHowTo: () => void
  closeHowTo: () => void
  openLetter: () => void
  closeLetter: () => void
}

const HOWTO_KEY = 'cluecab-howto-v1'
const LETTER_KEY = 'cluecab-letter-v1'

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
  howToOpen: false,
  letterOpen: false,
  gateIndex: null,
  goTo: (screen) => {
    const from = get().screen
    if (screen !== 'home' && screen !== from) pushHistory()
    if (screen === 'home' && from !== 'home') popHistory()
    set({ screen, sheetWordId: null, gateIndex: screen === 'gate' ? get().gateIndex : null })
  },
  openGate: (gateIndex) => {
    if (get().screen !== 'gate') pushHistory()
    set({ screen: 'gate', gateIndex, sheetWordId: null })
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
  openLetter: () => {
    if (!get().letterOpen) pushHistory()
    set({ letterOpen: true })
  },
  closeLetter: () => {
    localStorage.setItem(LETTER_KEY, 'read')
    // First read only: the rules follow the invitation, never precede it. When
    // they do, the how-to inherits the letter's history entry rather than
    // popping one and pushing another — history.back() lands a tick later, so
    // the two would race and the pushed entry would be the one it swallowed.
    const chain = get().howToOpen === false && shouldShowHowTo()
    if (get().letterOpen && !chain) popHistory()
    set({ letterOpen: false, howToOpen: chain })
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

/** The letter opens the game, once. It stays re-readable from Home after that. */
export function shouldShowLetter(): boolean {
  return localStorage.getItem(LETTER_KEY) === null
}
