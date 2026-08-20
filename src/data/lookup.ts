import { danishStem, normalize } from '../engine/text'
import type { WordEntry } from './types'
import { WORDS } from './words'

/**
 * Two-way lookup over the shipped dataset.
 *
 * The dictionary sheet answers "what does this board word mean?". This answers
 * the other question, the one a player composing a Danish clue actually has:
 * "what is the Danish for X?" — and the reverse, when Casey clues in Danish and
 * the word is new.
 *
 * Local first, always: a thousand words covers every board word and everything
 * the player is being taught, it is instant, it costs nothing, and it works on
 * a train. Anything outside it goes to Casey, but only when asked.
 */
export interface LocalMatch {
  entry: WordEntry
  /** Which side of the entry the term matched — decides how to read it back. */
  matched: 'da' | 'en'
  /** An inflection or a near form rather than the citation form. */
  approximate: boolean
}

const normalizeGloss = (g: string): string => normalize(g).replace(/^(to|a|an|the) /, '')

const byDa = new Map<string, WordEntry>()
const byStem = new Map<string, WordEntry[]>()
const byGloss = new Map<string, WordEntry[]>()

for (const w of WORDS) {
  byDa.set(normalize(w.da), w)
  const stem = danishStem(w.da)
  const stems = byStem.get(stem)
  if (stems) stems.push(w)
  else byStem.set(stem, [w])
  for (const g of w.en) {
    const key = normalizeGloss(g)
    const list = byGloss.get(key)
    if (list) list.push(w)
    else byGloss.set(key, [w])
  }
}

/**
 * Everything the dataset knows about a term, best match first. Empty when the
 * word is outside the thousand — which is when Casey is worth asking.
 */
export function lookupLocal(term: string): LocalMatch[] {
  const t = normalizeGloss(term)
  if (!t) return []

  const exactDa = byDa.get(normalize(term))
  if (exactDa) return [{ entry: exactDa, matched: 'da', approximate: false }]

  const glossHits = byGloss.get(t)
  if (glossHits?.length) {
    return glossHits.map((entry) => ({ entry, matched: 'en' as const, approximate: false }))
  }

  // "hunden" should still find "hund"; the packing grader is strict, a
  // dictionary need not be.
  const stemHits = byStem.get(danishStem(term))
  if (stemHits?.length) {
    return stemHits.map((entry) => ({ entry, matched: 'da' as const, approximate: true }))
  }
  return []
}

/** The board word this term names, if any — so a lookup can be charged for. */
export function boardWordFor(term: string, boardIds: readonly string[]): string | undefined {
  const ids = new Set(boardIds)
  return lookupLocal(term).find((m) => ids.has(m.entry.id))?.entry.id
}
