// Checks every src/data/matrix.<lang>.<city>.json against the dataset it is
// keyed by.
//
//   node scripts/validate-matrix.mjs            (--lang da is the default)
//
// EVERY CITY THERE IS, not a city named here. `authoredCities()` reads the
// tree, so E6's next city is checked the day its file lands and a city that
// silently disappears fails the vacuity guard instead of being skipped. There
// is no first city in this file: city 1's matrix was renamed into the
// per-city scheme by E6 precisely so it could not be a special case.
//
// The matrix is 4,950 judgements a city that no test can re-derive, so what a
// validator can do is check the things that ARE derivable: that every id it
// names is a real headword of the city it claims, that the square is
// symmetric, that the diagonal is 3, and that it agrees with the one fact the
// repo already states about which words MEAN the same thing.
//
// About that last one. docs/clue-engine.md §6 originally asked for "every
// `sampler.ts` `conflicts` pair scores >= 2". That rule was written before
// anyone checked what `conflicts()` does, and it is wrong twice over:
//
//   - A conflicts pair can never be dealt onto one board. `conflicts()`
//     reaches the board through `fitsBoard()`, which `drawWeighted()` applies
//     to every pick, and every draw in sampler.ts goes through `drawWeighted`.
//     So the rule gated pairs that cannot co-occur — no play meaning at all.
//   - Two of the function's three arms are orthographic. Same stem and edit
//     distance <= 1 catch hus/bus, hund/hånd, bog/tog: words that look alike
//     and mean nothing to each other. Asserting they are associated would put
//     a lie in a semantic table, and the evaluator walks that table two-hop —
//     M[hus][bus] = 2 would tell the engine a house-flavoured clue REACHES
//     "bus", which is an unsound clue when "bus" is a target, not a cautious
//     one. All 17 of city 1's conflicts are this kind, and all 17 are exempt.
//
// The third arm, a shared English gloss, IS semantic: two words that print the
// same word on the card's English side are near-synonyms, and a clue for one
// really does pull the other. That arm is gated, at >= 2. Neither city 1 nor
// city 2 contains an instance of it (the whole 900-word dataset has eight, in
// cities 8 and 9), so the threshold is still inherited from the spec rather
// than calibrated — say so here rather than pretend, and revisit it when city
// 8 is judged.
//
// The dataset's `concepts` tags are the other cross-check the spec asked for,
// and they are REPORTED, not gated. Flooring or failing on them would only
// hide what they found: 46 of city 1's 421 same-tag pairs were judged 0, and
// the judges may be right — `nature` and `place` are wide enough to hold two
// unrelated words. A tag whose pairs mostly score 0 is saying something about
// the tag, which is for a human to read, not for a build to reject.
//
// It refuses to pass vacuously, the way scripts/validate-audio.mjs does: no
// words read, no matrix files at all, no ids in a file, a matrix that is
// entirely zero off the diagonal, or a `conflicts()` that finds nothing at all
// in a hundred words (which would mean the module failed to load) each exit
// non-zero rather than reporting a clean run over nothing.
import { cityPairs, cityWords, loadWords } from './matrix-pairs.mjs'
import {
  authoredCities,
  classifyConflicts,
  fromBase64,
  matrixPath,
  readJson,
  unpackMatrix,
} from './matrix-pack.mjs'

const argLang = process.argv.indexOf('--lang')
const LANG = argLang === -1 ? 'da' : (process.argv[argLang + 1] ?? 'da')
if (!/^[a-z]{2}$/.test(LANG)) {
  console.error(`--lang must be a two-letter code, got "${LANG}"`)
  process.exit(2)
}

const words = loadWords(LANG)
if (words.length === 0) {
  console.error(
    `read no headwords out of src/data/words.${LANG}.json — the check would pass vacuously`,
  )
  process.exit(2)
}

const cities = authoredCities(LANG)
if (cities.length === 0) {
  console.error(
    `no src/data/matrix.${LANG}.<city>.json in the tree — the check would pass vacuously`,
  )
  process.exit(2)
}

const GLOSS_MIN = 2
const byId = new Map(words.map((w) => [w.id, w]))

// The `concepts` cross-check is per city and reported rather than gated, so
// the thing that must not pass quietly is the tags failing to LOAD — which
// would look exactly like every city having nothing to report. Asserted once,
// over the whole dataset, rather than once per city: city 2's hundred carry no
// tags at all, and that is a gap in the dataset, not a broken matrix.
if (words.every((w) => (w.concepts ?? []).length === 0)) {
  console.error(
    `no word in src/data/words.${LANG}.json carries a concepts tag — the cross-check would report nothing anywhere`,
  )
  process.exit(2)
}

