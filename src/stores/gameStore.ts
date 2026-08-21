import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AiError } from '../ai/client'
import { OllamaCompanion, planGuessExecution, type Companion } from '../ai/companion'
import { MockCompanion } from '../ai/mock/mockCompanion'
import { TutorialCompanion } from '../ai/tutorialCompanion'
import { buildAiClueView, buildAiGuessView, buildStoryView } from '../ai/projections'
import type { GuessResponse, StoryResponse, TranslationResponse } from '../ai/schemas'
import { GRID_CONFIGS, WRAPUP_CONFIG, type GridConfig, type GridSize } from '../engine/config'
import { applyEvent as applyEventIn, createGame, currentClue } from '../engine/game'
import { matchesAnswer } from '../engine/packing'
import { mulberry32 } from '../engine/rng'
import type { GameState } from '../engine/types'
import { selectBoardWords, selectDailyWords } from '../srs/sampler'
import type { RoundWordResult } from '../srs/types'
import { boardWordFor } from '../data/lookup'
import { WORDS, isHeadword, wordById } from '../data/words'
import { TUTORIAL_SEED, TUTORIAL_WORD_IDS } from '../onboarding/tutorial'
import { ACTIVE } from '../lang/active'
import { DEFAULT_LANGUAGE } from '../lang/index'
import type { LanguageCode } from '../lang/types'
import { isCollected, studyPhaseEnabled, wordsForCity } from '../journey/progress'
import { pickStoryTargets, useCoverage } from './coverageStore'
import { wrapUpBias, wrapUpWords, type RoundMode } from '../journey/wrapup'
import { flagsFor, useFeedback } from './feedbackStore'
import { useJourney } from './journeyStore'
import { practiceNeed } from '../srs/scheduler'
import { useSettings } from './settingsStore'
import { useSrs } from './srsStore'
import { useUi } from './uiStore'

/**
 * The engine takes the language pack as a parameter (H1) so it can stay free of
 * data; the app has exactly one active language, so it is bound once here
 * rather than at each of the six call sites.
 */
const applyEvent = (
  s: Parameters<typeof applyEventIn>[0],
  e: Parameters<typeof applyEventIn>[1],
) => applyEventIn(s, e, ACTIVE)

type PlannedGuess = GuessResponse['guesses'][number]

export interface NewGameOptions {
  seed?: number
  gridSize?: GridSize
  /** Set for the shared daily challenge (local date, e.g. "2026-08-12"). */
  dailyKey?: string
}

interface GameStore {
  game: GameState | null
  /**
   * The language the persisted round is in. Checked on rehydrate; a round in
   * another language is dropped rather than resumed. See `dropForeignGame`.
   */
  gameLanguage: LanguageCode
  /** Word ids looked up in the dictionary this round (SRS signal). */
  lookedUp: string[]
  /**
   * The last two boards dealt, newest first, so the next deal can put exactly
   * three words of the newest back and keep the rest off both.
   *
   * Two rather than one: three carried words that may carry again chain
   * forward, and the sampler needs to see the board before last to know which
   * three have already had their turn.
   *
   * Persisted: a board dealt before the app was closed is still the last one
   * the player saw, and coming back to a near-identical board is exactly the
   * thing this prevents.
   */
  recentBoards: string[][]
  roundRecorded: boolean
  /** Non-null while playing (or having finished) a daily challenge. */
  dailyKey: string | null
  /** Opening study phase: the whole board shown translated, before play. */
  studying: boolean
  /**
   * Wrap-up rounds deal from the city's collected words with every card
   * English-side up; the packing phase below is how they turn over. All
   * persisted: a wrap-up put down mid-packing resumes as itself.
   */
  mode: RoundMode
  /** Word ids translated to Danish during packing — face-up, wrappable. */
  packed: string[]
  /** Words whose FIRST packing attempt missed (an SRS demotion each). */
  packingMissed: string[]
  /** Set when every card is packed, or the player starts early regardless. */
  packingDone: boolean
  /** Words this round pushed over the line into the collection's green. */
  newlyLearned: string[]
  /**
   * Words this round was the player's FIRST sight of — never on a board
   * before. The test is the absence of an SRS record when the round started:
   * `finishRound` writes one for every word on a finished board, and
   * `wordState` reads the same absence as `undiscovered`, so the two agree by
   * construction rather than by a second rule kept in step by hand.
   */
  newlyDiscovered: string[]
  /**
   * Whether this round's ending put a wrap-up round in the bank — read off
   * the bank itself across `recordGame` rather than recomputed from the
   * outcome, so the summary cannot claim a reward the cap refused.
   *
   * A new persisted field rather than a version bump: every save ever written
   * lacks it, and zustand's merge is `{...initial, ...persisted}`, so a save
   * without it rehydrates to `false` — which is the true answer for a round
   * that finished before wins earned anything. The trap CLAUDE.md warns about
   * is the other one: CHANGING a default that every save already carries.
   */
  earnedWrapUp: boolean
  // Transient (not persisted):
  aiBusy: boolean
  /**
   * The post-round story (H5), and why it is transient: the summary is the
   * only reader, a reload after a finished round starts from Home anyway, and
   * a persisted story would need a migration story of its own for a feature
   * whose failure mode is already "show the example sentences instead".
   */
  story: StoryResponse | null
  storyStatus: 'idle' | 'loading' | 'ready' | 'off'
  /** What the coverage store asked this round's story to contain. */
  storyTargets: string[]
  /**
   * Ask Casey to weave the round's words into a story. Called by the summary
   * with the same word ids it shows sentences for; safe to call repeatedly —
   * only the first call after a round finishes does anything.
   */
  requestStory: (wordIds: readonly string[]) => Promise<void>
  aiGuessQueue: PlannedGuess[]
  /** clueHistory.length the current guess plan was made for — distinguishes "plan consumed" from "no plan yet". */
  planForClueIndex: number | null
  /** The guess currently being dramatized in the UI, just applied. */
  lastAiGuess: PlannedGuess | null
  error: string | null
  selectedWordId: string | null
  /**
   * Finish this round with the practice companion because Casey could not be
   * reached. Deliberately per-round, not a settings change: a player who falls
   * back once during an outage must not find themselves quietly playing the
   * offline companion for good. Persisted so a reload mid-round does not walk
   * back into the same failure.
   */
  practiceFallback: boolean
  /** Give up on Casey for this round and carry on offline. */
  fallBackToPractice: () => void

