// Checks src/data/matrix.<lang>.json against the dataset it is keyed by.
//
//   node scripts/validate-matrix.mjs            (--lang da is the default)
//
// The matrix is 4,950 judgements no test can re-derive, so what a validator
// can do is check the things that ARE derivable: that every id it names is a
// real headword of the city it claims, that the square is symmetric, and that
// it agrees with the two facts the repo already states about which words pull
// each other — the board sampler's `conflicts()` and the dataset's `concepts`
// tags. Those two are what `merge-matrix.mjs` floors on, so on a freshly
// merged file they pass by construction; they earn their place the day the
// dataset changes under a matrix that was merged before it (a new word pair
// that becomes a conflict, a concept tag added to a word) or the day somebody
// hand-edits the packed data.
//
// It refuses to pass vacuously, the way scripts/validate-audio.mjs does: no
// words read, no ids in the file, or a matrix that is entirely zero off the
// diagonal all exit non-zero rather than reporting a clean run over nothing.
import { cityPairs, cityWords, loadWords } from './matrix-pairs.mjs'
import { conflictPairs, fromBase64, readJson, unpackMatrix } from './matrix-pack.mjs'

const argLang = process.argv.indexOf('--lang')
const LANG = argLang === -1 ? 'da' : (process.argv[argLang + 1] ?? 'da')
if (!/^[a-z]{2}$/.test(LANG)) {
  console.error(`--lang must be a two-letter code, got "${LANG}"`)
  process.exit(2)
}

const PATH = `src/data/matrix.${LANG}.json`
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

// --- shape ----------------------------------------------------------------

const ids = doc.ids ?? []
if (ids.length === 0) {
  console.error(`${PATH} names no word ids — the check would pass vacuously`)
  process.exit(2)
}
if (doc.bits !== 2) fail(`bits is ${doc.bits}; this reader only knows the two-bit packing`)
if (doc.n !== ids.length) fail(`n is ${doc.n} but ids has ${ids.length} entries`)

const n = ids.length
const bytes = fromBase64(doc.data ?? '')
const expectedBytes = Math.ceil((n * n * 2) / 8)
if (bytes.length !== expectedBytes) {
  console.error(`${PATH}: data is ${bytes.length} bytes, expected ${expectedBytes} for ${n}x${n}`)
  process.exit(2)
}
const cells = unpackMatrix(bytes, n)

// --- the ids are the city's, in the canonical order ------------------------

const entries = cityWords(words, doc.city)
if (entries.length === 0) {
  console.error(`no words with curriculumRank in city ${doc.city} — the check would pass vacuously`)
  process.exit(2)
}
const byId = new Map(words.map((w) => [w.id, w]))
for (const id of ids) {
  if (!byId.has(id)) fail(`${id} is in the matrix but not in the dataset`)
}
const expectedIds = entries.map((e) => e.id)
if (ids.length !== expectedIds.length || ids.some((id, i) => id !== expectedIds[i])) {
  const missing = expectedIds.filter((id) => !ids.includes(id))
  const extra = ids.filter((id) => !expectedIds.includes(id))
  fail(
    `the ids are not city ${doc.city} in curriculumRank order` +
      (missing.length ? `; missing ${missing.slice(0, 5).join(', ')}` : '') +
      (extra.length ? `; unexpected ${extra.slice(0, 5).join(', ')}` : ''),
  )
}

// --- symmetry, range, diagonal, and not-all-zero ---------------------------

let asymmetric = 0
let nonZero = 0
for (let i = 0; i < n; i++) {
  for (let j = i + 1; j < n; j++) {
    const a = cells[i * n + j]
    const b = cells[j * n + i]
    if (a !== b) {
      if (asymmetric < 5) fail(`M[${ids[i]}][${ids[j]}] is ${a} but the mirror cell is ${b}`)
      asymmetric++
    }
    if (a > 0) nonZero++
  }
}
if (asymmetric > 5) fail(`...and ${asymmetric - 5} further asymmetric cells`)
if (nonZero === 0) {
  console.error(`${PATH} is zero everywhere off the diagonal — the check would pass vacuously`)
  process.exit(2)
}
for (let i = 0; i < n; i++) {
  if (cells[i * n + i] !== 3) fail(`M[${ids[i]}][${ids[i]}] is ${cells[i * n + i]}, expected 3`)
}

// --- the two facts the repo already states --------------------------------

const at = (i, j) => cells[i * n + j]

let conflictChecked = 0
for (const [i, j] of await conflictPairs(entries)) {
  conflictChecked++
  if (at(i, j) < 2) {
    fail(
      `${ids[i]} / ${ids[j]} is a sampler conflict but scores ${at(i, j)} — a conflict pair is confusable in play and must be at least 2`,
    )
  }
}
if (conflictChecked === 0) {
  console.error(
    `conflicts() found no pairs among city ${doc.city}'s ${n} words — that check would pass vacuously`,
  )
  process.exit(2)
}

let conceptChecked = 0
for (const p of cityPairs(entries)) {
  const shared = (p.a.concepts ?? []).filter((c) => (p.b.concepts ?? []).includes(c))
  if (shared.length === 0) continue
  conceptChecked++
  if (at(p.i, p.j) < 1) {
    fail(
      `${p.a.id} / ${p.b.id} both carry concept "${shared[0]}" but score 0 — a shared everyday domain is at least a 1`,
    )
  }
}
if (conceptChecked === 0) {
  console.error(
    `no two words in city ${doc.city} share a concepts tag — that check would pass vacuously`,
  )
  process.exit(2)
}

// --- report ---------------------------------------------------------------

if (errors.length > 0) {
  console.error(`${PATH}: ${errors.length} problem${errors.length === 1 ? '' : 's'}`)
  for (const e of errors) console.error(`  ${e}`)
  process.exit(1)
}

const dist = [0, 0, 0, 0]
for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) dist[at(i, j)]++
console.log(
  `${PATH}: ${n} words, ${(n * (n - 1)) / 2} pairs (0:${dist[0]} 1:${dist[1]} 2:${dist[2]} 3:${dist[3]}), ` +
    `symmetric, ${conflictChecked} conflict pairs >= 2, ${conceptChecked} same-concept pairs >= 1`,
)
