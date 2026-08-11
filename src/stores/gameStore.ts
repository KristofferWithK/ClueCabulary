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
import { GRID_CONFIGS } from '../engine/config'
import { applyEvent, createGame, currentClue } from '../engine/game'
import { mulberry32 } from '../engine/rng'
import type { GameState } from '../engine/types'
import { selectBoardWords } from '../srs/sampler'
import type { RoundWordResult } from '../srs/types'
import { WORDS } from '../data/words'
import { useSettings } from './settingsStore'
import { useSrs } from './srsStore'

type PlannedGuess = GuessResponse['guesses'][number]

interface GameStore {
  game: GameState | null
  /** Word ids looked up in the dictionary this round (SRS signal). */
  lookedUp: string[]
  roundRecorded: boolean
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

  newGame: (seed?: number) => void
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

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      game: null,
      lookedUp: [],
      roundRecorded: false,
      debrief: null,
      debriefFailed: false,
      aiBusy: false,
      aiGuessQueue: [],
      planForClueIndex: null,
      lastAiGuess: null,
      error: null,
      selectedWordId: null,

      newGame: (seed) => {
        const settings = useSettings.getState()
        const config = GRID_CONFIGS[settings.gridSize]
        const actualSeed = seed ?? (Date.now() % 0xffffffff)
        const entries = selectBoardWords(
          WORDS,
          useSrs.getState().stats,
          { totalWords: config.totalWords, maxNewWordsPerBoard: config.maxNewWordsPerBoard },
          mulberry32(actualSeed ^ 0x9e3779b9),
          Date.now(),
        )
        const game = createGame({
          config,
          words: entries.map((w) => ({ wordId: w.id, da: w.da, en: w.en, pos: w.pos })),
          seed: actualSeed,
        })
        set({
          game,
          lookedUp: [],
          roundRecorded: false,
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

      abandonGame: () =>
        set({
          game: null,
          lookedUp: [],
          roundRecorded: false,
          debrief: null,
          debriefFailed: false,
          aiGuessQueue: [],
          planForClueIndex: null,
          lastAiGuess: null,
          error: null,
          selectedWordId: null,
        }),

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
          const clue = currentClue(get().game!)
          const plan = planGuessExecution(res.guesses, clue?.number ?? 1)
          set({ aiBusy: false, aiGuessQueue: plan, planForClueIndex: game.clueHistory.length })
        } catch (e) {
          set({ aiBusy: false, error: aiMessage(e) })
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
          const after = applyEvent(game, { type: 'STOP_GUESSING' })
          set({ game: after, lastAiGuess: null })
          return
        }
        try {
          const after = applyEvent(game, { type: 'GUESS', wordId: next.wordId })
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
          const current = get().game
          if (!current || current.phase !== 'aiClueInput') return
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
          set({ aiBusy: false, error: aiMessage(e) })
        }
      },

      requestDebrief: async () => {
        const { game, lookedUp, debrief, aiBusy } = get()
        if (!game || game.phase !== 'finished' || debrief || aiBusy) return
        set({ aiBusy: true })
        try {
          const view = buildDebriefView(game, lookedUp)
          const res = await companion().getDebrief(view)
          set({ aiBusy: false, debrief: res, debriefFailed: false })
        } catch {
          set({ aiBusy: false, debriefFailed: true })
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
        useSrs.getState().recordRound(results, Date.now())
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
        debrief: s.debrief,
        debriefFailed: s.debriefFailed,
      }),
    },
  ),
)
