import { useRef, useState } from 'react'
import type { GameState, Outcome } from '../../engine/types'
import { WINS_PER_WRAP_UP, WRAP_UP_BANK_CAP, winsToNextWrapUp } from '../../journey/wrapup'
import { useGame, wrappableIds } from '../../stores/gameStore'
import { useSrs } from '../../stores/srsStore'
import { clueFlagId, guessFlagId, useFeedback } from '../../stores/feedbackStore'
import { useUi } from '../../stores/uiStore'
import { ClueyFace } from './Cluey'
import { RoundSentences } from './RoundSentences'
import { SpeakWord } from './SpeakWord'
import { ACTIVE } from '../../lang/active'

/**
 * The scraps, in the board's own hand.
 *
 * They used to be plain coloured rectangles in a five-colour palette that
 * belonged to nothing else on screen — the one thing left in the app the
 * pencil pass had never reached. Four torn shapes now, drawn through
 * `#pencil-edge` in the `.cluey-hatch` weight and tinted from the card
 * palette, so a win is celebrated by the same hand that drew the round.
 *
 * The fall is untouched: the same deterministic left/delay/duration triple
 * over the same twenty-eight pieces, the same one-shot `confetti-fall`, the
 * same `prefers-reduced-motion` rule. Still no dependency.
 */
const SCRAP_PATHS = [
  'M1 2 L11 1 L9 9 L2 11 Z',
  'M2 1 L10 4 L6 11 L1 7 Z',
  'M1 6 Q6 0 11 5 Q6 11 1 6 Z',
  'M3 1 L11 3 L8 10 L1 8 Z',
]
const SCRAP_TINTS = ['var(--green)', 'var(--line)', 'var(--beige-deep)']

/** One-shot pencil confetti — deterministic layout, no dependencies.
 *  Exported for the tutorial's win beat, which celebrates without the summary. */
export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <svg
          key={i}
          className="confetti-piece"
          viewBox="0 0 12 12"
          style={{
            left: `${(i * 37) % 100}%`,
            // The tint travels as `color`, so one `fill: currentColor` in the
            // stylesheet draws every scrap.
            color: SCRAP_TINTS[i % SCRAP_TINTS.length],
            animationDelay: `${(i % 7) * 0.12}s`,
            animationDuration: `${2 + (i % 5) * 0.3}s`,
          }}
        >
          <path className="confetti-scrap" d={SCRAP_PATHS[i % SCRAP_PATHS.length]} />
        </svg>
      ))}
    </div>
  )
}

/**
 * Every ending, keyed by `result:reason`. Typed off the Outcome union rather
 * than `Record<string, …>`, so an ending added to the engine fails the build
 * here instead of reading `undefined!` and throwing on the summary screen the
 * first time a player reaches it.
 *
 * No emoji since P1: Casey is on the screen now, wearing the outcome's own
 * mood, and a 🎉 beside a drawn suitcase is two mascots arguing about the tone.
 */
type OutcomeKey = Outcome extends infer O
  ? O extends Outcome
    ? `${O['result']}:${O['reason']}`
    : never
  : never

const OUTCOME_COPY: Record<OutcomeKey, { title: string; sub: string }> = {
  'won:all-greens': { title: 'You won!', sub: 'Every green word found together.' },
  // Reached by giving up in the last chance now, not by the clock running out —
  // the clock hands you the last chance instead of ending the round.
  'lost:timeout': { title: 'Round given up', sub: 'The connection was there — next time.' },
  'lost:sudden-death': {
    title: 'Last chance',
    sub: 'One word too far. The clues were spent and that one was not green.',
  },
}

/**
 * One tap to say "that was a bad call", on the screen where the reasoning is.
 *
 * A toggle, not a report form: the player is looking at a finished round and
 * the useful signal is cheap to give. Everything needed to show Casey what she
 * did — the word, the clue it was made under, and her own account of it — is
 * on screen already, so the flag carries it rather than a bare thumbs-down.
 */
