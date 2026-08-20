import { useEffect } from 'react'
import { wordById } from '../../data/words'
import type { GameState } from '../../engine/types'
import { useGame } from '../../stores/gameStore'
import { useSettings } from '../../stores/settingsStore'
import { canSpeak, speakText } from '../speak'
import { ACTIVE } from '../../lang/active'

/**
 * Five is what fits without turning the summary into a reading exercise. The
 * section lives inside `.summary-scroll`, so a sixth would cost nothing in
 * layout — it costs attention, on a screen whose job is to say what the round
 * did and get out of the way.
 */
export const MAX_SENTENCES = 5

/**
 * Which greens get a sentence, in order.
 *
 * Pure, exported and tested, because the ordering is the whole feature: a
 * player who just met a word for the first time is the one who needs to see it
 * used, and a summary that showed five words they have known for a month would
 * look identical to a working one.
 *
 * Three ranks, stable inside each so board order breaks ties:
 *   0. green AND met for the first time this round
 *   1. green AND collected this round
 *   2. green, already known
 *
 * A word in both of the first two ranks takes the better one.
 */
export function pickSentenceWords(
  greenIds: readonly string[],
  newlyDiscovered: readonly string[],
  newlyLearned: readonly string[],
  max: number = MAX_SENTENCES,
): string[] {
  const discovered = new Set(newlyDiscovered)
  const learned = new Set(newlyLearned)
  const rank = (id: string) => (discovered.has(id) ? 0 : learned.has(id) ? 1 : 2)
  return greenIds
    .map((id, i) => ({ id, rank: rank(id), i }))
    // Index as the tiebreak rather than relying on sort stability. It is
    // guaranteed by the spec these days, but the intent is worth saying.
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, max)
    .map((x) => x.id)
}

/**
 * A Danish sentence that says itself when you tap it.
 *
 * The sibling of `SpeakWord`, and the same bargain: the text IS the button, so
 * a speak affordance costs no element and no height. It differs in one way that
 * matters — it is gated on `canSpeak` rather than `canPlayWords`, because a
 * sentence has no baked clip and never will (`speak.ts` says so at the top).
 * On a phone with no Danish voice this correctly goes back to being plain text
 * instead of offering a button that would be silent.
 */
function SpeakSentence({ da }: { da: string }) {
  const sound = useSettings((s) => s.sound)
  if (!sound || !canSpeak()) return <span lang={ACTIVE.code}>{da}</span>
  return (
    <button
      type="button"
      className="speak-word speak-sentence"
      // The word buttons above read as the word itself; a whole sentence needs
      // the verb said out loud or the control is a mystery to a screen reader.
      aria-label={`Say «${da}» out loud`}
      onClick={() => speakText(da)}
    >
      <span lang={ACTIVE.code}>{da}</span>
    </button>
  )
}

/**
 * The round's green words, used in a sentence.
 *
 * The reason this exists is not revision — the words are already listed twice
 * on this screen. It is the words that are NOT on the board. Nothing in the
 * nine hundred is a preposition, a conjunction or a pronoun, because none of
 * them can be clued: there is no clue for «hvis». They arrive as scenery in
 * somebody else's sentence or they do not arrive at all.
 *
 * How much scenery the shipped sentences actually carry was measured rather
 * than hoped for — `scripts/measure-function-words.mjs`, and the answer is
 * "the common ones, over and over, and almost nothing else". A round shows
 * about eleven distinct function words and two thirds of them are the same
 * twenty every time. That is the v1 this card asked for and it is worth
 * shipping; it is also the argument for H5, which writes sentences on purpose
 * instead of taking what the dataset happens to contain.
 */
export function RoundSentences({ game }: { game: GameState }) {
  const newlyDiscovered = useGame((s) => s.newlyDiscovered)
  const newlyLearned = useGame((s) => s.newlyLearned)
  const requestStory = useGame((s) => s.requestStory)

  const greenIds = game.words
    .filter((w) => game.reveals[w.wordId]?.kind === 'green')
    .map((w) => w.wordId)
  const chosen = pickSentenceWords(greenIds, newlyDiscovered, newlyLearned)
  const rows = chosen
    .map((id) => wordById(id))
    .filter((w): w is NonNullable<typeof w> => !!w?.exampleDa && !!w.exampleEn)

  // The story is asked for from here rather than from finishRound, because
  // this component owns the choice of words — the same picks the sentence
  // list shows. The store makes repeat calls no-ops, so a remount (or React
  // strict-mode's double effect) cannot fire a second request.
  useEffect(() => {
    void requestStory(chosen)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one ask per round; the guard is in the store
  }, [requestStory])

  // A round can end with nothing green — sudden death on the first name.
  if (rows.length === 0) return null

  return (
    <>
      <section className="summary-section sentences-section">
        <h3>In a sentence</h3>
        <ul className="round-sentences">
          {rows.map((w) => (
            <li key={w.id} className="round-sentence">
              <SpeakSentence da={w.exampleDa} />
              <span className="sentence-en">{w.exampleEn}</span>
            </li>
          ))}
        </ul>
      </section>
      <RoundStory />
    </>
  )
}

/**
 * The round's words woven into a tiny story (H5) — the words the sentences
 * above cannot carry, arriving on purpose.
 *
 * BELOW the sentences, never above: it lands a few seconds after the summary
 * does, and content that appears above what a player is reading yanks the
 * page out of their hands. Down here it grows into the scroll like a
 * postscript. While it is on its way there is a single quiet line, so the
 * arrival changes a line into a paragraph instead of conjuring a section.
 *
 * The small words it was asked to include are named under the story — that
 * list is the feature: «hvis» has no card anywhere in the game, and this line
 * is the one place the player is told they just met it.
 */
function RoundStory() {
  const story = useGame((s) => s.story)
  const status = useGame((s) => s.storyStatus)
  const targets = useGame((s) => s.storyTargets)

  if (status === 'off' || status === 'idle') return null
  return (
    <section className="summary-section story-section">
      <h3>The round, as a story</h3>
      {status === 'loading' ? (
        <p className="story-waiting">Casey is writing one…</p>
      ) : (
        <>
          <ul className="round-sentences">
            {story!.sentences.map((s, i) => (
              <li key={i} className="round-sentence">
                <SpeakSentence da={s.da} />
                <span className="sentence-en">{s.en}</span>
              </li>
            ))}
          </ul>
          {targets.length > 0 && (
            <p className="story-targets">
              Smuggled in:{' '}
              {targets.map((t, i) => (
                <span key={t}>
                  {i > 0 && ' · '}
                  <span lang={ACTIVE.code} className="story-target">
                    {t}
                  </span>
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </section>
  )
}
