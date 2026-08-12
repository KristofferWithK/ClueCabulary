// Validates src/data/words.da.json: schema, uniqueness, single-token Danish
// citation forms, POS whitelist. Exits non-zero on hard errors; prints warnings
// for things a human/model review pass should look at.
import { readFileSync } from 'node:fs'

const PATH = new URL('../src/data/words.da.json', import.meta.url)
const POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'numeral', 'interjection'])
const DA_TOKEN = /^[a-zA-ZæøåÆØÅé]+$/

const words = JSON.parse(readFileSync(PATH, 'utf8'))
const errors = []
const warnings = []

const ids = new Set()
const das = new Set()
const ranks = new Set()
const curriculum = new Set()
// Kept in step with src/ai/local/concepts.ts by concepts.test.ts, which fails
// if the city uses a concept the companion cannot name.
const CONCEPTS = new Set([
  'people', 'family', 'body', 'food', 'drink', 'kitchen', 'home', 'furniture',
  'school', 'work', 'money', 'time', 'colour', 'animal', 'nature', 'weather',
  'vehicle', 'building', 'place', 'movement', 'speech', 'thought', 'emotion',
  'senses', 'size', 'age', 'clothing', 'health', 'leisure', 'nationality',
])

for (const [i, w] of words.entries()) {
  const at = `#${i} (${w?.da ?? '?'})`
  for (const field of ['id', 'da', 'en', 'pos', 'exampleDa', 'exampleEn', 'freqRank']) {
    if (w[field] === undefined || w[field] === null || w[field] === '') {
      errors.push(`${at}: missing ${field}`)
    }
  }
  if (ids.has(w.id)) errors.push(`${at}: duplicate id`)
  ids.add(w.id)
  const daKey = String(w.da).toLowerCase()
  if (das.has(daKey)) errors.push(`${at}: duplicate da`)
  das.add(daKey)
  if (ranks.has(w.freqRank)) errors.push(`${at}: duplicate freqRank ${w.freqRank}`)
  ranks.add(w.freqRank)
  if (!Number.isInteger(w.freqRank) || w.freqRank < 1) errors.push(`${at}: bad freqRank`)
  if (w.curriculumRank !== undefined) {
    if (!Number.isInteger(w.curriculumRank) || w.curriculumRank < 1) {
      errors.push(`${at}: bad curriculumRank`)
    } else if (curriculum.has(w.curriculumRank)) {
      errors.push(`${at}: duplicate curriculumRank ${w.curriculumRank}`)
    }
    curriculum.add(w.curriculumRank)
  }
  if (w.concepts !== undefined) {
    if (!Array.isArray(w.concepts) || w.concepts.length === 0) {
      errors.push(`${at}: concepts must be a non-empty array when present`)
    } else {
      for (const c of w.concepts) if (!CONCEPTS.has(c)) errors.push(`${at}: unknown concept "${c}"`)
    }
  }
  if (!DA_TOKEN.test(w.da)) errors.push(`${at}: da is not a single Danish token`)
  if (!POS.has(w.pos)) errors.push(`${at}: pos "${w.pos}" not in whitelist`)
  if (!Array.isArray(w.en) || w.en.length === 0 || w.en.some((g) => typeof g !== 'string' || !g.trim())) {
    errors.push(`${at}: en must be a non-empty string array`)
  }
  if (w.pos === 'noun' && w.article !== 'en' && w.article !== 'et') {
    warnings.push(`${at}: noun without en/et article`)
  }
  if (w.pos !== 'noun' && w.article) warnings.push(`${at}: non-noun with article`)
  if (w.en?.some((g) => /^to /.test(g))) warnings.push(`${at}: gloss with leading "to " (${w.en})`)
  // The example should contain the headword or a recognizable inflection.
  const stem = String(w.da).toLowerCase().slice(0, Math.max(3, w.da.length - 2))
  if (w.exampleDa && !w.exampleDa.toLowerCase().includes(stem)) {
    warnings.push(`${at}: exampleDa may not use the headword`)
  }
}

// A partial curriculum ordering would put words in no city at all.
if (curriculum.size && curriculum.size !== words.length) {
  errors.push(`${curriculum.size} of ${words.length} words have a curriculumRank — it must be all or none`)
}
const tagged = words.filter((w) => w.concepts?.length).length
console.log(`${words.length} entries checked, ${curriculum.size} ranked for teaching, ${tagged} tagged`)
if (warnings.length) {
  console.log(`\n${warnings.length} warnings:`)
  for (const w of warnings.slice(0, 40)) console.log(`  ⚠ ${w}`)
  if (warnings.length > 40) console.log(`  … and ${warnings.length - 40} more`)
}
if (errors.length) {
  console.error(`\n${errors.length} ERRORS:`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log('OK — no hard errors')
