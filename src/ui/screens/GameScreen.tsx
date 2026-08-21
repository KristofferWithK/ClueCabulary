import { useEffect, useState } from 'react'
import { currentClue } from '../../engine/game'
import type { GameState } from '../../engine/types'
import { onPracticeCompanion, useGame } from '../../stores/gameStore'
import { useUi } from '../../stores/uiStore'
import { AiTurnPanel } from '../components/AiTurnPanel'
import { BoardGrid } from '../components/BoardGrid'
import { ClueInput } from '../components/ClueInput'
import { useOpenDictionary } from '../components/DictionarySheet'
import { HearBoard } from '../components/HearBoard'
import { PackingDock } from '../components/PackingDock'
import { RoundSummary } from '../components/RoundSummary'
import { TranslateBox } from '../components/TranslateBox'
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
  const englishFace = mode === 'wrapup' ? (id: string) => !packed.includes(id) : undefined

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

      {onPracticeCompanion(practiceFallback) && !error && (
        // Say it for as long as it is true: these clues and guesses are not
        // Casey's, and the player should not judge the AI companion by them.
        // Keyed on the companion actually in use, not on the fallback flag —
        // the settings route reached the same object and said nothing.
        <p className="practice-note">
          Practice companion — random guesses, Casey is not playing. Settings turns it off.
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
            packingSelectable={packing}
          />
        </div>
      )}

      {showBoard && (
        <p className="key-legend">
          {/* One line, always: the legend sits between the board and the dock
              on a screen that must FIT a 640px phone. It had a second swatch
              for the dashed forbidden cards, which no longer exist. */}
          <span className="legend-swatch legend-target" aria-hidden="true" /> your target
          <span className="legend-sep">·</span>
          <span aria-hidden="true">ⓘ</span> look up
        </p>
      )}

      {studying && (
        <div className="dock study-dock">
          <p className="dock-title">Study the board</p>
          <p className="study-hint">
            Every translation is shown. Once you start they hide, and you can tap a single word to
            look it up.
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
      {/* The reserve is the SLOT, not the panel.
          It used to be the panel: every dock was given the tallest dock's
          height, so the clue composer — which wants 126px — was drawn as a
          200px sheet of grey with its fields stranded at the top of it. The
          board has to be locked, and the space genuinely has to be held; what
          it does not have to be is painted. The slot holds it and stays
          invisible, and the dock inside hugs its own content against the
          bottom edge. So the field sits low, whatever phase it is, and a
          lookup answer grows the panel UPWARDS into space that was already
          spoken for rather than moving anything. */}
      {tutorial ? (
        <div className="dock-slot tutorial-slot">
          <TutorialDock game={game} />
        </div>
      ) : (
        <>
          {!studying && !packing && game.phase !== 'finished' && (
            <div className="dock-slot">
              {game.phase === 'playerClueInput' && (
                <ClueInput
                  game={game}
                  onSubmit={(t, n) => useGame.getState().submitPlayerClue(t, n)}
                />
              )}
              {(game.phase === 'aiGuessing' || game.phase === 'aiClueInput') && (
                <AiTurnPanel game={game} />
              )}
              {game.phase === 'playerGuessing' && <PlayerGuessBar game={game} />}
              {game.phase === 'suddenDeath' && <SuddenDeathBar game={game} />}
            </div>
          )}
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
      {/* The dock's give-way region: it is prose, so it may be cut, and it is
          what absorbs whatever the row below it happens to be. */}
      <p className="dim dock-flex">
        Keep naming green words and you can still win this. Name anything else and the round is
        over. Tap a word you are sure of.
      </p>
      {/* One row, not two. Giving up and confirming a name are alternatives —
          you cancel a selection before you walk away from the round — so they
          share a row rather than each reserving one. The second row was 56px
          of the dock's reserve, and the dock's reserve is the board's size in
          every phase of the round. */}
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

  return (
    <div className="dock guess-bar">
      {/* The clue is the button that looks it up. It was printed here AND
          offered again on the dictionary's own line ("Look up Casey's clue")
          one row below — two rows for one word, in the dock whose height is
          the board's height for the whole round. Tapping the word you cannot
          read is also the more obvious gesture of the two. */}
      <p className="dock-title">
        Casey's clue:{' '}
        <button
          className="clue-lookup"
          aria-label={`Look up «${clue.text}» in the dictionary`}
          onClick={() => setLookUps((n) => n + 1)}
        >
          «{clue.text}»
        </button>{' '}
        ({clue.number}) — up to {left} more guess
        {left === 1 ? '' : 'es'}
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
          ones with no stop button in them at all. */}
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
      {/* Casey clues in Danish when asked to, and a clue you cannot read is
          not a clue. The title above is the tap that fills this. */}
      <TranslateBox fill={{ term: clue.text, nonce: lookUps }} />
    </div>
  )
}
