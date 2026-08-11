import type { CardRole, GameState, Reveal, Side } from '../engine/types'

/**
 * THE FIREWALL. These projections are the only game data the AI layer may see.
 * - AiClueView: the AI's OWN key, never the player's.
 * - AiGuessView: no key of any kind.
 * Enforced by tests: prompts built from these views are byte-identical under
 * permutations of the player's key (and of both keys, for the guess view).
 */

export interface PublicWord {
  id: string
  da: string
  en: string[]
  pos: string
  /** Reveal state is public — both players watched it happen. */
  reveal: Reveal
}

export interface PublicClue {
  by: Side
  text: string
  number: number
  guesses: { da: string; result: CardRole }[]
}

export interface AiClueView {
  kind: 'ai-clue'
  clueLanguage: 'da' | 'en'
  turnsLeft: number
  words: (PublicWord & { roleOnMyKey: CardRole })[]
  history: PublicClue[]
}

export interface AiGuessView {
  kind: 'ai-guess'
  clueLanguage: 'da' | 'en'
  turnsLeft: number
  words: PublicWord[]
  currentClue: { text: string; number: number }
  history: PublicClue[]
}

/** Post-game view for the debrief — the game is over, everything is public. */
export interface DebriefView {
  outcome: NonNullable<GameState['outcome']>
  words: (PublicWord & { onPlayerKey: CardRole; onAiKey: CardRole })[]
  history: { by: Side; text: string; number: number; targets?: string[]; rationale?: string; guesses: { da: string; result: CardRole }[] }[]
  lookedUpDa: string[]
}

const publicWord = (state: GameState, wordId: string): PublicWord => {
  const w = state.words.find((x) => x.wordId === wordId)!
  return { id: w.wordId, da: w.da, en: w.en, pos: w.pos, reveal: state.reveals[wordId]! }
}

/** History stripped of targets/rationale — they stay hidden until the debrief. */
const publicHistory = (state: GameState): PublicClue[] =>
  state.clueHistory.map((c) => ({
    by: c.by,
    text: c.text,
    number: c.number,
    guesses: c.guesses.map((g) => ({
      da: state.words.find((w) => w.wordId === g.wordId)!.da,
      result: g.result,
    })),
  }))

export function buildAiClueView(state: GameState, clueLanguage: 'da' | 'en'): AiClueView {
  return {
    kind: 'ai-clue',
    clueLanguage,
    turnsLeft: state.turnsLeft,
    words: state.words.map((w) => ({
      ...publicWord(state, w.wordId),
      roleOnMyKey: state.aiKey[w.wordId]!,
    })),
    history: publicHistory(state),
  }
}

export function buildAiGuessView(state: GameState, clueLanguage: 'da' | 'en'): AiGuessView {
  const clue = state.clueHistory[state.clueHistory.length - 1]
  if (!clue || clue.by !== 'player') throw new Error('AI guess view requires an active player clue')
  return {
    kind: 'ai-guess',
    clueLanguage,
    turnsLeft: state.turnsLeft,
    words: state.words.map((w) => publicWord(state, w.wordId)),
    currentClue: { text: clue.text, number: clue.number },
    history: publicHistory(state),
  }
}

export function buildDebriefView(state: GameState, lookedUpWordIds: string[]): DebriefView {
  if (!state.outcome) throw new Error('debrief requires a finished game')
  return {
    outcome: state.outcome,
    words: state.words.map((w) => ({
      ...publicWord(state, w.wordId),
      onPlayerKey: state.playerKey[w.wordId]!,
      onAiKey: state.aiKey[w.wordId]!,
    })),
    history: state.clueHistory.map((c) => ({
      by: c.by,
      text: c.text,
      number: c.number,
      targets: c.targets,
      rationale: c.rationale,
      guesses: c.guesses.map((g) => ({
        da: state.words.find((w) => w.wordId === g.wordId)!.da,
        result: g.result,
      })),
    })),
    lookedUpDa: lookedUpWordIds
      .map((id) => state.words.find((w) => w.wordId === id)?.da)
      .filter((da): da is string => !!da),
  }
}

/** Words the AI may legitimately target with its own clue (giver = 'ai'). */
export function aiTargetableIds(view: AiClueView): string[] {
  return view.words
    .filter((w) => w.roleOnMyKey === 'green' && isOpenFor(w.reveal, 'ai'))
    .map((w) => w.id)
}

/** Words the AI may guess under the player's clue (giver = 'player'). */
export function aiGuessableIds(view: AiGuessView): string[] {
  return view.words.filter((w) => isOpenFor(w.reveal, 'player')).map((w) => w.id)
}

function isOpenFor(reveal: Reveal, giver: Side): boolean {
  if (reveal.kind === 'hidden') return true
  if (reveal.kind === 'bystander') return !reveal.against.includes(giver)
  return false
}
