import { useEffect, useId, useMemo, useState } from 'react'
import { AiError } from '../../ai/client'
import type { TranslationResponse } from '../../ai/schemas'
import { articleLabel } from '../../data/gender'
import { lookupLocal } from '../../data/lookup'
import { useGame } from '../../stores/gameStore'

import { canSpeak, speakDanish } from '../speak'

/**
 * A word, either direction, without leaving the round.
 *
 * Clueing in Danish is the point of the game and the hardest part of it: the
 * word you want is usually one you do not have yet. The dictionary sheet
 * answers "what is this board word?", which is the question you have already
 * been given the answer to. This answers "what is the Danish for X?" — and
 * reads Cluey's clue back when he gives one you do not know.
 *
 * The thousand shipped words answer instantly, offline, for free, and cover
 * every board word. Cluey is asked only for what is outside them, and only on
 * a tap: a request per keystroke would be someone else's bill.
 */
/**
 * `prefill` puts a word one tap away: Cluey's clue while you are guessing, or
 * the English word you just tried to clue with while you are cluing.
 */
export function TranslateBox({ prefill }: { prefill?: { term: string; label: string } }) {
  const inputId = useId()
  const [term, setTerm] = useState('')
  const [asked, setAsked] = useState<TranslationResponse | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const translate = useGame((s) => s.translate)
  const noteLookup = useGame((s) => s.noteLookup)
  // The words in play, so a hit that is one of them can say so. Selected as the
  // store's own array and turned into a Set here: zustand 5 dropped the
  // equality-function argument, so a selector building a new Set each render
  // would never compare equal and would spin.
  const boardWords = useGame((s) => s.game?.words)
  const onBoard = useMemo(() => new Set((boardWords ?? []).map((w) => w.wordId)), [boardWords])

  const trimmed = term.trim()
  const local = trimmed ? lookupLocal(trimmed) : []

  // Typing again invalidates an answer about the previous word.
  useEffect(() => {
    setAsked(null)
    setError(null)
  }, [trimmed])

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
  // word in the language. The shipped thousand are the instant, free, offline
  // half; everything else is Cluey, and it should not need a second tap to say
  // yes — being told "not among the thousand words this app teaches" reads as
  // a refusal when it was only ever meant as a note about where the answer is
  // coming from. Asked automatically once typing settles, so it is one request
  // per word rather than one per keystroke.
  useEffect(() => {
    if (!trimmed || local.length > 0) return
    // Two letters is a prefix on the way somewhere, not a word.
    if (trimmed.length < 3) return
    const t = setTimeout(() => void ask(trimmed), 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, local.length])

  const say = (da: string) =>
    canSpeak() ? (
      <button className="speak-btn speak-btn-inline" aria-label={`Pronounce ${da}`} onClick={() => speakDanish(da)}>
        🔊
      </button>
    ) : null

  return (
    // A field, not a drawer. It was a <details> and the lid cost a tap every
    // time — and not once: the component unmounts and remounts with the phase,
    // so a <details> (whose open state lives on the element, not in React) shut
    // itself again on every turn. The word you need is the reason you are stuck
    // mid-clue, so the box has to be somewhere your thumb already is, open.
    <div className="translate-box">
      {/* The prefill button rides the label line rather than the input's. It
          used to sit beside the field, which cost it 141px of a 312px row —
          measured at 360px, the input came out 123px wide, about ten
          characters. That was survivable while the field was behind a lid and
          is not now that it is the thing you type into. */}
      {/* No standing label — the placeholder names the field. The one-tap
          lookup appears only when there is something to look up, so the line
          it costs is a line that earns itself. */}
      {prefill && (
        <button
          className="composer-link translate-prefill"
          aria-label={`Look up ${prefill.term}`}
          onClick={(e) => {
            e.preventDefault()
            setTerm(prefill.term)
          }}
        >
          Look up {prefill.label}
        </button>
      )}

      <input
        id={inputId}
        className="translate-input"
        type="text"
        value={term}
        placeholder="Dictionary"
        aria-label="Word to translate, Danish or English"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(e) => setTerm(e.target.value)}
      />

      {local.length > 0 && (
        <ul className="translate-hits">
          {local.slice(0, 4).map((m) => (
            <li key={m.entry.id} className={onBoard.has(m.entry.id) ? 'hit-on-board' : undefined}>
              <span lang="da">
                {articleLabel(m.entry) ? `${articleLabel(m.entry)} ` : ''}
                {m.entry.da}
              </span>
              {say(m.entry.da)} — {m.entry.en.join(', ')}
              {m.approximate && <em className="translate-note"> (from {term.trim()})</em>}
              {/* Looking up "wood" on a board holding træ answers with træ,
                  which is the right translation and an illegal clue. Saying so
                  here saves typing it and being told no — and the board is
                  already in front of the player, so it reveals nothing. */}
              {onBoard.has(m.entry.id) && (
                <em className="translate-note"> — on your board, so you cannot clue with it</em>
              )}
            </li>
          ))}
        </ul>
      )}

      {trimmed && local.length === 0 && !asked && (
        <div className="translate-ask">
          {asking ? (
            <p className="translate-note">Asking Cluey…</p>
          ) : (
            <button className="btn btn-small" onClick={() => void ask(trimmed)}>
              Ask Cluey
            </button>
          )}
        </div>
      )}

      {asked && (
        <ul className="translate-hits">
          <li>
            <span lang="da">
              {/* Cluey answers for the words outside the shipped thousand, so
                  his answer has to say the same thing the data does: an article
                  when the noun can be counted, the gender when it cannot. */}
              {articleLabel({ pos: 'noun', ...asked }) ? `${articleLabel({ pos: 'noun', ...asked })} ` : ''}
              {asked.da}
            </span>
            {say(asked.da)} — {asked.en}
            {asked.note && <em className="translate-note"> {asked.note}</em>}
          </li>
        </ul>
      )}

      {error && <p className="test-fail">{error}</p>}
    </div>
  )
}
