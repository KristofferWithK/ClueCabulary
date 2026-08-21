import { useState } from 'react'
import { useGame } from '../../stores/gameStore'
import { MAX_CLUE_NUMBER } from '../../engine/config'
import { classifyClue } from '../../data/words'
import { checkClueLegality } from '../../engine/legality'
import type { GameState } from '../../engine/types'
import { useDictionary } from './TranslateBox'
import { ACTIVE } from '../../lang/active'
import { HINT_KEYS, useFirstTimeHint } from '../hints'

interface Props {
  game: GameState
  onSubmit: (text: string, number: number) => void
}

/**
 * The composer, and it is exactly three rows tall in every state it can be in
 * (K1). The owner's rule: "I don't want the size of the composer to change
 * ever. Below clue and dictionary should be enough space for one small line of
 * text where the translation, or the clue warning can be."
 *
 *   [ Your clue          ] [ Dictionary        ]      the field row
 *   «nice» looks English — tap it    en fin 🔊 — fine  ONE shared line
 *   [−] 2 [+]                        [ Give clue ]    the action row
 *
 * Nothing here may render a fourth row. Everything that used to appear and
 * vanish — the first-clue hint, the illegality verdict, the English warning,
 * the dictionary's four-row scroller, its "Ask Casey" button and its error
 * paragraph — is now one of the two halves of the middle line, and the line is
 * always there whether or not it has anything in it. The height that follows
 * is measured and written down as --dock-h in index.css, and layout-drive
 * samples the panel's rectangle per frame across every state below.
 */