  newGame: (opts?: NewGameOptions) => void
  /**
   * A wrap-up round: WRAPUP_CONFIG, every word collected, nothing carried
   * over or remembered by the normal deal (recentBoards is untouched in both
   * directions — a carry-over quota could force uncollected words onto this
   * board, and remembering it would distort the next normal one).
   */
  newWrapUpGame: (opts?: { seed?: number }) => void
  /**
   * The onboarding tutorial round (O2): the real beginner board dealt from a
   * fixed word list and a fixed seed so the scripted commentary is pinnable,
   * with Casey giving the first clue — guessing is the low-friction act, so
   * the player learns it before cluing.
   */
  newTutorialGame: () => void
  /**
   * Grade one packing attempt. A hit flips the card; the first miss on a word
   * is recorded (SRS demotion at round end); retries are free — the gate
   * teaches, the round tests. Returns whether the answer packed the word.
   */
  submitPacking: (wordId: string, text: string) => boolean
  /** Start the clues with cards still unpacked — they stay English-side up
   *  all round and cannot wrap this round, even revealed green. */
  startRoundEarly: () => void
  /**
   * Throw this board away and deal another of the same size.
   *
   * "I want a reroll button at the beginning to reroll the board if I have no
   * idea on how to connect the words." Only before the first clue, and never on
   * the daily challenge, which is one shared board per date — a rerolled daily
   * would be nobody's board.
   */
  rerollBoard: () => void
  endStudy: () => void
  abandonGame: () => void
  submitPlayerClue: (text: string, number: number) => void
  selectWord: (wordId: string | null) => void
  playerGuess: (wordId: string) => void
  playerStop: () => void
  recordLookup: (wordId: string) => void
  /**
   * Translate one word for the player, so a Danish clue can be composed
   * without leaving the round. Charges a lookup when the word turns out to be
   * on the board, and refuses outright while the dictionary is locked.
   */
  translate: (term: string) => Promise<TranslationResponse>
  /**
   * Charge a lookup if this term names a board word — for the answers that
   * come from the shipped dictionary rather than from Casey. Without it the
   * offline half of the lookup field reads the board for free.
   */
  noteLookup: (term: string) => void
  /**
   * Is this word Danish? Asked of Casey when the shipped nine hundred cannot say.
   *
   * No new endpoint: translate() already tidies a Danish word to its citation
   * form and returns it as `da`, so a word that comes back as itself was
   * Danish and one that comes back as something else was not. «trafik» returns
   * trafik; «water» returns vand.
   */
  judgeTargetWord: (term: string) => Promise<boolean>
  runAiGuesses: () => Promise<void>
  stepAiGuess: () => void
  runAiClue: () => Promise<void>
  finishRound: () => void
  clearError: () => void
}

function companion(practiceFallback = false, mode: RoundMode = 'normal'): Companion {
  // The tutorial's Casey is scripted and offline by construction — the first
  // impression must never depend on the proxy. Mode outranks everything else,
  // including useMock: a drive running the tutorial under ?mock=1 must still
  // get the script, not hash-scrambled guesses.
  if (mode === 'tutorial') return new TutorialCompanion()
  const s = useSettings.getState()
  if (s.useMock || practiceFallback) return new MockCompanion()
  return new OllamaCompanion({ baseUrl: s.baseUrl, apiKey: s.apiKey, model: s.model })
}

