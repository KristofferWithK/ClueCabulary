// Merges the two models' votes into src/data/matrix.<lang>.json.
//
//   node scripts/merge-matrix.mjs --city 1
//   node scripts/merge-matrix.mjs --city 1 --report   (prints the disagreements)
//
// Every within-city pair was judged twice — once by an Opus subagent, once by
// a Fable one, 150 pairs an agent (docs/clue-engine.md §6 "Stage 2"). The vote
// files under src/data/generated/matrix-city<N>/ are the raw record; this
// script is the only thing that turns them into the shipped matrix, so the
// judgement calls below live here and nowhere else.
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
// 3. NO FLOORS. An earlier draft of this script raised every `conflicts()`
//    pair to 2 and every same-`concepts` pair to 1, on the argument that the
//    judges had missed a trap. Both were wrong and both were removed; the
//    reasoning is worth keeping so nobody adds them back.
//
//    The conflict floor rested on a story that cannot happen. `conflicts()`
//    reaches the board through `fitsBoard()`, which `drawWeighted()` applies
//    to every single pick, and every board draw in sampler.ts goes through
//    `drawWeighted` — so a conflicts pair is never dealt onto one board. There
//    is no player who reads the clue «hund» with "hånd" in front of them. And
//    the floor was not free: the matrix is a SEMANTIC table and the evaluator
//    walks it two-hop, so M[hus][bus] = 2 tells the engine a house-flavoured
//    clue reaches "bus". If "bus" is a trap that is over-caution and harmless;
//    if "bus" is a TARGET the engine has just been told an unsound clue is a
//    good one. Orthographic confusability is real, and the sampler is where it
//    is already handled. It must not be restated as association.
//
//    The concept floor was the same mistake in a gentler form: it made the
//    cross-check pass by construction and threw away what it had found. The
//    judges may simply be right that træ/hav and hav/butik are not associated
//    — `nature` and `place` are very wide tags. So the judged value stands and
//    validate-matrix.mjs REPORTS the zeros per tag instead of gating on them.
//
//    What ships is what the two models said, and nothing else.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { cityPairs, cityWords, loadWords } from './matrix-pairs.mjs'
import { packMatrix, readJson, toBase64 } from './matrix-pack.mjs'

const MODELS = ['opus', 'fable']
const DIAGONAL = 3

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
    floors: 'none — the judged values ship unaltered; see merge-matrix.mjs',
    agreed: pairs.length - split,
    split,
    farApart: disagreements.length,
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
}
