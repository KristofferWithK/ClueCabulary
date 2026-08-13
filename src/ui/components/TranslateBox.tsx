import { useEffect, useMemo, useState } from 'react'
import { AiError } from '../../ai/client'
import type { TranslationResponse } from '../../ai/schemas'
import { lookupLocal } from '../../data/lookup'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import { canSpeak, speakDanish } from '../speak'

/**
 * A word, either direction, without leaving the round.
 *
 * Clueing in Danish is the point of the game and the hardest part of it: the
 * word you want is usually one you do not have yet. The dictionary sheet
 * answers "what is this board word?", which is the question you have already
 * been given the answer to. This answers "what is the Danish for X?" — and
 * reads Klaus's clue back when he gives one you do not know.
 *
 * The thousand shipped words answer instantly, offline, for free, and cover
 * every board word. Klaus is asked only for what is outside them, and only on
 * a tap: a request per keystroke would be someone else's bill.
 */
export function TranslateBox({ klausClue }: { klausClue?: string }) {
  const [term, setTerm] = useState('')
  const [asked, setAsked] = useState<TranslationResponse | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const translate = useGame((s) => s.translate)
  const noteLookup = useGame((s) => s.noteLookup)
  // A suspended travel exam is still an exam. Both store actions already refuse
  // while one is out, but the shipped dictionary is read straight from this
  // component, so without this the offline half answered the paper's own words
  // — for free, since noteLookup declines to charge during an exam too. The
  // ⓘ sheet has locked itself this way all along; this is the same lock.
  const examOut = useJourney((s) => s.activeExam !== null)
  // The words in play, so a hit that is one of them can say so. Selected as the
  // store's own array and turned into a Set here: zustand 5 dropped the
  // equality-function argument, so a selector building a new Set each render
  // would never compare equal and would spin.
  const boardWords = useGame((s) => s.game?.words)
  const onBoard = useMemo(() => new Set((boardWords ?? []).map((w) => w.wordId)), [boardWords])

  const trimmed = term.trim()
  const local = trimmed && !examOut ? lookupLocal(trimmed) : []

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
  // half; everything else is Klaus, and it should not need a second tap to say
  // yes — being told "not among the thousand words this app teaches" reads as
  // a refusal when it was only ever meant as a note about where the answer is
  // coming from. Asked automatically once typing settles, so it is one request
  // per word rather than one per keystroke.
  useEffect(() => {
    if (examOut || !trimmed || local.length > 0) return
    // Two letters is a prefix on the way somewhere, not a word.
    if (trimmed.length < 3) return
    const t = setTimeout(() => void ask(trimmed), 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, local.length, examOut])

  const say = (da: string) =>
    canSpeak() ? (
      <button className="speak-btn speak-btn-inline" aria-label={`Pronounce ${da}`} onClick={() => speakDanish(da)}>
        🔊
      </button>
    ) : null

  // After the hooks, so the order stays stable when a paper is drawn mid-round.
  // Offering a disabled box would only advertise the way around the lock.
  if (examOut) return null

  return (
    <details className="translate-box">
      <summary>Look up a word</summary>

      <div className="translate-row">
        <input
          type="text"
          value={term}
          placeholder="dansk eller engelsk"
          aria-label="Word to translate, Danish or English"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(e) => setTerm(e.target.value)}
        />
        {klausClue && (
          <button className="btn btn-small" onClick={() => setTerm(klausClue)}>
            Klaus's clue
          </button>
        )}
      </div>

      {local.length > 0 && (
        <ul className="translate-hits">
          {local.slice(0, 4).map((m) => (
            <li key={m.entry.id} className={onBoard.has(m.entry.id) ? 'hit-on-board' : undefined}>
              <span lang="da">
                {m.entry.pos === 'noun' && m.entry.article ? `${m.entry.article} ` : ''}
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
            <p className="translate-note">Asking Klaus…</p>
          ) : (
            <button className="btn btn-small" onClick={() => void ask(trimmed)}>
              Ask Klaus
            </button>
          )}
        </div>
      )}

      {asked && (
        <ul className="translate-hits">
          <li>
            <span lang="da">
              {asked.article ? `${asked.article} ` : ''}
              {asked.da}
            </span>
            {say(asked.da)} — {asked.en}
            {asked.note && <em className="translate-note"> {asked.note}</em>}
          </li>
        </ul>
      )}

      {error && <p className="test-fail">{error}</p>}
    </details>
  )
}