/**
 * Is the thing playing Casey the practice companion rather than Casey?
 *
 * The screen used to answer this with `practiceFallback` alone, which is only
 * one of the two routes into the same object. A player with useMock set — which
 * ?mock=1 writes permanently into settings — got the mock in every round with
 * NOTHING on screen saying so, while useMock simultaneously suppressed both of
 * Home's setup warnings. Its guesses rank by djb2(clue + wordId), so what they
 * saw was a companion measured to be statistically indistinguishable from
 * naming a card at random, presented as Casey.
 */
export function onPracticeCompanion(practiceFallback: boolean): boolean {
  return useSettings.getState().useMock || practiceFallback
}

const aiMessage = (e: unknown): string =>
  e instanceof AiError ? e.message : 'Something went wrong talking to the AI companion.'

/**
 * Deal a board.
 *
 * `priorBoards` is what the carry-over rule reads: the boards that came BEFORE
 * this one, newest first. Split out of newGame so a reroll can hand it a
 * different answer to that question — see rerollBoard, where the board being
 * thrown away must not count as one the player has played.
 */
function dealBoard(
  config: GridConfig,
  seed: number,
  dailyKey: string | null,
  priorBoards: string[][],
  avoid?: ReadonlySet<string>,
): { game: GameState; wordIds: string[] } {
  // The daily challenge is the same board for everyone on that date: a seeded
  // uniform draw over the whole dataset, ignoring personal SRS. Journey rounds
  // (and free play) draw only from the current city's words — earlier cities
  // are reviewed by travelling back, not by them bleeding onto later boards
  // (owner decision, docs/clue-engine.md §3.4); the daily challenge stays
  // global so everyone gets the same board.
  const pool = wordsForCity(WORDS, useJourney.getState().cityIndex)
  const entries = dailyKey
    ? selectDailyWords(WORDS, config.totalWords, mulberry32(seed ^ 0x9e3779b9))
    : selectBoardWords(
        pool,
        useSrs.getState().stats,
        {
          totalWords: config.totalWords,
          maxNewWordsPerBoard: config.maxNewWordsPerBoard,
          collected: new Set(Object.keys(useJourney.getState().wrapped)),
          // Whatever the SRS weights want, exactly three words of the last
          // board come back and the rest of this one avoids both — a board that
          // repeats the last one does not feel like a new board, and one that
          // repeats nothing forgets too fast.
          recentBoards: priorBoards.map((b) => new Set(b)),
          // A rejected board is the opposite of a played one: the player said
          // they could not read those words, so they stay off this deal.
          ...(avoid ? { avoid } : {}),
        },
        mulberry32(seed ^ 0x9e3779b9),
        Date.now(),
      )
  // Steer the deal: words the player still struggles with become Casey's
  // greens, so the player has to recall them. (Well-known ones used to become
  // the forbidden hazards; with those gone they simply drift off both keys.)
  // The daily challenge stays an unbiased shared board.
  const srsStats = useSrs.getState().stats
  const wrapped = useJourney.getState().wrapped
  const bias = dailyKey
    ? undefined
    : {
        need: Object.fromEntries(
          entries.map((w) => [
            w.id,
            practiceNeed(srsStats[w.id], isCollected(srsStats[w.id], w.id in wrapped), Date.now()),
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
      gender: w.gender,
      countable: w.countable,
    })),
    seed,
    bias,
    ...(useUi.getState().pendingFirstGiver
      ? { firstGiver: useUi.getState().pendingFirstGiver! }
      : {}),
  })
  return { game, wordIds: entries.map((w) => w.id) }
}

/**
 * Everything a new board resets, whether it arrives from newGame or a reroll.
 *
 * A function rather than a constant: the empty array and object literals in
 * here would otherwise be one shared instance handed to every round.
 */
const freshRound = () => ({
  lookedUp: [] as string[],
  roundRecorded: false,
  newlyLearned: [] as string[],
  newlyDiscovered: [] as string[],
  earnedWrapUp: false,
  story: null as StoryResponse | null,
  storyStatus: 'idle' as const,
  storyTargets: [] as string[],
  // Every round gets a fresh chance at Casey.
  practiceFallback: false,
  aiGuessQueue: [] as PlannedGuess[],
  planForClueIndex: null,
  lastAiGuess: null,
  error: null,
  selectedWordId: null,
  aiBusy: false,
  // A normal round has nothing to pack; newWrapUpGame overrides all four.
  mode: 'normal' as const,
  packed: [] as string[],
  packingMissed: [] as string[],
  packingDone: true,
})

/**
 * A different board from the same starting point. An LCG step rather than the
 * clock, so a round dealt from ?seed= still rerolls reproducibly — and so a
 * reroll can never land on the seed it came from.
 */
const nextSeed = (seed: number) => (Math.imul(seed, 1664525) + 1013904223) >>> 0

// Two patterns, because there are two things a guess can be. The third — a
// long double buzz for a forbidden word — went with the forbidden words.
const buzz = (result: 'green' | 'bystander') => {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  navigator.vibrate(result === 'green' ? 15 : 40)
}

