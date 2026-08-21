import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { AiError } from '../../ai/client'
import type { TranslationResponse } from '../../ai/schemas'
import { articleLabel } from '../../data/gender'
import { lookupLocal } from '../../data/lookup'
import { useGame } from '../../stores/gameStore'

import { useSettings } from '../../stores/settingsStore'
import { useUi } from '../../stores/uiStore'
import { canPlayWords, canSpeak, playWord, speakText } from '../speak'
import { ACTIVE } from '../../lang/active'

/**
 * A word, either direction, without leaving the round.
 *
 * Clueing in Danish is the point of the game and the hardest part of it: the
 * word you want is usually one you do not have yet. The dictionary sheet
 * answers "what is this board word?", which is the question you have already
 * been given the answer to. This answers "what is the Danish for X?" — and
 * reads Casey's clue back when he gives one you do not know.
 *
 * The nine hundred shipped words answer instantly, offline, for free, and cover
 * every board word. Casey is asked only for what is outside them, and only once
 * typing settles: a request per keystroke would be someone else's bill.
 *
 * ---- ONE answer, on ONE line (K1) ----
 *
 * This used to answer with a four-row scrolling list, an "Ask Casey" button of
 * its own and an error paragraph under that — up to three regions that appeared
 * and vanished as you typed, in the box that decides how tall the dock is. It
 * now answers with the single best hit — article, word, first gloss, 🔊 — and
 * the tap on it opens the sheet for the rest (every gloss, the example, the 🐢).
 * "Asking Casey…", Casey's own answer and the error all take that same one
 * line, so the box has exactly two heights and the composer around it has one.
 *
 * The 🔊 trails the text rather than sitting between the word and its gloss,
 * which is the one place this departs from the card's sketch: the whole text
 * has to be a single tap target to open the sheet, and a button cannot be
 * interrupted by another button. Trailing also keeps the speaker on screen
 * while the gloss is the part that ellipsizes.
 */
export interface DictionaryParts {
  /** The field itself. */
  field: ReactNode
  /** The answer, one line, or null when there is nothing to say yet. */
  line: ReactNode
}

/**
 * `fill` is a word put into the field from OUTSIDE it, by whatever named it:
 * Casey's clue in the guess bar's title, the English word in the composer's
 * verdict line. It replaces a `prefill` prop that rendered its own "Look up
 * «x»" line INSIDE the box — a second printing of a word the line above had
 * just named, and a row out of the dock's reserve, which is the board's height
 * for the whole round (see --dock-h). A counter rather than the term itself:
 * the same word has to be askable twice, after the field has been typed over
 * in between.
 */
