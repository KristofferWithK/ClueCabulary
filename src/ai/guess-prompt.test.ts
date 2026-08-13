import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS } from '../engine/config'
import { applyEvent, createGame } from '../engine/game'
import type { BoardWord } from '../engine/types'
import { buildAiGuessView } from './projections'
import { buildGuessPrompt } from './prompts'

const words = (n: number): BoardWord[] =>
  Array.from({ length: n }, (_, i) => ({
    wordId: `w${i}`,
    da: `dansk${i}ord${i}`,
    en: [`gloss${i}word${i}`],
    pos: 'noun' as const,
  }))

/** A game sitting in aiGuessing, under a player clue of the given number. */
const promptText = (number = 2, clue = 'klods') => {
  let s = createGame({
    config: GRID_CONFIGS.beginner,
    words: words(12),
    seed: 7,
    firstGiver: 'player',
  })
  s = applyEvent(s, { type: 'SUBMIT_CLUE', by: 'player', text: clue, number })
  return buildGuessPrompt(buildAiGuessView(s, 'en'))
    .map((m) => m.content)
    .join('\n')
}

/**
 * Reported: "Why did it pick hvid at foster? It's still picking forbidden words
 * a lot."
 *
 * He did not think «hvid» meant «foster». He was made to say it. The rules
 * require a guess every turn, so planGuessExecution plays the top-ranked word
 * at any confidence — while this prompt told him "under 0.35: do not guess
 * this". A model that scored every word at 0.05 and wrote "nothing here fits"
 * had done everything the prompt asked and still named a card at random.
 *
 * The contract has to be true, because the model acts on it.
 */
describe('the guess prompt tells the truth about the guess that is forced', () => {
  it('says the top-ranked word is played whatever confidence it carries', () => {
    const text = promptText()
    expect(text).toMatch(/TOP-RANKED WORD IS NAMED ON THE BOARD NO MATTER WHAT/i)
    expect(text).toMatch(/cannot pass/i)
  })

  it('and that the ranking, not the score, is the decision', () => {
    expect(promptText()).toMatch(/ranking IS the decision/i)
  })

  /**
   * The floor is real from the second guess on — it is only the first that is
   * unconditional — so the bands must not be deleted, just scoped.
   */
  it('keeps the confidence bands, scoped to the guesses they govern', () => {
    const text = promptText()
    expect(text).toContain('0.35')
    expect(text).toMatch(/from the second onward/i)
  })

  it('does not still promise an abstention it cannot honour', () => {
    // The old wording, verbatim. It described the second guess onward and read
    // as a blanket permission to decline.
    expect(promptText()).not.toMatch(/everything stops at the first below 0\.35\. So the bands/)
  })
})

/**
 * The other half of «foster»: Klaus is handed the clue as a bare string beside
 * a Danish board and is never told which language it is in. «foster» is a
 * Danish/English homograph whose senses are unrelated — a fetus, or to raise a
 * child — so he had two readings and no way to choose.
 *
 * The clue-language SETTING is not the fix and is deliberately not used here:
 * it governs only the language Klaus clues in, while the clue dock hardcodes
 * "ét dansk ord" for the player. Feeding the setting into this prompt would
 * label a Danish clue as English on the default.
 */
describe('the guess prompt says the clue may be in either language', () => {
  it('warns that a learner reaches for English when the Danish will not come', () => {
    const text = promptText()
    expect(text).toMatch(/EITHER LANGUAGE/i)
    expect(text).toMatch(/learner/i)
  })

  it('names the homograph trap with the reported word in it', () => {
    expect(promptText()).toContain('foster')
  })

  it('asks him to say which reading he took', () => {
    expect(promptText()).toMatch(/which reading you took/i)
  })

  /** The setting is for Klaus's own clues; it must not leak into this prompt. */
  it('does not claim to know the language from the setting', () => {
    const text = promptText()
    expect(text).not.toMatch(/your partner clued in English/i)
    expect(text).not.toMatch(/the clue is in Danish\b/i)
  })
})
