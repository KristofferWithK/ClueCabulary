import { create } from 'zustand'

export type Screen = 'home' | 'game' | 'settings' | 'stats'

interface UiState {
  screen: Screen
  /** Word id shown in the dictionary bottom sheet, if open. */
  sheetWordId: string | null
  translationsOn: boolean
  /** Fixed board seed from the ?seed= URL param (dev/e2e). */
  pendingSeed: number | null
  howToOpen: boolean
  goTo: (screen: Screen) => void
  openSheet: (wordId: string) => void
  closeSheet: () => void
  toggleTranslations: () => void
  resetTranslations: () => void
  openHowTo: () => void
  closeHowTo: () => void
}

const HOWTO_KEY = 'cluecab-howto-v1'

/**
 * Each screen/overlay pushes a history entry so the Android back gesture (and
 * browser back) closes the sheet or returns home instead of quitting the
 * installed PWA. App.tsx handles popstate.
 */
const pushHistory = () => {
  try {
    history.pushState({ cluecab: true }, '')
  } catch {
    // History can be unavailable in exotic embeds — navigation still works.
  }
}

export const useUi = create<UiState>((set, get) => ({
  screen: 'home',
  sheetWordId: null,
  translationsOn: false,
  pendingSeed: null,
  howToOpen: false,
  goTo: (screen) => {
    if (screen !== 'home' && screen !== get().screen) pushHistory()
    set({ screen, sheetWordId: null })
  },
  openSheet: (wordId) => {
    if (!get().sheetWordId) pushHistory()
    set({ sheetWordId: wordId })
  },
  closeSheet: () => set({ sheetWordId: null }),
  toggleTranslations: () => set((s) => ({ translationsOn: !s.translationsOn })),
  resetTranslations: () => set({ translationsOn: false }),
  openHowTo: () => {
    if (!get().howToOpen) pushHistory()
    set({ howToOpen: true })
  },
  closeHowTo: () => {
    localStorage.setItem(HOWTO_KEY, 'seen')
    set({ howToOpen: false })
  },
}))

/** First visit: show the rules once, NYT-style. */
export function shouldShowHowTo(): boolean {
  return localStorage.getItem(HOWTO_KEY) === null
}
