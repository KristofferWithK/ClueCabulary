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
   * When Cluey last actually answered — a passed connection test, or a real
   * clue or guess in play. Null means the credentials here have never been
   * shown to work, which is different from having none at all: a key that is
   * present but wrong, or blocked by CORS, otherwise announces itself only
   * after the player has committed to a board.
   *
   * The field keeps the name it was persisted under when the companion was
   * Klaus: settings has no partialize, so every saved blob carries it, and
   * renaming a stored field buys a migration for a label nobody sees.
   */
  klausVerifiedAt: number | null
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
  /** Record that Cluey answered. Cheap enough to call on every reply. */
  markClueyVerified: (now: number) => void
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
  if (from >= 4) return persisted
  const s = {
    ...((persisted ?? {}) as {
      studyPhase?: StudyMode
      clueLanguage?: 'da' | 'en'
      gridSize?: GridSize
    }),
  }
  // v1 -> v2: the study phase stopped being the default.
  if (from < 2 && s.studyPhase === 'auto') s.studyPhase = 'never'
  // v2 -> v3: Cluey clues in Danish. Same shape of trap as the study phase —
  // changing a default does nothing for a device that already stored one, and
  // this one had every existing player still getting English clues.
  if (from < 3 && s.clueLanguage === 'en') s.clueLanguage = 'da'
  // v3 -> v4: 3x5 is the board «Spil videre» deals.
  //
  // This one is not clean, and the dishonest thing would be to pretend it is.
  // 'always' could be left alone in the study-phase migration because it was
  // never a default, so holding it proved somebody chose it. 'beginner' was the
  // default AND is a real choice, and the persisted blob cannot tell them
  // apart: this store has no partialize, so every save ever written carries a
  // gridSize whether the player ever touched the picker or not.
  //
  // So it moves everyone, and the cost is asymmetric on purpose. Someone who
  // wanted 3x4 is one tap from it — the picker is on Home, above the fold, and
  // tapping it stores the choice for good. Someone who is not moved never gets
  // the board that was asked for, which is exactly the trap this app has fallen
  // into three times now.
  if (from < 4 && s.gridSize === 'beginner') s.gridSize = 'middle'
  return s
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      // 3x5. Fifteen words, six clues, one forbidden word a side — the board
      // the game is actually tuned around, and the one «Spil videre» deals.
      // 3x4 is still a tap away in the picker for a first sitting.
      gridSize: 'middle',
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
      markClueyVerified: (now) => set({ klausVerifiedAt: now }),
    }),
    {
      name: 'cluecab-settings-v1',
      version: 4,
      migrate: migrateSettings,
    },
  ),
)
