// The two things `merge-matrix.mjs` and `validate-matrix.mjs` have to agree
// about: how the matrix is packed into bytes, and which pairs the board
// sampler calls a conflict.
//
// Packing: two bits a cell, row-major over the full n x n square, base64 in
// the JSON. A score is 0-3, so two bits is exact — no quantisation, nothing
// lost. The full square rather than the upper triangle costs twice the bytes
// (2,500 instead of 1,250 for a hundred words) and buys two things worth more
// than that: `M[a][b]` is one shift away from a flat index, and the symmetry
// the validator checks is a real property of the file rather than an artefact
// of how it is read back.
//
// Conflicts: `conflicts()` in src/srs/sampler.ts is the real function, loaded
// through Vite rather than restated here. It reaches the Danish stemmer and
// the shared edit distance, and a validator that reimplemented either would
// pass happily on the day one of them changed.
//
// It has three arms and they do not mean the same thing. Same stem and edit
// distance <= 1 are ORTHOGRAPHIC: hus/bus and hund/hånd look alike and mean
// nothing to each other. A shared English gloss is SEMANTIC: two words that
// print the same word on the card's English side are near-synonyms. The
// matrix only has an opinion about the third, so `classifyConflicts` splits
// them and the validator gates on the gloss arm alone.
import { existsSync, readFileSync, readdirSync } from 'node:fs'

/**
 * ONE FILE PER CITY, and this is where that is spelled.
 *
 * E2 measured city 1's book at 104.7 KB gzipped against the matrix's 2.1 KB,
 * and E4 carried the arithmetic into E6's brief: nine cities in one eager
 * asset is ~940 KB. So the shipped data is sharded by city —
 * `src/data/matrix.da.2.json`, `src/data/book.da.2.json` — and the evaluator's
 * dynamic import is keyed by city, which is what `loadEvaluator(city)` in
 * `src/ai/local/evaluator.ts` does with them. City 1's two files were renamed
 * into the scheme rather than kept as a special case: a validator that
 * iterates "whatever cities exist" cannot have a hard-coded first city in it.
 */
export const matrixPath = (lang, city) => `src/data/matrix.${lang}.${city}.json`
export const bookPath = (lang, city) => `src/data/book.${lang}.${city}.json`

/**
 * The cities that have shipped data, ascending. Derived from the tree rather
 * than from a list, so E6's next city needs no edit here — and so the
 * validators check every city there is instead of the one somebody remembered
 * to name.
 *
 * The union of BOTH kinds of shard on purpose. A city is only shipped when it
 * has a matrix and a book: take the matrix files alone and a book landing
 * without its matrix is silently skipped by both validators, which is exactly
 * the shape of failure they exist to prevent. With the union, each validator
 * fails on the file it cannot read and names the missing half.
 */
export function authoredCities(lang, dir = 'src/data') {
  if (!existsSync(dir)) return []
  const re = new RegExp(`^(?:matrix|book)\\.${lang}\\.(\\d+)\\.json$`)
  const found = new Set()
  for (const f of readdirSync(dir)) {
    const m = re.exec(f)
    if (m) found.add(Number(m[1]))
  }
  return [...found].sort((a, b) => a - b)
}

export const BITS = 2
export const MAX_SCORE = 3

export function packMatrix(scores, n) {
  const bytes = new Uint8Array(Math.ceil((n * n * BITS) / 8))
  for (let i = 0; i < n * n; i++) {
    const v = scores[i]
    if (!Number.isInteger(v) || v < 0 || v > MAX_SCORE) {
      throw new Error(`cell ${i} is ${v}, which is not an integer 0-${MAX_SCORE}`)
    }
    bytes[i >> 2] |= v << ((i & 3) * BITS)
  }
  return bytes
}

export function unpackMatrix(bytes, n) {
  const scores = new Uint8Array(n * n)
  for (let i = 0; i < n * n; i++) {
    scores[i] = (bytes[i >> 2] >> ((i & 3) * BITS)) & 0b11
  }
  return scores
}

export const toBase64 = (bytes) => Buffer.from(bytes).toString('base64')
export const fromBase64 = (s) => new Uint8Array(Buffer.from(s, 'base64'))

/**
 * The sampler's conflicts for one city's words, split by which arm caught
 * them.
 *
 * The gloss arm is recomputed here from the same `normalize` the sampler
 * uses — one line, and the only way to know WHICH arm fired, since
 * `conflicts()` returns a bare boolean. `drift` names any pair that shares a
 * gloss and yet is not a conflict, which would mean the sampler's third arm
 * has changed shape and this split no longer describes it.
 */
export async function classifyConflicts(entries) {
  const { createServer } = await import('vite')
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    // Nothing here renders; the dependency scan would crawl the whole app and
    // complain about the PWA virtual module for no benefit.
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    logLevel: 'silent',
  })
  try {
    const { conflicts } = await server.ssrLoadModule('/src/srs/sampler.ts')
    const { normalize } = await server.ssrLoadModule('/src/engine/text.ts')
    if (typeof conflicts !== 'function') {
      throw new Error('src/srs/sampler.ts no longer exports conflicts()')
    }
    const gloss = []
    const orthographic = []
    const drift = []
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const aGlosses = new Set(entries[i].en.map(normalize))
        const shared = entries[j].en.map(normalize).filter((g) => aGlosses.has(g))
        const isConflict = conflicts(entries[i], entries[j])
        if (shared.length > 0 && !isConflict) {
          drift.push([i, j])
          continue
        }
        if (!isConflict) continue
        if (shared.length > 0) gloss.push([i, j, shared[0]])
        else orthographic.push([i, j])
      }
    }
    return { gloss, orthographic, drift, total: gloss.length + orthographic.length }
  } finally {
    await server.close()
  }
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}
