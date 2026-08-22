import { describe, expect, it } from 'vitest'
import { TutorialCompanion } from '../ai/tutorialCompanion'
import { planGuessExecution } from '../ai/companion'
import { buildAiClueView, buildAiGuessView } from '../ai/projections'
import { TUTORIAL_CONFIG } from '../engine/config'
import { applyEvent as applyEventIn, createGame, isGuessable } from '../engine/game'
import { checkClueLegality } from '../engine/legality'
import type { GameState } from '../engine/types'
import { WORDS, isHeadword, wordById } from '../data/words'
import { wordsForCity } from '../journey/progress'
import { danish } from '../lang/da'
import { conflicts } from '../srs/sampler'
import {
  TUTORIAL_AI_CLUES,
  TUTORIAL_AI_GUESSES,
  TUTORIAL_BEATS,
  TUTORIAL_CANNED_CLUES,
  TUTORIAL_ROLES,
  TUTORIAL_SEED,
  TUTORIAL_WORD_IDS,
  tutorialResumeIndex,
} from './tutorial'

/**
 * THE SCRIPT IS PINNED AGAINST THE ENGINE. This suite plays every beat of the
 * tutorial through `applyEvent` — Casey's clues through the real
 * TutorialCompanion and the real projections, his guesses through the real
 * plan — and asserts that each engine outcome is exactly what the commentary
 * claims at that beat. Flip a claim in tutorial.ts (an `expect`, a role, a
 * clue's targets) and this fails; the mutation checks run against it are
 * recorded in the commit that added it.
 *
 * Re-read game.test.ts ("a guess is judged against the clue-giver key, and
 * only that key") before touching either file: the miss beat and its payoff
 * are that rule taught forwards, and this suite is what keeps the tutorial
 * from ever teaching it backwards.
 */

const applyEvent = (s: GameState, e: Parameters<typeof applyEventIn>[1]) =>
  applyEventIn(s, e, danish)

const deal = (): GameState =>
  createGame({
    config: TUTORIAL_CONFIG,
    words: TUTORIAL_WORD_IDS.map((id) => {
      const w = wordById(id)!
      return {
        wordId: w.id,
        da: w.da,
        en: w.en,
        pos: w.pos,
        article: w.article,
        gender: w.gender,
        countable: w.countable,
      }
    }),
    seed: TUTORIAL_SEED,
    firstGiver: 'ai',
  })

const companion = new TutorialCompanion()

/** Casey composes exactly as the app does: view → companion → SUBMIT_CLUE. */
async function applyNextAiClue(s: GameState): Promise<GameState> {
  const res = await companion.getClue(buildAiClueView(s, 'target'))
  return applyEvent(s, {
    type: 'SUBMIT_CLUE',
    by: 'ai',
    text: res.clue,
    number: res.number,
    targets: res.targetWordIds,
    rationale: res.rationale,
  })
}

describe('the tutorial board', () => {
  it('is Sønderborg’s first twelve frequency ranks, in rank order', () => {
    expect(TUTORIAL_WORD_IDS).toEqual(wordsForCity(WORDS, 0).slice(0, 12).map((w) => w.id))
  })

  it('passes the sampler’s own conflict rules pairwise', () => {
    const entries = TUTORIAL_WORD_IDS.map((id) => wordById(id)!)
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        expect(
          conflicts(entries[i]!, entries[j]!),
          `${entries[i]!.id} vs ${entries[j]!.id}`,
        ).toBe(false)
      }
    }
  })

  it('deals the exact roles the script narrates, from the fixed seed', () => {
    const s = deal()
    const roleOf = (id: string) => `${s.playerKey[id]}/${s.aiKey[id]}`
    for (const id of TUTORIAL_ROLES.sharedGreens) expect(roleOf(id), id).toBe('green/green')
    for (const id of TUTORIAL_ROLES.playerOnlyGreens) expect(roleOf(id), id).toBe('green/bystander')
    for (const id of TUTORIAL_ROLES.aiOnlyGreens) expect(roleOf(id), id).toBe('bystander/green')
    for (const id of TUTORIAL_ROLES.bystanders) expect(roleOf(id), id).toBe('bystander/bystander')
    // …and the roles above cover the whole board, once each.
    expect(
      [
        ...TUTORIAL_ROLES.sharedGreens,
        ...TUTORIAL_ROLES.playerOnlyGreens,
        ...TUTORIAL_ROLES.aiOnlyGreens,
        ...TUTORIAL_ROLES.bystanders,
      ].sort(),
    ).toEqual([...TUTORIAL_WORD_IDS].sort())
  })

  it('deals identically twice — the seed really is the whole deal', () => {
    expect(deal().aiKey).toEqual(deal().aiKey)
    expect(deal().playerKey).toEqual(deal().playerKey)
  })

  it('every scripted clue is a dataset word OFF the board, and legal on it', () => {
    const s = deal()
    const onBoard = new Set(TUTORIAL_WORD_IDS)
    for (const clue of [...TUTORIAL_AI_CLUES, ...TUTORIAL_CANNED_CLUES]) {
      expect(isHeadword(clue.text), clue.text).toBe(true)
      const entry = WORDS.find((w) => w.da === clue.text)!
      expect(onBoard.has(entry.id), clue.text).toBe(false)
      expect(checkClueLegality(clue.text, s.words, danish).legal, clue.text).toBe(true)
    }
  })
})

