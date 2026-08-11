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

console.log(`${words.length} entries checked`)
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
