import type { GridConfig } from './config'
import { distinctGreenIds, generateKeys } from './keygen'
import { checkClueLegality, type LegalityVerdict } from './legality'
import { gradeRedemption } from './redemption'
import { mulberry32 } from './rng'
import type { BoardWord, Clue, GameEvent, GameState, Phase, Side } from './types'

export class IllegalEventError extends Error {}

export class IllegalClueError extends Error {
  constructor(public verdict: LegalityVerdict) {
    super(verdict.reason ?? 'illegal clue')
  }
}

export function createGame(opts: {
  config: GridConfig
  words: BoardWord[]
  seed: number
  firstGiver?: Side
}): GameState {
  const { config, words, seed, firstGiver = 'player' } = opts
  if (words.length !== config.totalWords) {
    throw new Error(`board needs ${config.totalWords} words, got ${words.length}`)
  }
  const { playerKey, aiKey } = generateKeys(
    config,
    words.map((w) => w.wordId),
    mulberry32(seed),
  )
  return {
    config,
    seed,
    words,
    reveals: Object.fromEntries(words.map((w) => [w.wordId, { kind: 'hidden' as const }])),
    playerKey,
    aiKey,
    phase: firstGiver === 'player' ? 'playerClueInput' : 'aiClueInput',
    turnsLeft: config.turnTokens,
    clueHistory: [],
  }
}

/** The side whose key the current clue is judged against. */
export function giverOf(phase: Phase): Side {
  if (phase === 'playerClueInput' || phase === 'aiGuessing') return 'player'
  if (phase === 'aiClueInput' || phase === 'playerGuessing') return 'ai'
  throw new IllegalEventError(`no clue-giver in phase ${phase}`)
}

export function currentClue(state: GameState): Clue | undefined {
  return state.clueHistory[state.clueHistory.length - 1]
}

export function isGuessable(state: GameState, wordId: string): boolean {
  const reveal = state.reveals[wordId]
  if (!reveal) return false
  if (reveal.kind === 'hidden') return true
  if (reveal.kind === 'bystander') return !reveal.against.includes(giverOf(state.phase))
  return false
}

export function remainingGreenIds(state: GameState): string[] {
  return distinctGreenIds({ playerKey: state.playerKey, aiKey: state.aiKey }).filter(
    (id) => state.reveals[id]!.kind !== 'green',
  )
}

function endTurn(s: GameState, giver: Side): GameState {
  s.turnsLeft -= 1
  if (s.turnsLeft <= 0) {
    s.phase = 'finished'
    s.outcome = { result: 'lost', reason: 'timeout' }
  } else {
    s.phase = giver === 'player' ? 'aiClueInput' : 'playerClueInput'
  }
  return s
}

export function applyEvent(state: GameState, event: GameEvent): GameState {
  const s = structuredClone(state)

  switch (event.type) {
    case 'SUBMIT_CLUE': {
      const expected: Record<string, Side> = { playerClueInput: 'player', aiClueInput: 'ai' }
      if (expected[s.phase] !== event.by) {
        throw new IllegalEventError(`cannot submit ${event.by} clue in phase ${s.phase}`)
      }
      if (!Number.isInteger(event.number) || event.number < 1 || event.number > 4) {
        throw new IllegalEventError('clue number must be an integer 1-4')
      }
      const verdict = checkClueLegality(event.text, s.words)
      if (!verdict.legal) throw new IllegalClueError(verdict)
      s.clueHistory.push({
        by: event.by,
        text: event.text.trim(),
        number: event.number,
        targets: event.targets,
        rationale: event.rationale,
        guesses: [],
      })
      s.phase = event.by === 'player' ? 'aiGuessing' : 'playerGuessing'
      return s
    }

    case 'GUESS': {
      if (s.phase !== 'aiGuessing' && s.phase !== 'playerGuessing') {
        throw new IllegalEventError(`cannot guess in phase ${s.phase}`)
      }
      if (!isGuessable(s, event.wordId)) {
        throw new IllegalEventError(`word ${event.wordId} is not guessable`)
      }
      const giver = giverOf(s.phase)
      const clue = currentClue(s)
      if (!clue) throw new IllegalEventError('no active clue')
      const key = giver === 'player' ? s.playerKey : s.aiKey
      const role = key[event.wordId]
      if (!role) throw new IllegalEventError(`unknown word ${event.wordId}`)
      clue.guesses.push({ wordId: event.wordId, result: role })

      if (role === 'green') {
        s.reveals[event.wordId] = { kind: 'green' }
        if (remainingGreenIds(s).length === 0) {
          s.phase = 'finished'
          s.outcome = { result: 'won', reason: 'all-greens' }
          return s
        }
        // Duet rule: up to number + 1 guesses per clue.
        if (clue.guesses.length >= clue.number + 1) return endTurn(s, giver)
        return s
      }

      if (role === 'bystander') {
        const reveal = s.reveals[event.wordId]!
        if (reveal.kind === 'bystander') {
          if (!reveal.against.includes(giver)) reveal.against.push(giver)
        } else {
          s.reveals[event.wordId] = { kind: 'bystander', against: [giver] }
        }
        return endTurn(s, giver)
      }

      // Forbidden: one chance left — translate everything not already solved.
      s.reveals[event.wordId] = { kind: 'forbidden' }
      s.phase = 'redemption'
      s.redemption = {
        promptWordIds: s.words
          .filter((w) => s.reveals[w.wordId]!.kind !== 'green')
          .map((w) => w.wordId),
      }
      return s
    }

    case 'STOP_GUESSING': {
      if (s.phase !== 'aiGuessing' && s.phase !== 'playerGuessing') {
        throw new IllegalEventError(`cannot stop guessing in phase ${s.phase}`)
      }
      const clue = currentClue(s)
      if (!clue || clue.guesses.length === 0) {
        throw new IllegalEventError('must make at least one guess before stopping')
      }
      return endTurn(s, giverOf(s.phase))
    }

    case 'SUBMIT_REDEMPTION': {
      if (s.phase !== 'redemption' || !s.redemption) {
        throw new IllegalEventError(`cannot submit redemption in phase ${s.phase}`)
      }
      const prompted = s.words.filter((w) => s.redemption!.promptWordIds.includes(w.wordId))
      const results = gradeRedemption(event.answers, prompted)
      s.redemption.results = results
      s.phase = 'finished'
      s.outcome = results.every((r) => r.accepted)
        ? { result: 'won', reason: 'redeemed' }
        : { result: 'lost', reason: 'forbidden-failed' }
      return s
    }
  }
}
