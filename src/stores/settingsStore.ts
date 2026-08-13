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
  /**
   * When Klaus last actually answered — a passed connection test, or a real
   * clue or guess in play. Null means the credentials here have never been
   * shown to work, which is different from having none at all: a key that is
   * present but wrong, or blocked by CORS, otherwise announces itself only
   * after the player has committed to a board.
   */
  klausVerifiedAt: number | null
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
  /** Record that Klaus answered. Cheap enough to call on every reply. */
  markKlausVerified: (now: number) => void
}

/**
 * v1's default was 'auto' — the whole board translated for the first five
 * cities. Changing the default fixed nothing for anyone already playing:
 * settings persist, so every existing device kept 'auto' and kept opening every
 * round with twelve English glosses on screen. Measured on a v1 save: study
 * dock present, 12 of 12 translations shown.
 *
 * Only 'auto' is rewritten. 'always' was never a default, so a device holding
 * it chose it, and that choice survives.
 *
 * Exported so it can be tested directly: under vitest there is no localStorage,
 * persist quietly becomes a passthrough, and a test reaching through the
 * middleware would be testing nothing.
 */
export function migrateSettings(persisted: unknown, from: number): unknown {
  if (from >= 3) return persisted
  const s = { ...((persisted ?? {}) as { studyPhase?: StudyMode; clueLanguage?: 'da' | 'en' }) }
  // v1 -> v2: the study phase stopped being the default.
  if (from < 2 && s.studyPhase === 'auto') s.studyPhase = 'never'
  // v2 -> v3: Klaus clues in Danish. Same shape of trap as the study phase —
  // changing a default does nothing for a device that already stored one, and
  // this one had every existing player still getting English clues.
  if (from < 3 && s.clueLanguage === 'en') s.clueLanguage = 'da'
  return s
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      gridSize: 'beginner',
      // Danish, both ways. The player has always been asked for "ét dansk ord"
      // by the clue dock; this setting governed only KLAUS's clues, and its
      // default had him answering in English on a Danish board. Both sides
      // speak Danish now, and the setting is the escape hatch rather than the
      // norm.
      clueLanguage: 'da',
      // Off. Opening every round with all twelve translations on screen
      // clutters the board you are about to read, and the lookup box and ⓘ
      // both answer the same question on demand. 'auto' and 'always' are
      // still there in Settings for anyone who wants the old opening.
      studyPhase: 'never',
      useMock: false,
      klausVerifiedAt: null,
      set: (patch) =>
        set((s) => {
          // Any change of credentials invalidates the last success.
          const touched =
            (patch.apiKey !== undefined && patch.apiKey !== s.apiKey) ||
            (patch.baseUrl !== undefined && patch.baseUrl !== s.baseUrl) ||
            (patch.model !== undefined && patch.model !== s.model)
          return touched ? { ...patch, klausVerifiedAt: null } : patch
        }),
      markKlausVerified: (now) => set({ klausVerifiedAt: now }),
    }),
    {
      name: 'cluecab-settings-v1',
      version: 3,
      migrate: migrateSettings,
    },
  ),
)
