import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS } from '../engine/config'
import { applyEvent as applyEventIn, createGame } from '../engine/game'
import type { BoardWord, GameState } from '../engine/types'
import { aiTargetableIds, buildAiClueView, buildAiGuessView } from './projections'
import { buildCluePrompt as buildCluePromptIn, buildGuessPrompt as buildGuessPromptIn } from './prompts'
import { danish } from '../lang/da'

/**
 * The prompt builders take the language pack now (H1). Bound to Danish here so
 * every assertion below keeps testing the prompt it was written against.
 */
const buildCluePrompt = (v: Parameters<typeof buildCluePromptIn>[0]) =>
  buildCluePromptIn(v, danish)
const buildGuessPrompt = (v: Parameters<typeof buildGuessPromptIn>[0]) =>
  buildGuessPromptIn(v, danish)

/**
 * The engine takes the language pack now (H1). Wrapped here so the suite's
 * call sites stay exactly as they were and keep pinning what they pinned.
 */
const applyEvent = (s: Parameters<typeof applyEventIn>[0], e: Parameters<typeof applyEventIn>[1]) =>
  applyEventIn(s, e, danish)

const words = (n: number): BoardWord[] =>
  Array.from({ length: n }, (_, i) => ({
    wordId: `w${i}`,
    da: `dansk${i}ord${i}`,
    en: [`gloss${i}word${i}`],
    pos: 'noun',
  }))

const start = (): GameState =>
  createGame({
    config: GRID_CONFIGS.beginner,
    words: words(GRID_CONFIGS.beginner.totalWords),
    seed: 7,
    firstGiver: 'ai',
  })

// The instructions are the system message and the board is the user message;
// what Casey reads is both, so these assertions read both.
const textOf = (msgs: { content: string }[]) => msgs.map((m) => m.content).join('\n')
const promptFor = (s: GameState) => textOf(buildCluePrompt(buildAiClueView(s, 'en')))
const lineFor = (text: string, id: string) =>
  text.split('\n').find((l) => l.startsWith(`${id} |`)) ?? `(no row for ${id})`

/** Play until one of Casey's own greens has been found, so it is spent. */
function findOneOfHisGreens(s: GameState): { state: GameState; found: string } {
  const target = s.words.map((w) => w.wordId).find((id) => s.aiKey[id] === 'green')!
  let next = applyEvent(s, { type: 'SUBMIT_CLUE', by: 'ai', text: 'klods', number: 1 })
  next = applyEvent(next, { type: 'GUESS', wordId: target })
  return { state: next, found: target }
}

/**
 * Reported from a real game, twice over: Casey asked for a word he had already
 * found, the validator refused it, the one corrective retry made the same
 * mistake, and the round ended on "The AI kept answering invalidly: w1 (bog) is
 * not an unrevealed GREEN word on your key".
 *
 * The board table was the cause. It printed "revealed green" in one column and
 * "my key: GREEN" in another and left the model to intersect them, which is
 * exactly the kind of two-column inference a smaller model skips. It is spelled
 * out per row now, and the targetable ids are listed once at the top where they
 * cannot be missed.
 */
describe('the clue prompt says which words are actually targetable', () => {
  it('lists them explicitly, by id and Danish word', () => {
    const s = start()
    const view = buildAiClueView(s, 'en')
    const text = promptFor(s)
    for (const id of aiTargetableIds(view)) {
      const da = view.words.find((w) => w.id === id)!.da
      expect(text).toContain(`${id} (${da})`)
    }
  })

  it('marks a green Casey has already found as spent, in words, on its own row', () => {
    const { state, found } = findOneOfHisGreens(start())
    const text = promptFor(state)
    const row = lineFor(text, found)
    expect(row).toContain('ALREADY FOUND')
    expect(row).not.toContain('YOU MAY TARGET THIS')
    // And it is not in the list of ids he may name. Matched with the Danish
    // word attached, because "w1" is a substring of "w10".
    const header = text.split('\n').find((l) => l.startsWith('THE ONLY WORDS YOU MAY NAME'))!
    const da = state.words.find((w) => w.wordId === found)!.da
    expect(header).not.toContain(`${found} (${da})`)
  })

  it('marks the ones he may still take', () => {
    const s = start()
    const targetable = aiTargetableIds(buildAiClueView(s, 'en'))
    const text = promptFor(s)
    for (const id of targetable) expect(lineFor(text, id)).toContain('YOU MAY TARGET THIS')
  })
})

