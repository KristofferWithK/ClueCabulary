import { create } from 'zustand'

export type Screen = 'home' | 'game' | 'settings' | 'stats'

interface UiState {
  screen: Screen
  /** Word id shown in the dictionary bottom sheet, if open. */
  sheetWordId: string | null
  translationsOn: boolean
  /** Fixed board seed from the ?seed= URL param (dev/e2e). */
  pendingSeed: number | null
  goTo: (screen: Screen) => void
  openSheet: (wordId: string) => void
  closeSheet: () => void
  toggleTranslations: () => void
}

export const useUi = create<UiState>((set) => ({
  screen: 'home',
  sheetWordId: null,
  translationsOn: false,
  pendingSeed: null,
  goTo: (screen) => set({ screen, sheetWordId: null }),
  openSheet: (wordId) => set({ sheetWordId: wordId }),
  closeSheet: () => set({ sheetWordId: null }),
  toggleTranslations: () => set((s) => ({ translationsOn: !s.translationsOn })),
}))