describe('every beat, played through the engine', () => {
  it('matches what Casey’s commentary claims, beat by beat', async () => {
    let s = deal()
    expect(s.phase).toBe('aiClueInput') // firstGiver: 'ai' — guessing before cluing
    expect(s.config.turnTokens).toBe(5) // "we share five for the whole round"

    // "See the framed cards?" — the frames are the player-key greens.
    const framed = Object.keys(s.playerKey).filter((id) => s.playerKey[id] === 'green')
    expect(framed.sort()).toEqual(
      [...TUTORIAL_ROLES.playerOnlyGreens, ...TUTORIAL_ROLES.sharedGreens].sort(),
    )

    let aiGuessPlan: typeof TUTORIAL_AI_GUESSES = []
    for (const beat of TUTORIAL_BEATS) {
      // The app's effect composes Casey's clue the moment the phase asks for
      // it; the walk does the same so narration beats read the same state.
      if (s.phase === 'aiClueInput') {
        const before = s.clueHistory.filter((c) => c.by === 'ai').length
        s = await applyNextAiClue(s)
        const clue = s.clueHistory[s.clueHistory.length - 1]!
        const scripted = TUTORIAL_AI_CLUES[before]!
        expect(clue.text).toBe(scripted.text)
        // A clue may only point at his own unrevealed greens — the same
        // check the real companion path enforces.
        for (const id of scripted.targetWordIds) expect(s.aiKey[id], id).toBe('green')
      }

      if (beat.kind === 'guess') {
        expect(s.phase).toBe('playerGuessing') // giver is Casey: his key judges
        s = applyEvent(s, { type: 'GUESS', wordId: beat.wordId })
        const last = s.clueHistory[s.clueHistory.length - 1]!.guesses.at(-1)!
        expect(last.wordId).toBe(beat.wordId)
        // THE CLAIM: what the commentary says the engine will answer.
        expect(last.result, `guess ${beat.wordId}`).toBe(beat.expect)
      } else if (beat.kind === 'chooseClue') {
        expect(s.phase).toBe('playerClueInput')
        const picked = TUTORIAL_CANNED_CLUES[0]!
        s = applyEvent(s, {
          type: 'SUBMIT_CLUE',
          by: 'player',
          text: picked.text,
          number: picked.number,
        })
        expect(s.phase).toBe('aiGuessing')
        // Casey's guesses arrive the way the app plans them: companion →
        // planGuessExecution, capped by the clue's number.
        const res = await companion.getGuesses(buildAiGuessView(s, 'target'))
        aiGuessPlan = planGuessExecution(res.guesses, picked.number)
        expect(aiGuessPlan.map((g) => g.wordId)).toEqual(
          TUTORIAL_AI_GUESSES.map((g) => g.wordId),
        )
      } else if (beat.kind === 'watchGuess') {
        expect(s.phase).toBe('aiGuessing')
        const next = aiGuessPlan.shift()!
        expect(next.wordId).toBe(beat.wordId)
        s = applyEvent(s, {
          type: 'GUESS',
          wordId: next.wordId,
          reasoning: next.reasoning,
          confidence: next.confidence,
        })
        const last = s.clueHistory[s.clueHistory.length - 1]!.guesses.at(-1)!
        expect(last.result, `Casey guesses ${beat.wordId}`).toBe(beat.expect)
      }

      // The named claims, pinned at the exact position their line is spoken.
      if (beat.kind === 'guess' && beat.wordId === 'da:barn') {
        // "the guess misses and our turn is spent" — and the burn is
        // DIRECTIONAL: against Casey alone, because the clue was his.
        expect(s.reveals['da:barn']).toEqual({ kind: 'bystander', against: ['ai'] })
        expect(s.phase).toBe('playerClueInput') // the turn passed to the player
        expect(s.turnsLeft).toBe(4) // "that turn cost one clue token"
      }
      if (beat.kind === 'chooseClue') {
        // "under yours it is still alive" — the burned card is guessable the
        // moment the player's own clue is on the table.
        expect(isGuessable(s, 'da:barn')).toBe(true)
      }
      if (beat.kind === 'watchGuess' && beat.wordId === 'da:barn') {
        // "…green under YOURS — that is the whole rule", and "the turn ends
        // by itself" on the number-th find.
        expect(s.reveals['da:barn']).toEqual({ kind: 'green' })
        expect(s.phase).not.toBe('aiGuessing')
      }
      if (beat.kind === 'guess' && beat.wordId === 'da:vand') {
        // "Two of two — my turn ended by itself. Two tokens left." And the
        // player has nothing left to clue, so the giver stays Casey.
        expect(s.turnsLeft).toBe(2)
        expect(s.phase).toBe('aiClueInput')
      }
      if (beat.kind === 'win') {
        expect(s.phase).toBe('finished')
        expect(s.outcome).toEqual({ result: 'won', reason: 'all-greens' })
        // Won with tokens to spare — the tutorial never grazes sudden death.
        expect(s.turnsLeft).toBe(2)
      }
    }

    // Every scripted clue was used: three of Casey's, one of the player's.
    expect(s.clueHistory.map((c) => c.by)).toEqual(['ai', 'player', 'ai', 'ai'])
    expect(s.clueHistory.map((c) => c.text)).toEqual(['dyr', 'familie', 'drikke', 'sove'])
  })

  it('mentions each of Casey’s clue words in a bubble, so the copy and the script move together', () => {
    const spoken = TUTORIAL_BEATS.filter((b) => b.kind === 'say')
      .map((b) => b.text)
      .join(' ')
    for (const clue of TUTORIAL_AI_CLUES) expect(spoken).toContain(`«${clue.text}»`)
  })
})

