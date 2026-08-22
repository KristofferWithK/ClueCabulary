// Merges the two models' authored associations into src/data/book.<lang>.json.
//
//   node scripts/merge-book.mjs --city 1
//   node scripts/merge-book.mjs --city 1 --report   (prints what was dropped)
//
// Every city-1 word was written twice — once by an Opus subagent, once by a
// Fable one, 25 words an agent — and every within-city pair the matrix scores
// M >= 1 likewise, ~213 pairs an agent (docs/clue-engine.md §6 "Stage 1"). The
// raw files under src/data/generated/book-city<N>/ are the record; this script
// is the only thing that turns them into the shipped book, so the judgement
// calls live here and nowhere else. It is re-runnable: nothing it reads is
// written by a previous run.
//
// 1. MERGE RULE — UNION, keyed by the normalised Danish side. An association
//    only one model thought of is still an association, and the book's cost of
//    a wrong entry is not the cost of a wrong matrix cell: a bad clue in the
//    book is a candidate the search scores and rejects, while a missing one is
//    a clue the engine can never give at all. So the union, not the
//    intersection, and `v` (1 or 2) records which entries both models reached
//    for. `v` is not a filter, it is a ranking signal — see the cap below.
//
//    The Danish side is the identity of an entry because it is the clue: two
//    entries with the same `da` are the same clue however differently they
//    were glossed.
//
// 2. STRENGTH where both models proposed the same clue — `ceil(mean(o, f))`,
//    the same function merge-matrix.mjs uses, and deliberately so. `sim()`
//    reads a book strength and a matrix cell on one scale and compares them;
//    two different rounding rules on one scale would be a silent bias between
//    the direct and the two-hop path. (For integers the two candidate spellings
//    of "ties up" are the same function: ceil((1+2)/2) = round(1.5) = 2.)
//
// 3. THE `why` AND THE ENGLISH SIDE where both models proposed the same clue —
//    the higher-`s` model's, ties to Opus. A rationale is read out loud to a
//    player («"kæledyr" — a household pet»), so it wants one voice rather than
//    a blend, and the model that scored the link higher is the one that thought
//    hardest about what the link IS. The one exception is mechanical: if the
//    winner's `why` is outside the 3-8 word band and the loser's is inside it,
//    the loser's is taken, because a `why` the validator would reject is worse
//    than a `why` in the other model's voice.
//
// 4. ILLEGAL AND MALFORMED ENTRIES ARE DROPPED, not repaired. `checkClueLegality`
//    runs on every clue at play time, so an entry it rejects is one the engine
//    can never give — repairing it would mean inventing an association neither
//    model proposed. They are counted and, with --report, named: a model that
//    produced a lot of them is a fact about the brief, worth knowing before the
//    next city is authored.
//
// 5. THE CAP — 35 a word, the top of the band the spec asks for, by (v, s)
//    and Opus first on a tie. Both models writing ~30 each means the union
//    overshoots, and something has to choose. Consensus first is the right
//    order: an entry both models reached for independently is the one most
//    likely to be the clue a third party would also give. Nothing is trimmed
//    from a pair section — two models writing 2-3 clues each cannot exceed the
//    6 the format allows.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { cityWords, loadWords } from './matrix-pairs.mjs'
import {
  ASSOC_MAX,
  ASSOC_MIN,
  MODELS,
  PAIR_MAX,
  WHY_MAX_WORDS,
  WHY_MIN_WORDS,
  loadMatrix,
  pairKey,
  relatedPairs,
} from './book-brief.mjs'
import { checkEntryShape, entryLegality, withLegality } from './book-pack.mjs'
import { readJson } from './matrix-pack.mjs'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const CITY = Number(arg('city', '1'))
const LANG = arg('lang', 'da')
const REPORT = argv.includes('--report')
const SRC_DIR = arg('src', `src/data/generated/book-city${CITY}`)
const OUT = arg('out', `src/data/book.${LANG}.json`)

const words = loadWords(LANG)
const entries = cityWords(words, CITY)
if (entries.length === 0) {
  console.error(`no words in city ${CITY} — nothing to merge`)
  process.exit(2)
}
const byId = new Map(entries.map((e) => [e.id, e]))
const { at } = loadMatrix(LANG)
const related = relatedPairs(entries, at)
const relatedByKey = new Map(related.map((p) => [pairKey(p.a, p.b), p]))

// --- read every authored file ---------------------------------------------

