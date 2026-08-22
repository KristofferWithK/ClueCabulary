import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../../engine/types'
import { useGame, wrappableIds } from '../../stores/gameStore'
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
  const wrappable = useGame((s) => s.wrappable)
  const selectedWordId = useGame((s) => s.selectedWordId)
  const [text, setText] = useState('')
  const [missed, setMissed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = selectedWordId ? game.words.find((w) => w.wordId === selectedWordId) : null
  // Every count in this dock is over the WRAPPABLE cards, not the board (W1).
  // A topped-up board holds cards with nothing to pack, and «3 of 18» on a
  // board where only nine can ever be packed is a progress bar that cannot
  // fill — the dock would be counting toward a number the round cannot reach.
  const packable = wrappableIds(game, wrappable)
  const remaining = packable.length - packed.length

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
    // Three rows and one height, the same --dock-h every other dock in a round
    // holds (K2). It used to be five, two of which came and went with the
    // selection — the word being packed had a prompt row of its own, the miss
    // note appeared under the field, and "Start with N unpacked" was a ghost
    // button whose sentence wrapped to two lines at 360px. The clue phases of
    // the same wrap-up round were sized against that, so the board moved
    // between packing and cluing.
    //
    // What replaced them: the word goes INTO the title, the field row is
    // rendered in both states (disabled with nothing selected, so the row
    // cannot appear and move the rest), the note is one line that always
    // stands, and start-early is a nowrap link riding the title row.
    <div className="dock packing-dock">
      <div className="dock-head">
        <p className="dock-title">
          {selected ? (
            <>
              Pack «{selected.en[0]}»
            </>
          ) : (
            'Pack the board'
          )}{' '}
          — {packed.length} of {packable.length}
        </p>
        {remaining > 0 && (
          // A link, not a .btn: the sentence it used to carry ("they stay
          // English and cannot be wrapped this round") wrapped to two lines in
          // a ghost button, and both lines came off the board. The warning
          // survives as the accessible name and the tooltip.
          <button
            className="composer-link packing-early"
            title={`Start with ${remaining} unpacked — they stay English and cannot be wrapped this round`}
            aria-label={`Start with ${remaining} unpacked — they stay English and cannot be wrapped this round`}
            onClick={() => useGame.getState().startRoundEarly()}
          >
            Start with {remaining}
          </button>
        )}
      </div>
      <div className="clue-row">
        <input
          ref={inputRef}
          className="packing-input"
          type="text"
          value={text}
          disabled={!selected}
          placeholder={selected ? ACTIVE.copy.answerPlaceholder : 'Tap an English card'}
          aria-label={
            selected ? `The ${ACTIVE.name} for ${selected.en[0]}` : `Tap an English card first`
          }
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={!selected || !text.trim()}
        >
          Pack
        </button>
      </div>
      {/* ONE line, always present. role=status on the element rather than on a
          paragraph that appears with the miss: a live region that arrives with
          its content does not announce. */}
      <p className={`packing-note ${missed ? 'packing-miss' : 'dim'}`} role="status">
        {missed
          ? 'Not it — that miss is remembered. Keep trying.'
          : selected
            ? 'The dictionary is shut — this is the recall.'
            : `Tap an English card and type its ${ACTIVE.name}.`}
      </p>
    </div>
  )
}
