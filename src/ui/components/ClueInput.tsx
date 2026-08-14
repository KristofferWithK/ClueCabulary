import { useState } from 'react'
import { useGame } from '../../stores/gameStore'
import { MAX_CLUE_NUMBER } from '../../engine/config'
import { classifyClue } from '../../data/words'
import { checkClueLegality } from '../../engine/legality'
import type { GameState } from '../../engine/types'
import { TranslateBox } from './TranslateBox'

interface Props {
  game: GameState
  onSubmit: (text: string, number: number) => void
}

export function ClueInput({ game, onSubmit }: Props) {
  const [text, setText] = useState('')
  const [number, setNumber] = useState(2)
  // A word Cluey has confirmed is Danish, so the offline guess does not get to
  // refuse it twice.
  const [cleared, setCleared] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const judgeDanish = useGame((s) => s.judgeDanish)
  const dailyKey = useGame((s) => s.dailyKey)
  // "A reroll button at the beginning to reroll the board if I have no idea on
  // how to connect the words." The beginning is this screen with nothing behind
  // it: no clue given, so nothing has been spent and nothing is being undone.
  // The daily challenge is excluded — it is one shared board per date.
  const canReroll = game.clueHistory.length === 0 && !dailyKey

  const trimmed = text.trim()
  const verdict = trimmed ? checkClueLegality(trimmed, game.words) : null
  // Cluey reads a Danish board and is handed the clue as a bare string, so an
  // English word there is one he cannot place. The shipped thousand settle most
  // of it offline — æ/ø/å, an inflection, a compound of two known words — and
  // 'unknown' means permission rather than suspicion, since every Danish word
  // we do not ship lives there. Only a word that looks positively English is
  // stopped, and even then Cluey gets the final say on submit.
  const english = classifyClue(trimmed) === 'english' && cleared !== trimmed.toLowerCase()
  const canSubmit = trimmed.length > 0 && verdict?.legal === true && !asking

  const submit = async () => {
    if (english) {
      // The offline guess can be wrong about a Danish word we do not ship, so
      // it is never the last word: ask before refusing.
      setAsking(true)
      try {
        if (await judgeDanish(trimmed)) {
          setCleared(trimmed.toLowerCase())
          onSubmit(trimmed, number)
          setText('')
        }
      } catch {
        // Cluey unreachable: trust the player rather than block the round on a
        // guess made from a thousand-word list.
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

  const last = game.clueHistory[game.clueHistory.length - 1]
  const mark = { green: '✓', bystander: '·', forbidden: '☠' } as const

  return (
    <div className="dock clue-input">
      {last && (
        <p className="last-turn">
          Last turn — {last.by === 'player' ? 'you' : 'Cluey'} clued «{last.text}»:{' '}
          {last.guesses.length === 0
            ? 'no guesses'
            : last.guesses.map((g, i) => (
                <span key={g.wordId}>
                  {i > 0 && '  '}
                  <span lang="da">{game.words.find((w) => w.wordId === g.wordId)?.da}</span>{' '}
                  {mark[g.result]}
                </span>
              ))}
        </p>
      )}
      <div className="dock-head">
        <p className="dock-title">
          Your clue — <strong lang="da">ét dansk ord</strong> for your{' '}
          <span className="legend-target">●</span> targets
        </p>
        {/* The reroll rides the title line: it exists only before the first
            clue, exactly when the dock is at its tallest, and a full-width
            button of its own was 48px the board could not spare on a 640px
            phone. */}
        {canReroll && (
          <button
            className="btn btn-small btn-ghost reroll-btn"
            onClick={() => {
              // The dock stays mounted across a re-deal, so a half-typed clue
              // for the old board would otherwise sit there aimed at nothing.
              setText('')
              setCleared(null)
              useGame.getState().rerollBoard()
            }}
          >
            <span lang="da">Nye ord</span>
          </button>
        )}
      </div>
      <div className="clue-row">
        <input
          id="clue-word"
          type="text"
          value={text}
          placeholder="fx dyreliv"
          aria-label="Your one-word clue"
          aria-invalid={trimmed ? !canSubmit : undefined}
          aria-describedby={(verdict && !verdict.legal) || english ? 'clue-error' : undefined}
          autoCapitalize="off"
          autoComplete="off"
          // The one field in the app that asks for DANISH and the only one that
          // was leaving the phone keyboard's English autocorrect on — every
          // other free-text field (TranslateBox, the exam paper, Settings,
          // Backup) sets both of these. On an English keyboard a Danish word is
          // rewritten at the space or submit boundary, and what arrives is an
          // English dictionary word the player never typed.
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="stepper">
          <button
            aria-label="fewer words"
            onClick={() => setNumber((n) => Math.max(1, n - 1))}
          >
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
      </div>
      {/* role=alert so a rejected clue is spoken; id so the field points at it. */}
      {verdict && !verdict.legal && !english && (
        <p className="clue-error" id="clue-error" role="alert">
          {verdict.reason}
        </p>
      )}
      {english && (
        <p className="clue-error" id="clue-error" role="alert">
          «{trimmed}» looks English. Look it up below for the Danish — or give the clue anyway and
          Cluey will check.
        </p>
      )}
      {/* Clueing in Danish means needing a word you do not have yet — which is
          the moment to be able to look one up, not after abandoning the turn. */}
      {/* The button rides the lookup's own "Look up a word" line, so the label
          is the word alone; TranslateBox spells it out for a screen reader. */}
      <TranslateBox prefill={english ? { term: trimmed, label: `«${trimmed}»` } : undefined} />
      <button className="btn btn-primary" disabled={!canSubmit} onClick={() => void submit()}>
        {asking ? 'Asking Cluey…' : english ? 'Give clue anyway' : 'Give clue'}
      </button>
    </div>
  )
}
