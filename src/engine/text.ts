/** Shared text utilities for legality checks, redemption grading and board sampling. */

export function normalize(s: string): string {
  return s.normalize('NFC').trim().toLowerCase()
}

/**
 * Optimal-string-alignment distance: Levenshtein plus adjacent transpositions,
 * so a swapped-letter typo ("huose" for "house") counts as one edit.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const rows: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1))
  for (let i = 0; i <= m; i++) rows[i]![0] = i
  for (let j = 0; j <= n; j++) rows[0]![j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, rows[i - 2]![j - 2]! + 1)
      }
      rows[i]![j] = d
    }
  }
  return rows[m]![n]!
}

/**
 * Regular Danish inflection is suffixing (hus/huset, løbe/løber/løbet,
 * hund/hunden/hundene). Stripping one longest-match suffix catches the
 * realistic clue/board collisions. Heuristic by design — Codenames legality
 * is human-adjudicated anyway.
 */
const DANISH_SUFFIXES = ['erne', 'ene', 'ede', 'er', 'en', 'et', 'e', 'r', 's', 't']

export function danishStem(word: string): string {
  const w = normalize(word)
  for (const suf of DANISH_SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      return w.slice(0, w.length - suf.length)
    }
  }
  return w
}