describe('where a reload resumes', () => {
  const firstOfKind = (kind: string) => TUTORIAL_BEATS.findIndex((b) => b.kind === kind)

  it('starts at the top on an untouched round', () => {
    expect(tutorialResumeIndex(deal())).toBe(0)
  })

  it('resumes after the guesses the engine has evidence of', async () => {
    let s = await applyNextAiClue(deal())
    s = applyEvent(s, { type: 'GUESS', wordId: 'da:hund' })
    // One guess made: past the intro, past the audio beat, past the first
    // guess — at the narration that follows it.
    expect(tutorialResumeIndex(s)).toBe(firstOfKind('guess') + 1)
    s = applyEvent(s, { type: 'GUESS', wordId: 'da:barn' })
    const missAt = TUTORIAL_BEATS.findIndex((b) => b.kind === 'guess' && b.wordId === 'da:barn')
    expect(tutorialResumeIndex(s)).toBe(missAt + 1)
  })

  it('resumes past the clue choice once a player clue is on the record', async () => {
    let s = await applyNextAiClue(deal())
    s = applyEvent(s, { type: 'GUESS', wordId: 'da:hund' })
    s = applyEvent(s, { type: 'GUESS', wordId: 'da:barn' })
    s = applyEvent(s, { type: 'SUBMIT_CLUE', by: 'player', text: 'familie', number: 3 })
    expect(tutorialResumeIndex(s)).toBe(firstOfKind('chooseClue') + 1)
  })
})
