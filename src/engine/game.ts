import { type GridConfig } from './config'
import { distinctGreenIds, generateKeys, type KeyBias } from './keygen'
import { checkClueLegality, type LegalityVerdict } from './legality'
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
  /** Steers which words become the player's recall practice. */
  bias?: KeyBias
}): GameState {
  // The player opens. Cluey opened for one build, on the reasoning that a
  // round beginning with a guess lets the player meet the words before having
  // to compose a Danish clue about them. Played, it was worse: the round
  // starts with waiting, and the study phase already does the meeting. Back to
  // the player, who now decides when the round begins.
  const { config, words, seed, firstGiver = 'player', bias } = opts
  if (words.length !== config.totalWords) {
    throw new Error(`board needs ${config.totalWords} words, got ${words.length}`)
  }
  const { playerKey, aiKey } = generateKeys(
    config,
    words.map((w) => w.wordId),
    mulberry32(seed),
    bias,
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
  // Sudden death has no giver to judge against, so "burned for this side" does
  // not apply: a card that was neutral under one key can still be the other
  // side's green, and with no clues left that is exactly what you are hunting.
  if (state.phase === 'suddenDeath') return reveal.kind === 'hidden' || reveal.kind === 'bystander'
  if (reveal.kind === 'hidden') return true
  if (reveal.kind === 'bystander') return !reveal.against.includes(giverOf(state.phase))
  return false
}

export function remainingGreenIds(state: GameState): string[] {
  return distinctGreenIds({ playerKey: state.playerKey, aiKey: state.aiKey }).filter(
    (id) => state.reveals[id]!.kind !== 'green',
  )
}

/** Greens a side could still legitimately target with a clue of its own. */
export function targetableGreenIds(state: GameState, side: Side): string[] {
  const key = side === 'player' ? state.playerKey : state.aiKey
  return state.words
    .map((w) => w.wordId)
    .filter((id) => {
      if (key[id] !== 'green') return false
      const reveal = state.reveals[id]!
      if (reveal.kind === 'hidden') return true
      return reveal.kind === 'bystander' && !reveal.against.includes(side)
    })
}

function endTurn(s: GameState, giver: Side): GameState {
  s.turnsLeft -= 1
  if (s.turnsLeft <= 0) {
    // Duet's ending rather than a buzzer. The clues are spent, but the board
    // is still in front of you and you have been staring at it for four
    // rounds — so keep naming words, with nothing to go on but what the clues
    // already meant, and one wrong name ends it.
    s.phase = 'suddenDeath'
  } else {
    // The other side normally clues next — but a side whose greens are all
    // found has nothing to clue, so the same giver continues (Duet lets the
    // team choose clue order). Every remaining green is targetable by the
    // side that holds it, so at least one side can always clue.
    const other: Side = giver === 'player' ? 'ai' : 'player'
    const nextGiver = targetableGreenIds(s, other).length > 0 ? other : giver
    s.phase = nextGiver === 'player' ? 'playerClueInput' : 'aiClueInput'
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
      /**
       * Sudden death has no clue and no giver, so it is judged differently:
       * a word counts if it is green on EITHER key, and anything else loses on
       * the spot. Duet has the two players keep guessing on each other's cards
       * here, which needs a partner who can guess with no clue to go on —
       * Cluey cannot, and inventing a clueless AI turn would be a worse game
       * than letting the player name the board themselves. The greens on your
       * own key are the ones you can already see, so the tension is real: what
       * is left is whatever Cluey was pointing at and you never worked out.
       */
      if (s.phase === 'suddenDeath') {
        if (!isGuessable(s, event.wordId)) {
          throw new IllegalEventError(`word ${event.wordId} is not guessable`)
        }
        const isGreen =
          s.playerKey[event.wordId] === 'green' || s.aiKey[event.wordId] === 'green'
        if (isGreen) {
          s.reveals[event.wordId] = { kind: 'green' }
          if (remainingGreenIds(s).length === 0) {
            s.phase = 'finished'
            s.outcome = { result: 'won', reason: 'all-greens' }
          }
          return s
        }
        // Show what it was, so the ending is legible rather than just over.
        // Green on neither key means bystander on both, and there is no third
        // role left to distinguish — this used to branch for a forbidden word.
        s.reveals[event.wordId] = { kind: 'bystander', against: ['player', 'ai'] }
        s.phase = 'finished'
        s.outcome = { result: 'lost', reason: 'sudden-death' }
        return s
      }

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
      clue.guesses.push({
        wordId: event.wordId,
        result: role,
        // Undefined for the player's own taps; the AI's account of its own
        // guess rides along and is kept for the debrief.
        ...(event.reasoning ? { reasoning: event.reasoning } : {}),
        ...(event.confidence !== undefined ? { confidence: event.confidence } : {}),
      })

      if (role === 'green') {
        s.reveals[event.wordId] = { kind: 'green' }
        if (remainingGreenIds(s).length === 0) {
          s.phase = 'finished'
          s.outcome = { result: 'won', reason: 'all-greens' }
          return s
        }
        /**
         * The number is the whole allowance. Guess that many right and the turn
         * ends itself.
         *
         * Codenames and Duet both grant a bonus (number + 1)-th guess, and this
         * followed them — but the bonus is there to pick up a word left over
         * from an EARLIER clue, which is a move a player has to be told about to
         * ever make. In practice it read as the turn not ending: you guessed the
         * two words Cluey asked for, both green, and then nothing happened until
         * you found "Stop guessing". Asked for directly: "when you have guessed
         * the amount of words Cluey gives you the turn ends automatically."
         *
         * Stopping short is still yours to do — the button remains, and stopping
         * after one of three is a real decision. It is only the guess past the
         * number that is gone.
         */
        if (clue.guesses.length >= clue.number) return endTurn(s, giver)
        return s
      }

      // Not green on the giver's key, so it is a bystander there — the only
      // other thing a card can be. It costs the turn and nothing worse; there
      // used to be a third branch here where a forbidden word ended the round
      // outright, or opened the translate-everything last chance if enough
      // clues had been given.
      const reveal = s.reveals[event.wordId]!
      if (reveal.kind === 'bystander') {
        if (!reveal.against.includes(giver)) reveal.against.push(giver)
      } else {
        s.reveals[event.wordId] = { kind: 'bystander', against: [giver] }
      }
      return endTurn(s, giver)
    }

    case 'STOP_GUESSING': {
      // Walking away from sudden death is allowed and is a loss: it is the
      // difference between deciding you are beaten and being told you are.
      if (s.phase === 'suddenDeath') {
        s.phase = 'finished'
        s.outcome = { result: 'lost', reason: 'timeout' }
        return s
      }
      if (s.phase !== 'aiGuessing' && s.phase !== 'playerGuessing') {
        throw new IllegalEventError(`cannot stop guessing in phase ${s.phase}`)
      }
      const clue = currentClue(s)
      if (!clue || clue.guesses.length === 0) {
        throw new IllegalEventError('must make at least one guess before stopping')
      }
      return endTurn(s, giverOf(s.phase))
    }
  }
}
