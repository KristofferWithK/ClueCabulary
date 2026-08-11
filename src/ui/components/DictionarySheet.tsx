import { wordById } from '../../data/words'
import { useGame } from '../../stores/gameStore'
import { useUi } from '../../stores/uiStore'

export function DictionarySheet() {
  const { sheetWordId, closeSheet } = useUi()
  const entry = sheetWordId ? wordById(sheetWordId) : undefined
  if (!entry) return null

  return (
    <div className="sheet-backdrop" onClick={closeSheet}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>
            {entry.pos === 'noun' && entry.article ? `${entry.article} ` : ''}
            {entry.da}
          </h2>
          <span className="pos-badge">{entry.pos}</span>
        </div>
        <p className="sheet-glosses">{entry.en.join(', ')}</p>
        <blockquote className="sheet-example">
          <p lang="da">{entry.exampleDa}</p>
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
