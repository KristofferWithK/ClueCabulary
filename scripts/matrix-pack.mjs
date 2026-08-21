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
import { readFileSync } from 'node:fs'

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
 * The real `conflicts` from the sampler, applied to one city's words.
 * Returns [i, j] index pairs into `entries`.
 */
export async function conflictPairs(entries) {
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
    if (typeof conflicts !== 'function') {
      throw new Error('src/srs/sampler.ts no longer exports conflicts()')
    }
    const pairs = []
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (conflicts(entries[i], entries[j])) pairs.push([i, j])
      }
    }
    return pairs
  } finally {
    await server.close()
  }
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}