const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.json')).sort()
if (files.length === 0) {
  console.error(`no authored files in ${SRC_DIR} — the merge would produce an empty book`)
  process.exit(2)
}

/** model -> id/key -> raw entries, in the order the model wrote them. */
const rawWords = new Map(MODELS.map((m) => [m, new Map()]))
const rawPairs = new Map(MODELS.map((m) => [m, new Map()]))
const problems = []

for (const file of files) {
  const model = file.split('-')[0]
  const kind = file.split('-')[1]
  if (!MODELS.includes(model) || !['words', 'pairs'].includes(kind)) {
    console.error(`${SRC_DIR}/${file}: expected <model>-<words|pairs>-<nn>.json`)
    process.exit(2)
  }
  const doc = readJson(`${SRC_DIR}/${file}`)
  const section = doc[kind] ?? {}
  const into = kind === 'words' ? rawWords.get(model) : rawPairs.get(model)
  for (const [key, list] of Object.entries(section)) {
    if (kind === 'words' && !byId.has(key)) {
      problems.push(`${file}: "${key}" is not a city ${CITY} word id`)
      continue
    }
    if (kind === 'pairs' && !relatedByKey.has(key)) {
      problems.push(`${file}: "${key}" is not a city ${CITY} pair the matrix scores M >= 1`)
      continue
    }
    if (into.has(key)) {
      problems.push(`${file}: ${model} already wrote "${key}" in another batch`)
      continue
    }
    if (!Array.isArray(list)) {
      problems.push(`${file}: "${key}" is not an array`)
      continue
    }
    into.set(key, list)
  }
}
if (problems.length > 0) {
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'} reading ${SRC_DIR}:`)
  for (const p of problems.slice(0, 20)) console.error(`  ${p}`)
  if (problems.length > 20) console.error(`  ...and ${problems.length - 20} more`)
  process.exit(2)
}

// --- merge ----------------------------------------------------------------

const dropped = { shape: [], illegal: [] }
const perModelKept = { opus: 0, fable: 0 }
const whyFrom = { opus: 0, fable: 0, band: 0 }
const trimmed = { words: 0, pairs: 0 }

const book = await withLegality(({ isLegal, normalize }) => {
  /** Clean one model's list for one key, dropping what cannot ship. */
  const clean = (list, model, key, boardWords) => {
    const out = new Map()
    for (const e of list) {
      const shape = checkEntryShape(e, { whyMin: WHY_MIN_WORDS, whyMax: WHY_MAX_WORDS })
      if (shape.length > 0) {
        dropped.shape.push(`${model} ${key} ${JSON.stringify(e)?.slice(0, 60)}: ${shape[0]}`)
        continue
      }
      const illegal = entryLegality(e, boardWords, isLegal)
      if (illegal.length > 0) {
        dropped.illegal.push(`${model} ${key} — ${illegal[0]}`)
        continue
      }
      const k = normalize(e.da)
      if (out.has(k)) continue // the model repeated itself; first spelling wins
      out.set(k, { da: e.da, en: e.en, why: e.why.trim(), s: e.s })
      perModelKept[model]++
    }
    return out
  }

  /** Union two models' cleaned maps into the shipped list. */
  const union = (byModel, cap, bucket) => {
    const keys = new Set([...byModel.opus.keys(), ...byModel.fable.keys()])
    const merged = []
    for (const k of keys) {
      const o = byModel.opus.get(k)
      const f = byModel.fable.get(k)
      if (o && f) {
        const s = Math.ceil((o.s + f.s) / 2)
        const inBand = (w) => {
          const n = w.why.trim().split(/\s+/).length
          return n >= WHY_MIN_WORDS && n <= WHY_MAX_WORDS
        }
        let winner = o.s >= f.s ? o : f
        const loser = winner === o ? f : o
        if (!inBand(winner) && inBand(loser)) {
          winner = loser
          whyFrom.band++
        } else {
          whyFrom[winner === o ? 'opus' : 'fable']++
        }
        merged.push({ da: winner.da, en: winner.en, why: winner.why, s, v: 2 })
      } else {
        const only = o ?? f
        merged.push({ da: only.da, en: only.en, why: only.why, s: only.s, v: 1 })
      }
    }
    merged.sort(
      (a, b) => b.v - a.v || b.s - a.s || a.da.localeCompare(b.da, 'da'),
    )
    if (merged.length > cap) {
      trimmed[bucket] += merged.length - cap
      return merged.slice(0, cap)
    }
    return merged
  }

  const outWords = {}
  for (const w of entries) {
    const byModel = {
      opus: clean(rawWords.get('opus').get(w.id) ?? [], 'opus', w.id, [w]),
      fable: clean(rawWords.get('fable').get(w.id) ?? [], 'fable', w.id, [w]),
    }
    outWords[w.id] = { assoc: union(byModel, ASSOC_MAX, 'words') }
  }

  const outPairs = {}
  for (const p of related) {
    const key = pairKey(p.a, p.b)
    const board = [p.a, p.b]
    const byModel = {
      opus: clean(rawPairs.get('opus').get(key) ?? [], 'opus', key, board),
      fable: clean(rawPairs.get('fable').get(key) ?? [], 'fable', key, board),
    }
    outPairs[key] = union(byModel, PAIR_MAX, 'pairs')
  }

  return { words: outWords, pairs: outPairs }
})

