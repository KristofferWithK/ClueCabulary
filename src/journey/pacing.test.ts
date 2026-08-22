import { describe, expect, it } from 'vitest'
import { WORDS } from '../data/words'
import { BOARD } from '../engine/config'
import {
  applyEvent as applyEventIn,
  createGame,
  giverOf,
  isGuessable,
  remainingGreenIds,
  targetableGreenIds,
} from '../engine/game'
import { checkClueLegality } from '../engine/legality'
import { mulberry32, type Rng } from '../engine/rng'
import type { GameState } from '../engine/types'
import { danish } from '../lang/da'
import { WORDS_PER_CITY } from './cities'
import { isCollected, wordsForCity } from './progress'
import { applyRoundResults, practiceNeed } from '../srs/scheduler'
import { selectBoardWords } from '../srs/sampler'
import type { RoundWordResult, SrsMap } from '../srs/types'
import {
  WINS_PER_WRAP_UP,
  WRAP_UP_BANK_CAP,
  bankAfterRound,
  wrapUpBias,
  wrapUpUnlocked,
  wrapUpWords,
  type WrapUpBank,
} from './wrapup'

/**
 * HOW LONG A CITY TAKES, AND WHETHER THE WIN GATE IS ANYWHERE NEAR THE DOOR.
 *
 * This is the harness behind `WRAP_UP_BANK_CAP`'s table and behind
 * `WINS_PER_WRAP_UP` being three rather than one. It plays whole cities: the
 * real sampler deals the board, the real `createGame` deals the keys, the real
 * engine plays the round, the real scheduler records it, and greens are
 * credited to clue and guess exactly the way `finishRound` does — the credit
 * rule is copied below rather than imported, and `progress.test.ts` is what
 * pins the two readings of "collected" to each other.
 *
 * One skill dial, the same one `selfplay.test.ts` walks: the chance a guess
 * finds a word the clue-giver actually meant. One economy dial: how many won
 * normal rounds buy a wrap-up token.
 *
 * The player modelled here is GREEDY — it spends a token the moment it holds
 * one and the city has anything to pack. That is deliberately the pessimistic
 * reading of W1: it is the player who ignores the suitcase's advice to wait,
 * and every figure below is therefore a floor for a player who takes it.
 *
 * HONEST LIMITS. The guesser is a hash with a probability, not a person;
 * packing is assumed to succeed on every collected card, so no wrap-up ever
 * loses a word to a spelling; and no lookups are charged, so nothing is ever
 * demoted for cheating. Real play is slower than every number here. This is a
 * floor and an ORDERING — which gate binds, and whether rationing helps or
 * hurts — not a forecast of anybody's evening.
 *
 * The full sweep is opt-in because it plays about thirteen thousand rounds:
 *
 *   WRAPUP_PACING=1 npx vitest run src/journey/pacing.test.ts
 */

/** Read a knob without naming `process` — see selfplay.test.ts for why. */
const envVar = (name: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]

const applyEvent = (s: Parameters<typeof applyEventIn>[0], e: Parameters<typeof applyEventIn>[1]) =>
  applyEventIn(s, e, danish)

const CITY = 0
const cityWords = wordsForCity(WORDS, CITY)
const START = Date.UTC(2026, 0, 1)
/** One round an hour: enough spacing that box intervals mean something. */
const ROUND_MS = 60 * 60 * 1000
/** A run that has not finished a city by here is reported as not finishing. */
const MAX_ROUNDS = 400

/** A legal nonsense clue for whatever is on this board. */
function nonsenseClue(state: GameState, turn: number): string {
  for (let i = 0; i < 60; i++) {
    const candidate = `zxklodrup${turn}q${i}`
    if (checkClueLegality(candidate, state.words, danish).legal) return candidate
  }
  throw new Error('could not produce a legal clue')
}

/**
 * One round at a given skill, on the real engine — the same model
 * `selfplay.test.ts`'s `playSkilled` uses, so a win rate measured here is the
 * win rate measured there. Both sides clue for up to three of whatever they
 * have left; a guess finds a word the giver meant with probability `skill`,
 * and otherwise lands anywhere still open.
 */
function playSkilled(start: GameState, skill: number, rng: Rng): GameState {
  let s = start
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rng() * xs.length)]!
  for (let guard = 0; s.phase !== 'finished' && guard < 400; guard++) {
    if (s.phase === 'playerClueInput' || s.phase === 'aiClueInput') {
      const giver = giverOf(s.phase)
      s = applyEvent(s, {
        type: 'SUBMIT_CLUE',
        by: giver,
        text: nonsenseClue(s, s.clueHistory.length),
        number: Math.min(3, targetableGreenIds(s, giver).length),
      })
      continue
    }
    if (s.phase === 'playerGuessing' || s.phase === 'aiGuessing') {
      const meant = targetableGreenIds(s, giverOf(s.phase))
      const open = s.words.filter((w) => isGuessable(s, w.wordId))
      const right = meant.length > 0 && rng() < skill
      s = applyEvent(s, { type: 'GUESS', wordId: right ? pick(meant) : pick(open).wordId })
      continue
    }
    // The last chance: no giver, so a green on either key counts.
    const alive = remainingGreenIds(s).filter((id) => isGuessable(s, id))
    const open = s.words.filter((w) => isGuessable(s, w.wordId))
    const right = alive.length > 0 && rng() < skill
    s = applyEvent(s, { type: 'GUESS', wordId: right ? pick(alive) : pick(open).wordId })
  }
  return s
}

