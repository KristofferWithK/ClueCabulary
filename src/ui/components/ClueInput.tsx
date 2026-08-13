import { useState } from 'react'
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

  const trimmed = text.trim()
  const verdict = trimmed ? checkClueLegality(trimmed, game.words) : null
  const canSubmit = trimmed.length > 0 && verdict?.legal === true

  const last = game.clueHistory[game.clueHistory.length - 1]
  const mark = { green: '✓', bystander: '·', forbidden: '☠' } as const

  return (
    <div className="dock clue-input">
      {last && (
        <p className="last-turn">
          Last turn — {last.by === 'player' ? 'you' : 'Klaus'} clued «{last.text}»:{' '}
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
      <p className="dock-title">
        Your clue — <strong lang="da">ét dansk ord</strong> leading Klaus to your{' '}
        <span className="legend-target">●</span> targets
      </p>
      <div className="clue-row">
        <input
          id="clue-word"
          type="text"
          value={text}
          placeholder="fx dyreliv"
          aria-label="Your one-word clue"
          aria-invalid={verdict ? !verdict.legal : undefined}
          aria-describedby={verdict && !verdict.legal ? 'clue-error' : undefined}
          autoCapitalize="off"
          autoComplete="off"
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
          <button aria-label="more words" onClick={() => setNumber((n) => Math.min(4, n + 1))}>
            +
          </button>
        </div>
      </div>
      {/* role=alert so a rejected clue is spoken; id so the field points at it. */}
      {verdict && !verdict.legal && (
        <p className="clue-error" id="clue-error" role="alert">
          {verdict.reason}
        </p>
      )}
      {/* Clueing in Danish means needing a word you do not have yet — which is
          the moment to be able to look one up, not after abandoning the turn. */}
      <TranslateBox />
      <button
        className="btn btn-primary"
        disabled={!canSubmit}
        onClick={() => {
          onSubmit(trimmed, number)
          setText('')
        }}
      >
        Give clue
      </button>
    </div>
  )
}
