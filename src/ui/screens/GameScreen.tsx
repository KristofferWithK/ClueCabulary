import { useEffect } from 'react'
import { currentClue } from '../../engine/game'
import type { GameState } from '../../engine/types'
import { useGame } from '../../stores/gameStore'
import { useUi } from '../../stores/uiStore'
import { AiTurnPanel } from '../components/AiTurnPanel'
import { BoardGrid } from '../components/BoardGrid'
import { ClueInput } from '../components/ClueInput'
import { DebriefPanel } from '../components/DebriefPanel'
import { useOpenDictionary } from '../components/DictionarySheet'
import { TranslateBox } from '../components/TranslateBox'
import { RedemptionView } from '../components/RedemptionView'
import { TurnTokens } from '../components/TurnTokens'

const PHASE_CAPTION: Record<GameState['phase'], string> = {
  playerClueInput: 'Give Klaus a clue',
  aiGuessing: 'Klaus is guessing',
  aiClueInput: 'Klaus prepares a clue',
  playerGuessing: 'Your turn to guess',
  suddenDeath: 'Sudden death — no clues left',
  redemption: 'Last chance',
  finished: 'Round over',
}

export function GameScreen() {
  const game = useGame((s) => s.game)
  const studying = useGame((s) => s.studying)
  const { error, aiBusy, planForClueIndex, selectedWordId, clearError } = useGame()
  const practiceFallback = useGame((s) => s.practiceFallback)
  const fallBackToPractice = useGame((s) => s.fallBackToPractice)
  const lastAiGuess = useGame((s) => s.lastAiGuess)
  const { translationsOn, toggleTranslations, goTo } = useUi()
  const openDictionary = useOpenDictionary()

  // Drive the AI side of the loop off the game phase. Guards inside the store
  // actions make this safe under StrictMode double-invocation and reloads.
  useEffect(() => {
    if (!game || studying) return // nobody plays until the board has been read
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
  }, [game, studying, error, aiBusy, planForClueIndex])

  useEffect(() => {
    if (!game) goTo('home')
  }, [game, goTo])
  if (!game) return null

  const showBoard = game.phase !== 'redemption' && game.phase !== 'finished'

  const announcement = (() => {
    if (game.phase === 'aiGuessing' && lastAiGuess) {
      const word = game.words.find((w) => w.wordId === lastAiGuess.wordId)
      const result = game.reveals[lastAiGuess.wordId]?.kind
      if (word && result) {
        const outcome =
          result === 'green' ? 'correct' : result === 'forbidden' ? 'forbidden' : 'neutral'
        return `Klaus guessed ${word.da} — ${outcome}.`
      }
    }
    if (aiBusy) return 'Klaus is thinking.'
    return PHASE_CAPTION[game.phase]
  })()

  const handleTranslationsToggle = () => {
    if (game.phase === 'redemption') return
    if (!translationsOn) {
      // Turning the overlay on counts as looking up every word that is not
      // already solved green — bystander-revealed words can still be guessed
      // (and quizzed in redemption), so they count too.
      const s = useGame.getState()
      for (const w of game.words) {
        if (game.reveals[w.wordId]!.kind !== 'green') s.recordLookup(w.wordId)
      }
    }
    toggleTranslations()
  }

  return (
    <div className="screen game-screen">
      <header className="game-header">
        <button className="icon-btn" aria-label="Home" onClick={() => goTo('home')}>
          ←
        </button>
        <div className="game-header-mid">
          <TurnTokens total={game.config.turnTokens} left={game.turnsLeft} />
          <p className="phase-caption" role="status">
            {PHASE_CAPTION[game.phase]}
          </p>
        </div>
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
          disabled={game.phase === 'redemption' || studying}
          onClick={handleTranslationsToggle}
        >
          Aa
        </button>
      </header>

      {/* Klaus's whole turn happened in silence: every status message in the
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
              Play on without Klaus
            </button>
          </div>
        </div>
      )}

      {practiceFallback && !error && (
        // Say it for the rest of the round: these clues are not Klaus's, and
        // the player should not judge the AI companion by them.
        <p className="practice-note">
          Playing on with the practice companion — Klaus sits this round out.
        </p>
      )}

      {showBoard && (
        <div className="board-area">
          <BoardGrid
            game={game}
            translationsOn={translationsOn || studying}
            canGuess={!studying && (game.phase === 'playerGuessing' || game.phase === 'suddenDeath')}
            selectedWordId={selectedWordId}
            onCardTap={(id) => useGame.getState().selectWord(id)}
            onInfoTap={openDictionary}
            dictionaryLocked={false}
          />
        </div>
      )}

      {showBoard && (
        <p className="key-legend">
          <span className="legend-dot legend-target" aria-hidden="true">
            ●
          </span>{' '}
          your target
          <span className="legend-sep">·</span>
          <span className="legend-dot legend-forbidden" aria-hidden="true">
            ✖
          </span>{' '}
          forbidden for you
          <span className="legend-sep">·</span>
          <span aria-hidden="true">ⓘ</span> look up
          {game.phase === 'playerGuessing' && (
            <>
              <br />
              A crossed-out word is spent for you; a neutral Klaus burned is still
              yours to guess.
            </>
          )}
        </p>
      )}

      {studying && (
        <div className="dock study-dock">
          <p className="dock-title">
            <span lang="da">Lær ordene</span> — study the board
          </p>
          <p className="study-hint">
            Every translation is shown. Once you start they hide, and you can tap a single word to
            look it up.
          </p>
          <button className="btn btn-primary btn-big" onClick={() => useGame.getState().endStudy()}>
            <span lang="da">Klar</span> — start the round
          </button>
        </div>
      )}

      {!studying && game.phase === 'playerClueInput' && (
        <ClueInput game={game} onSubmit={(t, n) => useGame.getState().submitPlayerClue(t, n)} />
      )}
      {!studying && (game.phase === 'aiGuessing' || game.phase === 'aiClueInput') && (
        <AiTurnPanel game={game} />
      )}
      {!studying && game.phase === 'playerGuessing' && <PlayerGuessBar game={game} />}
      {!studying && game.phase === 'suddenDeath' && <SuddenDeathBar game={game} />}
      {game.phase === 'redemption' && (
        <RedemptionView game={game} onSubmit={(a) => useGame.getState().submitRedemption(a)} />
      )}
      {game.phase === 'finished' && <DebriefPanel game={game} />}
    </div>
  )
}

/**
 * The clues are gone and the board is not finished. Codenames Duet ends this
 * way rather than on a buzzer: keep naming words, with nothing to go on but
 * what the clues already meant, and one wrong name ends it.
 *
 * The greens on your own key are the ones you can already see, so what is left
 * is whatever Klaus was pointing at and you never worked out. No target count
 * is shown on purpose — knowing how many remain is most of the puzzle.
 */
function SuddenDeathBar({ game }: { game: GameState }) {
  const { selectedWordId } = useGame()
  const selected = selectedWordId ? game.words.find((w) => w.wordId === selectedWordId) : null

  return (
    <div className="dock guess-bar sudden-death-bar">
      <p className="dock-title">
        <span lang="da">Alt eller intet</span> — no clues left
      </p>
      <p className="dim">
        Keep naming green words and you can still win this. Name anything else and the round is
        over.
      </p>
      {selected ? (
        <div className="guess-confirm">
          <button
            className="btn btn-primary"
            onClick={() => useGame.getState().playerGuess(selected.wordId)}
          >
            Name «{selected.da}»
          </button>
          <button className="btn" onClick={() => useGame.getState().selectWord(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <p className="dim">Tap a word you are sure of.</p>
      )}
      <button className="btn btn-ghost" onClick={() => useGame.getState().playerStop()}>
        Give up the round
      </button>
    </div>
  )
}

function PlayerGuessBar({ game }: { game: GameState }) {
  const { selectedWordId } = useGame()
  const clue = currentClue(game)!
  const made = clue.guesses.length
  const left = clue.number + 1 - made
  const selected = selectedWordId ? game.words.find((w) => w.wordId === selectedWordId) : null

  return (
    <div className="dock guess-bar">
      <p className="dock-title">
        Klaus's clue: <strong>«{clue.text}»</strong> ({clue.number}) — up to {left} more guess
        {left === 1 ? '' : 'es'}
      </p>
      {selected ? (
        <div className="guess-confirm">
          <button
            className="btn btn-primary"
            onClick={() => useGame.getState().playerGuess(selected.wordId)}
          >
            Guess «{selected.da}»
          </button>
          <button className="btn" onClick={() => useGame.getState().selectWord(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <p className="dim">Tap a word you think Klaus means.</p>
      )}
      {/* Klaus clues in Danish when asked to, and a clue you cannot read is
          not a clue. Prefilled from his, one tap. */}
      <TranslateBox klausClue={clue.text} />
      {made > 0 && (
        <button className="btn btn-ghost" onClick={() => useGame.getState().playerStop()}>
          Stop guessing (keep what we have)
        </button>
      )}
    </div>
  )
}