function FlagButton({
  id,
  kind,
  what,
  underClue,
  why,
  label,
}: {
  id: string
  kind: 'clue' | 'guess'
  what: string
  underClue?: string
  why?: string
  label: string
}) {
  const flags = useFeedback((s) => s.flags)
  const toggleFlag = useFeedback((s) => s.toggleFlag)
  const flagged = flags.some((f) => f.id === id)
  return (
    <button
      className={`flag-btn ${flagged ? 'flag-on' : ''}`}
      aria-pressed={flagged}
      aria-label={
        flagged ? `${label} — flagged as a bad call. Tap to undo` : `Flag ${label} as a bad call`
      }
      onClick={() => toggleFlag({ id, kind, what, underClue, why })}
    >
      ⚑
    </button>
  )
}

/** The words a tile is counting, named inside it rather than listed below it. */
function TileWords({ words }: { words: { wordId: string; da: string }[] }) {
  if (words.length === 0) return null
  return (
    <p className="stat-words">
      {words.map((w, i) => (
        <span key={w.wordId}>
          {i > 0 && <span aria-hidden="true">, </span>}
          <SpeakWord wordId={w.wordId} da={w.da} />
        </span>
      ))}
    </p>
  )
}

/**
 * What the round did, in the two numbers a learner is actually counting.
 *
 * There were four tiles here until P1: these two, plus "in Sønderborg" and
 * "of every word". Both of those are the collection rather than the round, and
 * both are drawn bigger and better one tap away — Home carries the city, the
 * suitcase carries the journey — so on the one screen that exists to say what
 * just happened they were context nobody came for. What is left is the pair of
 * diffs `finishRound` takes across the SRS: how many words were new, and how
 * many crossed into the suitcase.
 *
 * The collected tile carries the WORDS as well as the count, which is the old
 * "Collected for Casey" section folded in: the same names, tappable in the
 * same way, in the tile that counts them instead of a block of their own
 * below the fold.
 */
function RoundStats({
  discovered,
  collected,
  collectedWords,
}: {
  discovered: number
  collected: number
  collectedWords: { wordId: string; da: string }[]
}) {
  return (
    <section className="summary-stats" aria-label="What this round did">
      <div className="stat stat-discovered">
        <span className="stat-n">{discovered}</span>
        <span className="stat-label">new this round</span>
      </div>
      {/* Hidden at zero rather than drawn as a 0: a round that collected
          nothing has nothing to say here, and an empty tile beside a full one
          reads as a failure rather than as a quiet round. */}
      {collected > 0 && (
        <div className="stat stat-collected">
          <span className="stat-n">{collected}</span>
          <span className="stat-label">collected for Casey</span>
          <TileWords words={collectedWords} />
        </div>
      )}
    </section>
  )
}

/**
 * The same two tiles for a wrap-up round, counting the thing that round is for.
 *
 * A wrap-up packs at most thirteen — N2 moved it onto the 3×6 board — and what
 * it did not pack is not lost: those words stayed collected and the next token
 * can take them. Both halves are said, because "7 wrapped for good" alone
 * leaves a player counting the cards they packed and wondering where the other
 * three went.
 */
function WrapUpStats({
  wrappedWords,
  stayed,
}: {
  wrappedWords: { wordId: string; da: string }[]
  stayed: number
}) {
  return (
    <section className="summary-stats" aria-label="What this wrap-up round packed">
      <div className="stat stat-wrapped">
        <span className="stat-n">{wrappedWords.length}</span>
        <span className="stat-label">wrapped for good</span>
        <TileWords words={wrappedWords} />
      </div>
      {stayed > 0 && (
        <div className="stat stat-stayed">
          <span className="stat-n">{stayed}</span>
          <span className="stat-label">stayed</span>
        </div>
      )}
    </section>
  )
}

