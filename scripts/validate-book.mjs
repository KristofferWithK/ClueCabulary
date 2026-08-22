// Checks src/data/book.<lang>.json against the dataset and the matrix it is
// keyed by.
//
//   node scripts/validate-book.mjs            (--lang da is the default)
//   node scripts/validate-book.mjs --report   (per-word counts, thinnest first)
//
// The book is ~5,000 hand-authored associations no test can re-derive, so what
// a validator can do is check the things that ARE derivable:
//
//   - every id it names is a real headword of the city it claims, and every
//     headword of that city has a section;
//   - every entry is a LEGAL clue for the word it is filed under — the real
//     `checkClueLegality`, both language sides, because Casey clues in either.
//     This is the check that matters. An illegal entry is not a poor entry, it
//     is a dead one: the same function runs at play time, so the engine would
//     propose the clue, be refused, and have spent a candidate on nothing;
//   - orthography — æ/ø/å never spelled ae/oe/aa, nothing but Danish letters;
//   - the per-word count band, and a non-empty `why` of the right length;
//   - every `pairs` key names a real within-city pair the matrix puts at
//     M >= 1, and every such pair has a section.
//
// That last one is the correction E1 left for this card, made mechanical. The
// pairs to write clues for are the matrix's, not the dataset's `concepts`
// tags: half of city 1's `nature` and `place` same-tag pairs were judged 0 by
// both models, so a tag is not evidence of association. Keying the check to
// the matrix means a pair whose judged score later changes shows up here as a
// missing or an orphaned section rather than as silence.
//
// It refuses to pass vacuously, the way validate-audio.mjs and
// validate-matrix.mjs do: no words read, no headwords in the book, no pair
// sections, or a book whose entries are all empty each exit non-zero rather
// than reporting a clean run over nothing.
import { cityWords, loadWords } from './matrix-pairs.mjs'
import {
  ASSOC_MAX,
  ASSOC_MIN,
  PAIR_MAX,
  PAIR_MIN,
  WHY_MAX_WORDS,
  WHY_MIN_WORDS,
  loadMatrix,
  pairKey,
  relatedPairs,
} from './book-brief.mjs'
import { checkEntryShape, entryLegality, withLegality } from './book-pack.mjs'
import { readJson } from './matrix-pack.mjs'

const argLang = process.argv.indexOf('--lang')
const LANG = argLang === -1 ? 'da' : (process.argv[argLang + 1] ?? 'da')
if (!/^[a-z]{2}$/.test(LANG)) {
  console.error(`--lang must be a two-letter code, got "${LANG}"`)
  process.exit(2)
}
const REPORT = process.argv.includes('--report')

const PATH = `src/data/book.${LANG}.json`
let doc
try {
  doc = readJson(PATH)
} catch (err) {
  console.error(`could not read ${PATH}: ${err.message}`)
  process.exit(2)
}

const words = loadWords(LANG)
if (words.length === 0) {
  console.error(`read no headwords out of src/data/words.${LANG}.json — the check would pass vacuously`)
  process.exit(2)
}

const errors = []
const fail = (msg) => errors.push(msg)

// --- shape, and the refusal to run over nothing ---------------------------

const sections = doc.words ?? {}
const pairSections = doc.pairs ?? {}
if (Object.keys(sections).length === 0) {
  console.error(`${PATH} names no headwords — the check would pass vacuously`)
  process.exit(2)
}
if (Object.keys(pairSections).length === 0) {
  console.error(`${PATH} has no pair sections — the check would pass vacuously`)
  process.exit(2)
}
const totalEntries =
  Object.values(sections).reduce((a, w) => a + (w?.assoc?.length ?? 0), 0) +
  Object.values(pairSections).reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0)
if (totalEntries === 0) {
  console.error(`${PATH} holds no associations at all — the check would pass vacuously`)
  process.exit(2)
}

const entries = cityWords(words, doc.city)
if (entries.length === 0) {
  console.error(`no words with curriculumRank in city ${doc.city} — the check would pass vacuously`)
  process.exit(2)
}
const byId = new Map(entries.map((e) => [e.id, e]))

// --- the ids are the city's, all of them and nothing else ------------------

for (const id of Object.keys(sections)) {
  if (!byId.has(id)) fail(`${id} has a section but is not a city ${doc.city} word`)
}
for (const w of entries) {
  if (!sections[w.id]) fail(`${w.da} (${w.id}) has no section in the book`)
}

