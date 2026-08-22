import { describe, expect, it } from 'vitest'
import { BOARD, TUTORIAL_CONFIG, WRAPUP_CONFIG, type GridConfig } from '../engine/config'
import { applyEvent as applyEventIn, createGame, isGuessable } from '../engine/game'
import type { BoardWord } from '../engine/types'
import { aiTargetableIds, buildAiClueView } from './projections'
import { buildCluePrompt as buildCluePromptIn } from './prompts'
import { danish } from '../lang/da'

/**
 * The prompt builders take the language pack now (H1). Bound to Danish here so
 * every assertion below keeps testing the prompt it was written against.
 */
const buildCluePrompt = (v: Parameters<typeof buildCluePromptIn>[0]) =>
  buildCluePromptIn(v, danish)

/**
 * The engine takes the language pack now (H1). Wrapped here so the suite's
 * call sites stay exactly as they were and keep pinning what they pinned.
 */
const applyEvent = (s: Parameters<typeof applyEventIn>[0], e: Parameters<typeof applyEventIn>[1]) =>
  applyEventIn(s, e, danish)

/**
 * This file used to end with "the debrief is told how the round actually
 * ended" — a suite over `buildDebriefPrompt`'s ending sentences, including a
 * Record keyed off the Outcome union that made a missing ending a build error.
 * The debrief call is gone: the round summary is written from the board and the
 * stores rather than asked of the model, so there is no ending sentence left to
 * get wrong. The exhaustive-Record trick it was built on is worth remembering
 * (git history) — an `as` cast on a hand-written array is what it replaced, and
 * that array had silently stopped being exhaustive.
 */

const words = (n: number): BoardWord[] =>
  Array.from({ length: n }, (_, i) => ({
    wordId: `w${i}`,
    da: `dansk${i}ord${i}`,
    en: [`gloss${i}word${i}`],
    pos: 'noun',
  }))

/** The three boards that exist since N1 — one you play, two you enter. */
const CONFIGS: Record<'board' | 'tutorial' | 'wrapup', GridConfig> = {
  board: BOARD,
  tutorial: TUTORIAL_CONFIG,
  wrapup: WRAPUP_CONFIG,
}

const cluePrompt = (grid: keyof typeof CONFIGS, spend = 0) => {
  let s = createGame({
    config: CONFIGS[grid],
    words: words(CONFIGS[grid].totalWords),
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
 * Casey was giving clues of 1 on a board where that cannot win — the tutorial
 * board was four clues for eight greens — and the prompt was the reason: it told him
 * "caution beats greed" and "one word your partner will certainly find beats
 * two where the second is a coin flip", with nothing anywhere about the clock.
 * He had the numbers to work it out and no instruction to.
 */
describe('the clue prompt tells Casey the pace he has to keep', () => {
  it('states how many of his greens are left and how many clues remain', () => {
    const { text, view } = cluePrompt('board')
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
  it.each(['board', 'tutorial', 'wrapup'] as const)('does the division correctly on %s', (grid) => {
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
    for (const grid of ['board', 'tutorial', 'wrapup'] as const) {
      const { text } = cluePrompt(grid)
      if (!text.includes('A clue of 1 now leaves')) continue
      expect(text).toMatch(/A clue of 1 now leaves \d+ for \d+ turns? — \d+ a clue/)
    }
  })

  it('escalates when the clues are nearly gone', () => {
    // The tutorial board has five; spend three and two are left.
    const { text, state } = cluePrompt('tutorial', 3)
    expect(state.turnsLeft).toBeLessThanOrEqual(2)
    expect(text).toContain('THE CLOCK')
    expect(text).toContain('the last clue you are likely to get')
  })

  /**
   * The last clue is the only information the player will ever get about the
   * greens it does not mention. Running out of clues opens last chance, where
   * they name words with nothing new to go on — so a green Casey never pointed
   * at is one they cannot find, and a narrow last clue does not cost a word,
   * it costs the round.
   */
  it('tells him the last clue has to cover everything he has left', () => {
    const { text, view } = cluePrompt('tutorial', 3)
    const mine = aiTargetableIds(view).length
    expect(text).toContain('goes to last chance')
    expect(text).toContain('Anything you do not point at now, they cannot find later')
    expect(text).toContain(`cover ALL ${mine}`)
  })

  /**
   * D5 renamed sudden death to last chance in player-facing copy, and the
   * escalation sentence here already said "this is your last chance" about the
   * final clue itself — reusing the same phrase for the phase name would have
   * Casey's own prompt say "your last chance... goes to last chance" for two
   * different things, and a model happily repeats that back to the player.
   * The urgency sentence was reworded ("the last clue you are likely to get")
   * so "last chance" names only the phase.
   */
  it('does not reuse "last chance" for the final-clue urgency, only for the phase', () => {
    const { text } = cluePrompt('tutorial', 3)
    expect(text).not.toContain('your last chance')
  })

  it('asks for two or three as the normal shape, not one', () => {
    const { text } = cluePrompt('board')
    expect(text).toContain('Two or three targets is the normal shape')
    expect(text).toContain('Never split a clue you could give whole')
  })

  it('no longer tells him caution beats greed, which was the whole problem', () => {
    const { text } = cluePrompt('board')
    expect(text).not.toContain('caution beats greed')
    expect(text).not.toContain('coin flip')
    expect(text).not.toContain('Balance ambition with safety')
  })

  /**
   * This used to be "still refuses to gamble near a forbidden word", checking
   * that pushing Casey to clue for more had not also pushed him into pointing
   * at a hazard. There are no hazards; a wrong guess costs a turn and the
   * counterweight to ambition is now the turn itself, which the line below
   * carries. Re-measuring what ambition costs on a board with nothing fatal on
   * it is a job for the tuning pass, not a string check.
   */
  it('still weighs a wrong guess against the clue it spends', () => {
    const { text } = cluePrompt('board')
    expect(text).toContain('turns are what this board is short of')
  })

  /**
   * The pace is computed from the AI's own key and the shared turn count, both
   * already in this view. Worth an explicit check: a line that leaked which
   * words the PLAYER holds would defeat the firewall in the one place that
   * assembles free text.
   */
  it('says nothing that depends on the player’s key', () => {
    const base = createGame({
      config: BOARD,
      words: words(BOARD.totalWords),
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