export function useDictionary(fill?: { term: string; nonce: number }): DictionaryParts {
  const inputId = useId()
  const [term, setTerm] = useState('')
  const [asked, setAsked] = useState<TranslationResponse | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const translate = useGame((s) => s.translate)
  const noteLookup = useGame((s) => s.noteLookup)
  // Opening the sheet from the answer line does NOT charge a lookup: noteLookup
  // below has already charged for this very term, 500ms after the typing
  // settled, and openSheet here is the same word being read a second time. The
  // charging path is `useOpenDictionary` and it is unchanged — ⓘ on a card
  // still pays, because nothing has paid for that word yet.
  const openSheet = useUi((s) => s.openSheet)
  // The words in play, so a hit that is one of them can say so. Selected as the
  // store's own array and turned into a Set here: zustand 5 dropped the
  // equality-function argument, so a selector building a new Set each render
  // would never compare equal and would spin.
  const boardWords = useGame((s) => s.game?.words)
  const onBoard = useMemo(() => new Set((boardWords ?? []).map((w) => w.wordId)), [boardWords])

  const sound = useSettings((s) => s.sound)

  const trimmed = term.trim()
  const local = trimmed ? lookupLocal(trimmed) : []

  // Typing again invalidates an answer about the previous word.
  useEffect(() => {
    setAsked(null)
    setError(null)
  }, [trimmed])

  // An outside tap asking for a word. Nonce 0 is "never asked", so mounting
  // does not spend a lookup on a word nobody tapped.
  const nonce = fill?.nonce ?? 0
  const wanted = fill?.term
  useEffect(() => {
    if (nonce > 0 && wanted) setTerm(wanted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce])

  // A board word answered from the shipped dictionary costs the same lookup as
  // tapping ⓘ on it — the offline half must not be the cheap way to read the
  // board. Settled input only: charging on every keystroke would bill "kat" to
  // someone on their way to typing "katalog".
  useEffect(() => {
    if (!trimmed || local.length === 0) return
    const t = setTimeout(() => noteLookup(trimmed), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, local.length, noteLookup])

  const ask = async (term: string) => {
    setAsking(true)
    setError(null)
    try {
      setAsked(await translate(term))
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Could not translate that.')
    } finally {
      setAsking(false)
    }
  }

  // A clue may be any word in the language, so the lookup has to answer any
  // word in the language. The shipped nine hundred are the instant, free, offline
  // half; everything else is Casey, and it should not need a second tap to say
  // yes — being told "not among the words this app teaches" reads as
  // a refusal when it was only ever meant as a note about where the answer is
  // coming from. Asked automatically once typing settles, so it is one request
  // per word rather than one per keystroke. This is also why there is no "Ask
  // Casey" button left to fold into the line: the ask already happens.
  useEffect(() => {
    if (!trimmed || local.length > 0) return
    // Two letters is a prefix on the way somewhere, not a word.
    if (trimmed.length < 3) return
    const t = setTimeout(() => void ask(trimmed), 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, local.length])

  // With a wordId the baked clip plays and the device voice is the fallback;
  // without one — a word Cluey translated that is outside the 900 — speech is
  // all there is, which is the reason `speakText` did not go away.
  const say = (da: string, wordId?: string) =>
    (wordId ? canPlayWords() : canSpeak()) && sound ? (
      <button
        className="speak-btn speak-btn-inline"
        aria-label={`Pronounce ${da}`}
        onClick={() => (wordId ? void playWord(wordId, da) : speakText(da))}
      >
        🔊
      </button>
    ) : null

  const field = (
    // No standing label and no lookup line — the placeholder names the field,
    // and the word worth looking up is tappable where it is already printed.
    // Both were rows, and every row here is a row of board.
    <input
      key="field"
      id={inputId}
      className="translate-input"
      type="text"
      value={term}
      placeholder="Dictionary"
      aria-label={`Word to translate, ${ACTIVE.name} or English`}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="search"
      onChange={(e) => setTerm(e.target.value)}
    />
  )

  let line: ReactNode = null
  const best = local[0]
  if (best) {
    const article = articleLabel(best.entry)
    const head = `${article ? `${article} ` : ''}${best.entry.da}`
    // The whole entry as the tooltip and the accessible name: the line prints
    // one gloss, the sheet behind it holds the rest, and neither a mouse nor a
    // screen reader should have to open the sheet to find out there are more.
    const full = `${head} — ${best.entry.en.join(', ')}`
    line = (
      <span className="dict-answer">
        <button
          className="dict-hit"
          title={full}
          aria-label={`${full} — open the dictionary`}
          onClick={() => openSheet(best.entry.id)}
        >
          <span lang={ACTIVE.code}>{head}</span> — {best.entry.en[0]}
          {best.approximate && <em className="translate-note"> (from {trimmed})</em>}
          {/* Looking up "wood" on a board holding træ answers with træ, which
              is the right translation and an illegal clue. Saying so here saves
              typing it and being told no — and the board is already in front of
              the player, so it reveals nothing. Four words now, not twelve: the
              line it shares is the composer's only one. */}
          {onBoard.has(best.entry.id) && <em className="translate-note"> — on the board</em>}
        </button>
        {say(best.entry.da, best.entry.id)}
      </span>
    )
  } else if (asked) {
    // Casey answers for the words outside the shipped nine hundred, so his
    // answer has to say the same thing the data does: an article when the noun
    // can be counted, the gender when it cannot. No sheet behind it — there is
    // no entry to open — so the text is text rather than a button.
    const article = articleLabel({ pos: 'noun', ...asked })
    const head = `${article ? `${article} ` : ''}${asked.da}`
    line = (
      <span className="dict-answer" title={`${head} — ${asked.en}`}>
        <span className="dict-hit dict-hit-flat">
          <span lang={ACTIVE.code}>{head}</span> — {asked.en}
          {asked.note && <em className="translate-note"> {asked.note}</em>}
        </span>
        {say(asked.da)}
      </span>
    )
  } else if (asking) {
    line = (
      <span className="dict-answer translate-note" aria-live="polite">
        Asking Casey…
      </span>
    )
  } else if (error) {
    line = (
      <span className="dict-answer test-fail" title={error}>
        {error}
      </span>
    )
  }

  return { field, line }
}

/**
 * The stacked form: the field with its answer under it. The TUTORIAL DOCK is
 * the only caller left — K2 redrew the guess bar, which now places the same
 * two pieces side by side on its last row (`.dock-dictionary`), because the
 * box's own rule and its second row were most of what stood between that dock
 * and --dock-h. The tutorial has the room and I2 is what redraws it.
 *
 * A field, not a drawer. It was a <details> and the lid cost a tap every time —
 * and not once: the component unmounts and remounts with the phase, so a
 * <details> (whose open state lives on the element, not in React) shut itself
 * again on every turn. The word you need is the reason you are stuck mid-clue,
 * so the box has to be somewhere your thumb already is, open.
 */
export function TranslateBox({ fill }: { fill?: { term: string; nonce: number } }) {
  const { field, line } = useDictionary(fill)
  return (
    <div className="translate-box">
      {field}
      <div className="translate-line">{line}</div>
    </div>
  )
}
