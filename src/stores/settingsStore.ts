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
   * When Casey last actually answered — a passed connection test, or a real
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
  /** Record that Casey answered. Cheap enough to call on every reply. */
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
  if (from >= 7) return persisted
  const s = {
    ...((persisted ?? {}) as {
      studyPhase?: StudyMode
      clueLanguage?: 'da' | 'en'
      gridSize?: GridSize
      apiKey?: string
      baseUrl?: string
      model?: string
    }),
  }
  // v1 -> v2: the study phase stopped being the default.
  if (from < 2 && s.studyPhase === 'auto') s.studyPhase = 'never'
  // v2 -> v3: Casey clues in Danish. Same shape of trap as the study phase —
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
  // v4 -> v5: the proxy is the default, so Casey answers with no key at all.
  //
  // The fourth outing of the same trap, but the first one where the old value
  // can be told apart from a choice. A device sitting on the Gemini default
  // with an EMPTY key has never had a working Casey and could not have: no key
  // means no answers from Gemini direct, and the build bundles none. Moving
  // exactly that group costs them nothing and hands them a partner.
  //
  // Anyone who typed a key, or typed a Base URL of their own, made a decision —
  // possibly on a paid account — and is left alone. The model comes along only
  // where the URL does, because an Ollama id on a Gemini endpoint is a 404 that
  // reads as a broken server.
  const GEMINI_DIRECT = 'https://generativelanguage.googleapis.com/v1beta/openai'
  if (
    from < 5 &&
    !(s.apiKey ?? '').trim() &&
    [GEMINI_DIRECT, '', undefined].includes((s.baseUrl ?? '').trim().replace(/\/+$/, '') || '')
  ) {
    s.baseUrl = DEFAULT_BASE_URL
    s.model = DEFAULT_MODEL
  }
  // v5 -> v6: the model name became an alias the proxy resolves.
  //
  // Narrow on purpose. Only the exact pair v5 itself shipped is moved — the
  // proxy as the Base URL AND the literal model it set — because that
  // combination was written by the migration above rather than chosen by
  // anyone. A model picked from the Settings list is a decision and stays,
  // even on the proxy: "cluey" is a name only this proxy knows, so overwriting
  // a deliberate choice with it would be taking the pick away.
  if (from < 6 && (s.baseUrl ?? '').trim().replace(/\/+$/, '') === DEFAULT_BASE_URL && s.model === 'gpt-oss:120b') {
    s.model = DEFAULT_MODEL
  }
  // v6 -> v7: the API key is retired, and a stale one has to go with it.
  //
  // This is the migration that fixes a device rather than tidying it. A key
  // typed in an older build overrides the one the proxy holds — deliberately,
  // so another service could be used without a code change — and the v5
  // migration therefore left typed keys alone, treating them as a decision.
  // For a key that had since been revoked, "left alone" meant it kept being
  // sent, kept being forwarded ahead of the proxy's own, and kept coming back
  // rejected. Mid-round, pointing at a Settings field for a key the app does
  // not need.
  //
  // So it is cleared for everyone. There is no longer any field to type one
  // into, and the only service left brings its own.
  if (from < 7) s.apiKey = ''
  return s
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      // 3x5. Fifteen words, six clues — the board the game is actually tuned
      // around, and the one «Spil videre» deals. (It carried one forbidden
      // word a side when that was chosen; no board does now.)
      // 3x4 is still a tap away in the picker for a first sitting.
      gridSize: 'middle',
      // Danish, both ways. The player has always been asked for "ét dansk ord"
      // by the clue dock; this setting governs only CLUEY's clues, and its
      // old default had him answering in English on a Danish board. Both sides
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
      version: 7,
      migrate: migrateSettings,
    },
  ),
)
