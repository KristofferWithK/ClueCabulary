import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS } from '../engine/config'
import { applyEvent, createGame, isGuessable } from '../engine/game'
import type { BoardWord } from '../engine/types'
import { aiTargetableIds, buildAiClueView } from './projections'
import { buildCluePrompt } from './prompts'

const words = (n: number): BoardWord[] =>
  Array.from({ length: n }, (_, i) => ({
    wordId: `w${i}`,
    da: `dansk${i}ord${i}`,
    en: [`gloss${i}word${i}`],
    pos: 'noun',
  }))

const cluePrompt = (grid: 'beginner' | 'middle' | 'standard', spend = 0) => {
  let s = createGame({
    config: GRID_CONFIGS[grid],
    words: words(GRID_CONFIGS[grid].totalWords),
    seed: 7,
    firstGiver: 'ai',
  })
  // Burn turns without finding anything, to walk the clock down.
  for (let i = 0; i < spend; i++) {
    const giver = s.phase === 'aiClueInput' ? 'ai' : 'player'
    s = applyEvent(s, { type: 'SUBMIT_CLUE', by: giver, text: 'klods', number: 1 })
    const key = giver === 'ai' ? s.aiKey : s.playerKey
    const dud = s.words
      .map((w) => w.wordId)
      .find((id) => key[id] === 'bystander' && isGuessable(s, id))!
    s = applyEvent(s, { type: 'GUESS', wordId: dud })
  }
  const view = buildAiClueView(s, 'en')
  return { text: buildCluePrompt(view)[0]!.content, view, state: s }
}

/**
 * Klaus was giving clues of 1 on a board where that cannot win — beginner is
 * four clues for eight greens — and the prompt was the reason: it told him
 * "caution beats greed" and "one word your partner will certainly find beats
 * two where the second is a coin flip", with nothing anywhere about the clock.
 * He had the numbers to work it out and no instruction to.
 */
describe('the clue prompt tells Klaus the pace he has to keep', () => {
  it('states how many of his greens are left and how many clues remain', () => {
    const { text, view } = cluePrompt('beginner')
    const mine = aiTargetableIds(view).length
    expect(text).toContain(`${mine} of your greens are still hidden`)
    expect(text).toContain(`${view.turnsLeft} clues remain`)
  })

  it('and does the division, so a clue of 1 is visibly behind the pace', () => {
    const { text } = cluePrompt('beginner')
    // 5 greens over ~2 turns of his own: 2 or 3 a clue, and spending one on a
    // single word leaves 4 for the last turn.
    expect(text).toContain('That is 2 or 3 words a clue just to finish.')
    expect(text).toContain('A clue of 1 now leaves 4 for 1 turn — 4 a clue')
  })

  it('reports the rate honestly rather than rounding it up', () => {
    // The middle board is 7 greens over ~3 turns = 2.33. Rounding that up to
    // "3 words a clue" asks for a harder clue than the board does, which is
    // the opposite of the mistake being fixed.
    const { text } = cluePrompt('middle')
    expect(text).toContain('That is 2 or 3 words a clue just to finish.')
    expect(text).not.toContain('That is 3 words a clue')
  })

  it('escalates when the clues are nearly gone', () => {
    // Beginner has four; spend three and one is left.
    const { text, state } = cluePrompt('beginner', 3)
    expect(state.turnsLeft).toBeLessThanOrEqual(2)
    expect(text).toContain('THE CLOCK')
    expect(text).toContain('last chance')
  })

  it('asks for two or three as the normal shape, not one', () => {
    const { text } = cluePrompt('standard')
    expect(text).toContain('Two or three targets is the normal shape')
    expect(text).toContain('Never split a clue you could give whole')
  })

  it('no longer tells him caution beats greed, which was the whole problem', () => {
    const { text } = cluePrompt('standard')
    expect(text).not.toContain('caution beats greed')
    expect(text).not.toContain('coin flip')
    expect(text).not.toContain('Balance ambition with safety')
  })

  it('still refuses to gamble near a forbidden word', () => {
    const { text } = cluePrompt('standard')
    expect(text).toContain('never worth giving')
    expect(text).toMatch(/forbidden words nearly lose the game/i)
  })

  /**
   * The pace is computed from the AI's own key and the shared turn count, both
   * already in this view. Worth an explicit check: a line that leaked which
   * words the PLAYER holds would defeat the firewall in the one place that
   * assembles free text.
   */
  it('says nothing that depends on the player’s key', () => {
    const base = createGame({
      config: GRID_CONFIGS.standard,
      words: words(20),
      seed: 7,
      firstGiver: 'ai',
    })
    const permuted = { ...base, playerKey: Object.fromEntries(
      Object.entries(base.playerKey).map(([id], i, all) => [id, all[(i + 5) % all.length]![1]]),
    ) }
    const a = buildCluePrompt(buildAiClueView(base, 'en'))[0]!.content
    const b = buildCluePrompt(buildAiClueView(permuted, 'en'))[0]!.content
    expect(a).toBe(b)
  })
})
