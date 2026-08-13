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
import type { DebriefResponse, GuessResponse, TranslationResponse } from '../ai/schemas'
import { GRID_CONFIGS, type GridSize } from '../engine/config'
import { applyEvent, createGame, currentClue } from '../engine/game'
import { mulberry32 } from '../engine/rng'
import type { GameState } from '../engine/types'
import { selectBoardWords, selectDailyWords } from '../srs/sampler'
import type { RoundWordResult } from '../srs/types'
import { boardWordFor } from '../data/lookup'
import { WORDS, isKnownGloss } from '../data/words'
import { isLearned, studyPhaseEnabled, unlockedWords } from '../journey/progress'
import { useJourney } from './journeyStore'
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
  /**
   * The board just dealt, remembered so the NEXT one can avoid repeating it.
   * Persisted: a board dealt before the app was closed is still the last one
   * the player saw, and coming back to a near-identical board is exactly the
   * thing this prevents.
   */
  lastBoard: string[]
  roundRecorded: boolean
  /** Non-null while playing (or having finished) a daily challenge. */
  dailyKey: string | null
  /** Opening study phase: the whole board shown translated, before play. */
  studying: boolean
  debrief: DebriefResponse | null
  debriefFailed: boolean
  /** Words this round pushed over the line into the collection's green. */
  newlyLearned: string[]
  /**
   * Answers typed into the redemption challenge. Persisted because the phase
   * itself is: without this, one back gesture or a phone killing the app threw
   * away up to twenty typed answers in the one round that cannot be replayed.
   */
  redemptionDraft: Record<string, string>
  setRedemptionAnswer: (wordId: string, text: string) => void
  // Transient (not persisted):
  aiBusy: boolean
  aiGuessQueue: PlannedGuess[]
  /** clueHistory.length the current guess plan was made for — distinguishes "plan consumed" from "no plan yet". */
  planForClueIndex: number | null
  /** The guess currently being dramatized in the UI, just applied. */
  lastAiGuess: PlannedGuess | null
  error: string | null
  selectedWordId: string | null
  /**
   * Finish this round with the practice companion because Klaus could not be
   * reached. Deliberately per-round, not a settings change: a player who falls
   * back once during an outage must not find themselves quietly playing the
   * offline companion for good. Persisted so a reload mid-round does not walk
   * back into the same failure.
   */
  practiceFallback: boolean
  /** Give up on Klaus for this round and carry on offline. */
  fallBackToPractice: () => void

  newGame: (opts?: NewGameOptions) => void
  endStudy: () => void
  abandonGame: () => void
  submitPlayerClue: (text: string, number: number) => void
  selectWord: (wordId: string | null) => void
  playerGuess: (wordId: string) => void
  playerStop: () => void
  submitRedemption: (answers: Record<string, string>) => void
  recordLookup: (wordId: string) => void
  /**
   * Translate one word for the player, so a Danish clue can be composed
   * without leaving the round. Charges a lookup when the word turns out to be
   * on the board, and refuses outright while the dictionary is locked.
   */
  translate: (term: string) => Promise<TranslationResponse>
  /**
   * Charge a lookup if this term names a board word — for the answers that
   * come from the shipped dictionary rather than from Klaus. Without it the
   * offline half of the lookup field reads the board for free.
   */
  noteLookup: (term: string) => void
  runAiGuesses: () => Promise<void>
  stepAiGuess: () => void
  runAiClue: () => Promise<void>
  requestDebrief: () => Promise<void>
  finishRound: () => void
  clearError: () => void
}

