import type { CardRole, GameState, Reveal, Side } from '../engine/types'
import type { ClueLanguageSetting } from '../lang/types'

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

/**
 * What the player marked as a bad call in a past round's review.
 *
 * Carries no key data of any kind — a clue word, a Danish board word, and the
 * account Casey himself gave — so it passes the firewall by construction. It
 * is here rather than in the store because prompts may only read projections.
 */
export interface FlaggedCall {
  kind: 'clue' | 'guess'
  what: string
  underClue?: string
  why?: string
}

export interface AiClueView {
  kind: 'ai-clue'
  clueLanguage: ClueLanguageSetting
  turnsLeft: number
  words: (PublicWord & { roleOnMyKey: CardRole })[]
  history: PublicClue[]
  /** Past calls the player flagged. Empty when there are none. */
  flagged: FlaggedCall[]
}

export interface AiGuessView {
  kind: 'ai-guess'
  clueLanguage: ClueLanguageSetting
  turnsLeft: number
  words: PublicWord[]
  currentClue: { text: string; number: number }
  history: PublicClue[]
  /** Past calls the player flagged. Empty when there are none. */
  flagged: FlaggedCall[]
}

const publicWord = (state: GameState, wordId: string): PublicWord => {
  const w = state.words.find((x) => x.wordId === wordId)!
  return { id: w.wordId, da: w.da, en: w.en, pos: w.pos, reveal: state.reveals[wordId]! }
}

/**
 * History stripped of targets/rationale. They stay hidden until the round is
 * over, where the summary's turn log reads them straight off the game state —
 * there is no longer a projection carrying them to the model, because nothing
 * is asked of the model once the round ends.
 */
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

export function buildAiClueView(
  state: GameState,
  clueLanguage: ClueLanguageSetting,
  flagged: readonly FlaggedCall[] = [],
): AiClueView {
  return {
    kind: 'ai-clue',
    clueLanguage,
    turnsLeft: state.turnsLeft,
    words: state.words.map((w) => ({
      ...publicWord(state, w.wordId),
      roleOnMyKey: state.aiKey[w.wordId]!,
    })),
    history: publicHistory(state),
    flagged: flagged.map(({ kind, what, underClue, why }) => ({ kind, what, underClue, why })),
  }
}

export function buildAiGuessView(
  state: GameState,
  clueLanguage: ClueLanguageSetting,
  flagged: readonly FlaggedCall[] = [],
): AiGuessView {
  const clue = state.clueHistory[state.clueHistory.length - 1]
  if (!clue || clue.by !== 'player') throw new Error('AI guess view requires an active player clue')
  return {
    kind: 'ai-guess',
    clueLanguage,
    turnsLeft: state.turnsLeft,
    words: state.words.map((w) => publicWord(state, w.wordId)),
    currentClue: { text: clue.text, number: clue.number },
    history: publicHistory(state),
    flagged: flagged.map(({ kind, what, underClue, why }) => ({ kind, what, underClue, why })),
  }
}

/** Words the AI may legitimately target with its own clue (giver = 'ai'). */
/**
 * What the story prompt may see: the round's already-revealed green words and
 * the function words the coverage store wants woven in. Nothing else — no
 * reveal states, no keys, no history. The round is over when this is built,
 * but the firewall holds anyway: the builder reads only the public face of
 * the words it is handed, so permuting either key cannot change a byte of it
 * (pinned in projections.test.ts).
 */
export interface StoryView {
  kind: 'story'
  words: { da: string; en: string[]; pos: string }[]
  /** Function words the story must contain, e.g. ['hvis', 'fordi']. */
  targets: string[]
}

export function buildStoryView(
  state: GameState,
  wordIds: readonly string[],
  targets: readonly string[],
): StoryView {
  return {
    kind: 'story',
    words: wordIds.map((id) => {
      const w = state.words.find((x) => x.wordId === id)!
      return { da: w.da, en: w.en, pos: w.pos }
    }),
    targets: [...targets],
  }
}

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