export function RoundSummary({ game }: { game: GameState }) {
  /**
   * Collapsed to start with, and in React state rather than on a `<details>`.
   *
   * The `<details>` element keeps its open state on the DOM node, which is the
   * trap this codebase has already paid for once (README, the lookup field: it
   * was a drawer inside a dock that unmounts with the phase, so the lid cost a
   * tap every single turn). Here the direction of the bug would be the other
   * way — a `<details>` left open would hand the next round's summary an
   * expanded transcript before the player has read the outcome — and either way
   * the state belongs where the round can reset it.
   */
  const [logOpen, setLogOpen] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const newGame = useGame((s) => s.newGame)
  const newlyLearned = useGame((s) => s.newlyLearned)
  const newlyDiscovered = useGame((s) => s.newlyDiscovered)
  const mode = useGame((s) => s.mode)
  const packed = useGame((s) => s.packed)
  const wrappable = useGame((s) => s.wrappable)
  const earnedWrapUp = useGame((s) => s.earnedWrapUp)
  const banked = useSrs((s) => s.wrapUpsBanked)
  const winsToward = useSrs((s) => s.winsTowardWrapUp)
  const gamesWon = useSrs((s) => s.games.won)
  const goTo = useUi((s) => s.goTo)
  // What a wrap-up round wrapped: wrappable AND packed AND found green, the
  // exact mirror of finishRound — including W1's third conjunct, so the tile
  // cannot claim a top-up card the ledger did not take.
  const packable = wrappableIds(game, wrappable)
  const wrappedWords =
    mode === 'wrapup'
      ? game.words.filter(
          (w) =>
            packable.includes(w.wordId) &&
            packed.includes(w.wordId) &&
            game.reveals[w.wordId]?.kind === 'green',
        )
      : []
  // Collected before the deal and still only collected after it: the cards
  // this token could have packed and did not.
  const stayed = packable.length - wrappedWords.length
  const collectedWords = newlyLearned
    .map((id) => game.words.find((w) => w.wordId === id))
    .filter((w): w is NonNullable<typeof w> => !!w)
  const outcome = game.outcome!
  const copy = OUTCOME_COPY[`${outcome.result}:${outcome.reason}` as OutcomeKey]
  // The board is gone by the time this renders, so an ending caused by one
  // card has to say which card. The last chance is now the only such ending,
  // and it no longer leaves a role that names itself: a forbidden hit revealed
  // the one and only `forbidden` card, whereas a lost last chance just writes
  // another bystander.
  //
  // What identifies it: the last chance pushes no guess record — the reducer
  // writes the reveal and returns — and it is the only thing that burns a card
  // against BOTH sides in one go. So the card is the one neither clue ever
  // touched. A word already burned against one side by a clue and then named
  // here is indistinguishable, and this deliberately shows nothing rather than
  // pointing at the wrong card.
  const namedUnderAClue = new Set(game.clueHistory.flatMap((c) => c.guesses.map((g) => g.wordId)))
  const fatal =
    outcome.reason === 'sudden-death'
      ? game.words.find((w) => {
          const r = game.reveals[w.wordId]
          return r?.kind === 'bystander' && r.against.length === 2 && !namedUnderAClue.has(w.wordId)
        })
      : undefined
  // The last chance has no clue-giver: the player named it themselves.
  const fatalBy = 'You named'
  const da = (id: string) => game.words.find((w) => w.wordId === id)?.da ?? id

  return (
    // ONE FIXED SCREEN (P1). There is no scroller here any more, inner or
    // outer: every band below is bounded, and the one thing that never could
    // be — the transcript — opens as a panel OVER this column rather than
    // lengthening it.
    //
    // .round-summary is the positioned ancestor that panel resolves against,
    // and that is load-bearing twice over: every .visually-hidden span in the
    // log is position:absolute, and with nothing positioned between them and
    // .app-shell they park 1px boxes at whatever y the log reaches. That is
    // what once handed a 640px phone a 1028px document.
    <div className="round-summary">
      {outcome.result === 'won' && <Confetti />}

      <div className={`outcome-banner outcome-${outcome.result}`}>
        <ClueyFace
          mood={outcome.result === 'won' ? 'happy' : 'oops'}
          className="cluey-mini summary-cluey"
        />
        <div className="outcome-said">
          <h2>{copy.title}</h2>
          <p>{copy.sub}</p>
          {fatal && (
            <p className="outcome-culprit">
              {fatalBy} «<span lang={ACTIVE.code}>{fatal.da}</span>» — {fatal.en[0]}.
            </p>
          )}
        </div>
      </div>

      {mode === 'wrapup' ? (
        <WrapUpStats wrappedWords={wrappedWords} stayed={stayed} />
      ) : (
        <RoundStats
          discovered={newlyDiscovered.length}
          collected={newlyLearned.length}
          collectedWords={collectedWords}
        />
      )}

      {/* What the win left behind, in one line. `earnedWrapUp` is read off the
          bank across recordGame rather than recomputed from the outcome, so a
          win that hit the cap says nothing here rather than promising a token
          it did not get. Since W1 a token costs THREE won rounds, so a win
          that did not earn one has something to say too: how many more. That
          is the whole of the economy stated where a player will actually meet
          it, and it is shown only after a win — a loss costs nothing and does
          not advance the counter, and nagging about the price on the way out
          of a lost round would be a scold for nothing. At the cap there is no
          counter to report, only the reason wins are not counting. */}
      {mode === 'normal' && (earnedWrapUp || outcome.result === 'won') && (
        <p className="earned-section summary-earned">
          {earnedWrapUp
            ? gamesWon === WINS_PER_WRAP_UP
              ? 'Wrap-up round unlocked — the round that packs collected words into the suitcase for good. Open the suitcase to spend it.'
              : `Wrap-up round earned — ${banked} banked. Spend one in the suitcase.`
            : banked >= WRAP_UP_BANK_CAP
              ? `The bank is full — ${WRAP_UP_BANK_CAP} wrap-up rounds is all the suitcase holds. Spend one and wins start counting again.`
              : `${winsToNextWrapUp({ banked, wins: winsToward })} more ${
                  winsToNextWrapUp({ banked, wins: winsToward }) === 1 ? 'win' : 'wins'
                } for a wrap-up round`}
        </p>
      )}

      {/* W1's line, kept exactly because of what it stops: losing a wrap-up did
          not cost these — finishRound wraps every packed-and-green card
          regardless of the outcome, so a harder wrap-up round (N2) never reads
          as a door that locks.

          ONE paragraph at most, and that is a layout rule as much as a copy
          one. The two things this had to be able to say — "nothing wrapped"
          and "losing cost you nothing" — can both be true at once, and two
          paragraphs of forty-odd pixels each is more than the fixed screen has
          spare. So the empty case carries "win or lose" itself. */}
      {mode === 'wrapup' && (wrappedWords.length === 0 || outcome.result !== 'won') && (
        <p className="earned-section summary-earned">
          {wrappedWords.length === 0
            ? 'Nothing wrapped — a word is packed when it was translated AND found green, win or lose.'
            : 'Losing cost you nothing here — a wrap-up banks what you packed and found green, win or lose.'}
        </p>
      )}

      {/* The round's greens, each in a sentence. P2 turns this into the
          one-at-a-time audio review that sits in the same rectangle. */}
      <RoundSentences game={game} />

      {/* The way out of the round, pushed to the bottom of the column by CSS
          so it is in the same place whatever a particular ending is tall
          enough to say. */}
      <div className="summary-actions">
        <button className="btn btn-primary" onClick={() => newGame()}>
          Play again
        </button>
        <button className="btn" onClick={() => goTo('home')}>
          Home
        </button>
      </div>

      {/* Every decision Casey made, with her account of it — behind a
          text-sized link UNDER the actions, and behind a lid that opens OVER
          the summary instead of under it. Two things changed here in P1. It is
          no longer a boxed section competing with the round's own numbers, and
          it is no longer in flow: it is the one thing on this screen with no
          bound on its height, and the screen is fixed now, so it gets a panel
          of its own to scroll inside. P4 turns that panel into a proper sheet
          in DictionarySheet's idiom and this link into "Casey's calls"; this
          is the same bargain in the smallest form that keeps the document
          still. */}
      <section className="log-section">
        <button
          className="log-toggle"
          aria-expanded={logOpen}
          aria-controls="round-turn-log"
          onClick={() => {
            const opening = !logOpen
            setLogOpen(opening)
            // The panel is reused across openings, so it has to be put back to
            // the top; it no longer has to scroll the page to itself, because
            // it covers the page.
            if (opening) requestAnimationFrame(() => logRef.current?.scrollTo({ top: 0 }))
          }}
        >
          <span className="log-toggle-mark" aria-hidden="true">
            {logOpen ? '▾' : '▸'}
          </span>
          <span className="log-toggle-label">What was said</span>
          <span className="log-toggle-count">
            {game.clueHistory.length} {game.clueHistory.length === 1 ? 'turn' : 'turns'}
          </span>
        </button>
        <div className="log-body" id="round-turn-log" ref={logRef}>
          {logOpen && (
            <>
              <button className="btn btn-ghost log-close" onClick={() => setLogOpen(false)}>
                ‹ Back to the round
              </button>
              {/* Flagging lives here and nowhere else: this is the only place
                  the reasoning is visible, and a verdict on a clue is only
                  worth anything next to the account Casey gave of it. Casey's
                  own turns only — flagging your own clue would be marking
                  your own homework. */}
              <p className="dim log-hint">
                Tap ⚑ on anything of Casey's that was a bad call. She is shown the ones you flag.
              </p>
              <ol className="turn-log">
                {game.clueHistory.map((c, i) => {
                  const clueId = clueFlagId(game.seed, i)
                  return (
                    <li key={i}>
                      <p className="turn-clue">
                        <strong>{c.by === 'player' ? 'You' : 'Casey'}:</strong> «{c.text}» (
                        {c.number})
                        {c.by === 'ai' && c.targets && (
                          <span className="dim">
                            {' '}
                            for <span lang={ACTIVE.code}>{c.targets.map(da).join(', ')}</span>
                          </span>
                        )}
                        {c.by === 'ai' && (
                          <FlagButton
                            id={clueId}
                            kind="clue"
                            what={c.text}
                            why={c.rationale}
                            label={`Casey's clue «${c.text}»`}
                          />
                        )}
                      </p>
                      {c.rationale && <p className="turn-why">{c.rationale}</p>}
                      <ul className="turn-guesses">
                        {c.guesses.map((g, gi) => (
                          <li key={gi} className={`guess-${g.result}`}>
                            <span className="result-mark" aria-hidden="true">
                              {g.result === 'green' ? '✓' : '·'}
                            </span>
                            <span lang={ACTIVE.code} className="guess-word">
                              {da(g.wordId)}
                            </span>
                            <span className="visually-hidden">
                              {g.result === 'green' ? ' — correct' : ' — neutral'}
                            </span>
                            {g.reasoning && <span className="turn-why guess-why">{g.reasoning}</span>}
                            {g.confidence !== undefined && (
                              // Said out loud because it is the number that
                              // decided the ORDER, and the first guess is
                              // played whatever it is — so a guess Casey was
                              // never sure of should look like one rather
                              // than like a considered choice.
                              <span className="guess-confidence">
                                {Math.round(g.confidence * 100)}% sure
                              </span>
                            )}
                            {/* Her guesses are the ones made under YOUR clue;
                                the rest of this list is your own tapping. */}
                            {c.by === 'player' && (
                              <FlagButton
                                id={guessFlagId(game.seed, i, gi)}
                                kind="guess"
                                what={da(g.wordId)}
                                underClue={c.text}
                                why={g.reasoning}
                                label={`Casey's guess «${da(g.wordId)}»`}
                              />
                            )}
                          </li>
                        ))}
                        {c.guesses.length === 0 && <li className="dim">no guess made</li>}
                      </ul>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
