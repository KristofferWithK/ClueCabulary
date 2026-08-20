/** Shared text utilities for legality checks, answer grading and board sampling. */

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

/*
 * The stemmer used to live here as `danishStem`. It is a rule OF Danish rather
 * than a shared text utility, so it moved to `src/lang/da/morphology.ts` and
 * reaches its callers as `pack.morphology.stem` — that is the whole point of
 * the seam, and leaving a Danish suffix list in a file called `text` would have
 * been the first place a second language broke. Only `normalize` and
 * `levenshtein` are genuinely language-neutral, and they stayed.
 */