// --- write ----------------------------------------------------------------

const assocCounts = entries.map((w) => book.words[w.id].assoc.length)
const pairCounts = related.map((p) => book.pairs[pairKey(p.a, p.b)].length)
const totalAssoc = assocCounts.reduce((a, b) => a + b, 0)
const totalPairClues = pairCounts.reduce((a, b) => a + b, 0)

const doc = {
  lang: LANG,
  city: CITY,
  words: book.words,
  pairs: book.pairs,
  meta: {
    headwords: entries.length,
    associations: totalAssoc,
    relatedPairs: related.length,
    pairClues: totalPairClues,
    authors: MODELS,
    mergeRule: 'union on the normalised Danish side; s = ceil(mean) where both authored it',
    band: [ASSOC_MIN, ASSOC_MAX],
    pairGate: 'the judged matrix at M >= 1',
    generatedBy: 'scripts/merge-book.mjs',
  },
}
mkdirSync(dirname(OUT), { recursive: true })
const json = JSON.stringify(doc, null, 2) + '\n'
writeFileSync(OUT, json, 'utf8')

// --- say what happened ----------------------------------------------------

const span = (xs) => `${Math.min(...xs)}-${Math.max(...xs)}`
const bothVotes = Object.values(book.words).flatMap((w) => w.assoc).filter((e) => e.v === 2).length
console.log(`${files.length} authored files, ${entries.length} headwords, ${related.length} related pairs`)
console.log(`  kept opus ${perModelKept.opus}, fable ${perModelKept.fable} raw entries`)
console.log(
  `  dropped ${dropped.shape.length} malformed, ${dropped.illegal.length} illegal against their own word`,
)
console.log(
  `  words: ${totalAssoc} associations, ${span(assocCounts)} a word, ${bothVotes} with v=2 (${((bothVotes / totalAssoc) * 100).toFixed(1)}%)`,
)
const thin = entries.filter((w) => book.words[w.id].assoc.length < ASSOC_MIN)
if (thin.length > 0) {
  console.log(`  BELOW ${ASSOC_MIN}: ${thin.map((w) => `${w.da} (${book.words[w.id].assoc.length})`).join(', ')}`)
}
console.log(`  trimmed ${trimmed.words} associations over the cap of ${ASSOC_MAX}, ${trimmed.pairs} pair clues over ${PAIR_MAX}`)
console.log(
  `  pairs: ${totalPairClues} clues, ${span(pairCounts)} a pair, ${pairCounts.filter((c) => c < 2).length} with fewer than 2`,
)
console.log(
  `  of the v=2 entries, why taken from opus ${whyFrom.opus}, fable ${whyFrom.fable}, ` +
    `${whyFrom.band} handed to the loser because the winner's why was out of band`,
)
// Bytes, not `json.length`: a JS string length counts UTF-16 code units, and
// every æ, ø and å in a Danish book is two bytes on disk.
const bytes = Buffer.from(json, 'utf8')
console.log(`  ${OUT}: ${bytes.length} B of JSON, ${gzipSync(bytes).length} B gzipped`)
if (REPORT) {
  const head = (label, list) => {
    if (list.length === 0) return
    console.log(`\n${label} (${list.length}):`)
    for (const x of list.slice(0, 60)) console.log(`  ${x}`)
    if (list.length > 60) console.log(`  ...and ${list.length - 60} more`)
  }
  head('Malformed', dropped.shape)
  head('Illegal against their own word', dropped.illegal)
}