/** One city's file. Returns its complaints; a vacuous run exits instead. */
async function checkCity(city) {
  const PATH = matrixPath(LANG, city)
  let doc
  try {
    doc = readJson(PATH)
  } catch (err) {
    console.error(`could not read ${PATH}: ${err.message}`)
    console.error(`  city ${city} ships a book but no matrix — E6 ships the two together`)
    process.exit(2)
  }

  const errors = []
  const fail = (msg) => errors.push(msg)

  // --- shape ---------------------------------------------------------------

  const ids = doc.ids ?? []
  if (ids.length === 0) {
    console.error(`${PATH} names no word ids — the check would pass vacuously`)
    process.exit(2)
  }
  if (doc.bits !== 2) fail(`bits is ${doc.bits}; this reader only knows the two-bit packing`)
  if (doc.n !== ids.length) fail(`n is ${doc.n} but ids has ${ids.length} entries`)
  // The filename is a claim about which city is inside; a file that disagrees
  // with its own name would send every check below at the wrong hundred words.
  if (doc.city !== city) fail(`${PATH} says city ${doc.city} inside`)

  const n = ids.length
  const bytes = fromBase64(doc.data ?? '')
  const expectedBytes = Math.ceil((n * n * 2) / 8)
  if (bytes.length !== expectedBytes) {
    console.error(`${PATH}: data is ${bytes.length} bytes, expected ${expectedBytes} for ${n}x${n}`)
    process.exit(2)
  }
  const cells = unpackMatrix(bytes, n)

  // --- the ids are the city's, in the canonical order -----------------------

  const entries = cityWords(words, city)
  if (entries.length === 0) {
    console.error(`no words with curriculumRank in city ${city} — the check would pass vacuously`)
    process.exit(2)
  }
  for (const id of ids) {
    if (!byId.has(id)) fail(`${id} is in the matrix but not in the dataset`)
  }
  const expectedIds = entries.map((e) => e.id)
  if (ids.length !== expectedIds.length || ids.some((id, i) => id !== expectedIds[i])) {
    const missing = expectedIds.filter((id) => !ids.includes(id))
    const extra = ids.filter((id) => !expectedIds.includes(id))
    fail(
      `the ids are not city ${city} in curriculumRank order` +
        (missing.length ? `; missing ${missing.slice(0, 5).join(', ')}` : '') +
        (extra.length ? `; unexpected ${extra.slice(0, 5).join(', ')}` : ''),
    )
  }

  // --- symmetry, range, diagonal, and not-all-zero -------------------------

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

  // --- the one semantic arm of conflicts() ---------------------------------

  const at = (i, j) => cells[i * n + j]

  const { gloss, orthographic, drift, total } = await classifyConflicts(entries)
  if (total === 0) {
    console.error(`conflicts() found no pairs at all among city ${city}'s ${n} words — that is not a`)
    console.error('  plausible answer for a hundred Danish words, so the module did not load properly')
    process.exit(2)
  }
  for (const [i, j] of drift) {
    fail(
      `${ids[i]} / ${ids[j]} share an English gloss but conflicts() says no — the sampler's gloss arm has changed and this validator's split of it is stale`,
    )
  }
  for (const [i, j, shared] of gloss) {
    if (at(i, j) < GLOSS_MIN) {
      fail(
        `${ids[i]} / ${ids[j]} both gloss as "${shared}" but score ${at(i, j)} — two words with the same English side are near-synonyms and must be at least ${GLOSS_MIN}`,
      )
    }
  }

  // --- the concepts cross-check, reported rather than gated ----------------

  const perTag = new Map()
  const zeros = []
  let conceptPairs = 0
  for (const p of cityPairs(entries)) {
    const shared = (p.a.concepts ?? []).filter((c) => (p.b.concepts ?? []).includes(c))
    if (shared.length === 0) continue
    conceptPairs++
    const v = at(p.i, p.j)
    for (const tag of shared) {
      const row = perTag.get(tag) ?? { pairs: 0, zero: 0 }
      row.pairs++
      if (v === 0) row.zero++
      perTag.set(tag, row)
    }
    if (v === 0) {
      zeros.push(`${p.a.da}/${p.b.da} (${p.a.en[0]}/${p.b.en[0]}) share ${shared.join('+')}`)
    }
  }
  // Nothing to cross-check is a fact about the DATASET, not about the matrix,
  // and it is only alarming if it is true everywhere. City 1's hundred all
  // carry `concepts`; city 2's carry none at all — the tags were authored for
  // the first hundred and never extended — so this report is simply empty for
  // city 2 and says so. The vacuity guard that matters (no tags anywhere,
  // meaning the field stopped loading) is above, outside this loop.
  const taggedHere = entries.filter((e) => (e.concepts ?? []).length > 0).length

  // --- report --------------------------------------------------------------

  if (errors.length > 0) return { PATH, errors }

  const dist = [0, 0, 0, 0]
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) dist[at(i, j)]++
  console.log(
    `${PATH}: ${n} words, ${(n * (n - 1)) / 2} pairs (0:${dist[0]} 1:${dist[1]} 2:${dist[2]} 3:${dist[3]}), ` +
      `symmetric, diagonal 3`,
  )
  console.log(
    `  conflicts(): ${gloss.length} shared-gloss pairs checked >= ${GLOSS_MIN}, ` +
      `${orthographic.length} orthographic pairs exempt (they can never share a board)`,
  )
  console.log(
    conceptPairs === 0
      ? `  concepts: ${taggedHere} of ${n} words carry a tag and no two share one — nothing to report`
      : `  concepts: ${zeros.length} of ${conceptPairs} same-tag pairs scored 0 — reported, not a failure`,
  )
  const loose = [...perTag.entries()]
    .filter(([, r]) => r.zero > 0)
    .sort((a, b) => b[1].zero / b[1].pairs - a[1].zero / a[1].pairs)
  for (const [tag, r] of loose) {
    const share = ((r.zero / r.pairs) * 100).toFixed(0)
    console.log(
      `    ${tag.padEnd(12)} ${String(r.zero).padStart(3)}/${String(r.pairs).padStart(3)} judged 0 (${share}%)`,
    )
  }
  if (process.argv.includes('--pairs')) {
    for (const z of zeros) console.log(`    · ${z}`)
  }
  return null
}

let failed = 0
for (const city of cities) {
  const bad = await checkCity(city)
  if (bad) {
    failed++
    console.error(`${bad.PATH}: ${bad.errors.length} problem${bad.errors.length === 1 ? '' : 's'}`)
    for (const e of bad.errors) console.error(`  ${e}`)
  }
}
if (failed > 0) process.exit(1)
console.log(`${cities.length} authored ${LANG} matrix file${cities.length === 1 ? '' : 's'}: city ${cities.join(', ')}`)
