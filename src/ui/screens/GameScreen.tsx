import { useEffect, useState } from 'react'
import { currentClue } from '../../engine/game'
import type { GameState } from '../../engine/types'
import { onPracticeCompanion, useGame, wrappableIds } from '../../stores/gameStore'
import { useUi } from '../../stores/uiStore'
import { AiTurnPanel } from '../components/AiTurnPanel'
import { BoardGrid } from '../components/BoardGrid'
import { ClueInput } from '../components/ClueInput'
import { useOpenDictionary } from '../components/DictionarySheet'
import { HearBoard } from '../components/HearBoard'
import { PackingDock } from '../components/PackingDock'
import { RoundSummary } from '../components/RoundSummary'
import { useDictionary } from '../components/TranslateBox'
import { TurnTokens } from '../components/TurnTokens'
import { TutorialDock } from '../components/TutorialDock'
import { HINT_KEYS, useFirstTimeHint } from '../hints'
import { playWord } from '../speak'

const PHASE_CAPTION: Record<GameState['phase'], string> = {
  playerClueInput: 'Give Casey a clue',
  aiGuessing: 'Casey is guessing',
  aiClueInput: 'Casey prepares a clue',
  playerGuessing: 'Your turn to guess',
  suddenDeath: 'Last chance — no clues left',
  finished: 'Round over',
}