// --- the pair sections are exactly the matrix's M >= 1 pairs ---------------

const { at } = loadMatrix(LANG)
const related = relatedPairs(entries, at)
if (related.length === 0) {
  console.error(
    `the matrix scores no city ${doc.city} pair at M >= 1 — the pair check would run over nothing`,
  )
  process.exit(2)
}
const wanted = new Map(related.map((p) => [pairKey(p.a, p.b), p]))
for (const key of Object.keys(pairSections)) {
  if (!wanted.has(key)) {
    fail(`"${key}" has a pair section but is not a city ${doc.city} pair the matrix puts at M >= 1`)
  }
}
for (const [key, p] of wanted) {
  if (!pairSections[key]) fail(`${p.a.da}/${p.b.da} scores M ${at(p.i, p.j)} but has no pair section`)
}

// --- every entry: shape, orthography, legality against its own word(s) -----

const bands = { whyMin: WHY_MIN_WORDS, whyMax: WHY_MAX_WORDS }
const counts = []
let checked = 0
let legalityCalls = 0

await withLegality(({ isLegal, normalize }) => {
  const check = (list, label, board) => {
    const seen = new Set()
    for (const e of list) {
      checked++
      for (const bad of checkEntryShape(e, bands)) fail(`${label}: ${bad}`)
      if (typeof e?.da !== 'string' || typeof e?.en !== 'string') continue
      const k = normalize(e.da)
      if (seen.has(k)) fail(`${label}: "${e.da}" appears twice`)
      seen.add(k)
      legalityCalls += 2
      for (const bad of entryLegality(e, board, isLegal)) fail(`${label}: ${bad}`)
      if (e.v !== undefined && ![1, 2].includes(e.v)) fail(`${label}: v is ${e.v}, not 1 or 2`)
    }
  }

  for (const w of entries) {
    const list = sections[w.id]?.assoc
    if (!Array.isArray(list)) {
      fail(`${w.da}: assoc is missing or not an array`)
      continue
    }
    counts.push([w, list.length])
    if (list.length < ASSOC_MIN || list.length > ASSOC_MAX) {
      fail(`${w.da} has ${list.length} associations, outside the band ${ASSOC_MIN}-${ASSOC_MAX}`)
    }
    check(list, `${w.da} (${w.id})`, [w])
  }

  for (const [key, p] of wanted) {
    const list = pairSections[key]
    if (!Array.isArray(list)) {
      if (pairSections[key] !== undefined) fail(`${key}: the pair section is not an array`)
      continue
    }
    if (list.length < PAIR_MIN || list.length > PAIR_MAX) {
      fail(`${p.a.da}/${p.b.da} has ${list.length} pair clues, outside ${PAIR_MIN}-${PAIR_MAX}`)
    }
    check(list, `${p.a.da}/${p.b.da}`, [p.a, p.b])
  }
})

if (legalityCalls === 0) {
  console.error(`${PATH}: no entry reached the legality check — the check would pass vacuously`)
  process.exit(2)
}

// --- report ---------------------------------------------------------------

if (errors.length > 0) {
  console.error(`${PATH}: ${errors.length} problem${errors.length === 1 ? '' : 's'}`)
  for (const e of errors.slice(0, 40)) console.error(`  ${e}`)
  if (errors.length > 40) console.error(`  ...and ${errors.length - 40} more`)
  process.exit(1)
}

const assoc = counts.map(([, n]) => n)
const pairLens = [...wanted.keys()].map((k) => pairSections[k].length)
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const votes = Object.values(sections).flatMap((w) => w.assoc).filter((e) => e.v === 2).length
console.log(
  `${PATH}: ${entries.length} city ${doc.city} headwords, ${sum(assoc)} associations ` +
    `(${Math.min(...assoc)}-${Math.max(...assoc)} a word, ${votes} authored by both models)`,
)
console.log(
  `  ${wanted.size} pairs at M >= 1, ${sum(pairLens)} pair clues ` +
    `(${Math.min(...pairLens)}-${Math.max(...pairLens)} a pair)`,
)
console.log(`  every one of ${checked} entries is a legal clue for its own word, in both languages`)
if (REPORT) {
  console.log('\nAssociations per word, thinnest first:')
  for (const [w, n] of [...counts].sort((a, b) => a[1] - b[1]).slice(0, 25)) {
    console.log(`  ${String(n).padStart(3)}  ${w.da} (${w.en[0]})`)
  }
}
