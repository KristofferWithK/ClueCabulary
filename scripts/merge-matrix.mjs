// Merges the two models' votes into src/data/matrix.<lang>.json.
//
//   node scripts/merge-matrix.mjs --city 1
//   node scripts/merge-matrix.mjs --city 1 --report   (prints the disagreements)
//
// Every within-city pair was judged twice — once by an Opus subagent, once by
// a Fable one, 150 pairs an agent (docs/clue-engine.md §6 "Stage 2"). The vote
// files under src/data/generated/matrix-city<N>/ are the raw record; this
// script is the only thing that turns them into the shipped matrix, so the
// three judgement calls below live here and nowhere else.
//
// 1. MERGE RULE — `ceil((opus + fable) / 2)`: the mean, and a tie goes to the
//    higher of the two. The costs are not symmetric. A cell scored too LOW is
//    a trap the engine cannot see, and the clue it then gives loses the turn;
//    a cell scored too HIGH only makes the engine reject a clue it could have
//    afforded, which costs coverage. So where the two judges split — 304 of
//    the 4,950 pairs, every one of them by exactly one — the merge takes the
//    cautious number.
//
//    Plain max over both votes was the alternative. On this data the two are
//    the same function: not one pair came back more than one apart, so
//    ceil(mean) and max agree on all 4,950. The rule is still written as
//    ceil(mean) because it is the one that stays sane on the eight cities not
//    yet judged, where a 0-against-2 split is a pair one judge has misread and
//    the midpoint is the better answer than the higher of two guesses.
//
// 2. DIAGONAL — 3. A clue for a word pulls that word maximally; that is what
//    a clue IS. It is never read as a trap (no card is its own trap), but the
//    two-hop estimate in the evaluator walks through the matrix, and a
//    diagonal of 0 would make a word its own worst path.
//
// 3. CONFLICT FLOOR — a pair the board sampler calls a conflict is raised to
//    at least 2. The judges were told to ignore spelling and did: they scored
//    hund/hånd, kat/nat and bog/tog as unrelated, which is correct about
//    MEANING and wrong about play. A learner reading the clue «hund» with
//    "hånd" on the board can absolutely reach for it, and that near-miss is
//    precisely what `conflicts()` exists to name.
//
// 4. CONCEPT FLOOR — a pair sharing a `concepts` tag is raised to at least 1.
//    The tags are this repo's own statement that two words sit in the same
//    everyday domain, and "same broad everyday domain" is word-for-word what
//    the judging brief defines a 1 as. Where the judges said 0 anyway — 46
//    pairs of the 421 that share a tag, mostly the two widest tags, `nature`
//    (træ/hav, blomst/måne) and `place` (hav/butik, strand/gade) — the two
//    statements disagree and the floor takes the union, for the same reason
//    the merge rounds ties up.
//
//    Both floors are applied AFTER the honest judgement is recorded, and every
//    cell either one moves is listed in the file's `meta.floored` with the
//    value it had before. That list is the cross-check's real output: it is
//    where to look when a concept tag or a clue looks wrong later, and it is
//    why flooring does not simply erase the signal it is papering over.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { cityPairs, cityWords, loadWords } from './matrix-pairs.mjs'
import { conflictPairs, packMatrix, readJson, toBase64 } from './matrix-pack.mjs'

const MODELS = ['opus', 'fable']
const DIAGONAL = 3
const CONFLICT_FLOOR = 2
const CONCEPT_FLOOR = 1

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const CITY = Number(arg('city', '1'))
const LANG = arg('lang', 'da')
const REPORT = argv.includes('--report')
const VOTE_DIR = arg('votes', `src/data/generated/matrix-city${CITY}`)
const OUT = arg('out', `src/data/matrix.${LANG}.json`)

const entries = cityWords(loadWords(LANG), CITY)
if (entries.length === 0) {
  console.error(`no words in city ${CITY} — nothing to merge`)
  process.exit(2)
}
const pairs = cityPairs(entries)
const n = entries.length

// --- read every vote ------------------------------------------------------

const votes = new Map(MODELS.map((m) => [m, new Map()]))
const files = readdirSync(VOTE_DIR).filter((f) => f.endsWith('.json'))
if (files.length === 0) {
  console.error(`no vote files in ${VOTE_DIR} — the merge would produce an empty matrix`)
  process.exit(2)
}
for (const file of files) {
  const model = file.split('-')[0]
  if (!votes.has(model)) {
    console.error(`${VOTE_DIR}/${file}: "${model}" is not one of ${MODELS.join(', ')}`)
    process.exit(2)
  }
  const doc = readJson(`${VOTE_DIR}/${file}`)
  for (const [k, v] of Object.entries(doc.scores ?? {})) {
    const key = Number(k)
    if (!Number.isInteger(v) || v < 0 || v > 3) {
      console.error(`${file}: pair ${k} scored ${v}, which is not an integer 0-3`)
      process.exit(2)
    }
    if (votes.get(model).has(key)) {
      console.error(`${file}: pair ${k} was already scored by ${model} in another batch`)
      process.exit(2)
    }
    votes.get(model).set(key, v)
  }
}
for (const model of MODELS) {
  const missing = pairs.filter((p) => !votes.get(model).has(p.k))
  if (missing.length > 0) {
    console.error(
      `${model} is missing ${missing.length} pairs, first ${missing[0].k} (${missing[0].a.da}/${missing[0].b.da})`,
    )
    process.exit(2)
  }
  const extra = [...votes.get(model).keys()].filter((k) => k < 1 || k > pairs.length)
  if (extra.length > 0) {
    console.error(`${model} scored ${extra.length} pair indexes outside 1-${pairs.length}`)
    process.exit(2)
  }
}

