import { useRef, useState } from 'react'
import { WORDS } from '../../data/words'
import type { GameState, Outcome } from '../../engine/types'
import { WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { countCollection, wordsForCity } from '../../journey/progress'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import { useSrs } from '../../stores/srsStore'
import { clueFlagId, guessFlagId, useFeedback } from '../../stores/feedbackStore'
import { useUi } from '../../stores/uiStore'
import { RoundSentences } from './RoundSentences'
import { SpeakWord } from './SpeakWord'
import { ACTIVE } from '../../lang/active'

const CONFETTI_COLORS = ['#6aaa64', '#c9b458', '#567b95', '#121212', '#e3735e']

/** One-shot CSS confetti burst — deterministic layout, no dependencies.
 *  Exported for the tutorial's win beat, which celebrates without the summary. */
export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 7) * 0.12}s`,
            animationDuration: `${2 + (i % 5) * 0.3}s`,
          }}
        />
      ))}
    </div>
  )
}

/**
 * Every ending, keyed by `result:reason`. Typed off the Outcome union rather
 * than `Record<string, …>`, so an ending added to the engine fails the build
 * here instead of reading `undefined!` and throwing on the summary screen the
 * first time a player reaches it.
 */
type OutcomeKey = Outcome extends infer O
  ? O extends Outcome
    ? `${O['result']}:${O['reason']}`
    : never
  : never

const OUTCOME_COPY: Record<OutcomeKey, { title: string; sub: string }> = {
  'won:all-greens': { title: 'You won! 🎉', sub: 'Every green word found together.' },
  // Reached by giving up in sudden death now, not by the clock running out —
  // the clock hands you sudden death instead of ending the round.
  'lost:timeout': { title: 'Round given up', sub: 'The connection was there — next time.' },
  'lost:sudden-death': {
    title: 'Sudden death',
    sub: 'One word too far. The clues were spent and that one was not green.',
  },
}

/**
 * One tap to say "that was a bad call", on the screen where the reasoning is.
 *
 * A toggle, not a report form: the player is looking at a finished round and
 * the useful signal is cheap to give. Everything needed to show Casey what he
 * did — the word, the clue it was made under, and his own account of it — is
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
      aria-label={flagged ? `${label} — flagged as a bad call. Tap to undo` : `Flag ${label} as a bad call`}
      onClick={() => toggleFlag({ id, kind, what, underClue, why })}
    >
      ⚑
    </button>
  )
}

/**
 * What the round did, in numbers the app already holds.
 *
 * This screen used to open with a paragraph Casey wrote about the round —
 * one model call per round, several seconds of "Casey is gathering his
 * thoughts…", and prose in place of the two facts a learner is actually
 * counting: how many words were new, and how many crossed into the suitcase.
 * Those are both diffs `finishRound` takes across the SRS, and the collection
 * totals beside them come from the same `countCollection` the suitcase and Home
 * are drawn from, so every number here is the one the rest of the app shows.
 */
function RoundStats({
  discovered,
  collected,
  cityIndex,
}: {
  discovered: number
  collected: number
  cityIndex: number
}) {
  const wrapped = useJourney((s) => s.wrapped)
  const srs = useSrs((s) => s.stats)
  // Collected-or-better, which is what "in the suitcase" means everywhere else:
  // a wrapped word is a collected word that has also been packed.
  const city = countCollection(wordsForCity(WORDS, cityIndex), srs, wrapped)
  const all = countCollection(WORDS, srs, wrapped)

  return (
    <section className="summary-stats" aria-label="What this round did, and where it leaves you">
      <div className="stat stat-discovered">
        <span className="stat-n">{discovered}</span>
        <span className="stat-label">new this round</span>
      </div>
      <div className="stat stat-collected">
        <span className="stat-n">{collected}</span>
        <span className="stat-label">collected this round</span>
      </div>
      <div className="stat stat-city">
        <span className="stat-n">
          {city.collected + city.wrapped}/{WORDS_PER_CITY}
        </span>
        <span className="stat-label">in {cityAt(cityIndex).name}</span>
      </div>
      <div className="stat stat-total">
        <span className="stat-n">
          {all.collected + all.wrapped}/{all.total}
        </span>
        <span className="stat-label">of every word</span>
      </div>
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
  const logRef = useRef<HTMLElement>(null)
  const newGame = useGame((s) => s.newGame)
  const newlyLearned = useGame((s) => s.newlyLearned)
  const newlyDiscovered = useGame((s) => s.newlyDiscovered)
  const mode = useGame((s) => s.mode)
  const packed = useGame((s) => s.packed)
  const earnedWrapUp = useGame((s) => s.earnedWrapUp)
  const banked = useSrs((s) => s.wrapUpsBanked)
  const gamesWon = useSrs((s) => s.games.won)
  const goTo = useUi((s) => s.goTo)
  const cityIndex = useJourney((s) => s.cityIndex)
  const wrapped = useJourney((s) => s.wrapped)
  const srs = useSrs((s) => s.stats)
  // What a wrap-up round wrapped: packed AND found green, mirror of finishRound.
  const wrappedWords =
    mode === 'wrapup'
      ? game.words.filter(
          (w) => packed.includes(w.wordId) && game.reveals[w.wordId]?.kind === 'green',
        )
      : []
  const cityWrapped = countCollection(wordsForCity(WORDS, cityIndex), srs, wrapped).wrapped
  const outcome = game.outcome!
  const copy = OUTCOME_COPY[`${outcome.result}:${outcome.reason}` as OutcomeKey]
  // The board is gone by the time this renders, so an ending caused by one
  // card has to say which card. Sudden death is now the only such ending, and
  // it no longer leaves a role that names itself: a forbidden hit revealed the
  // one and only `forbidden` card, whereas a lost sudden death just writes
  // another bystander.
  //
  // What identifies it: sudden death pushes no guess record — the reducer
  // writes the reveal and returns — and it is the only thing that burns a card
  // against BOTH sides in one go. So the card is the one neither clue ever
  // touched. A word already burned against one side by a clue and then named
  // here is indistinguishable, and this deliberately shows nothing rather than
  // pointing at the wrong card.
  const namedUnderAClue = new Set(
    game.clueHistory.flatMap((c) => c.guesses.map((g) => g.wordId)),
  )
  const fatal =
    outcome.reason === 'sudden-death'
      ? game.words.find((w) => {
          const r = game.reveals[w.wordId]
          return r?.kind === 'bystander' && r.against.length === 2 && !namedUnderAClue.has(w.wordId)
        })
      : undefined
  // Sudden death has no clue-giver: the player named it themselves.
  const fatalBy = 'You named'
  const da = (id: string) => game.words.find((w) => w.wordId === id)?.da ?? id

  return (
    <div className="round-summary">
      {outcome.result === 'won' && <Confetti />}
      {/* Everything above the actions scrolls INSIDE this, never the document —
          the same bargain Settings makes. An expanded transcript is the one
          thing on this screen with no bound on its height, and the no-scroll
          rule is measured on document.scrollingElement. */}
      <div className="summary-scroll">
        <div className={`outcome-banner outcome-${outcome.result}`}>
          <h2>{copy.title}</h2>
          <p>{copy.sub}</p>
          {fatal && (
            <p className="outcome-culprit">
              {fatalBy} «<span lang={ACTIVE.code}>{fatal.da}</span>» — {fatal.en[0]}.
            </p>
          )}
        </div>

        <RoundStats
          discovered={newlyDiscovered.length}
          collected={newlyLearned.length}
          cityIndex={cityIndex}
        />

        {/* What the win left behind. `earnedWrapUp` is read off the bank
            across recordGame rather than recomputed from the outcome, so a win
            that hit the cap says nothing here rather than promising a token it
            did not get. The first one is written as an unlock because that is
            what it is — this is where a player finds out that wins buy the
            round that packs words for good. */}
        {earnedWrapUp && (
          <section className="summary-section earned-section">
            <h3>{gamesWon === 1 ? 'Wrap-up round unlocked' : 'Wrap-up round earned'}</h3>
            <p className="collected-note">
              {gamesWon === 1
                ? 'Winning earns a wrap-up round — the one round that packs collected words into the suitcase for good. Open the suitcase to spend it.'
                : `${banked} banked. Spend one in the suitcase to pack collected words for good.`}
            </p>
          </section>
        )}

        {/* The point of a wrap-up round: what went into the suitcase for good.
            Shown either way — a lost round keeps every word it wrapped. */}
        {mode === 'wrapup' && (
          <section className="summary-section collected-section">
            <h3>Wrapped and packed</h3>
            {wrappedWords.length > 0 ? (
              <>
                <ul className="collected-words">
                  {wrappedWords.map((w) => (
                    <li key={w.wordId} className="collected-word">
                      <span className="collected-mark" aria-hidden="true">
                        ●
                      </span>
                      <SpeakWord wordId={w.wordId} da={w.da} />
                      <span className="collected-en">{w.en[0]}</span>
                    </li>
                  ))}
                </ul>
                <p className="collected-note">
                  {wrappedWords.length === 1 ? 'One word' : `${wrappedWords.length} words`} wrapped —{' '}
                  {cityWrapped} of {WORDS_PER_CITY} packed in {cityAt(cityIndex).name}.
                </p>
              </>
            ) : (
              <p className="collected-note">
                Nothing wrapped this time — a word is packed when it was translated AND found green.
              </p>
            )}
          </section>
        )}

        {/* Which words the "collected this round" tile is counting. A loss can
            still green a word, so this is shown either way. The sentence that
            used to close it — "2 words collected — 34 of 100 in Sønderborg" —
            is gone: the stats block above says both halves of it. */}
        {newlyLearned.length > 0 && (
          <section className="summary-section collected-section">
            <h3>Collected for Casey</h3>
            <ul className="collected-words">
              {newlyLearned.map((id) => {
                const w = game.words.find((x) => x.wordId === id)
                if (!w) return null
                return (
                  <li key={id} className="collected-word">
                    <span className="collected-mark" aria-hidden="true">
                      ●
                    </span>
                    <SpeakWord wordId={w.wordId} da={w.da} />
                    <span className="collected-en">{w.en[0]}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* The round's greens, each in a sentence. Placed after the lists that
            name them and before the transcript: the words are the reward, this
            is what they are for, and the log is for the curious. */}
        <RoundSentences game={game} />

        {/* Every decision Casey made, with his account of it — behind a lid.
            It is the longest thing on the screen and the least urgent: a player
            who wants to know why he said «kæledyr» opens it, and the numbers
            above are what everyone else came for. The reasoning itself is not
            optional — the model had always written a reason for each guess and
            the engine used to drop it on the floor, so "why that word?" was the
            one question the app had thrown away. */}
        <section className="summary-section log-section" ref={logRef}>
          <button
            className="log-toggle"
            aria-expanded={logOpen}
            aria-controls="round-turn-log"
            onClick={() => {
              const opening = !logOpen
              setLogOpen(opening)
              // The lid sits below the fold, under four stat tiles and a
              // banner. Opening it without this looks like nothing happening:
              // the transcript unfolds off the bottom of the scroller and the
              // player is left looking at the same tiles they just tapped past.
              // Instant rather than smooth — a drive that clicks and measures
              // should not have to guess at an animation.
              if (opening) {
                requestAnimationFrame(() => logRef.current?.scrollIntoView({ block: 'start' }))
              }
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
          <div className="log-body" id="round-turn-log">
            {logOpen && (
              <>
                {/* Flagging lives here and nowhere else: this is the only place
                    the reasoning is visible, and a verdict on a clue is only
                    worth anything next to the account Casey gave of it. Casey's
                    own turns only — flagging your own clue would be marking
                    your own homework. */}
                <p className="dim log-hint">
                  Tap ⚑ on anything of Casey's that was a bad call. He is shown the ones you flag.
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
                              {g.reasoning && (
                                <span className="turn-why guess-why">{g.reasoning}</span>
                              )}
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
                              {/* His guesses are the ones made under YOUR clue;
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

      <div className="summary-actions">
        <button className="btn btn-primary" onClick={() => newGame()}>
          Play again
        </button>
        <button className="btn" onClick={() => goTo('home')}>
          Home
        </button>
      </div>
    </div>
  )
}
