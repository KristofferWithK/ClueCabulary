import { useState } from 'react'
import { useGame } from '../../stores/gameStore'
import { MAX_CLUE_NUMBER } from '../../engine/config'
import { classifyClue } from '../../data/words'
import { checkClueLegality } from '../../engine/legality'
import type { GameState } from '../../engine/types'
import { TranslateBox } from './TranslateBox'
import { ACTIVE } from '../../lang/active'
import { HINT_KEYS, useFirstTimeHint } from '../hints'

interface Props {
  game: GameState
  onSubmit: (text: string, number: number) => void
}

export function ClueInput({ game, onSubmit }: Props) {
  const [text, setText] = useState('')
  const [number, setNumber] = useState(2)
  // A word Casey has confirmed is Danish, so the offline guess does not get to
  // refuse it twice.
  const [cleared, setCleared] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const judgeTargetWord = useGame((s) => s.judgeTargetWord)
  // The first clue ever asked of this device gets one extra sentence (O4).
  // Gone the moment typing starts, so it never stands beside a verdict line.
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
        <label className="composer-field">
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
            // other free-text field (TranslateBox, the packing dock, Settings,
            // Backup) sets both of these. On an English keyboard a Danish word is
            // rewritten at the space or submit boundary, and what arrives is an
            // English dictionary word the player never typed.
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {/* Clueing in Danish means needing a word you do not have yet — which
            is the moment to look one up, not after abandoning the turn. */}
        <TranslateBox prefill={english ? { term: trimmed, label: `«${trimmed}»` } : undefined} />
      </div>
      {/* The first-encounter line (O4), in the slot the verdict lines use: the
          highest-friction act in the game arrives here with zero Danish, and
          the tutorial deferred it on purpose (canned clues), so the first real
          composer says what is being asked for and where the missing word
          lives. Once ever — the cluecab-hint-clue flag — and it shares the
          `!trimmed` moment, so it and a verdict can never stack in the dock's
          reserved height. */}
      {firstClueEver && !trimmed && (
        <p className="first-hint dim">
          One {ACTIVE.name} word Casey can chase. Missing it? The Dictionary beside your clue turns
          English into {ACTIVE.name}.
        </p>
      )}
      {/* role=alert so a rejected clue is spoken; id so the field points at it. */}
      {verdict && !verdict.legal && !english && (
        <p className="clue-error" id="clue-error" role="alert">
          {verdict.reason}
        </p>
      )}
      {english && (
        <p className="clue-error" id="clue-error" role="alert">
          «{trimmed}» looks English. Look it up beside the field for the {ACTIVE.name} — or give the clue
          anyway and Casey will check.
        </p>
      )}
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
          {asking ? 'Asking Casey…' : english ? 'Give clue anyway' : 'Give clue'}
        </button>
      </div>
    </div>
  )
}
