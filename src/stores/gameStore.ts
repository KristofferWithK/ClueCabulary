import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AiError } from '../ai/client'
import { OllamaCompanion, planGuessExecution, type Companion } from '../ai/companion'
import { MockCompanion } from '../ai/mock/mockCompanion'
import {
  buildAiClueView,
  buildAiGuessView,
  buildDebriefView,
} from '../ai/projections'
import type { DebriefResponse, GuessResponse } from '../ai/schemas'
import { GRID_CONFIGS, type GridSize } from '../engine/config'
import { applyEvent, createGame, currentClue } from '../engine/game'
import { mulberry32 } from '../engine/rng'
import type { GameState } from '../engine/types'
import { selectBoardWords, selectDailyWords } from '../srs/sampler'
import type { RoundWordResult } from '../srs/types'
import { WORDS } from '../data/words'
import { studyPhaseEnabled, unlockedWords } from '../journey/progress'
import { collectedSet, useJourney } from './journeyStore'
import { practiceNeed } from '../srs/scheduler'
import { useSettings } from './settingsStore'
import { useSrs } from './srsStore'
import { useUi } from './uiStore'

type PlannedGuess = GuessResponse['guesses'][number]

export interface NewGameOptions {
  seed?: number
  gridSize?: GridSize
  /** Set for the shared daily challenge (local date, e.g. "2026-08-12"). */
  dailyKey?: string
}

interface GameStore {
  game: GameState | null
  /** Word ids looked up in the dictionary this round (SRS signal). */
  lookedUp: string[]
  roundRecorded: boolean
  /** Non-null while playing (or having finished) a daily challenge. */
  dailyKey: string | null
  /** Opening study phase: the whole board shown translated, before play. */
  studying: boolean
  debrief: DebriefResponse | null
  debriefFailed: boolean
  // Transient (not persisted):
  aiBusy: boolean
  aiGuessQueue: PlannedGuess[]
  /** clueHistory.length the current guess plan was made for — distinguishes "plan consumed" from "no plan yet". */
  planForClueIndex: number | null
  /** The guess currently being dramatized in the UI, just applied. */
  lastAiGuess: PlannedGuess | null
  error: string | null
  selectedWordId: string | null

  newGame: (opts?: NewGameOptions) => void
  endStudy: () => void
  abandonGame: () => void
  submitPlayerClue: (text: string, number: number) => void
  selectWord: (wordId: string | null) => void
  playerGuess: (wordId: string) => void
  playerStop: () => void
  submitRedemption: (answers: Record<string, string>) => void
  recordLookup: (wordId: string) => void
  runAiGuesses: () => Promise<void>
  stepAiGuess: () => void
  runAiClue: () => Promise<void>
  requestDebrief: () => Promise<void>
  finishRound: () => void
  clearError: () => void
}

function companion(): Companion {
  const s = useSettings.getState()
  if (s.useMock) return new MockCompanion()
  return new OllamaCompanion({ baseUrl: s.baseUrl, apiKey: s.apiKey, model: s.model })
}

const aiMessage = (e: unknown): string =>
  e instanceof AiError ? e.message : 'Something went wrong talking to the AI companion.'

