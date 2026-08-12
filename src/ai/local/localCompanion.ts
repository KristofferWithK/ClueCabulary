import { checkClueLegality } from '../../engine/legality'
import { normalize } from '../../engine/text'
import type { BoardWord } from '../../engine/types'
import { conceptsOf as defaultConceptsOf } from '../../data/words'
import { AiError } from '../client'
import type { Companion } from '../companion'
import { CONCEPT_BY_NAME, CONCEPT_CLUES, type ConceptId } from './concepts'
import {
  aiGuessableIds,
  aiTargetableIds,
  type AiClueView,
  type AiGuessView,
  type DebriefView,
} from '../projections'
import type { ClueResponse, DebriefResponse, GuessResponse } from '../schemas'

/**
 * A companion that plays without a network, a key, or a model.
 *
 * MockCompanion exists to make drives deterministic and clues "mok1"; it was
 * never something a person could play against. This one is, because the
 * curated first city carries semantic tags: a clue is the name of a concept
 * covering several of Klaus's words and none of his forbidden ones, which is
 * exactly what a clue is.
 *
 * It is deliberately honest about what it cannot do. Reading a HUMAN's clue is
 * the hard direction — a person will not clue in concept names — so it matches
 * what it can, concept names and the glosses the board already carries, and
 * reports low confidence otherwise. That is what makes the app stop the turn
 * rather than blunder on into a forbidden word.
 */

/** How much a word other than my target costs if the clue would drag it in. */
const FORBIDDEN_COST = 100
const OPPONENT_GREEN_COST = 0.2 // finding one of these is not a disaster
const BYSTANDER_COST = 1.2

interface Scored {
  concept: ConceptId
  targets: string[]
  score: number
}

const boardWordsOf = (view: { words: { id: string; da: string; en: string[]; pos: string }[] }): BoardWord[] =>
  view.words.map((w) => ({ wordId: w.id, da: w.da, en: w.en, pos: w.pos }))

/** The first concept name this board will actually accept as a clue. */
function legalName(concept: ConceptId, language: 'da' | 'en', board: BoardWord[]): string | undefined {
  for (const name of CONCEPT_CLUES[concept][language]) {
    if (checkClueLegality(name, board).legal) return name
  }
  // Fall back to the other language rather than give up on a good concept:
  // a stray English clue beats no clue at all.
  const other = language === 'da' ? 'en' : 'da'
  for (const name of CONCEPT_CLUES[concept][other]) {
    if (checkClueLegality(name, board).legal) return name
  }
  return undefined
}

export class LocalCompanion implements Companion {
  /**
   * Tags are injected so this stays testable without the shipped dataset, and
   * so the class never reaches past the projection it was handed.
   */
  constructor(private conceptsOf: (id: string) => readonly ConceptId[] = defaultConceptsOf) {}

  async getClue(view: AiClueView): Promise<ClueResponse> {
    const targetable = new Set(aiTargetableIds(view))
    if (targetable.size === 0) {
      throw new AiError('invalid-response', 'Klaus has no words left to clue this round.')
    }
    const board = boardWordsOf(view)
    const unrevealed = view.words.filter((w) => w.reveal.kind !== 'green')

    // Score every concept by what it would drag in besides my own words.
    const candidates: Scored[] = []
    for (const [concept, ids] of conceptIndex(unrevealed.map((w) => w.id), this.conceptsOf)) {
      const mine = ids.filter((id) => targetable.has(id))
      if (mine.length === 0) continue
      let cost = 0
      for (const id of ids) {
        if (targetable.has(id)) continue
        const role = view.words.find((w) => w.id === id)?.roleOnMyKey
        cost +=
          role === 'forbidden' ? FORBIDDEN_COST : role === 'green' ? OPPONENT_GREEN_COST : BYSTANDER_COST
      }
      // Two words for one clue is the point of the game, so reward breadth
      // super-linearly — but never enough to outweigh a forbidden word.
      candidates.push({ concept, targets: mine.slice(0, 3), score: mine.length * 2 - cost })
    }

    candidates.sort((a, b) => b.score - a.score || a.concept.localeCompare(b.concept))
    for (const c of candidates) {
      if (c.score <= -FORBIDDEN_COST / 2) break // every remaining option touches a forbidden word
      const clue = legalName(c.concept, view.clueLanguage, board)
      if (!clue) continue
      return {
        clue,
        number: Math.min(c.targets.length, 4),
        targetWordIds: c.targets,
        rationale: `They are all ${c.concept}.`,
      }
    }

    // Nothing clean: clue a single word by any concept it has, accepting the
    // collateral. Better a risky clue than a turn Klaus cannot take.
    for (const id of targetable) {
      for (const concept of this.conceptsOf(id)) {
        const clue = legalName(concept, view.clueLanguage, board)
        if (clue) {
          return { clue, number: 1, targetWordIds: [id], rationale: `It is ${concept}.` }
        }
      }
    }
    throw new AiError('invalid-response', 'Klaus could not find a clue he is allowed to give.')
  }

