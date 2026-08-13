import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS } from '../engine/config'
import { applyEvent, createGame, isGuessable } from '../engine/game'
import type { BoardWord } from '../engine/types'
import { aiTargetableIds, buildAiClueView } from './projections'
import type { DebriefView } from './projections'
import { buildCluePrompt, buildDebriefPrompt } from './prompts'

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

  /**
   * Checked as arithmetic rather than as a fixed string, so retuning a board's
   * token count does not silently make the sentence wrong — which is what a
   * hardcoded "2 or 3" did the first time beginner moved from four clues to
   * five.
   */
  it.each(['beginner', 'middle', 'standard'] as const)('does the division correctly on %s', (grid) => {
    const { text, view } = cluePrompt(grid)
    const mine = aiTargetableIds(view).length
    // Half the shared pool is his, rounded up.
    const myTurns = Math.ceil(view.turnsLeft / 2)
    const rate = mine / myTurns

    const m = text.match(/That is (\d+)(?: or (\d+))? words? a clue just to finish\./)
    expect(m, `no rate sentence in:\n${text}`).not.toBeNull()
    const low = Number(m![1])
    const high = m![2] ? Number(m![2]) : low
    // The true rate has to sit inside the range quoted, and the range has to
    // be the tightest pair of whole numbers around it — not rounded up, which
    // would ask for a harder clue than the board needs.
    expect(rate).toBeGreaterThanOrEqual(low === 0 ? 0 : low - 0.001)
    expect(rate).toBeLessThanOrEqual(high + 0.001)
    expect(high - low).toBeLessThanOrEqual(1)
    expect(text).toContain(`${mine} of your greens are still hidden`)
  })

  it('only warns what a cheap clue costs when it really costs something', () => {
    // The clause is conditional on purpose: on a board where 1 now still
    // leaves a normal clue later, saying "and then you will need N" would be
    // a scold with no arithmetic behind it.
    for (const grid of ['beginner', 'middle', 'standard'] as const) {
      const { text } = cluePrompt(grid)
      if (!text.includes('A clue of 1 now leaves')) continue
      expect(text).toMatch(/A clue of 1 now leaves \d+ for \d+ turns? — \d+ a clue/)
    }
  })

  it('escalates when the clues are nearly gone', () => {
    // Beginner has four; spend three and one is left.
    const { text, state } = cluePrompt('beginner', 3)
    expect(state.turnsLeft).toBeLessThanOrEqual(2)
    expect(text).toContain('THE CLOCK')
    expect(text).toContain('last chance')
  })

  /**
   * The last clue is the only information the player will ever get about the
   * greens it does not mention. Running out of clues opens sudden death, where
   * they name words with nothing new to go on — so a green Klaus never pointed
   * at is one they cannot find, and a narrow last clue does not cost a word,
   * it costs the round.
   */
  it('tells him the last clue has to cover everything he has left', () => {
    const { text, view } = cluePrompt('beginner', 3)
    const mine = aiTargetableIds(view).length
    expect(text).toContain('sudden death')
    expect(text).toContain('Anything you do not point at now, they cannot find later')
    expect(text).toContain(`cover ALL ${mine}`)
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

/**
 * The debrief is written from a one-line account of how the round ended, and
 * that line came from a ternary chain with a catch-all. Sudden death — added
 * later — fell off the end of it into "lost on the translation challenge after
 * hitting a forbidden word", so on the most common losing ending Klaus was
 * told, as fact, about a forbidden word the player never hit and a challenge
 * that never ran. The banner above his text said "Sudden death"; his text
 * explained a different round.
 */
describe('the debrief is told how the round actually ended', () => {
  const view = (outcome: DebriefView['outcome']): DebriefView => ({
    outcome,
    words: [
      { id: 'w0', da: 'hus', en: ['house'], pos: 'noun', reveal: { kind: 'hidden' }, onPlayerKey: 'green', onAiKey: 'bystander' },
    ],
    history: [],
    lookedUpDa: [],
  })
  const text = (o: DebriefView['outcome']) => buildDebriefPrompt(view(o))[1]!.content

  it('names sudden death as sudden death', () => {
    const t = text({ result: 'lost', reason: 'sudden-death' })
    expect(t).toContain('sudden death')
    expect(t).not.toContain('translation challenge after hitting a forbidden word')
  })

  it('does not call giving up "the clues ran out", now that running out opens sudden death', () => {
    expect(text({ result: 'lost', reason: 'timeout' })).toContain('giving up in sudden death')
  })

  it('still describes the endings it always got right', () => {
    expect(text({ result: 'won', reason: 'all-greens' })).toContain('finding every green word')
    expect(text({ result: 'won', reason: 'redeemed' })).toContain('translation challenge')
    expect(text({ result: 'lost', reason: 'forbidden-failed' })).toContain('forbidden word')
  })

  it('has a sentence for every ending the engine can produce', () => {
    // The type makes this compile-time; this catches a stray `as` cast.
    for (const o of [
      { result: 'won', reason: 'all-greens' },
      { result: 'won', reason: 'redeemed' },
      { result: 'lost', reason: 'timeout' },
      { result: 'lost', reason: 'sudden-death' },
      { result: 'lost', reason: 'forbidden-failed' },
    ] as DebriefView['outcome'][]) {
      expect(text(o), JSON.stringify(o)).not.toContain('undefined')
    }
  })
})
