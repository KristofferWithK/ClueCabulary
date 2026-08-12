import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from '../ai/client'
import type { GridSize } from '../engine/config'
import type { StudyMode } from '../journey/progress'

interface SettingsState {
  apiKey: string
  baseUrl: string
  model: string
  gridSize: GridSize
  clueLanguage: 'da' | 'en'
  /** Show the whole board translated before a round starts. */
  studyPhase: StudyMode
  /** Play against the deterministic offline companion (dev/e2e). */
  useMock: boolean
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      gridSize: 'beginner',
      clueLanguage: 'en',
      studyPhase: 'auto',
      useMock: false,
      set: (patch) => set(patch),
    }),
    { name: 'cluecab-settings-v1', version: 1 },
  ),
)