  async getGuesses(view: AiGuessView): Promise<GuessResponse> {
    const guessable = aiGuessableIds(view)
    if (guessable.length === 0) {
      throw new AiError('invalid-response', 'Nothing left to guess.')
    }
    const clue = normalize(view.currentClue.text)
    const viaConcept = CONCEPT_BY_NAME.get(clue)

    const scored = guessable.map((id) => {
      // Only what the projection carries — the same board every player sees.
      const word = view.words.find((w) => w.id === id)
      const concepts = this.conceptsOf(id)
      let score = 0
      let why = 'nothing much points here'
      if (viaConcept && concepts.includes(viaConcept)) {
        score = 3
        why = `it is ${viaConcept}, which is what the clue names`
      } else if (word) {
        const haystack = normalize(word.en.join(' '))
        // Whole-word match only: "ear" must not fire on "year".
        if (clue.length >= 3 && new RegExp(`\\b${escapeRegExp(clue)}\\b`).test(haystack)) {
          score = 2
          why = 'the clue is what this word means'
        } else if (clue.length >= 4 && haystack.includes(clue)) {
          score = 1
          why = 'the clue looks related to what this word means'
        }
      }
      return { wordId: id, score, reasoning: why }
    })

    scored.sort((a, b) => b.score - a.score || a.wordId.localeCompare(b.wordId))
    const best = scored[0]!.score
    if (best === 0) {
      // Say so, at a confidence the app reads as "rather stop than guess".
      return {
        guesses: scored.slice(0, 2).map((s) => ({
          wordId: s.wordId,
          confidence: 0.2,
          reasoning: 'Klaus has no idea what that clue points at.',
        })),
      }
    }
    const confidenceFor = (score: number) => (score >= 3 ? 0.85 : score === 2 ? 0.6 : score === 1 ? 0.4 : 0.15)
    return {
      guesses: scored
        .filter((s) => s.score > 0)
        .slice(0, 4)
        .map((s) => ({ wordId: s.wordId, confidence: confidenceFor(s.score), reasoning: s.reasoning })),
    }
  }

  async getDebrief(view: DebriefView): Promise<DebriefResponse> {
    const found = view.words.filter((w) => w.reveal.kind === 'green').length
    const missed = view.words.filter((w) => w.reveal.kind !== 'green' && (w.onPlayerKey === 'green' || w.onAiKey === 'green'))
    const outcome =
      view.outcome.result === 'won'
        ? view.outcome.reason === 'redeemed'
          ? 'We got there on the translation challenge — that counts.'
          : 'Every green word found. Cleanly done.'
        : view.outcome.reason === 'timeout'
          ? 'The clues ran out before we found them all.'
          : 'A forbidden word, and the challenge did not save us.'
    const lookedUp = new Set(view.lookedUpDa)
    const takeaways = [
      ...missed.slice(0, 3).map((w) => `${w.da} — "${w.en[0]}". We left this one on the board.`),
      ...view.words
        .filter((w) => lookedUp.has(w.da))
        .slice(0, 2)
        .map((w) => `${w.da} — "${w.en[0]}". You looked this one up; worth a second pass.`),
    ]
    return {
      summary: `${outcome} ${found} of ${view.words.length} words turned green.`,
      takeaways: takeaways.length ? takeaways.slice(0, 6) : ['Nothing left over — a clean board.'],
    }
  }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** concept → the ids on this board carrying it. */
function conceptIndex(
  ids: readonly string[],
  conceptsOf: (id: string) => readonly ConceptId[],
): Map<ConceptId, string[]> {
  const index = new Map<ConceptId, string[]>()
  for (const id of ids) {
    for (const concept of conceptsOf(id)) {
      const list = index.get(concept)
      if (list) list.push(id)
      else index.set(concept, [id])
    }
  }
  return index
}
