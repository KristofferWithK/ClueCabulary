import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS } from '../engine/config'
import { applyEvent, createGame } from '../engine/game'
import type { BoardWord, GameState } from '../engine/types'
import { aiTargetableIds, buildAiClueView } from './projections'
import { buildCluePrompt } from './prompts'

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
// what Klaus reads is both, so these assertions read both.
const textOf = (msgs: { content: string }[]) => msgs.map((m) => m.content).join('\n')
const promptFor = (s: GameState) => textOf(buildCluePrompt(buildAiClueView(s, 'en')))
const lineFor = (text: string, id: string) =>
  text.split('\n').find((l) => l.startsWith(`${id} |`)) ?? `(no row for ${id})`

/** Play until one of Klaus's own greens has been found, so it is spent. */
function findOneOfHisGreens(s: GameState): { state: GameState; found: string } {
  const target = s.words.map((w) => w.wordId).find((id) => s.aiKey[id] === 'green')!
  let next = applyEvent(s, { type: 'SUBMIT_CLUE', by: 'ai', text: 'klods', number: 1 })
  next = applyEvent(next, { type: 'GUESS', wordId: target })
  return { state: next, found: target }
}

/**
 * Reported from a real game, twice over: Klaus asked for a word he had already
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

  it('marks a green Klaus has already found as spent, in words, on its own row', () => {
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
 * Also reported: "Klaus gave kitchen and I said food but that was forbidden."
 *
 * A guess is judged against the clue-giver's key alone, so «food» was forbidden
 * on KLAUS's key — a word he could see, under a clue he chose. That is what
 * makes his own forbidden words dangerous while he is the giver: his key is the
 * one every guess of the player's is read against. (The first version of this
 * comment said "either side's forbidden word ends the round, whoever names it",
 * which is false, and reached the right conclusion by the wrong route.)
 *
 * He could see them in the table and was told to check — in the third of five
 * bullet points under "Hard constraints", as one clause among several. They get
 * their own block now, with the player's own example in it.
 */
describe('the clue prompt makes the forbidden words hard to walk past', () => {
  it('names them in a block of their own, not only in the table', () => {
    const s = start()
    const view = buildAiClueView(s, 'en')
    const text = promptFor(s)
    const forbidden = view.words.filter((w) => w.roleOnMyKey === 'forbidden')
    expect(forbidden.length).toBeGreaterThan(0)
    const block = text.split('\n').find((l) => l.startsWith('FORBIDDEN FOR YOU'))!
    for (const w of forbidden) expect(block).toContain(w.da)
  })

  it('asks for the association test by example, not as an instruction to remember', () => {
    const text = promptFor(start())
    expect(text).toContain('"kitchen" fetches "food"')
  })

  it('marks them on their own row too', () => {
    const s = start()
    const view = buildAiClueView(s, 'en')
    const text = promptFor(s)
    for (const w of view.words.filter((x) => x.roleOnMyKey === 'forbidden')) {
      expect(lineFor(text, w.id)).toContain('FORBIDDEN FOR YOU')
    }
  })

  /**
   * A forbidden word already revealed has done its damage and cannot do it
   * again; listing it as live keeps steering him away from clues that are now
   * perfectly safe.
   */
  it('drops one that has already been hit', () => {
    let s = start()
    const doomed = s.words.map((w) => w.wordId).find((id) => s.aiKey[id] === 'forbidden')!
    s = applyEvent(s, { type: 'SUBMIT_CLUE', by: 'ai', text: 'klods', number: 1 })
    s = applyEvent(s, { type: 'GUESS', wordId: doomed })
    // The round is over after a forbidden hit, so ask the projection directly.
    const view = buildAiClueView({ ...s, phase: 'aiClueInput' }, 'en')
    const block = textOf(buildCluePrompt(view))
      .split('\n')
      .find((l) => l.startsWith('FORBIDDEN FOR YOU'))
    const da = s.words.find((w) => w.wordId === doomed)!.da
    expect(block ?? '').not.toContain(da)
  })
})

/**
 * The board can be dealt so that every one of Klaus's greens is also a word he
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
 * The two boards a learner meets deal no card that one key calls green and the
 * other calls forbidden.
 *
 * This block used to be titled "no board word is both a target and an instant
 * loss" and justified by the claim that a forbidden-for-player, green-for-Klaus
 * card is "his best clue and the player's instant loss". That is false: under
 * Klaus's clue the card is read off HIS key, where it is green, and it scores.
 *
 * The shape actually worth excluding is its mirror, which forbiddenVsGreen
 * deals in the same breath: green on the player's key, forbidden on Klaus's.
 * There the player's own key marks the card as a target while Klaus's key ends
 * the round on it, and while they are guessing nothing on screen says so. Klaus
 * can see it — it is forbidden on his own key — so a good clue steers around
 * it, but that is the only protection there is.
 *
 * standard keeps it on purpose (see config.ts), which is why it is not swept
 * here: this asserts what beginner and middle do, not a law about every board.
 */
describe('the learner boards deal no card that is green on one key and forbidden on the other', () => {
  it.each(['beginner', 'middle'] as const)('on %s', (grid) => {
    expect(GRID_CONFIGS[grid].forbiddenVsGreen).toBe(0)
  })

  it('and standard keeps it, so this is a choice per board rather than a law', () => {
    expect(GRID_CONFIGS.standard.forbiddenVsGreen).toBe(1)
  })

  it('holds through a dealt board: no forbidden word is green on the other key', () => {
    for (const grid of ['beginner', 'middle'] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const s = createGame({
          config: GRID_CONFIGS[grid],
          words: words(GRID_CONFIGS[grid].totalWords),
          seed,
          firstGiver: 'ai',
        })
        for (const w of s.words) {
          const id = w.wordId
          if (s.playerKey[id] === 'forbidden') expect(s.aiKey[id]).not.toBe('green')
          if (s.aiKey[id] === 'forbidden') expect(s.playerKey[id]).not.toBe('green')
        }
      }
    }
  })
})