/**
 * The SRS results a finished round owes — the credit rule from `finishRound`,
 * copied verbatim in shape. A green under a clue `by: 'player'` is Casey
 * finding the player's word, so the player's CLUE earned it; a green under
 * `by: 'ai'` is the player's own tap; and a green that appears in no clue's
 * guesses was named in sudden death, which is guess credit.
 */
function resultsFor(game: GameState): RoundWordResult[] {
  const greenUnder = (side: 'player' | 'ai', wordId: string) =>
    game.clueHistory.some(
      (c) => c.by === side && c.guesses.some((g) => g.wordId === wordId && g.result === 'green'),
    )
  return game.words.map((w) => {
    const guessedGreen = game.reveals[w.wordId]!.kind === 'green'
    const greenByOwnClue = greenUnder('player', w.wordId)
    const greenByOwnGuess = greenUnder('ai', w.wordId) || (guessedGreen && !greenByOwnClue)
    return {
      wordId: w.wordId,
      guessedGreen,
      guessedWrong: game.clueHistory.some(
        (c) => c.by === 'ai' && c.guesses.some((g) => g.wordId === w.wordId && g.result !== 'green'),
      ),
      greenByOwnClue,
      greenByOwnGuess,
      lookedUp: false,
    }
  })
}

interface RunResult {
  /** Rounds played before every city word was collected; MAX_ROUNDS if never. */
  roundsToCollect: number
  /** Rounds played before every city word was wrapped. */
  roundsToWrap: number
  wrapUps: number
  /**
   * Rounds begun holding a token that could not be spent — the bank at its cap,
   * or nothing in the city to pack yet. Under the OLD two-gate rule this was
   * the early-city window where wins piled up against a board that could not be
   * dealt; W1 is expected to collapse it, and whether it does is the point of
   * measuring it.
   */
  idleTokenRounds: number
}

function playCity(seed: number, skill: number, winsPerToken: number): RunResult {
  let srs: SrsMap = {}
  const wrapped: Record<string, number> = {}
  let recent: string[][] = []
  let bank: WrapUpBank = { banked: 0, wins: 0 }
  let roundsToCollect = MAX_ROUNDS
  let roundsToWrap = MAX_ROUNDS
  let wrapUps = 0
  let idleTokenRounds = 0
  const rng = mulberry32(seed ^ Math.round(skill * 1000) ^ (winsPerToken << 16))

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const now = START + round * ROUND_MS
    const canDeal = wrapUpUnlocked(WORDS, srs, wrapped, CITY)
    if (bank.banked > 0 && (bank.banked >= WRAP_UP_BANK_CAP || !canDeal)) idleTokenRounds++

    const boardSeed = Math.floor(rng() * 0xffffffff)
    let game: GameState
    let wrappable: string[] = []
    const isWrapUp = bank.banked > 0 && canDeal
    if (isWrapUp) {
      const deal = wrapUpWords(WORDS, srs, wrapped, CITY, mulberry32(boardSeed ^ 0x9e3779b9))
      if (deal.words.length < BOARD.totalWords) break
      wrappable = deal.wrappable
      game = createGame({
        config: BOARD,
        words: deal.words.map((w) => ({ wordId: w.id, da: w.da, en: w.en, pos: w.pos })),
        seed: boardSeed,
        bias: wrapUpBias(deal.words, wrapped, new Set(wrappable)),
        greenPool: new Set(wrappable),
      })
      bank = { banked: bank.banked - 1, wins: bank.wins }
      wrapUps++
    } else {
      const entries = selectBoardWords(
        cityWords,
        srs,
        {
          totalWords: BOARD.totalWords,
          maxNewWordsPerBoard: BOARD.maxNewWordsPerBoard,
          collected: new Set(Object.keys(wrapped)),
          recentBoards: recent.map((b) => new Set(b)),
        },
        mulberry32(boardSeed ^ 0x9e3779b9),
        now,
      )
      recent = [entries.map((w) => w.id), ...recent].slice(0, 2)
      game = createGame({
        config: BOARD,
        words: entries.map((w) => ({ wordId: w.id, da: w.da, en: w.en, pos: w.pos })),
        seed: boardSeed,
        bias: {
          need: Object.fromEntries(
            entries.map((w) => [
              w.id,
              practiceNeed(srs[w.id], isCollected(srs[w.id], w.id in wrapped), now),
            ]),
          ),
        },
      })
    }

    const end = playSkilled(game, skill, rng)
    // A wrap-up wraps every card that was PACKED and ended green. Packing is
    // assumed to succeed, so "packed" is "wrappable" — see the honest limits.
    if (isWrapUp) {
      for (const id of wrappable) {
        if (end.reveals[id]!.kind === 'green') wrapped[id] = now
      }
    }
    srs = applyRoundResults(srs, resultsFor(end), now)
    if (!isWrapUp) {
      bank = bankAfterRoundAt(bank, end.outcome!.result === 'won', winsPerToken)
    }

    const collected = cityWords.filter((w) => isCollected(srs[w.id], w.id in wrapped)).length
    if (collected >= WORDS_PER_CITY && roundsToCollect === MAX_ROUNDS) roundsToCollect = round
    if (Object.keys(wrapped).length >= WORDS_PER_CITY) {
      roundsToWrap = round
      break
    }
  }
  return { roundsToCollect, roundsToWrap, wrapUps, idleTokenRounds }
}