/**
 * v1 remembered one board under `lastBoard`. Without this the upgrade would
 * silently lose it — harmless (one board deals without a carry-over quota) but
 * avoidable, and an installed PWA updates under the player rather than at a
 * moment they chose.
 *
 * v2 -> v3: the wrap-up fields. An in-flight round from the old build is by
 * definition a normal one with nothing to pack, and resumes as such.
 *
 * v3 -> v4: forbidden words and the redemption phase are gone, and this is the
 * one migration that cannot preserve the round. A save written by the old build
 * may hold a key with `forbidden` on it, a `{kind: 'forbidden'}` reveal, a
 * `phase: 'redemption'` with typed answers beside it, or an outcome of
 * 'redeemed' — none of which the new types can represent, and all of which
 * would be read straight back onto the board. So the game is thrown away and
 * the player lands on Home with Play. One abandoned mid-round on the update is
 * the accepted cost; the alternative is a screen rendering roles that no longer
 * exist.
 *
 * recentBoards survives on purpose: it is only word ids, it carries no key
 * data, and keeping it means the board dealt after the update still honours the
 * carry-over rule.
 *
 * v4 -> v5: the debrief is gone. The round summary is written from the board
 * and the stores rather than asked of the model, so `debrief` and
 * `debriefFailed` are dropped and `newlyDiscovered` joins `newlyLearned`. The
 * round in flight is KEPT — nothing in it changed shape, and this is the first
 * of these migrations that costs the player nothing. The two dead keys are
 * deleted rather than left to rot: this store has a `partialize`, which writes
 * the blob back key for key, so a `debrief` object stored once would ride along
 * in every save a device ever wrote afterwards.
 *
 * Exported so it can be tested directly, like migrateSrs: under vitest there is
 * no localStorage, persist quietly becomes a passthrough, and a test reaching
 * through the middleware would be testing nothing.
 */
/**
 * A blank round, used by every path that has to throw one away. Named rather
 * than repeated so a field added to the store cannot be forgotten in one of
 * them.
 */
const noRound = {
  game: null,
  lookedUp: [],
  roundRecorded: false,
  dailyKey: null,
  studying: false,
  mode: 'normal' as const,
  packed: [],
  packingMissed: [],
  packingDone: true,
  newlyLearned: [],
  newlyDiscovered: [],
  earnedWrapUp: false,
  practiceFallback: false,
}

/**
 * A board of one language's words cannot be resumed in another: the cards are
 * in a language the player is no longer playing and the SRS would record the
 * round against the wrong collection. So the save is stamped, and a stamp that
 * disagrees with the active language throws the round away.
 *
 * Losing one mid-round on a language change is the same cost A1 accepted for
 * losing one on an update, and a language change is a far more deliberate act
 * than an update is.
 */
export function dropForeignGame<T extends { gameLanguage: LanguageCode }>(
  state: T,
  active: LanguageCode,
): T {
  if (state.gameLanguage === active) return state
  return { ...state, ...noRound, gameLanguage: active }
}