export function GameScreen() {
  const game = useGame((s) => s.game)
  const studying = useGame((s) => s.studying)
  const mode = useGame((s) => s.mode)
  const packed = useGame((s) => s.packed)
  const wrappable = useGame((s) => s.wrappable)
  const packingDone = useGame((s) => s.packingDone)
  const { error, aiBusy, planForClueIndex, selectedWordId, clearError } = useGame()
  const practiceFallback = useGame((s) => s.practiceFallback)
  const fallBackToPractice = useGame((s) => s.fallBackToPractice)
  const lastAiGuess = useGame((s) => s.lastAiGuess)
  // The daily challenge is one shared board per date, so it is the one round
  // that must not be re-dealt.
  const dailyKey = useGame((s) => s.dailyKey)
  const { translationsOn, toggleTranslations, goTo } = useUi()
  const openDictionary = useOpenDictionary()

  // The wrap-up packing phase: cards English-side up until translated.
  const packing = mode === 'wrapup' && !packingDone
  // The onboarding tutorial (O2): the same screen and the same engine, with
  // Casey's scripted dock standing where the phase docks would.
  const tutorial = mode === 'tutorial'
  // Skipped cards keep their English face for the WHOLE round — the visible
  // mark of "cannot wrap this time".
  //
  // Only the WRAPPABLE cards ever wear an English face (W1): a wrap-up board
  // is topped up from the rest of the city when the collected pool is thin,
  // and a top-up card has nothing to pack, so it opens Danish-side up like the
  // ordinary card it is and wears the quiet mark below instead.
  const packable = wrappableIds(game, wrappable)
  const englishFace =
    mode === 'wrapup'
      ? (id: string) => packable.includes(id) && !packed.includes(id)
      : undefined
  const notWrappable =
    mode === 'wrapup' ? (id: string) => !packable.includes(id) : undefined

  // Drive the AI side of the loop off the game phase. Guards inside the store
  // actions make this safe under StrictMode double-invocation and reloads.
  useEffect(() => {
    if (!game || studying || packing) return // nobody plays until the board has been read
    const s = useGame.getState()
    if (
      game.phase === 'aiGuessing' &&
      s.planForClueIndex !== game.clueHistory.length &&
      !s.aiBusy &&
      !s.error
    ) {
      void s.runAiGuesses()
    }
    if (game.phase === 'aiClueInput' && !s.aiBusy && !s.error) void s.runAiClue()
    if (game.phase === 'finished' && !s.roundRecorded) s.finishRound()
  }, [game, studying, packing, error, aiBusy, planForClueIndex])

  useEffect(() => {
    if (!game) goTo('home')
  }, [game, goTo])
  if (!game) return null

  const showBoard = game.phase !== 'finished'

  const announcement = (() => {
    if (game.phase === 'aiGuessing' && lastAiGuess) {
      const word = game.words.find((w) => w.wordId === lastAiGuess.wordId)
      const result = game.reveals[lastAiGuess.wordId]?.kind
      if (word && result) {
        return `Casey guessed ${word.da} — ${result === 'green' ? 'correct' : 'neutral'}.`
      }
    }
    if (aiBusy) return 'Casey is thinking.'
    return PHASE_CAPTION[game.phase]
  })()

  const handleTranslationsToggle = () => {
    if (!translationsOn) {
      // Turning the overlay on counts as looking up every word that is not
      // already solved green — a bystander-revealed word can still be guessed
      // under the other side's clue, so it counts too.
      const s = useGame.getState()
      for (const w of game.words) {
        if (game.reveals[w.wordId]!.kind !== 'green') s.recordLookup(w.wordId)
      }
    }
    toggleTranslations()
  }

  return (
    <div className="screen game-screen">
      {/* While the keyboard is up, a tap anywhere else puts it away — and does
          nothing else. It is a real element rather than a document listener
          precisely so the tap lands HERE: dismissing the keyboard and also
          guessing the card you happened to touch is two actions from one tap,
          and the second one costs a turn nobody chose to spend. (It used to
          cost the whole round — that tap could land on a forbidden word.)
          The next tap, with the keyboard down, does what it says.
          IN THE GAME SCREEN only, because the board is what it protects:
          rendered app-wide it swallowed the first tap on Settings and the
          backup panel, whose inputs live in no dock. */}
      <div
        className="kb-scrim"
        aria-hidden="true"
        onPointerDown={() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        }}
      />
      <header className="game-header">
        {tutorial ? (
          // Skip is always visible — the study-phase precedent, the same
          // standing rule the train acts keep. It ends the intro the way the
          // ticket's skip does; the half-played round goes with it, its SRS
          // already banked by finishRound if the round got that far.
          <button
            className="btn onboard-skip"
            onClick={() => {
              useGame.getState().abandonGame()
              useUi.getState().finishOnboarding()
            }}
          >
            Skip
          </button>
        ) : (
          <button className="icon-btn" aria-label="Home" onClick={() => goTo('home')}>
            ←
          </button>
        )}
        {/* Re-deal, as a symbol in the header rather than a worded button in
            the composer — where it cost a whole line of a block that has to
            fit above a keyboard. It exists only before the first clue, when
            nothing has been spent and nothing is being undone, and never on
            the daily challenge, which is one shared board per date. */}
        {game.phase === 'playerClueInput' && game.clueHistory.length === 0 && !dailyKey && (
          <button
            className="icon-btn"
            aria-label="Deal new words"
            title="Deal new words"
            onClick={() => useGame.getState().rerollBoard()}
          >
            ↻
          </button>
        )}
        <div className="game-header-mid">
          <TurnTokens
            total={game.config.turnTokens}
            left={game.turnsLeft}
            given={game.clueHistory.length}
          />
          <p className="phase-caption" role="status">
            {packing ? 'Pack the board' : PHASE_CAPTION[game.phase]}
            {/* Which build this is, on the screen every bug report is taken
                of. A photograph of the app was unattributable without it, and
                one round of "still broken" turned out to be a build that
                predated the fix by two minutes. Native only: on the web the
                deploy is whatever the page was loaded from. */}
            {__TF_BUILD__ && <span className="build-tag"> · b{__TF_BUILD__}</span>}
          </p>
        </div>
        {/* Optional, never automatic, and gone during packing — the cards are
            English-side up in that phase and the Danish would be the answer.
            Only while the board is on screen: at `finished` there is no board
            to read. */}
        {showBoard && !packing && <HearBoard game={game} />}
        <button
          className="icon-btn"
          aria-label="How to play"
          onClick={() => useUi.getState().openHowTo()}
        >
          ?
        </button>
        <button
          className={`icon-btn ${translationsOn ? 'icon-btn-active' : ''}`}
          // The on/off state was carried by background colour alone.
          aria-pressed={translationsOn}
          aria-label={
            translationsOn
              ? 'Hide translations'
              : 'Show every translation — counts as looking up each unsolved word'
          }
          disabled={studying}
          onClick={handleTranslationsToggle}
        >
          Aa
        </button>
      </header>

      {/* Casey's whole turn happened in silence: every status message in the
          loop was a plain paragraph that never took focus, so no screen reader
          had reason to speak it. This region is mounted for the whole round —
          a live region that appears with its content does not announce. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      {error && (
        <div className="error-banner" role="alert">
          <p>{error}</p>
          <div className="error-actions">
            <button className="btn btn-small" onClick={clearError}>
              Retry
            </button>
            {/* Retry alone is a dead end when the key is wrong, missing, or
                blocked — and the board is already dealt. This finishes the
                round offline rather than throwing it away. */}
            <button className="btn btn-small" onClick={fallBackToPractice}>
              Play on without Casey
            </button>
          </div>
        </div>
      )}

      {/* Not on the end screen (P1). The only thing this sentence exists to
          tell someone is that Casey is not answering and where the switch is,
          and once the round is finished there is nothing left for her to
          answer — while the 53px it costs is 53px off a summary that has to
          fit a 640px phone with no scroller. */}
      {onPracticeCompanion(practiceFallback) && !error && game.phase !== 'finished' && (
        // Say what is true: since E3 the practice companion is the local clue
        // engine — real clues from the word book, guesses ranked by the judged
        // matrix — not the hash-scrambled mock this line used to apologise
        // for. It still is not Casey (no model, no reasoning). Keyed on the
        // companion actually in use, not on the fallback flag — the settings
        // route reached the same object and said nothing. smoke-drive asserts
        // this wording; change both together.
        //
        // E4 HAS THE NUMBER NOW AND THE COPY DELIBERATELY DOES NOT CARRY IT.
        // The engine reads an independently-authored clue between a p = 0.6 and
        // a p = 0.7 partner on city-1 boards — decent, and worth nothing to a
        // player as a figure. Two reasons not to warm the line up on the
        // strength of it: the only thing this sentence exists to tell someone
        // mid-round is that Casey is not answering and where the switch is;
        // and the engine has data for city 1 ALONE, so past it `searchClue`
        // returns null and the mock answers under the same banner. A warmer
        // sentence would be false for eight cities in nine until E6 lands.
        <p className="practice-note">
          Practice companion — Casey is offline, a little word book is playing for her. Settings
          turns it off.
        </p>
      )}

      {showBoard && (
        <div className="board-area">
          <BoardGrid
            game={game}
            translationsOn={translationsOn || studying}
            canGuess={
              !studying &&
              !packing &&
              (game.phase === 'playerGuessing' || game.phase === 'suddenDeath')
            }
            selectedWordId={selectedWordId}
            onCardTap={(id) => useGame.getState().selectWord(id)}
            onInfoTap={openDictionary}
            dictionaryLocked={packing}
            englishFace={englishFace}
            notWrappable={notWrappable}
            packingSelectable={packing}
          />
        </div>
      )}

      {/* The key legend stood here — a swatch reading "your target" and a ⓘ
          reading "look up", one line between the board and the dock. K2 took
          it out, and it is a deletion rather than a move: the border IS the
          legend (README's rule, and the card's aria-label says "your target"
          in words for anyone who cannot see it), and a ⓘ on a card explains
          itself the moment it is tapped. What it cost was 17.3px plus the
          column's 12px gap on a screen that must fit 640px, in every phase of
          every round, for a sentence read once. The board has it now. */}

      {studying && (
        <div className="dock study-dock">
          <p className="dock-title">Study the board</p>
          {/* Two lines, and the give-way region of this dock: it is prose and
              may be cut, which is what lets the dock hold --dock-h with the
              button pinned under it. */}
          <p className="study-hint">
            Every translation is shown. They hide when you start, and a tap looks one up.
          </p>
          <button className="btn btn-primary btn-big" onClick={() => useGame.getState().endStudy()}>
            Start the round
          </button>
        </div>
      )}

      {packing && <PackingDock game={game} />}

      {/* The tutorial's scripted dock stands in for every phase dock at once —
          including the round's end, where it celebrates and doors to Home
          instead of the summary. Everything above (board, tokens, ⓘ, Aa, the
          dictionary) is the real thing; only the dock is Casey's. */}
      {/* The panel IS the reserve again (K2). There was a `.dock-slot` wrapper
          here holding --dock-slot-h while the dock inside hugged its own
          content, because the docks were different heights and the difference
          had to be held as air rather than as grey. Every dock a round can be
          in is now --dock-h exactly — study and packing included, which is why
          they are not wrapped either — so the wrapper had nothing left to
          reserve and went. The tutorial keeps a slot, because its dock changes
          shape every beat and is deliberately taller (I2 moves the bubble). */}
      {tutorial ? (
        <div className="tutorial-slot">
          <TutorialDock game={game} />
        </div>
      ) : (
        <>
          {game.phase === 'playerClueInput' && !studying && !packing && (
            <ClueInput game={game} onSubmit={(t, n) => useGame.getState().submitPlayerClue(t, n)} />
          )}
          {(game.phase === 'aiGuessing' || game.phase === 'aiClueInput') &&
            !studying &&
            !packing && <AiTurnPanel game={game} />}
          {game.phase === 'playerGuessing' && !studying && !packing && (
            <PlayerGuessBar game={game} />
          )}
          {game.phase === 'suddenDeath' && !studying && !packing && <SuddenDeathBar game={game} />}
          {game.phase === 'finished' && <RoundSummary game={game} />}
        </>
      )}
    </div>
  )
}