/**
 * The shipped `bankAfterRound` with the price as a parameter, so the sweep can
 * walk it. At `winsPerToken === WINS_PER_WRAP_UP` it must agree with the
 * shipped function card for card — pinned below, so this cannot drift into
 * measuring an economy the game does not have.
 */
function bankAfterRoundAt(bank: WrapUpBank, won: boolean, winsPerToken: number): WrapUpBank {
  if (!won) return bank
  if (bank.banked >= WRAP_UP_BANK_CAP) return { banked: bank.banked, wins: 0 }
  const wins = bank.wins + 1
  if (wins < winsPerToken) return { banked: bank.banked, wins }
  return { banked: Math.min(bank.banked + 1, WRAP_UP_BANK_CAP), wins: 0 }
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}

function cell(skill: number, winsPerToken: number, runs: number): RunResult {
  const rs: RunResult[] = []
  for (let seed = 1; seed <= runs; seed++) rs.push(playCity(seed, skill, winsPerToken))
  return {
    roundsToCollect: median(rs.map((r) => r.roundsToCollect)),
    roundsToWrap: median(rs.map((r) => r.roundsToWrap)),
    wrapUps: median(rs.map((r) => r.wrapUps)),
    idleTokenRounds: median(rs.map((r) => r.idleTokenRounds)),
  }
}

describe('the wrap-up economy paces a city', () => {
  it('mirrors the shipped bank rule at the shipped price', () => {
    const cases: WrapUpBank[] = [
      { banked: 0, wins: 0 },
      { banked: 0, wins: 1 },
      { banked: 0, wins: 2 },
      { banked: 2, wins: 2 },
      { banked: WRAP_UP_BANK_CAP, wins: 0 },
    ]
    for (const b of cases) {
      expect(bankAfterRoundAt(b, true, WINS_PER_WRAP_UP)).toEqual(
        bankAfterRound(b, 'won', 'normal'),
      )
      expect(bankAfterRoundAt(b, false, WINS_PER_WRAP_UP)).toEqual(
        bankAfterRound(b, 'lost', 'normal'),
      )
    }
  })

  it(
    'never finishes wrapping before it finishes collecting — the win gate is not the door',
    () => {
      // The load-bearing claim of the table, at the shipped price, cheap enough
      // to run on every `npm test`. The sweep below is the whole table.
      const r = cell(0.7, WINS_PER_WRAP_UP, 2)
      expect(r.roundsToCollect).toBeLessThan(MAX_ROUNDS)
      expect(r.roundsToWrap).toBeLessThan(MAX_ROUNDS)
      expect(r.roundsToWrap).toBeGreaterThanOrEqual(r.roundsToCollect)
    },
    300_000,
  )

  it.runIf(envVar('WRAPUP_PACING'))(
    'prints the whole table',
    () => {
      const runs = Number(envVar('WRAPUP_PACING_RUNS') ?? 12)
      let out =
        `\nwhole cities, median of ${runs} runs a cell, city 1, W1's one gate\n` +
        'skill  wins/token   rounds to collect 100   rounds to wrap 100   wrap-ups   idle-token rounds\n'
      for (const skill of [0.6, 0.7, 0.8]) {
        for (const winsPerToken of [1, 2, 3]) {
          const r = cell(skill, winsPerToken, runs)
          out +=
            `${skill.toFixed(1).padStart(5)} ${String(winsPerToken).padStart(11)} ` +
            `${String(r.roundsToCollect).padStart(23)} ${String(r.roundsToWrap).padStart(20)} ` +
            `${String(r.wrapUps).padStart(10)} ${String(r.idleTokenRounds).padStart(19)}\n`
        }
      }
      console.log(out)
    },
    1_800_000,
  )
})
