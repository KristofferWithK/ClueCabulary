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

export const useUi = create<UiState>((set) => ({
  screen: 'home',
  sheetWordId: null,
  translationsOn: false,
  pendingSeed: null,
  howToOpen: false,
  goTo: (screen) => set({ screen, sheetWordId: null }),
  openSheet: (wordId) => set({ sheetWordId: wordId }),
  closeSheet: () => set({ sheetWordId: null }),
  toggleTranslations: () => set((s) => ({ translationsOn: !s.translationsOn })),
  resetTranslations: () => set({ translationsOn: false }),
  openHowTo: () => set({ howToOpen: true }),
  closeHowTo: () => {
    localStorage.setItem(HOWTO_KEY, 'seen')
    set({ howToOpen: false })
  },
}))

/** First visit: show the rules once, NYT-style. */
export function shouldShowHowTo(): boolean {
  return localStorage.getItem(HOWTO_KEY) === null
}
