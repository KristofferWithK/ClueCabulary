// Applies a curated first city to the dataset.
//
// Frequency order put "ikke", "også" and "nu" on the first board anyone plays,
// and no one-word clue can point at those. So the first hundred words are
// curated for clueability first and frequency second, and carry the semantic
// tags the offline companion clues from. Everything after them keeps plain
// frequency order.
//
//   node scripts/apply-city-one.mjs <curation.json>
//
// where curation.json is {"words": [{"id", "da", "tags": [...]}, ...]} with
// exactly 100 entries, in teaching order. Refuses anything it cannot verify.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORDS_PATH = `${ROOT}/src/data/words.da.json`
const CITY_SIZE = 100

const source = process.argv[2]
if (!source) {
  console.error('usage: node scripts/apply-city-one.mjs <curation.json>')
  process.exit(1)
}

const curated = JSON.parse(readFileSync(source, 'utf8'))
const picks = curated.words ?? curated
const words = JSON.parse(readFileSync(WORDS_PATH, 'utf8'))
const byId = new Map(words.map((w) => [w.id, w]))

const fail = (msg) => {
  console.error(`refusing to write: ${msg}`)
  process.exit(1)
}

if (!Array.isArray(picks) || picks.length !== CITY_SIZE) {
  fail(`expected ${CITY_SIZE} curated words, got ${picks?.length}`)
}
const seen = new Set()
for (const p of picks) {
  if (!byId.has(p.id)) fail(`unknown word id ${p.id}`)
  if (seen.has(p.id)) fail(`duplicate word ${p.id}`)
  if (!Array.isArray(p.tags) || p.tags.length === 0) fail(`${p.id} has no concepts`)
  seen.add(p.id)
}

// A board refuses two words sharing an English gloss, and the first fifteen
// are the whole pool the opening boards draw from — a collision there shrinks
// that pool silently.
const norm = (s) => s.toLowerCase().trim().replace(/^(to|a|an|the) /, '')
const glossOwner = new Map()
for (const p of picks.slice(0, 15)) {
  for (const g of byId.get(p.id).en.map(norm)) {
    if (glossOwner.has(g)) fail(`"${g}" is the gloss of both ${glossOwner.get(g)} and ${p.id}, inside the opening fifteen`)
    glossOwner.set(g, p.id)
  }
}

const curatedIds = new Set(picks.map((p) => p.id))
const rest = words.filter((w) => !curatedIds.has(w.id)).sort((a, b) => a.freqRank - b.freqRank)

for (const [i, p] of picks.entries()) {
  const w = byId.get(p.id)
  w.curriculumRank = i + 1
  w.concepts = p.tags
}
for (const [i, w] of rest.entries()) {
  w.curriculumRank = CITY_SIZE + i + 1
  delete w.concepts
}

const ranks = new Set(words.map((w) => w.curriculumRank))
if (ranks.size !== words.length) fail('curriculumRank is not a permutation')

// Keep the file in teaching order: it is the order everything reads it in.
words.sort((a, b) => a.curriculumRank - b.curriculumRank)
writeFileSync(WORDS_PATH, `${JSON.stringify(words, null, 2)}\n`)

const tagCounts = {}
for (const p of picks) for (const t of p.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1
console.log(`first city: ${picks.map((p) => p.da).slice(0, 15).join(', ')} …`)
console.log(`concepts used: ${Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' ')}`)
console.log(`wrote ${words.length} words, ${picks.length} curated`)
