import { useEffect, useState } from 'react'
import { AiError } from '../../ai/client'
import type { TranslationResponse } from '../../ai/schemas'
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

  const ask = async () => {
    setAsking(true)
    setError(null)
    try {
      setAsked(await translate(trimmed))
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Could not translate that.')
    } finally {
      setAsking(false)
    }
  }

  const say = (da: string) =>
    canSpeak() ? (
      <button className="speak-btn speak-btn-inline" aria-label={`Pronounce ${da}`} onClick={() => speakDanish(da)}>
        🔊
      </button>
    ) : null

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
            <li key={m.entry.id}>
              <span lang="da">
                {m.entry.pos === 'noun' && m.entry.article ? `${m.entry.article} ` : ''}
                {m.entry.da}
              </span>
              {say(m.entry.da)} — {m.entry.en.join(', ')}
              {m.approximate && <em className="translate-note"> (from {term.trim()})</em>}
            </li>
          ))}
        </ul>
      )}

      {trimmed && local.length === 0 && !asked && (
        <div className="translate-ask">
          <p className="translate-note">Not among the thousand words this app teaches.</p>
          <button className="btn btn-small" disabled={asking} onClick={ask}>
            {asking ? 'Asking Klaus…' : 'Ask Klaus'}
          </button>
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