export function migrateGame(persisted: unknown, from: number): unknown {
  if (from >= 6) return persisted
  // v5 -> v6: the in-flight round learns which language it is in. Every save
  // written before the seam is Danish; stamping it as such keeps the round the
  // player is in the middle of, which is the whole reason to say it explicitly
  // rather than leaving the field undefined and dropping the board.
  if (from === 5) {
    return { ...((persisted ?? {}) as Record<string, unknown>), gameLanguage: DEFAULT_LANGUAGE }
  }
  if (from === 4) {
    const kept = { ...((persisted ?? {}) as Record<string, unknown>) }
    delete kept.debrief
    delete kept.debriefFailed
    return { ...kept, newlyDiscovered: [], gameLanguage: DEFAULT_LANGUAGE }
  }
  let p = persisted
  if (from < 2) {
    const { lastBoard, ...rest } = (p ?? {}) as { lastBoard?: string[] }
    p = { ...rest, recentBoards: lastBoard?.length ? [lastBoard] : [] }
  }
  const { recentBoards } = (p ?? {}) as { recentBoards?: string[][] }
  return {
    recentBoards: recentBoards ?? [],
    gameLanguage: DEFAULT_LANGUAGE,
    ...noRound,
  }
}

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      game: null,
      gameLanguage: ACTIVE.code,
      lookedUp: [],
      recentBoards: [],
      roundRecorded: false,
      dailyKey: null,
      studying: false,
      mode: 'normal',
      packed: [],
      packingMissed: [],
      packingDone: true,
      newlyLearned: [],
      newlyDiscovered: [],
      earnedWrapUp: false,
      story: null,
      storyStatus: 'idle',
      storyTargets: [],
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
        const dailyKey = opts?.dailyKey ?? null
        const prior = get().recentBoards
        const { game, wordIds } = dealBoard(config, actualSeed, dailyKey, prior)
        // A translation overlay left on would show answers from second one
        // without ever counting as lookups — every round starts covered.
        useUi.getState().resetTranslations()
        set({
          game,
          // Remembered for the NEXT deal, not this one. Two deep, which is all
          // the "a word may not carry over twice running" rule can use.
          recentBoards: [wordIds, ...prior].slice(0, 2),
          dailyKey,
          // A deliberate preview is presentation, not a crutch, so it records
          // no lookups — the clean-guess credit survives it.
          studying: studyPhaseEnabled(settings.studyPhase, useJourney.getState().cityIndex),
          ...freshRound(),
        })
      },

      newWrapUpGame: (opts) => {
        const journey = useJourney.getState()
        const seed = opts?.seed ?? useUi.getState().pendingSeed ?? Date.now() % 0xffffffff
        const entries = wrapUpWords(
          WORDS,
          useSrs.getState().stats,
          journey.wrapped,
          journey.cityIndex,
          mulberry32(seed ^ 0x9e3779b9),
        )
        // The CTA gates on wrapUpUnlocked; refusing here too keeps a stray
        // call from dealing a board the mode's invariant does not hold on.
        if (entries.length < WRAPUP_CONFIG.totalWords) return
        // And the round has to have been earned. Checked AFTER the deal is
        // known to be possible and in the same breath as spending, because the
        // one thing worse than a refused wrap-up is a token taken for a board
        // that never appeared. The CTA gates on this too; the store owns it
        // because spending and dealing must not be able to come apart.
        // (A reroll re-deals without coming through here — deliberately: the
        // token bought the round, not the particular twenty words.)
        if (!useSrs.getState().spendWrapUp()) return
        const game = createGame({
          config: WRAPUP_CONFIG,
          words: entries.map((w) => ({
            wordId: w.id,
            da: w.da,
            en: w.en,
            pos: w.pos,
            article: w.article,
            gender: w.gender,
            countable: w.countable,
          })),
          seed,
          bias: wrapUpBias(entries, journey.wrapped),
        })
        useUi.getState().resetTranslations()
        set({
          game,
          // recentBoards deliberately untouched: the carry-over rule is about
          // normal boards, and a wrap-up board is neither read from it nor
          // remembered by it.
          dailyKey: null,
          // Packing IS this round's study phase.
          studying: false,
          ...freshRound(),
          mode: 'wrapup',
          packingDone: false,
        })
      },

      newTutorialGame: () => {
        // The fixed list is Sønderborg's first twelve frequency ranks and the
        // seed was searched for the key layout the script narrates — see
        // src/onboarding/tutorial.ts; tutorial.test.ts pins both to the engine.
        const entries = TUTORIAL_WORD_IDS.map((id) => wordById(id)!)
        const game = createGame({
          config: GRID_CONFIGS.beginner,
          words: entries.map((w) => ({
            wordId: w.id,
            da: w.da,
            en: w.en,
            pos: w.pos,
            article: w.article,
            gender: w.gender,
            countable: w.countable,
          })),
          seed: TUTORIAL_SEED,
          firstGiver: 'ai',
        })
        const prior = get().recentBoards
        useUi.getState().resetTranslations()
        set({
          game,
          // Unlike a wrap-up, this board ENTERS the carry-over window: its
          // words are real first meetings, and the first real round carrying
          // three of them forward is the same continuity any round gets.
          recentBoards: [entries.map((w) => w.id), ...prior].slice(0, 2),
          dailyKey: null,
          // The tutorial IS the study phase — Casey introduces the board.
          studying: false,
          ...freshRound(),
          mode: 'tutorial',
        })
      },

      submitPacking: (wordId, text) => {
        const { game, mode, packingDone, packed, packingMissed } = get()
        if (!game || mode !== 'wrapup' || packingDone) return false
        const word = game.words.find((w) => w.wordId === wordId)
        if (!word || packed.includes(wordId)) return false
        if (matchesAnswer(text, word.da, ACTIVE, isHeadword)) {
          const nextPacked = [...packed, wordId]
          set({
            packed: nextPacked,
            // The last card packed opens the round by itself.
            packingDone: nextPacked.length === game.words.length,
          })
          buzz('green')
          return true
        }
        // The first miss is the honest signal; retries after reading the
        // right shape of the word teach, but they must not erase it.
        if (!packingMissed.includes(wordId)) set({ packingMissed: [...packingMissed, wordId] })
        buzz('bystander')
        return false
      },

      startRoundEarly: () => {
        const { game, mode } = get()
        if (!game || mode !== 'wrapup') return
        set({ packingDone: true })
      },

      rerollBoard: () => {
        const { game, dailyKey, mode, packed, packingMissed } = get()
        if (!game) return
        // Only at the beginning. Once a clue is on the table the round has a
        // history — tokens spent, words revealed, an SRS result owed — and
        // re-dealing under it would be a way to unsee a bad guess rather than a
        // way to read the board.
        if (game.clueHistory.length > 0) return
        // One shared board per date. A rerolled daily is nobody's board.
        if (dailyKey) return
        // A wrap-up rerolls only before the first packing ATTEMPT, hit or
        // miss: a miss is an SRS demotion owed, and re-dealing under it would
        // be a way to unsee it — the same reasoning as the clue rule above.
        if (mode === 'wrapup') {
          if (packed.length > 0 || packingMissed.length > 0) return
          const journey = useJourney.getState()
          const rejected = new Set(game.words.map((w) => w.wordId))
          const entries = wrapUpWords(
            WORDS,
            useSrs.getState().stats,
            journey.wrapped,
            journey.cityIndex,
            mulberry32(nextSeed(game.seed) ^ 0x9e3779b9),
            rejected,
          )
          if (entries.length < WRAPUP_CONFIG.totalWords) return
          const next = createGame({
            config: WRAPUP_CONFIG,
            words: entries.map((w) => ({
              wordId: w.id,
              da: w.da,
              en: w.en,
              pos: w.pos,
              article: w.article,
              gender: w.gender,
              countable: w.countable,
            })),
            seed: nextSeed(game.seed),
            bias: wrapUpBias(entries, journey.wrapped),
          })
          useUi.getState().resetTranslations()
          set({ game: next, ...freshRound(), mode: 'wrapup', packingDone: false })
          return
        }

        // REPLACE the head of recentBoards rather than push onto it. What the
        // carry-over rule is about is the board the player actually played, and
        // a board dealt ten seconds ago and rejected is not one. Pushing would
        // cost twice: the board before it would fall off the two-deep window,
        // losing the "a word may not carry over twice running" check, and the
        // reroll would come back holding three words of the very board the
        // player just said they could not read.
        //
        // One thing this genuinely gives up, and it is worth being explicit:
        // the window is two deep, so dropping the rejected board leaves the
        // sampler ONE board of history for this deal, and the "a word may not
        // carry over twice running" check has nothing to read. The board before
        // last was already gone — it fell off the window when the rejected
        // board was dealt — so the alternative is a three-deep persisted
        // window, which is a lot of shape for one relaxed check on one deal.
        const prior = get().recentBoards.slice(1)
        // And the board being thrown away is kept OFF the new one. Without
        // this the reroll answered the wrong question: it avoided the board
        // before and had no opinion about the one on screen, so a 3x4 reroll
        // came back measuring 7 of the same 12 words.
        const rejected = new Set(game.words.map((w) => w.wordId))
        const { game: next, wordIds } = dealBoard(
          game.config,
          nextSeed(game.seed),
          null,
          prior,
          rejected,
        )
        useUi.getState().resetTranslations()
        set({
          game: next,
          recentBoards: [wordIds, ...prior].slice(0, 2),
          // Recomputed, not carried: a new board gets whatever opening the
          // setting asks for, even if the discarded one was already studied.
          studying: studyPhaseEnabled(
            useSettings.getState().studyPhase,
            useJourney.getState().cityIndex,
          ),
          ...freshRound(),
        })
      },

      endStudy: () => set({ studying: false }),

      abandonGame: () => {
        useUi.getState().resetTranslations()
        set({
          game: null,
          dailyKey: null,
          studying: false,
          ...freshRound(),
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
          buzz(next.reveals[wordId]!.kind === 'green' ? 'green' : 'bystander')
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

      recordLookup: (wordId) => {
        const { game, lookedUp, studying, mode, packingDone } = get()
        if (!game) return
        // The packing phase IS "type the Danish with no dictionary" — an open
        // dictionary during it would be the answer key.
        if (mode === 'wrapup' && !packingDone) return
        // The opening study phase shows every translation anyway, so a tap
        // during it reveals nothing and must not spend the round's credit —
        // which is what Settings promises. Guarded here, not at the call site,
        // so no future entry point can quietly break the promise.
        if (studying) return
        if (!lookedUp.includes(wordId)) set({ lookedUp: [...lookedUp, wordId] })
      },

      noteLookup: (term) => {
        const { game, mode, packingDone } = get()
        if (!game) return
        if (mode === 'wrapup' && !packingDone) return
        const hit = boardWordFor(term, game.words.map((w) => w.wordId))
        if (hit) get().recordLookup(hit)
      },

      translate: async (term) => {
        const { game, practiceFallback, mode, packingDone } = get()
        // The packing phase IS "type the Danish with no dictionary". A
        // translate field open during it would not be a feature, it would be
        // the answer key. (The redemption challenge was the same bargain in the
        // other direction and shut this too; it no longer exists.)
        if (game && mode === 'wrapup' && !packingDone) {
          throw new AiError('invalid-response', 'The dictionary is closed until this is finished.')
        }
        const result = await companion(practiceFallback, mode).translate(term)
        // Looking a board word up here costs exactly what tapping ⓘ costs.
        // Otherwise this field is a way to read the board for free.
        if (game) {
          const ids = game.words.map((w) => w.wordId)
          const hit = boardWordFor(term, ids) ?? boardWordFor(result.da, ids)
          if (hit) get().recordLookup(hit)
        }
        return result
      },

      judgeTargetWord: async (term) => {
        const asked = await companion(get().practiceFallback, get().mode).translate(term)
        const norm = (x: string) => x.trim().toLowerCase()
        return norm(asked.da) === norm(term)
      },

      runAiGuesses: async () => {
        const { game, aiBusy } = get()
        if (!game || game.phase !== 'aiGuessing' || aiBusy) return
        set({ aiBusy: true, error: null })
        try {
          // Flags the player raised in past reviews travel with the request:
          // this is the only channel where "that was a bad call" reaches Casey.
          const view = buildAiGuessView(
            game,
            useSettings.getState().clueLanguage,
            flagsFor(useFeedback.getState().flags, ACTIVE.code),
          )
          const res = await companion(get().practiceFallback, get().mode).getGuesses(view)
          // Any event replaces the game object, so reference equality proves
          // this response still belongs to the current game and clue. A stale
          // response (user abandoned or started a new game mid-flight) is
          // dropped without touching state — the new game manages its own.
          if (get().game !== game) return
          const plan = planGuessExecution(res.guesses, currentClue(game)?.number ?? 1)
          // Casey answered: ordinary play is proof the credentials work, so
          // Home stops asking the player to check them.
          useSettings.getState().markClueyVerified(Date.now())
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
          // Casey's own account of the guess travels with it into the history,
          // so the round's turn log can say why he named that word rather than
          // another. It is the whole reason that log is worth expanding.
          const after = applyEvent(game, {
            type: 'GUESS',
            wordId: next.wordId,
            reasoning: next.reasoning,
            confidence: next.confidence,
          })
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
          const view = buildAiClueView(
            game,
            useSettings.getState().clueLanguage,
            flagsFor(useFeedback.getState().flags, ACTIVE.code),
          )
          const res = await companion(get().practiceFallback, get().mode).getClue(view)
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
          useSettings.getState().markClueyVerified(Date.now())
          set({ aiBusy: false, game: after })
        } catch (e) {
          if (get().game === game) set({ aiBusy: false, error: aiMessage(e) })
        }
      },

      requestStory: async (wordIds) => {
        const { game, storyStatus, mode, practiceFallback } = get()
        if (!game || game.phase !== 'finished' || storyStatus !== 'idle') return
        // Wrap-up rounds are the packing ritual over words already collected;
        // the story is for rounds that MET words. The practice companion
        // cannot write one worth reading, so those rounds keep the example
        // sentences — which is also what any failure below falls back to. The
        // tutorial ends on its own scripted line and is offline anyway.
        if (
          mode === 'wrapup' ||
          mode === 'tutorial' ||
          onPracticeCompanion(practiceFallback) ||
          wordIds.length === 0
        ) {
          set({ storyStatus: 'off' })
          return
        }
        const targets = pickStoryTargets(useCoverage.getState().met)
        set({ storyStatus: 'loading', storyTargets: targets })
        try {
          const story = await companion(practiceFallback).getStory(
            buildStoryView(game, wordIds, targets),
          )
          if (get().game !== game) return // a new round started under the request
          // Recorded only AFTER the companion verified the targets are really
          // in the text — the ledger holds what was shown, never what was asked.
          useCoverage.getState().recordStory(story)
          set({ story, storyStatus: 'ready' })
        } catch {
          // The round is over and the sentences are already on screen; a story
          // that could not be written is a shrug, not an error banner.
          if (get().game === game) set({ storyStatus: 'off' })
        }
      },

      finishRound: () => {
        const { game, lookedUp, roundRecorded, mode, packed, packingMissed } = get()
        if (!game || game.phase !== 'finished' || roundRecorded) return
        // A guess record's result is judged against the CLUE-GIVER's key
        // (engine/game.ts), so a green under a clue `by: 'player'` is Casey
        // finding the player's word — the player's CLUE earned it — and a
        // green under `by: 'ai'` is the player's own tap. Sudden death pushes
        // no guess record at all (the reducer writes the reveal and returns),
        // so a green reveal that appears in no clue's guesses was named by the
        // player with no clue-giver: guess credit.
        const greenUnder = (side: 'player' | 'ai', wordId: string) =>
          game.clueHistory.some(
            (c) =>
              c.by === side &&
              c.guesses.some((g) => g.wordId === wordId && g.result === 'green'),
          )
        const results: RoundWordResult[] = game.words.map((w) => {
          const guessedGreen = game.reveals[w.wordId]!.kind === 'green'
          // Only the player's own wrong guesses count against a word.
          const guessedWrong = game.clueHistory.some(
            (c) =>
              c.by === 'ai' &&
              c.guesses.some((g) => g.wordId === w.wordId && g.result !== 'green'),
          )
          const greenByOwnClue = greenUnder('player', w.wordId)
          const greenByOwnGuess = greenUnder('ai', w.wordId) || (guessedGreen && !greenByOwnClue)
          return {
            wordId: w.wordId,
            guessedGreen,
            guessedWrong,
            greenByOwnClue,
            greenByOwnGuess,
            lookedUp: lookedUp.includes(w.wordId),
            ...(mode === 'wrapup' ? { packingMissed: packingMissed.includes(w.wordId) } : {}),
          }
        })
        const finishedAt = Date.now()
        // The point of a wrap-up: every word that was PACKED (translated, not
        // skipped) and ended the round green goes into the suitcase for good.
        // The outcome beyond the reveals is irrelevant — what you packed stays
        // packed, win or lose.
        if (mode === 'wrapup') {
          const toWrap = game.words
            .filter((w) => packed.includes(w.wordId) && game.reveals[w.wordId]!.kind === 'green')
            .map((w) => w.wordId)
          if (toWrap.length > 0) useJourney.getState().wrapWords(toWrap, finishedAt)
        }
        // Collecting a word is the loop's atomic reward, and it happens inside
        // recordRound where nothing can see it. Straddle the call so the round
        // can tell the player what it earned them. (The persisted field keeps
        // its old name; renaming it buys a migration for a label.)
        const wrapped = useJourney.getState().wrapped
        const before = useSrs.getState().stats
        const wasCollected = new Set(
          game.words
            .filter((w) => isCollected(before[w.wordId], w.wordId in wrapped))
            .map((w) => w.wordId),
        )
        // The other half of the same reward, and the only moment it can be
        // read: recordRound gives EVERY word on this board an SRS record, so
        // afterwards a word met for the first time today is indistinguishable
        // from one met a year ago. Absence before the call is the whole test —
        // it is what `wordState` calls `undiscovered`.
        const newlyDiscovered = game.words
          .filter((w) => !before[w.wordId])
          .map((w) => w.wordId)
        useSrs.getState().recordRound(results, finishedAt)
        const after = useSrs.getState().stats
        const newlyLearned = game.words
          .map((w) => w.wordId)
          .filter((id) => !wasCollected.has(id) && isCollected(after[id], id in wrapped))
        // A won round earns a wrap-up round — the only way words get packed
        // for good, so winning advances the journey rather than just ending
        // the round. `mode` is what stops a wrap-up win from earning another
        // one; the daily challenge is a normal round and earns like any other.
        // Straddled like newlyLearned above, and for the same reason: at the
        // cap the win earns nothing, and the summary must not say otherwise.
        const bankBefore = useSrs.getState().wrapUpsBanked
        // The tutorial records no game: no play in the tally, no wins, no
        // wrap-up earn — R1's "first win is the unlock" stays the first REAL
        // round's moment. Its words still count in full: recordRound above ran
        // like any round, so discovered/collected and the carry-over window
        // are real (the card's "generous over strict").
        if (mode !== 'tutorial') useSrs.getState().recordGame(game.outcome!, mode)
        const earnedWrapUp = useSrs.getState().wrapUpsBanked > bankBefore
        const { dailyKey } = get()
        if (dailyKey) {
          // 'won' or 'lost' — 'redeemed' was a third value here and is not
          // written any more. Phones that played a daily before this build
          // still have it in localStorage; HomeScreen only ever interpolates
          // the string into an aria-label, so an old one reads back harmlessly.
          localStorage.setItem(
            `cluecab-daily:${dailyKey}`,
            game.outcome!.result === 'won' ? 'won' : 'lost',
          )
        }
        set({ roundRecorded: true, newlyLearned, newlyDiscovered, earnedWrapUp })
      },

      clearError: () => set({ error: null }),

      // Clearing the error is what restarts the turn, so this both switches
      // companions and resumes in one tap.
      fallBackToPractice: () => set({ practiceFallback: true, error: null }),
    }),
    {
      name: 'cluecab-game-v1',
      version: 6,
      migrate: migrateGame,
      // The language may have changed since this round was put down; the picker
      // reloads, so ACTIVE is already the new one by the time this runs.
      onRehydrateStorage: () => (state) => {
        if (state && state.gameLanguage !== ACTIVE.code) {
          useGame.setState(dropForeignGame(state, ACTIVE.code))
          return
        }
        // A tutorial round only makes sense inside the intro. One can outlive
        // it — a transient replay closed mid-round, or a skip that raced the
        // persist — and resuming it from Home would put the scripted dock on a
        // screen with no script. Dropped like a foreign-language round; the
        // SRS keeps whatever the finished part already recorded. uiStore is
        // initialised before this store (this module imports it), so the
        // intro decision is already made when rehydration runs.
        if (state && state.mode === 'tutorial' && !useUi.getState().onboarding) {
          useGame.setState({ ...state, ...noRound })
        }
      },
      partialize: (s) => ({
        game: s.game,
        gameLanguage: s.gameLanguage,
        lookedUp: s.lookedUp,
        recentBoards: s.recentBoards,
        roundRecorded: s.roundRecorded,
        dailyKey: s.dailyKey,
        studying: s.studying,
        mode: s.mode,
        packed: s.packed,
        packingMissed: s.packingMissed,
        packingDone: s.packingDone,
        newlyLearned: s.newlyLearned,
        newlyDiscovered: s.newlyDiscovered,
        earnedWrapUp: s.earnedWrapUp,
        practiceFallback: s.practiceFallback,
      }),
    },
  ),
)