const buzz = (result: 'green' | 'bystander' | 'forbidden') => {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  navigator.vibrate(result === 'green' ? 15 : result === 'bystander' ? 40 : [70, 50, 70])
}

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      game: null,
      lookedUp: [],
      roundRecorded: false,
      dailyKey: null,
      studying: false,
      debrief: null,
      debriefFailed: false,
      aiBusy: false,
      aiGuessQueue: [],
      planForClueIndex: null,
      lastAiGuess: null,
      error: null,
      selectedWordId: null,

      newGame: (opts) => {
        const settings = useSettings.getState()
        const config = GRID_CONFIGS[opts?.gridSize ?? settings.gridSize]
        const actualSeed = opts?.seed ?? (Date.now() % 0xffffffff)
        // The daily challenge is the same board for everyone on that date:
        // a seeded uniform draw over the whole dataset, ignoring personal SRS.
        // Journey rounds (and free play) draw only from words the player has
        // travelled far enough to unlock; the daily challenge stays global so
        // everyone gets the same board.
        const pool = unlockedWords(WORDS, useJourney.getState().cityIndex)
        const entries = opts?.dailyKey
          ? selectDailyWords(WORDS, config.totalWords, mulberry32(actualSeed ^ 0x9e3779b9))
          : selectBoardWords(
              pool,
              useSrs.getState().stats,
              { totalWords: config.totalWords, maxNewWordsPerBoard: config.maxNewWordsPerBoard },
              mulberry32(actualSeed ^ 0x9e3779b9),
              Date.now(),
            )
        // Steer the deal: words the player still struggles with become Klaus's
        // greens (so the player has to recall them), well-known ones become the
        // forbidden hazards. The daily challenge stays an unbiased shared board.
        const srsStats = useSrs.getState().stats
        const collectedIds = collectedSet(useJourney.getState().collectedAt)
        const bias = opts?.dailyKey
          ? undefined
          : {
              need: Object.fromEntries(
                entries.map((w) => [
                  w.id,
                  practiceNeed(srsStats[w.id], collectedIds.has(w.id), Date.now()),
                ]),
              ),
            }

        const game = createGame({
          config,
          words: entries.map((w) => ({ wordId: w.id, da: w.da, en: w.en, pos: w.pos })),
          seed: actualSeed,
          bias,
        })
        // A translation overlay left on would show answers from second one
        // without ever counting as lookups — every round starts covered.
        useUi.getState().resetTranslations()
        set({
          game,
          lookedUp: [],
          roundRecorded: false,
          dailyKey: opts?.dailyKey ?? null,
          // A deliberate preview is presentation, not a crutch, so it records
          // no lookups — the clean-guess credit survives it.
          studying: studyPhaseEnabled(settings.studyPhase, useJourney.getState().cityIndex),
          debrief: null,
          debriefFailed: false,
          aiGuessQueue: [],
          planForClueIndex: null,
          lastAiGuess: null,
          error: null,
          selectedWordId: null,
          aiBusy: false,
        })
      },

      endStudy: () => set({ studying: false }),

      abandonGame: () => {
        useUi.getState().resetTranslations()
        set({
          game: null,
          lookedUp: [],
          roundRecorded: false,
          dailyKey: null,
          studying: false,
          debrief: null,
          debriefFailed: false,
          aiGuessQueue: [],
          planForClueIndex: null,
          lastAiGuess: null,
          error: null,
          selectedWordId: null,
        })
      },

      submitPlayerClue: (text, number) => {
        const { game } = get()
        if (!game || game.phase !== 'playerClueInput') return
        set({ game: applyEvent(game, { type: 'SUBMIT_CLUE', by: 'player', text, number }) })
      },

      selectWord: (wordId) => set({ selectedWordId: wordId }),

      playerGuess: (wordId) => {
        const { game } = get()
        if (!game || game.phase !== 'playerGuessing') return
        const next = applyEvent(game, { type: 'GUESS', wordId })
        const clue = currentClue(next)
        buzz(clue!.guesses[clue!.guesses.length - 1]!.result)
        set({ game: next, selectedWordId: null })
        if (next.phase === 'finished') get().finishRound()
      },

      playerStop: () => {
        const { game } = get()
        if (!game || game.phase !== 'playerGuessing') return
        const next = applyEvent(game, { type: 'STOP_GUESSING' })
        set({ game: next, selectedWordId: null })
        if (next.phase === 'finished') get().finishRound()
      },

      submitRedemption: (answers) => {
        const { game } = get()
        if (!game || game.phase !== 'redemption') return
        const next = applyEvent(game, { type: 'SUBMIT_REDEMPTION', answers })
        set({ game: next })
        get().finishRound()
      },

      recordLookup: (wordId) => {
        const { game, lookedUp } = get()
        if (!game || game.phase === 'redemption') return
        if (!lookedUp.includes(wordId)) set({ lookedUp: [...lookedUp, wordId] })
      },

      runAiGuesses: async () => {
        const { game, aiBusy } = get()
        if (!game || game.phase !== 'aiGuessing' || aiBusy) return
        set({ aiBusy: true, error: null })
        try {
          const view = buildAiGuessView(game, useSettings.getState().clueLanguage)
          const res = await companion().getGuesses(view)
          // Any event replaces the game object, so reference equality proves
          // this response still belongs to the current game and clue. A stale
          // response (user abandoned or started a new game mid-flight) is
          // dropped without touching state — the new game manages its own.
          if (get().game !== game) return
          const plan = planGuessExecution(res.guesses, currentClue(game)?.number ?? 1)
          set({ aiBusy: false, aiGuessQueue: plan, planForClueIndex: game.clueHistory.length })
        } catch (e) {
          if (get().game === game) set({ aiBusy: false, error: aiMessage(e) })
        }
      },

      stepAiGuess: () => {
        const { game, aiGuessQueue, planForClueIndex } = get()
        if (!game) return
        if (game.phase !== 'aiGuessing') {
          if (aiGuessQueue.length > 0) set({ aiGuessQueue: [] })
          return
        }
        if (planForClueIndex !== game.clueHistory.length) return // plan is stale or missing
        const [next, ...rest] = aiGuessQueue
        if (!next) {
          const clue = currentClue(game)
          if (!clue || clue.guesses.length === 0) {
            // The plan produced no executable guess (e.g. every id was stale):
            // stopping now would be an illegal event — request a fresh plan.
            set({ planForClueIndex: null, lastAiGuess: null })
            return
          }
          try {
            const after = applyEvent(game, { type: 'STOP_GUESSING' })
            set({ game: after, lastAiGuess: null })
          } catch {
            set({ planForClueIndex: null, lastAiGuess: null })
          }
          return
        }
        try {
          const after = applyEvent(game, { type: 'GUESS', wordId: next.wordId })
          const clue = currentClue(after)
          buzz(clue!.guesses[clue!.guesses.length - 1]!.result)
          const turnEnded = after.phase !== 'aiGuessing'
          set({ game: after, aiGuessQueue: turnEnded ? [] : rest, lastAiGuess: next })
          if (after.phase === 'finished') get().finishRound()
        } catch {
          // Word became unguessable (shouldn't happen) — drop it and move on.
          set({ aiGuessQueue: rest })
        }
      },

      runAiClue: async () => {
        const { game, aiBusy } = get()
        if (!game || game.phase !== 'aiClueInput' || aiBusy) return
        set({ aiBusy: true, error: null, lastAiGuess: null })
        try {
          const view = buildAiClueView(game, useSettings.getState().clueLanguage)
          const res = await companion().getClue(view)
          // Reference check: never apply a clue composed for a previous game.
          const current = get().game
          if (current !== game || current.phase !== 'aiClueInput') return
          const after = applyEvent(current, {
            type: 'SUBMIT_CLUE',
            by: 'ai',
            text: res.clue,
            number: res.number,
            targets: res.targetWordIds,
            rationale: res.rationale,
          })
          set({ aiBusy: false, game: after })
        } catch (e) {
          if (get().game === game) set({ aiBusy: false, error: aiMessage(e) })
        }
      },

      requestDebrief: async () => {
        const { game, lookedUp, debrief, aiBusy } = get()
        if (!game || game.phase !== 'finished' || debrief || aiBusy) return
        set({ aiBusy: true })
        try {
          const view = buildDebriefView(game, lookedUp)
          const res = await companion().getDebrief(view)
          if (get().game !== game) return // user already started the next round
          set({ aiBusy: false, debrief: res, debriefFailed: false })
        } catch {
          if (get().game === game) set({ aiBusy: false, debriefFailed: true })
        }
      },

      finishRound: () => {
        const { game, lookedUp, roundRecorded } = get()
        if (!game || game.phase !== 'finished' || roundRecorded) return
        const redemptionByWord = new Map(
          (game.redemption?.results ?? []).map((r) => [r.wordId, r.accepted]),
        )
        const results: RoundWordResult[] = game.words.map((w) => {
          const guessedGreen = game.reveals[w.wordId]!.kind === 'green'
          // Only the player's own wrong guesses count against a word.
          const guessedWrong = game.clueHistory.some(
            (c) =>
              c.by === 'ai' &&
              c.guesses.some((g) => g.wordId === w.wordId && g.result !== 'green'),
          )
          const redemption = redemptionByWord.has(w.wordId)
            ? redemptionByWord.get(w.wordId)
              ? ('right' as const)
              : ('wrong' as const)
            : undefined
          return {
            wordId: w.wordId,
            guessedGreen,
            guessedWrong,
            lookedUp: lookedUp.includes(w.wordId),
            redemption,
          }
        })
        const finishedAt = Date.now()
        useSrs.getState().recordRound(results, finishedAt)
        useSrs.getState().recordGame(game.outcome!)
        // Latch anything newly proven, so journey progress only ever grows.
        useJourney.getState().syncCollected(useSrs.getState().stats, finishedAt)
        const { dailyKey } = get()
        if (dailyKey) {
          const outcome =
            game.outcome!.result === 'won'
              ? game.outcome!.reason === 'redeemed'
                ? 'redeemed'
                : 'won'
              : 'lost'
          localStorage.setItem(`cluecab-daily:${dailyKey}`, outcome)
        }
        set({ roundRecorded: true })
        void get().requestDebrief()
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'cluecab-game-v1',
      version: 1,
      partialize: (s) => ({
        game: s.game,
        lookedUp: s.lookedUp,
        roundRecorded: s.roundRecorded,
        dailyKey: s.dailyKey,
        studying: s.studying,
        debrief: s.debrief,
        debriefFailed: s.debriefFailed,
      }),
    },
  ),
)
