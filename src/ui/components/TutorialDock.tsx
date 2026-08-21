import { useEffect, useState } from 'react'
import { currentClue } from '../../engine/game'
import type { GameState } from '../../engine/types'
import {
  TUTORIAL_BEATS,
  TUTORIAL_CANNED_CLUES,
  tutorialResumeIndex,
} from '../../onboarding/tutorial'
import { useGame } from '../../stores/gameStore'
import { useUi } from '../../stores/uiStore'
import { playWord } from '../speak'
import { ClueyFace } from './Cluey'
import { Confetti } from './RoundSummary'
import { TranslateBox } from './TranslateBox'

/**
 * Casey on screen for the tutorial round (O2): face, speech bubble,
 * tap-to-advance — swapping for the real guess-confirm at the moments the
 * player acts. The dock reserves one height for every beat
 * (--tutorial-dock-h), so the board above it never moves between them.
 *
 * The beats live in src/onboarding/tutorial.ts and are pinned against the
 * engine by tutorial.test.ts; this component only walks them. It never drives
 * the beat index off its own taps alone — action beats advance when the ENGINE
 * shows their evidence (tutorialResumeIndex), which is also what makes a
 * reload mid-round resume at the right place instead of the top.
 */
export function TutorialDock({ game }: { game: GameState }) {
  const [index, setIndex] = useState(() => tutorialResumeIndex(game))
  // Taps on the lookup offer, each one sending Casey's clue to the dictionary
  // below it — see TranslateBox's `fill`.
  const [lookUps, setLookUps] = useState(0)
  const selectedWordId = useGame((s) => s.selectedWordId)
  const planForClueIndex = useGame((s) => s.planForClueIndex)
  const beat = TUTORIAL_BEATS[Math.min(index, TUTORIAL_BEATS.length - 1)]!

  // Action beats advance on engine evidence, never past where taps have
  // already walked: max() lets narration the player is still reading stand.
  useEffect(() => {
    setIndex((i) => Math.max(i, tutorialResumeIndex(game)))
  }, [game])

  // A new beat starts unselected — a card picked during narration must not
  // arrive pre-confirmed at the next guess beat.
  useEffect(() => {
    useGame.getState().selectWord(null)
  }, [index])

  // The audio beat: any card tap (which BoardGrid has already spoken) moves on.
  useEffect(() => {
    if (beat.kind === 'tapCard' && selectedWordId) {
      useGame.getState().selectWord(null)
      setIndex((i) => i + 1)
    }
  }, [beat.kind, selectedWordId])

  if (game.phase === 'finished') return <TutorialWin />

  const clue = currentClue(game)
  const selected = selectedWordId ? game.words.find((w) => w.wordId === selectedWordId) : null
  const showLookup = (beat.kind === 'say' || beat.kind === 'guess') && beat.lookup && clue
  const target =
    beat.kind === 'guess' ? game.words.find((w) => w.wordId === beat.wordId) : undefined
  const mood =
    beat.kind === 'say' ? (beat.mood ?? 'idle') : beat.kind === 'watchGuess' ? 'thinking' : 'idle'
  const planReady = planForClueIndex === game.clueHistory.length

  return (
    // data-beat/data-target let onboarding-drive DRIVE the script rather than
    // hardcode a parallel copy of it: the drive reads what the dock asks for
    // and does exactly that, so a script edit cannot silently outrun the test.
    <div
      className="dock tutorial-dock"
      data-beat={beat.kind}
      data-target={target?.da}
    >
      <div className="tutorial-say">
        <ClueyFace mood={mood} className="cluey-mini" />
        {/* role=status: each beat is announced without stealing focus, the
            onboarding bubble's own pattern. */}
        <p className="tutorial-bubble" role="status">
          {beat.text}
        </p>
      </div>

      <div className="tutorial-body">
        {showLookup && (
          // Real play makes Casey's clue tappable where the guess bar's title
          // prints it; here the clue is in Casey's bubble, which is scripted
          // prose, so the offer is its own line. Same one line the dictionary
          // used to carry inside itself, and this dock has the room for it —
          // it keeps the taller reserve (see --tutorial-dock-h).
          <>
            <button
              className="composer-link tutorial-lookup"
              aria-label={`Look up «${clue.text}» in the dictionary`}
              onClick={() => setLookUps((n) => n + 1)}
            >
              Look up «{clue.text}»
            </button>
            <TranslateBox fill={{ term: clue.text, nonce: lookUps }} />
          </>
        )}
        {beat.kind === 'guess' &&
          !showLookup &&
          selected &&
          selected.wordId !== beat.wordId && (
            <p className="dim tutorial-nudge">Not that one yet — find «{target?.da}».</p>
          )}
        {beat.kind === 'chooseClue' && (
          <div className="tutorial-clues">
            {TUTORIAL_CANNED_CLUES.map((c) => (
              <button
                key={c.text}
                className="tutorial-clue-option"
                onClick={() => useGame.getState().submitPlayerClue(c.text, c.number)}
              >
                <span className="tutorial-clue-word">
                  «{c.text}» ({c.number})
                </span>
                <span className="tutorial-clue-hint">{c.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tutorial-controls">
        {beat.kind === 'say' && (
          <button className="btn btn-primary tutorial-next" onClick={() => setIndex(index + 1)}>
            Next
          </button>
        )}
        {beat.kind === 'watchGuess' && (
          <button
            className="btn btn-primary tutorial-next"
            disabled={!planReady}
            onClick={() => useGame.getState().stepAiGuess()}
          >
            {planReady ? 'Watch Casey guess' : 'Casey is thinking…'}
          </button>
        )}
        {beat.kind === 'guess' &&
          (selected && selected.wordId === beat.wordId ? (
            <div className="guess-confirm">
              <button
                className="btn btn-primary"
                onClick={() => {
                  // Committing to a word is the moment to hear it — the same
                  // pairing the real guess bar makes.
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
          ) : (
            <p className="dim tutorial-wait">Tap «{target?.da}» on the board.</p>
          ))}
      </div>
    </div>
  )
}

/**
 * The win beat: confetti, the case line, and the door onward — into the tour
 * (O3), where Casey opens himself and the case line just spoken is standing
 * on screen as twelve discovered words and two empty compartments.
 */
function TutorialWin() {
  const winBeat = TUTORIAL_BEATS[TUTORIAL_BEATS.length - 1]!
  return (
    <div className="dock tutorial-dock tutorial-win" data-beat="win">
      <Confetti />
      <div className="tutorial-say">
        <ClueyFace mood="happy" className="cluey-mini" />
        <p className="tutorial-bubble" role="status">
          {winBeat.text}
        </p>
      </div>
      <div className="tutorial-body" />
      <div className="tutorial-controls">
        <button
          className="btn btn-primary tutorial-continue"
          onClick={() => {
            // finishRound has already recorded the words (GameScreen's
            // effect); what is left of the round would only offer Home a
            // scriptless board to resume, so it goes before the flow moves on.
            useGame.getState().abandonGame()
            useUi.getState().advanceOnboarding('tour')
          }}
        >
          Open my case
        </button>
      </div>
    </div>
  )
}