/**
 * WHAT THIS FILE USED TO HOLD, and what replaced it.
 *
 * A block here pinned the FORBIDDEN FOR YOU section of the clue prompt: that
 * Casey's own hazards were named in a block of their own rather than only in
 * the board table, that the association test came with the player's own example
 * ("kitchen" fetches "food") attached, and that an already-hit hazard dropped
 * out of the list. A second block pinned which boards dealt a card that was
 * green on one key and forbidden on the other.
 *
 * Those cards are gone from every board, so all of it asserted the presence of
 * prompt text that must no longer be there — the opposite of what is wanted.
 * What took its place is the block below: with two roles left, the neutrals are
 * the only trap on the board, and the instruction telling Casey to hunt for
 * them before he commits is now the only thing standing between a clue and the
 * turn it throws away. That instruction is what this file guards now.
 */

/**
 * The lookahead, pinned.
 *
 * It is a paragraph of prose in a prompt, which is the easiest kind of thing in
 * this repo to lose: nothing breaks when it goes, the model keeps answering,
 * and the clues get quietly worse in a way no other test can see. So the three
 * load-bearing halves are asserted separately — scoring every non-target, the
 * rule for what to do when one of them wins, and naming the riskiest of them in
 * the rationale the player actually reads.
 *
 * Checked by reverting, twice, because the three do not share a failure mode.
 * Replacing the lookahead bullet with the one-sentence version it grew out of
 * ("read EVERY other unrevealed word ... if a non-target fits as well as or
 * better than a target, the clue is wrong: pick another") fails the first two
 * and leaves the third passing: the rationale demand lives in the JSON spec
 * line, a separate edit away, so it took its own mutation — reverting that line
 * to "the strongest board word you deliberately steered away from" fails the
 * third and nothing else.
 */
describe('the clue prompt makes Casey score the neutrals before he commits', () => {
  it('demands every non-target be scored against the candidate clue', () => {
    const text = promptFor(start())
    expect(text).toMatch(/EVERY unrevealed word on the board that is not one of your targets/)
    expect(text).toMatch(/scoring each for how well the clue fits it/i)
  })

  it('says what to do when a neutral scores as well as a target: change the clue', () => {
    expect(promptFor(start())).toMatch(/fits as well as or better than any target does, the clue is wrong/i)
  })

  it('makes him name the single riskiest neutral in the rationale', () => {
    const text = promptFor(start())
    expect(text).toMatch(/riskiest neutral/i)
    // Demanded of the rationale specifically — the field the player reads after
    // the round — not just mentioned somewhere in the instructions.
    const spec = text.split('\n').find((l) => l.includes('"rationale"'))!
    expect(spec).toMatch(/riskiest neutral/i)
  })
})

/**
 * The board can be dealt so that every one of Casey's greens is also a word he
 * cannot reach — the prompt still has to be a legal string. Guarded because the
 * targetable list is interpolated from an array that the caller has already
 * refused to let be empty, and a guard that only exists in the caller is one
 * refactor away from not existing.
 */
describe('the prompt survives a board with nothing to say', () => {
  it('renders without throwing when nothing is targetable', () => {
    const s = start()
    const view = buildAiClueView(s, 'en')
    const stripped = { ...view, words: view.words.map((w) => ({ ...w, roleOnMyKey: 'bystander' as const })) }
    expect(() => buildCluePrompt(stripped)).not.toThrow()
    expect(textOf(buildCluePrompt(stripped))).toContain('none')
  })
})

/**
 * The prompt must not describe a mechanic the game no longer has. A model told
 * about forbidden words will steer clues around cards that cannot hurt anyone,
 * and will explain the manoeuvre to a learner in the rationale — which is worse
 * than a bad clue, because the player believes it.
 *
 * A string check, deliberately: this asserts the ABSENCE of text, and there is
 * no board state that can produce it any more, so nothing structural is left to
 * ask. It stays until the prompts are rewritten properly, and it will still be
 * true afterwards.
 */
describe('the prompts say nothing about forbidden words', () => {
  it('not in the clue prompt', () => {
    expect(promptFor(start()).toLowerCase()).not.toContain('forbidden')
  })

  it('nor in the guess prompt', () => {
    const s = applyEvent(start(), { type: 'SUBMIT_CLUE', by: 'ai', text: 'klods', number: 1 })
    // The guesser is the player under an AI clue, so build the view the other
    // way: a player clue, with Casey guessing.
    const fresh = createGame({
      config: GRID_CONFIGS.beginner,
      words: words(GRID_CONFIGS.beginner.totalWords),
      seed: 7,
      firstGiver: 'player',
    })
    const clued = applyEvent(fresh, { type: 'SUBMIT_CLUE', by: 'player', text: 'klods', number: 1 })
    expect(textOf(buildGuessPrompt(buildAiGuessView(clued, 'en'))).toLowerCase()).not.toContain(
      'forbidden',
    )
    expect(s.phase).toBe('playerGuessing')
  })
})