/**
 * The clues are gone and the board is not finished. Codenames Duet ends this
 * way rather than on a buzzer: keep naming words, with nothing to go on but
 * what the clues already meant, and one wrong name ends it.
 *
 * The greens on your own key are the ones you can already see, so what is left
 * is whatever Casey was pointing at and you never worked out. No target count
 * is shown on purpose — knowing how many remain is most of the puzzle.
 */
function SuddenDeathBar({ game }: { game: GameState }) {
  const { selectedWordId } = useGame()
  const selected = selectedWordId ? game.words.find((w) => w.wordId === selectedWordId) : null

  return (
    <div className="dock guess-bar sudden-death-bar">
      <p className="dock-title">Last chance — no clues left</p>
      {/* ONE line (K2), where three sentences used to stand. It is still the
          dock's give-way region — prose, so it may be cut — but it no longer
          has to give way for anything: the dock is --dock-h like every other
          one, and the sentence that survived is the whole rule. */}
      <p className="dim dock-flex">Name greens to win. Anything else ends it.</p>
      {/* One row, not two. Giving up and confirming a name are alternatives —
          you cancel a selection before you walk away from the round — so they
          share a row rather than each reserving one. The second row was 56px
          of the dock's reserve, and the dock's reserve is the board's size in
          every phase of the round. */}
      <div className="dock-actions">
        {selected ? (
          <div className="guess-confirm">
            <button
              className="btn btn-primary"
              onClick={() => {
                // Committing to a word is the moment you have most reason to
                // hear it, and the button is already saying it in writing.
                void playWord(selected.wordId, selected.da)
                useGame.getState().playerGuess(selected.wordId)
              }}
            >
              Name «{selected.da}»
            </button>
            <button className="btn" onClick={() => useGame.getState().selectWord(null)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={() => useGame.getState().playerStop()}>
            Give up the round
          </button>
        )}
      </div>
    </div>
  )
}

function PlayerGuessBar({ game }: { game: GameState }) {
  const { selectedWordId } = useGame()
  const clue = currentClue(game)!
  const made = clue.guesses.length
  const left = clue.number - made
  const selected = selectedWordId ? game.words.find((w) => w.wordId === selectedWordId) : null
  // Taps on the clue in the title, each one sending it to the dictionary
  // below. A counter, so the same clue can be asked for again after the field
  // has been typed over — see TranslateBox's `fill`.
  const [lookUps, setLookUps] = useState(0)
  // The first guessing turn ever restates the rule the tutorial's staged miss
  // taught, in the hint slot that already exists — the line a selection swaps
  // away, so the dock's reserved height never grows (O4). Once ever, via
  // cluecab-hint-guess; never in the tutorial, whose dock replaces this one.
  const firstGuessEver = useFirstTimeHint(HINT_KEYS.guess)

  // The dictionary, taken apart the way the composer takes it apart (K1's
  // `useDictionary`): its field and its one answer sit side by side on the
  // dock's last row instead of stacked in a box of their own. The box was two
  // rows plus its own rule and padding; this is one.
  const dictionary = useDictionary({ term: clue.text, nonce: lookUps })

  return (
    <div className="dock guess-bar">
      {/* Three rows, the same three the composer has and the same height (K2):
          the title, ONE action row, and the dictionary. Nothing here may add a
          fourth.

          The clue is the button that looks it up. It was printed here AND
          offered again on the dictionary's own line ("Look up Casey's clue")
          one row below — two rows for one word, in the dock whose height is
          the board's height for the whole round. Tapping the word you cannot
          read is also the more obvious gesture of the two.

          "· 2 guesses left" rather than "— up to 2 more guesses": the title is
          nowrap and ellipsized, so what it says has to fit a long Danish clue
          beside it. */}
      <p className="dock-title">
        Casey's clue{' '}
        <button
          className="clue-lookup"
          aria-label={`Look up «${clue.text}» in the dictionary`}
          onClick={() => setLookUps((n) => n + 1)}
        >
          «{clue.text}»
        </button>{' '}
        ({clue.number}) · {left} guess{left === 1 ? '' : 'es'} left
      </p>
      {/* A stake note stood here explaining what a forbidden tap cost and whose
          forbidden words were in play. Nothing on this screen is fatal any
          more: a wrong guess spends the turn, and that is the whole stake. */}
      {/* One row for all three states. Stopping and confirming a guess are
          alternatives — a selected card is cancelled before you stop — so the
          stop button lives where the hint was rather than reserving a row of
          its own underneath it. That row was 74px of the reserve at 360x640
          (66 of button, wrapped to two lines, and an 8px gap), and the reserve
          is the board's height in every phase of the round — including the
          ones with no stop button in them at all.

          The row is also this dock's give-way region, so the difference
          between a 49px button and a one-line hint is spent HERE rather than
          moving the dictionary under it. */}
      <div className="dock-actions">
        {selected ? (
          <div className="guess-confirm">
            <button
              className="btn btn-primary"
              onClick={() => {
                void playWord(selected.wordId, selected.da)
                useGame.getState().playerGuess(selected.wordId)
              }}
            >
              Guess «{selected.da}»
            </button>
            <button className="btn" onClick={() => useGame.getState().selectWord(null)}>
              Cancel
            </button>
          </div>
        ) : made > 0 ? (
          // Only once a guess has been made, which is also the only moment the
          // hint below has nothing left to teach — the player has just done the
          // thing it describes.
          <button className="btn btn-ghost" onClick={() => useGame.getState().playerStop()}>
            Stop — keep what we have
          </button>
        ) : (
          <p className={firstGuessEver ? 'dim first-hint' : 'dim'}>
            {firstGuessEver
              ? // A guess is judged against the clue-giver's key — Casey clued,
                // so his key is the one being read. Said forwards, the way
                // game.test.ts pins it; the phase-specific consequence only.
                "It is Casey's key that counts now — tap a word her clue points at."
              : 'Tap a word you think Casey means.'}
          </p>
        )}
      </div>
      {/* Casey clues in Danish when asked to, and a clue you cannot read is
          not a clue. The title above is the tap that fills this. */}
      <div className="dock-dictionary">
        {dictionary.field}
        <div className="dict-line">{dictionary.line}</div>
      </div>
    </div>
  )
}
