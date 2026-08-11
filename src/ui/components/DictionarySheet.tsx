import { useEffect } from 'react'
import { wordById } from '../../data/words'
import { useGame } from '../../stores/gameStore'
import { useUi } from '../../stores/uiStore'
import { canSpeak, speakDanish } from '../speak'
import { useDialog } from '../useDialog'

export function DictionarySheet() {
  const { sheetWordId, closeSheet } = useUi()
  const phase = useGame((s) => s.game?.phase)

  // An open sheet must not survive into the translation challenge — it would
  // display the answer to a prompted word while the dictionary is "locked".
  const locked = phase === 'redemption'
  useEffect(() => {
    if (locked && sheetWordId) closeSheet()
  }, [locked, sheetWordId, closeSheet])

  const entry = sheetWordId ? wordById(sheetWordId) : undefined
  const open = !!entry && !locked
  const dialogRef = useDialog(open, closeSheet)
  if (!open || !entry) return null

  return (
    <div className="sheet-backdrop" onClick={closeSheet}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2 id="sheet-title" lang="da">
            {entry.pos === 'noun' && entry.article ? `${entry.article} ` : ''}
            {entry.da}
          </h2>
          <span className="pos-badge">{entry.pos}</span>
          {canSpeak() && (
            <button
              className="speak-btn"
              aria-label={`Pronounce ${entry.da}`}
              onClick={() => speakDanish(entry.da)}
            >
              🔊
            </button>
          )}
        </div>
        <p className="sheet-glosses">{entry.en.join(', ')}</p>
        <blockquote className="sheet-example">
          <p lang="da">
            {entry.exampleDa}
            {canSpeak() && (
              <button
                className="speak-btn speak-btn-inline"
                aria-label="Pronounce example sentence"
                onClick={() => speakDanish(entry.exampleDa)}
              >
                🔊
              </button>
            )}
          </p>
          <p className="sheet-example-en">{entry.exampleEn}</p>
        </blockquote>
        <button className="btn" onClick={closeSheet}>
          Close
        </button>
      </div>
    </div>
  )
}

/** Open the sheet for a word and log the lookup as an SRS signal. */
export function useOpenDictionary() {
  const openSheet = useUi((s) => s.openSheet)
  const recordLookup = useGame((s) => s.recordLookup)
  return (wordId: string) => {
    recordLookup(wordId)
    openSheet(wordId)
  }
}
