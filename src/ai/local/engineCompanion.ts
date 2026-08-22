import type { CallReport, Companion } from '../companion'
import { MockCompanion } from '../mock/mockCompanion'
import {
  aiGuessableIds,
  type AiClueView,
  type AiGuessView,
  type StoryView,
} from '../projections'
import type {
  ClueResponse,
  GuessResponse,
  StoryResponse,
  TranslationResponse,
} from '../schemas'
import { loadEvaluator, type Evaluator } from './evaluator'
import { searchClue } from './search'

/**
 * The local clue engine as a Companion (docs/clue-engine.md §6 Stage 3): the
 * opening book generates, `sim` evaluates, the search picks. Deterministic,
 * offline, milliseconds — it sits behind the practice seam in `gameStore.ts`,
 * where the hash-scrambled MockCompanion used to be.
 *
 * The mock stays underneath as the honest floor: on a board the book does not
 * cover (a daily board drawing outside the authored cities, a city E6 has not
 * reached), `searchClue` returns null and the clue falls back to the mock's —
 * a visibly meaningless `mok1` beats a book word chosen by nothing.
 * `translate` and `getStory` keep their existing fallbacks the same way: the
 * book knows associations, not citation forms, so those two were never the
 * engine's to answer.
 */

/**
 * sim (0–3, half steps) → the confidence contract `planGuessExecution` reads:
 * guesses run in confidence order and stop at the first below 0.35. A direct
 * book 2 or a judged matrix 2 is a guess worth acting on (0.70); a bare 1 is
 * "only if nothing better" (0.45); a two-hop 0.5 estimate lands at 0.33 —
 * deliberately under the stop, so a chained guess is never taken on the
 * strength of the first one; and a word the data says nothing about is 0.10,
 * named only when it is the forced first guess.
 */
const confidence = (sim: number): number =>
  sim <= 0 ? 0.1 : Math.min(0.95, 0.2 + sim * 0.25)

const daOf = (view: AiClueView | AiGuessView, id: string): string =>
  view.words.find((w) => w.id === id)?.da ?? id

/**
 * The templated rationale, doing the two jobs the prompt asks the model's to
 * do (prompts.ts): the connection to each target — the book's `why`, written
 * to be read aloud — and the riskiest neutral the lookahead turned up, named
 * so the player learns why it should not pull them.
 */
function rationaleFor(
  ev: Evaluator,
  view: AiClueView,
  plan: NonNullable<ReturnType<typeof searchClue>>,
): string {
  const links = plan.targets
    .map((id) => {
      const why = ev.whyFor(plan.text, id)
      return why ? `${daOf(view, id)} — ${why}` : daOf(view, id)
    })
    .join('; ')
  let risk = ''
  if (plan.riskiest && plan.riskiest.sim > 0) {
    const rid = plan.riskiest.id
    const why = ev.whyFor(plan.text, rid)
    risk = ` The riskiest neutral is ${daOf(view, rid)}${why ? ` (${why})` : ''} — it fits my clue a little too, but not one of mine, so do not let it pull you.`
  }
  return `My clue points at ${links}.${risk}`
}

export class EngineCompanion implements Companion {
  private fallback = new MockCompanion()

  /**
   * Which arm answered, for the clue ledger. `mock` rather than `engine`
   * whenever the search came back empty and the hash answered instead — the
   * ledger's whole point is that the arms are told apart, and a board the book
   * does not cover is exactly the case worth seeing separately. Neither arm can
   * be `refused`: there is no validator loop offline.
   */
  lastCall: CallReport | null = null

  async getClue(view: AiClueView): Promise<ClueResponse> {
    const ev = await loadEvaluator()
    const plan = searchClue(ev, view)
    if (!plan) {
      this.lastCall = { arm: 'mock', refused: false }
      return this.fallback.getClue(view)
    }
    this.lastCall = { arm: 'engine', refused: false }
    return {
      clue: plan.text,
      number: plan.targets.length,
      targetWordIds: plan.targets,
      rationale: rationaleFor(ev, view, plan),
    }
  }

  async getGuesses(view: AiGuessView): Promise<GuessResponse> {
    const ev = await loadEvaluator()
    const clue = view.currentClue
    const ranked = aiGuessableIds(view)
      .map((id) => ({ id, sim: ev.sim(clue.text, id) }))
      // Deterministic: sim descending, then id — the drives rely on the
      // practice companion replaying identically, as the mock always did.
      .sort((a, b) => b.sim - a.sim || (a.id < b.id ? -1 : 1))
    const reasoningFor = (id: string, sim: number): string => {
      const why = ev.whyFor(clue.text, id)
      if (why) return `«${clue.text}» is in my book for ${daOf(view, id)}: ${why}.`
      if (sim > 0) return `«${clue.text}» sits near ${daOf(view, id)} on my association map.`
      return `Nothing in my book links «${clue.text}» to ${daOf(view, id)}.`
    }
    const guesses = ranked
      .slice(0, Math.max(1, Math.min(clue.number, ranked.length)))
      .map(({ id, sim }) => ({
        wordId: id,
        confidence: confidence(sim),
        reasoning: reasoningFor(id, sim),
      }))
    return { guesses }
  }

  async translate(term: string): Promise<TranslationResponse> {
    return this.fallback.translate(term)
  }

  async getStory(view: StoryView): Promise<StoryResponse> {
    return this.fallback.getStory(view)
  }
}
