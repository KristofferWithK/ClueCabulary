import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../../engine/types'
import { useGame } from '../../stores/gameStore'
import { playWord } from '../speak'
import { ACTIVE } from '../../lang/active'

/**
 * The wrap-up packing phase: every card starts English-side up, and typing a
 * card's Danish flips it. The dictionary is locked — this is the recall the
 * round exists to demand — and retries are free, but the first miss on a word
 * is recorded. When every card is packed the clues start by themselves; the
 * player can also start early, at a price the button spells out.
 */
export function PackingDock({ game }: { game: GameState }) {
  const packed = useGame((s) => s.packed)
  const selectedWordId = useGame((s) => s.selectedWordId)
  const [text, setText] = useState('')
  const [missed, setMissed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = selectedWordId ? game.words.find((w) => w.wordId === selectedWordId) : null
  const remaining = game.words.length - packed.length

  // A fresh card gets a fresh field — and focus, so packing flows tap, type,
  // enter, tap.
  useEffect(() => {
    setText('')
    setMissed(false)
    if (selectedWordId) inputRef.current?.focus()
  }, [selectedWordId])

  const submit = () => {
    if (!selected || !text.trim()) return
    const hit = useGame.getState().submitPacking(selected.wordId, text)
    if (hit) {
      // The one moment in the app where the player produced the Danish from
      // memory. Hearing it back confirms the spelling was a word and not just
      // a match — and it only ever fires on a hit: saying the answer after a
      // miss would hand over the thing this phase exists to withhold.
      void playWord(selected.wordId, selected.da)
      useGame.getState().selectWord(null)
    } else {
      setMissed(true)
      setText('')
      inputRef.current?.focus()
    }
  }

  return (
    <div className="dock packing-dock">
      <p className="dock-title">
        Pack the words — {packed.length} of {game.words.length} packed
      </p>
      {selected ? (
        <>
          <p className="packing-prompt">
            The {ACTIVE.name} for <strong>{selected.en[0]}</strong>?
          </p>
          <div className="clue-row">
            <input
              ref={inputRef}
              className="packing-input"
              type="text"
              value={text}
              placeholder={ACTIVE.copy.answerPlaceholder}
              aria-label={`The ${ACTIVE.name} for ${selected.en[0]}`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            <button className="btn btn-primary" onClick={submit} disabled={!text.trim()}>
              Pack
            </button>
          </div>
          {missed && (
            <p className="packing-miss" role="status">
              Not it — that miss is remembered, but you can keep trying.
            </p>
          )}
        </>
      ) : (
        <p className="dim">
          Tap an English card and type its {ACTIVE.name}. The dictionary is closed — this is the part
          that packs the word safely.
        </p>
      )}
      {remaining > 0 && (
        <button className="btn btn-ghost" onClick={() => useGame.getState().startRoundEarly()}>
          Start with {remaining} unpacked — they stay English and cannot be wrapped this round
        </button>
      )}
    </div>
  )
}
