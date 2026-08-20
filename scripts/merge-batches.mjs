// Merges the verified generation batches in src/data/generated/ into the
// final src/data/words.da.json: dedupes, estimates a global frequency rank by
// proportionally interleaving the per-POS slices, assigns stable ids.
//
// THIS IS A BOOTSTRAP, NOT A BUILD STEP. It has not been the way
// src/data/words.da.json is produced since the dataset was first laid down:
// the shipped file carries curriculumRank, concepts, gender and countable,
// none of which this script writes. Running it over the shipped file would
// silently undo all of that, and would also need apply-city-one.mjs run again
// after it. The batches are the raw generation record and the ranked pool;
// src/data/words.da.json is the dataset.
//
// The two had already drifted by one headword before anyone noticed:
// "sommerfugl" replaced "ked" in the shipped file — "ked" is not a word on its
// own, only ever "ked af det" — and the batch kept saying "ked" for a year.
// It has been back-ported at the same slice and order, so the ranking is
// unchanged, and scripts/validate-words.mjs now fails on any headword that is
// in no batch. That is the drift worth catching.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

/**
 * How many words the game teaches: nine cities of WORDS_PER_CITY each
 * (src/journey/cities.ts). The name says it — 900Words. Ranks 901-1000 were
 * dropped from the shipped dataset when the tenth city went; the batches keep
 * them, so this cap is what decides the size rather than the size of the pool.
 */
const TARGET_SIZE = 900

const GEN_DIR = new URL('../src/data/generated/', import.meta.url)
const OUT = new URL('../src/data/words.da.json', import.meta.url)

// Within-slice order → approximate global content-word rank. Nouns are the
// densest class (rank spreads least), misc adverbs/numerals sit high, later
// noun/verb bands are offset by their band start.
const SLICE_SCORE = {
  'noun-1': (o) => o * 2.2,
  'noun-2': (o) => (150 + o) * 2.2,
  'noun-3': (o) => (300 + o) * 2.2,
  'noun-4': (o) => (450 + o) * 2.2,
  'verb-1': (o) => o * 4,
  'verb-2': (o) => (140 + o) * 4,
  'verb-3': (o) => (280 + o) * 4,
  'adj-1': (o) => o * 5,
  'adj-2': (o) => (160 + o) * 5,
  'misc-1': (o) => o * 3,
}

const files = readdirSync(GEN_DIR).filter((f) => /^words-batch-\d+\.json$/.test(f)).sort()
if (files.length === 0) {
  console.error('no batch files found in src/data/generated/')
  process.exit(1)
}

const seen = new Map()
let raw = 0
for (const f of files) {
  const entries = JSON.parse(readFileSync(new URL(f, GEN_DIR), 'utf8'))
  for (const e of entries) {
    raw++
    const key = e.da.trim().toLowerCase()
    if (!seen.has(key)) seen.set(key, e)
  }
}

const scored = [...seen.values()].map((e) => {
  const score = (SLICE_SCORE[e.slice] ?? ((o) => o * 6))(e.order)
  return { entry: e, score }
})
scored.sort((a, b) => a.score - b.score || a.entry.da.localeCompare(b.entry.da, 'da'))

const final = scored.slice(0, TARGET_SIZE).map(({ entry }, i) => {
  const out = {
    // Stable, word-derived id: SRS progress survives future dataset revisions.
    id: `da:${entry.da.trim().toLowerCase()}`,
    da: entry.da.trim(),
    en: entry.en.map((g) => g.trim()).filter(Boolean),
    pos: entry.pos,
    ...(entry.pos === 'noun' && entry.article ? { article: entry.article } : {}),
    exampleDa: entry.exampleDa.trim(),
    exampleEn: entry.exampleEn.trim(),
    freqRank: i + 1,
  }
  return out
})

writeFileSync(OUT, JSON.stringify(final, null, 1) + '\n')
console.log(`${files.length} batches, ${raw} raw entries, ${seen.size} unique, ${final.length} written`)
const byPos = {}
for (const w of final) byPos[w.pos] = (byPos[w.pos] ?? 0) + 1
console.log('POS distribution:', JSON.stringify(byPos))