export function ClueInput({ game, onSubmit }: Props) {
  const [text, setText] = useState('')
  const [number, setNumber] = useState(2)
  // A word Casey has confirmed is Danish, so the offline guess does not get to
  // refuse it twice.
  const [cleared, setCleared] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  // Taps on the word in the verdict line, each one sending it to the
  // dictionary beside the field — see useDictionary's `fill`. The offer used to
  // be a line of its own inside the dictionary ("Look up «nice»"), which said
  // the word a second time one row under the line that had just named it.
  const [lookUps, setLookUps] = useState(0)
  const judgeTargetWord = useGame((s) => s.judgeTargetWord)
  // The first clue ever asked of this device gets one extra sentence (O4).
  // Gone the moment typing starts, so it never stands beside a verdict.
  const firstClueEver = useFirstTimeHint(HINT_KEYS.clue)
  // The re-deal ("a reroll button at the beginning, if I have no idea how to
  // connect the words") now lives in the game header as a symbol — see
  // GameScreen. It kept the same conditions and lost a line of this dock,
  // which is a line of board while the keyboard is up.

  const trimmed = text.trim()
  const verdict = trimmed ? checkClueLegality(trimmed, game.words, ACTIVE) : null
  // Casey reads a Danish board and is handed the clue as a bare string, so an
  // English word there is one he cannot place. The shipped nine hundred settle most
  // of it offline — æ/ø/å, an inflection, a compound of two known words — and
  // 'unknown' means permission rather than suspicion, since every Danish word
  // we do not ship lives there. Only a word that looks positively English is
  // stopped, and even then Casey gets the final say on submit.
  const english = classifyClue(trimmed) === 'english' && cleared !== trimmed.toLowerCase()
  const canSubmit = trimmed.length > 0 && verdict?.legal === true && !asking

  // The dictionary, taken apart: its field belongs in the row above, its one
  // answer in the line below. The box that used to hold both would have been a
  // column of its own inside the field row.
  const dictionary = useDictionary({ term: trimmed, nonce: lookUps })

  const submit = async () => {
    if (english) {
      // The offline guess can be wrong about a Danish word we do not ship, so
      // it is never the last word: ask before refusing.
      setAsking(true)
      try {
        if (await judgeTargetWord(trimmed)) {
          setCleared(trimmed.toLowerCase())
          onSubmit(trimmed, number)
          setText('')
        }
      } catch {
        // Casey unreachable: trust the player rather than block the round on a
        // guess made from a nine-hundred-word list.
        setCleared(trimmed.toLowerCase())
        onSubmit(trimmed, number)
        setText('')
      } finally {
        setAsking(false)
      }
      return
    }
    onSubmit(trimmed, number)
    setText('')
  }

  // The left half of the shared line. At most one of these is ever true, and
  // the first-clue hint shares the `!trimmed` moment with the verdicts, so a
  // hint and a verdict can never stack.
  let verdictLine = null
  if (firstClueEver && !trimmed) {
    // The first-encounter line (O4). The highest-friction act in the game
    // arrives here with zero Danish, and the tutorial deferred it on purpose
    // (canned clues), so the first real composer says what is being asked for
    // and where the missing word lives. Once ever — the cluecab-hint-clue flag.
    // One line now rather than two: onboarding-drive reads it for "One Danish
    // word" and for "Dictionary", and both survive the cut.
    verdictLine = (
      <span className="first-hint dim">
        One {ACTIVE.name} word. Stuck? The Dictionary beside it translates.
      </span>
    )
  } else if (verdict && !verdict.legal && !english) {
    // role=alert so a rejected clue is spoken; id so the field points at it.
    // checkClueLegality's reasons are one clause each, so they fit; anything
    // longer is ellipsized on screen and kept whole in the title.
    verdictLine = (
      <span className="clue-error" id="clue-error" role="alert" title={verdict.reason}>
        {verdict.reason}
      </span>
    )
  } else if (english) {
    const full = `«${trimmed}» looks English. Tap it for the ${ACTIVE.name}, or give it anyway and Casey will check.`
    verdictLine = (
      <span className="clue-error" id="clue-error" role="alert" title={full}>
        {/* The word is the button that looks it up: the line already says it,
            and a "Look up «x»" row inside the dictionary underneath was the
            same word again a row lower, paid for out of the dock's reserve —
            which is the board's height for the whole round. The sentence is
            short enough to share a line with an answer now; the full one is
            still here for a screen reader and for a hover. */}
        <button className="clue-lookup" aria-label={full} onClick={() => setLookUps((n) => n + 1)}>
          «{trimmed}»
        </button>{' '}
        looks English — tap it, or give it anyway
      </span>
    )
  }

  return (
    <div className="dock clue-input">
      {/* A "Last turn — you clued «x»: …" recap stood here. It was a line the
          composer paid for on every turn but the first, and it was one of the
          two things that made the board a different size in every phase — the
          board is a flex:1 area sharing this column, so a recap appearing took
          36px straight off the grid. The turn log in the round summary says
          the same thing afterwards, at leisure, and the player has just
          watched the turn happen. */}
      {/* The two things you need while composing, side by side: the clue, and
          the word you do not have yet. They fit on one line because a clue is
          one short word.

          No labels above them. The placeholder says what each field is, in
          English — Danish is what you TYPE, not what the app says to you — and
          a label line costs a row of board to repeat a word already on screen.
          The re-deal moved to the header for the same reason. */}
      <div className="composer-fields">
        <input
          id="clue-word"
          type="text"
          value={text}
          placeholder="Your clue"
          aria-label={`Your one-word clue, in ${ACTIVE.name}`}
          aria-invalid={trimmed ? !canSubmit : undefined}
          aria-describedby={(verdict && !verdict.legal) || english ? 'clue-error' : undefined}
          autoCapitalize="off"
          autoComplete="off"
          // The one field in the app that asks for DANISH and the only one that
          // was leaving the phone keyboard's English autocorrect on — every
          // other free-text field (the dictionary, the packing dock, Settings,
          // Backup) sets both of these. On an English keyboard a Danish word is
          // rewritten at the space or submit boundary, and what arrives is an
          // English dictionary word the player never typed.
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
        />
        {/* Clueing in Danish means needing a word you do not have yet — which
            is the moment to look one up, not after abandoning the turn. */}
        {dictionary.field}
      </div>
      {/* THE line. Always rendered, empty or not: it is the whole reason the
          composer has one height, and a line that only exists when it has
          something to say is a line that moves the board when it arrives.
          Verdict on the left, the dictionary's answer on the right; either one
          alone takes the full width, and when both are up the answer is the
          half that gives way (see .composer-line in index.css). */}
      <div className="composer-line">
        {verdictLine}
        {dictionary.line}
      </div>
      {/* How many words the clue points at, and the send: one line, the way a
          messenger composer puts its send button next to what it sends. */}
      <div className="composer-actions">
        <div className="stepper">
          <button aria-label="fewer words" onClick={() => setNumber((n) => Math.max(1, n - 1))}>
            −
          </button>
          <span className="stepper-value" aria-live="polite" aria-label={`${number} words`}>
            {number}
          </span>
          {/* Shared with the engine: the config guard checks a board is
              clearable using this same ceiling, so the two must not drift. */}
          <button
            aria-label="more words"
            onClick={() => setNumber((n) => Math.min(MAX_CLUE_NUMBER, n + 1))}
          >
            +
          </button>
        </div>
        <button className="btn btn-primary" disabled={!canSubmit} onClick={() => void submit()}>
          {/* "Give clue anyway" wrapped to a second line beside the stepper at
              360px, and a wrapped button is 18px of the dock's reserve — which
              is 18px off the board, in every phase, for a state most turns
              never reach. */}
          {asking ? 'Asking Casey…' : english ? 'Give it anyway' : 'Give clue'}
        </button>
      </div>
    </div>
  )
}