function companion(practiceFallback = false): Companion {
  const s = useSettings.getState()
  if (s.useMock || practiceFallback) return new MockCompanion()
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
      lastBoard: [],
      roundRecorded: false,
      dailyKey: null,
      studying: false,
      debrief: null,
      debriefFailed: false,
      newlyLearned: [],
      redemptionDraft: {},
      practiceFallback: false,
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
              {
                totalWords: config.totalWords,
                maxNewWordsPerBoard: config.maxNewWordsPerBoard,
                collected: new Set(Object.keys(useJourney.getState().banked)),
                // Whatever the SRS weights want, at most three of these come
                // back — a board that repeats the last one does not feel like
                // a new board.
                previousBoard: new Set(get().lastBoard),
              },
              mulberry32(actualSeed ^ 0x9e3779b9),
              Date.now(),
            )
        // Steer the deal: words the player still struggles with become Klaus's
        // greens (so the player has to recall them), well-known ones become the
        // forbidden hazards. The daily challenge stays an unbiased shared board.
        const srsStats = useSrs.getState().stats
        const banked = useJourney.getState().banked
        const bias = opts?.dailyKey
          ? undefined
          : {
              need: Object.fromEntries(
                entries.map((w) => [
                  w.id,
                  practiceNeed(srsStats[w.id], isLearned(srsStats[w.id], w.id in banked), Date.now()),
                ]),
              ),
            }

        const game = createGame({
          config,
          words: entries.map((w) => ({
            wordId: w.id,
            da: w.da,
            en: w.en,
            pos: w.pos,
            article: w.article,
          })),
          seed: actualSeed,
          bias,
          ...(useUi.getState().pendingFirstGiver
            ? { firstGiver: useUi.getState().pendingFirstGiver! }
            : {}),
        })
        // A translation overlay left on would show answers from second one
        // without ever counting as lookups — every round starts covered.
        useUi.getState().resetTranslations()
        set({
          game,
          // Remembered for the NEXT deal, not this one.
          lastBoard: entries.map((w) => w.id),
          lookedUp: [],
          roundRecorded: false,
          dailyKey: opts?.dailyKey ?? null,
          // A deliberate preview is presentation, not a crutch, so it records
          // no lookups — the clean-guess credit survives it.
          studying: studyPhaseEnabled(settings.studyPhase, useJourney.getState().cityIndex),
          debrief: null,
          debriefFailed: false,
          newlyLearned: [],
          redemptionDraft: {},
          // Every round gets a fresh chance at Klaus.
          practiceFallback: false,
          aiGuessQueue: [],
          planForClueIndex: null,
          lastAiGuess: null,
          error: null,
          selectedWordId: null,
          aiBusy: false,
        })
      },

      endStudy: () => set({ studying: false }),

      setRedemptionAnswer: (wordId, text) =>
        set((s) => ({ redemptionDraft: { ...s.redemptionDraft, [wordId]: text } })),

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
          newlyLearned: [],
          redemptionDraft: {},
          practiceFallback: false,
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
        if (!game || (game.phase !== 'playerGuessing' && game.phase !== 'suddenDeath')) return
        const next = applyEvent(game, { type: 'GUESS', wordId })
        // Sudden death records nothing on a clue — there is no clue — so the
        // buzz comes from what the card turned out to be. Reading it off the
        // clue here threw on every sudden-death guess, because the last clue in
        // the history is whichever one ran the tokens out and it may have no
        // guesses at all.
        if (game.phase === 'suddenDeath') {
          const reveal = next.reveals[wordId]!
          buzz(reveal.kind === 'green' ? 'green' : reveal.kind === 'forbidden' ? 'forbidden' : 'bystander')
        } else {
          const clue = currentClue(next)
          buzz(clue!.guesses[clue!.guesses.length - 1]!.result)
        }
        set({ game: next, selectedWordId: null })
        if (next.phase === 'finished') get().finishRound()
      },

      playerStop: () => {
        const { game } = get()
        if (!game || (game.phase !== 'playerGuessing' && game.phase !== 'suddenDeath')) return
        const next = applyEvent(game, { type: 'STOP_GUESSING' })
        set({ game: next, selectedWordId: null })
        if (next.phase === 'finished') get().finishRound()
      },

      submitRedemption: (answers) => {
        const { game } = get()
        if (!game || game.phase !== 'redemption') return
        const next = applyEvent(game, {
          type: 'SUBMIT_REDEMPTION',
          answers,
          isKnownWord: isKnownGloss,
        })
        set({ game: next })
        get().finishRound()
      },

      recordLookup: (wordId) => {
        const { game, lookedUp, studying } = get()
        if (!game || game.phase === 'redemption') return
        // The opening study phase shows every translation anyway, so a tap
        // during it reveals nothing and must not spend the round's credit —
        // which is what Settings promises. Guarded here, not at the call site,
        // so no future entry point can quietly break the promise.
        if (studying) return
        if (!lookedUp.includes(wordId)) set({ lookedUp: [...lookedUp, wordId] })
      },

      noteLookup: (term) => {
        const { game } = get()
        if (!game || game.phase === 'redemption') return
        if (useJourney.getState().activeExam) return
        const hit = boardWordFor(term, game.words.map((w) => w.wordId))
        if (hit) get().recordLookup(hit)
      },

      translate: async (term) => {
        const { game, practiceFallback } = get()
        // The redemption challenge IS "translate the board with no dictionary",
        // and a travel exam is the same bargain. A translate field open during
        // either would not be a feature, it would be the answer key.
        if (game?.phase === 'redemption' || useJourney.getState().activeExam) {
          throw new AiError('invalid-response', 'The dictionary is closed until this is finished.')
        }
        const result = await companion(practiceFallback).translate(term)
        // Looking a board word up here costs exactly what tapping ⓘ costs.
        // Otherwise this field is a way to read the board for free.
        if (game) {
          const ids = game.words.map((w) => w.wordId)
          const hit = boardWordFor(term, ids) ?? boardWordFor(result.da, ids)
          if (hit) get().recordLookup(hit)
        }
        return result
      },

      runAiGuesses: async () => {
        const { game, aiBusy } = get()
        if (!game || game.phase !== 'aiGuessing' || aiBusy) return
        set({ aiBusy: true, error: null })
        try {
          const view = buildAiGuessView(game, useSettings.getState().clueLanguage)
          const res = await companion(get().practiceFallback).getGuesses(view)
          // Any event replaces the game object, so reference equality proves
          // this response still belongs to the current game and clue. A stale
          // response (user abandoned or started a new game mid-flight) is
          // dropped without touching state — the new game manages its own.
          if (get().game !== game) return
          const plan = planGuessExecution(res.guesses, currentClue(game)?.number ?? 1)
          // Klaus answered: ordinary play is proof the credentials work, so
          // Home stops asking the player to check them.
          useSettings.getState().markKlausVerified(Date.now())
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
          const res = await companion(get().practiceFallback).getClue(view)
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
          useSettings.getState().markKlausVerified(Date.now())
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
          const res = await companion(get().practiceFallback).getDebrief(view)
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
        // Turning a word green is the loop's atomic reward, and it happens
        // inside recordRound where nothing can see it. Straddle the call so the
        // round can tell the player what it earned them.
        const banked = useJourney.getState().banked
        const before = useSrs.getState().stats
        const wasLearned = new Set(
          game.words.filter((w) => isLearned(before[w.wordId], w.wordId in banked)).map((w) => w.wordId),
        )
        useSrs.getState().recordRound(results, finishedAt)
        const after = useSrs.getState().stats
        const newlyLearned = game.words
          .map((w) => w.wordId)
          .filter((id) => !wasLearned.has(id) && isLearned(after[id], id in banked))
        useSrs.getState().recordGame(game.outcome!)
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
        set({ roundRecorded: true, newlyLearned })
        void get().requestDebrief()
      },

      clearError: () => set({ error: null }),

      // Clearing the error is what restarts the turn, so this both switches
      // companions and resumes in one tap.
      fallBackToPractice: () => set({ practiceFallback: true, error: null }),
    }),
    {
      name: 'cluecab-game-v1',
      version: 1,
      partialize: (s) => ({
        game: s.game,
        lookedUp: s.lookedUp,
        lastBoard: s.lastBoard,
        roundRecorded: s.roundRecorded,
        dailyKey: s.dailyKey,
        studying: s.studying,
        debrief: s.debrief,
        debriefFailed: s.debriefFailed,
        newlyLearned: s.newlyLearned,
        redemptionDraft: s.redemptionDraft,
        practiceFallback: s.practiceFallback,
      }),
    },
  ),
)