// --- merge ----------------------------------------------------------------

const cells = new Uint8Array(n * n)
for (let i = 0; i < n; i++) cells[i * n + i] = DIAGONAL

const perModel = { opus: [0, 0, 0, 0], fable: [0, 0, 0, 0] }
const merged = [0, 0, 0, 0]
const disagreements = []
let split = 0

for (const p of pairs) {
  const o = votes.get('opus').get(p.k)
  const f = votes.get('fable').get(p.k)
  perModel.opus[o]++
  perModel.fable[f]++
  const value = Math.ceil((o + f) / 2)
  if (o !== f) {
    split++
    if (Math.abs(o - f) >= 2) disagreements.push({ p, o, f, value })
  }
  cells[p.i * n + p.j] = value
  cells[p.j * n + p.i] = value
  merged[value]++
}

const floored = []
const raise = (i, j, to, why) => {
  const before = cells[i * n + j]
  if (before >= to) return
  floored.push({ a: entries[i].id, b: entries[j].id, was: before, to, why })
  merged[before]--
  merged[to]++
  cells[i * n + j] = to
  cells[j * n + i] = to
}

for (const [i, j] of await conflictPairs(entries)) raise(i, j, CONFLICT_FLOOR, 'conflicts')
for (const p of pairs) {
  const shared = (p.a.concepts ?? []).filter((c) => (p.b.concepts ?? []).includes(c))
  if (shared.length > 0) raise(p.i, p.j, CONCEPT_FLOOR, `concepts:${shared.join('+')}`)
}

// --- write ----------------------------------------------------------------

const bytes = packMatrix(cells, n)
const doc = {
  lang: LANG,
  city: CITY,
  n,
  bits: 2,
  scale: [0, 3],
  ids: entries.map((e) => e.id),
  data: toBase64(bytes),
  meta: {
    pairs: pairs.length,
    judges: MODELS,
    mergeRule: 'ceil(mean(opus, fable)) — the mean, ties to the higher vote',
    diagonal: DIAGONAL,
    conflictFloor: CONFLICT_FLOOR,
    conceptFloor: CONCEPT_FLOOR,
    agreed: pairs.length - split,
    split,
    farApart: disagreements.length,
    floored,
    generatedBy: 'scripts/merge-matrix.mjs',
  },
}
mkdirSync(dirname(OUT), { recursive: true })
const json = JSON.stringify(doc, null, 2) + '\n'
writeFileSync(OUT, json, 'utf8')

// --- say what happened ----------------------------------------------------

const pct = (x) => `${((x / pairs.length) * 100).toFixed(1)}%`
console.log(`${n} words, ${pairs.length} pairs, ${files.length} vote files`)
for (const m of MODELS) {
  console.log(`  ${m.padEnd(6)} 0:${perModel[m][0]} 1:${perModel[m][1]} 2:${perModel[m][2]} 3:${perModel[m][3]}`)
}
console.log(`  merged 0:${merged[0]} 1:${merged[1]} 2:${merged[2]} 3:${merged[3]}`)
console.log(`  agreed on ${pairs.length - split} pairs (${pct(pairs.length - split)}), split on ${split}, apart by >=2 on ${disagreements.length}`)
const byWhy = (t) => floored.filter((f) => f.why.startsWith(t)).length
console.log(`  conflict floor raised ${byWhy('conflicts')} cells to ${CONFLICT_FLOOR}, concept floor ${byWhy('concepts')} to ${CONCEPT_FLOOR}`)
console.log(
  `  ${OUT}: ${bytes.length} B packed, ${json.length} B of JSON, ${gzipSync(Buffer.from(json)).length} B gzipped`,
)
if (REPORT) {
  console.log('\nPairs the two models put >=2 apart:')
  for (const d of disagreements) {
    console.log(
      `  ${String(d.p.k).padStart(4)} ${d.p.a.da}/${d.p.b.da} (${d.p.a.en[0]}/${d.p.b.en[0]}) opus ${d.o} fable ${d.f} -> ${d.value}`,
    )
  }
  if (floored.length > 0) {
    console.log('\nCells raised by a floor:')
    for (const f of floored) {
      console.log(`  ${f.a} / ${f.b} was ${f.was} -> ${f.to} (${f.why})`)
    }
  }
}
