/**
 * How much of the Danish function-word inventory the shipped example sentences
 * actually contain — and therefore how much of it the post-round sentences (F2)
 * can teach.
 *
 *     node scripts/measure-function-words.mjs
 *
 * WHY THIS EXISTS
 *
 * Nothing in the nine hundred is a preposition, a conjunction, a pronoun or a
 * determiner, and that is not an oversight: none of them can be clued. There is
 * no clue for «hvis». So the small words a learner needs in order to read a
 * Danish sentence — hvis, fordi, selvom, mens, eller — can only ever arrive as
 * scenery inside somebody else's sentence.
 *
 * F2 puts up to five `exampleDa` sentences on the round summary for exactly
 * that reason. This script answers whether the shipped sentences are carrying
 * enough scenery to make it work, so the answer is a measurement rather than a
 * hope. It is also the evidence for or against H5 (LLM-woven sentences that
 * thread function words in on purpose): if the numbers here were good, H5 would
 * be decoration.
 *
 * WHAT IT FOUND, on the 900 words as shipped (2026-08-20):
 *
 *   - 297 distinct word forms across the sentences are not a dataset headword,
 *     an inflection of one, or a compound of two.
 *   - 147 of a 209-word closed-class inventory appear at least once — 70%.
 *   - But 62 never appear at all and 50 appear in exactly one sentence of 900,
 *     so 112 of 209 — 54% of the inventory — is effectively unreachable by a
 *     feature that shows five sentences a round. Meeting even the 147 that ARE
 *     reachable, once each, takes 771 rounds.
 *   - Conjunctions are the hole: 9 of 21, and «hvis», «selvom», «eller» and
 *     «mens» are each 0/900. Two of the three words that prompted the feature —
 *     «hvis» at 0 and «fordi» at 2 — are effectively absent.
 *   - A round of five sentences shows ~11 distinct function words (median 11),
 *     and two thirds of them come from the same twenty: i, er, en, jeg, vi, på,
 *     har, hun, han, du…
 *
 * The reason is structural rather than accidental: these are A1 single-clause
 * examples ("Min mor laver god mad."), and a subordinating conjunction needs a
 * second clause to live in. So v1 teaches the core function words well through
 * sheer repetition and cannot teach the rest at all. That is the argument for
 * H5.
 *
 * The inventory below is hand-built — the Danish closed classes in full plus
 * the high-frequency adverbs and discourse particles — not a corpus cut. It is
 * the one judgement call in the file; everything else is counted.
 */
import { readFileSync } from 'node:fs'

const WORDS = JSON.parse(
  readFileSync(new URL('../src/data/words.da.json', import.meta.url), 'utf8'),
)

/* ------------------------------------------------------------------ *
 * "Is this word one of ours?" — the dataset's own rules
 *
 * Copied from `isInflection`/`isCompound` in src/data/words.ts rather than
 * imported, because that is a TypeScript module and this is a plain node
 * script. They must agree; if that file's rules change, change these.
 * Without them the non-dataset count is nonsense: «laver» and «huset» are
 * «lave» and «hus» wearing an ending, and counting them as new words would
 * roughly double the figure.
 * ------------------------------------------------------------------ */
const HEADWORDS = new Set(WORDS.map((w) => w.da.toLowerCase()))
const INFLECTIONS = ['en', 'et', 'er', 'ene', 'erne', 'e', 'r', 'ede', 'te', 's']
const LINKERS = ['', 's', 'e']

const isInflection = (n) =>
  INFLECTIONS.some((suffix) => {
    if (!n.endsWith(suffix) || n.length - suffix.length < 3) return false
    const stem = n.slice(0, n.length - suffix.length)
    return HEADWORDS.has(stem) || HEADWORDS.has(`${stem}e`)
  })

const isCompound = (n) => {
  for (let i = 3; i <= n.length - 3; i++) {
    const head = n.slice(0, i)
    if (!HEADWORDS.has(head) && !HEADWORDS.has(`${head}e`)) continue
    for (const link of LINKERS) {
      const tail = n.slice(i)
      if (tail.startsWith(link) && tail.length - link.length >= 3) {
        const rest = tail.slice(link.length)
        if (HEADWORDS.has(rest) || isInflection(rest)) return true
      }
    }
  }
  return false
}

const isDatasetWord = (n) => HEADWORDS.has(n) || isInflection(n) || isCompound(n)

/* ------------------------------------------------------------------ *
 * The inventory
 * ------------------------------------------------------------------ */
const FUNCTION_WORDS = {
  'personal pronouns': [
    'jeg', 'mig', 'du', 'dig', 'han', 'ham', 'hun', 'hende', 'den', 'det',
    'vi', 'os', 'i', 'jer', 'de', 'dem', 'man', 'sig', 'selv', 'hinanden',
  ],
  possessives: [
    'min', 'mit', 'mine', 'din', 'dit', 'dine', 'hans', 'hendes', 'dens',
    'dets', 'vores', 'jeres', 'deres', 'sin', 'sit', 'sine',
  ],
  determiners: [
    'en', 'et', 'denne', 'dette', 'disse', 'sådan', 'samme', 'anden', 'andet',
    'andre', 'hver', 'hvert', 'al', 'alt', 'alle', 'begge', 'ingen', 'intet',
    'nogen', 'noget', 'nogle', 'enhver', 'megen', 'meget', 'mange', 'flere',
    'fleste', 'færre', 'lidt',
  ],
  prepositions: [
    'i', 'på', 'til', 'fra', 'med', 'uden', 'om', 'over', 'under', 'ved',
    'af', 'for', 'efter', 'før', 'mellem', 'mod', 'imod', 'hos', 'gennem',
    'langs', 'omkring', 'bag', 'foran', 'blandt', 'trods', 'ifølge', 'siden',
    'indtil', 'per', 'ad', 'mens',
  ],
  conjunctions: [
    'og', 'eller', 'men', 'samt', 'at', 'om', 'hvis', 'fordi', 'da', 'når',
    'mens', 'siden', 'selvom', 'skønt', 'medmindre', 'eftersom', 'således',
    'både', 'enten', 'hverken', 'som',
  ],
  interrogatives: [
    'hvem', 'hvad', 'hvilken', 'hvilket', 'hvilke', 'hvor', 'hvornår',
    'hvorfor', 'hvordan', 'hvorhen',
  ],
  'auxiliaries and modals': [
    'er', 'var', 'været', 'være', 'har', 'havde', 'haft', 'have', 'kan',
    'kunne', 'skal', 'skulle', 'vil', 'ville', 'må', 'måtte', 'bør', 'burde',
    'bliver', 'blev', 'blive', 'blevet', 'gør', 'gjorde', 'gøre',
  ],
  'adverbs and particles': [
    'ikke', 'jo', 'nu', 'her', 'der', 'altid', 'aldrig', 'ofte', 'sjældent',
    'straks', 'pludselig', 'endelig', 'allerede', 'stadig', 'endnu', 'igen',
    'også', 'kun', 'bare', 'næsten', 'helt', 'ret', 'temmelig', 'ganske',
    'virkelig', 'faktisk', 'måske', 'nok', 'vel', 'dog', 'altså', 'derfor',
    'desuden', 'alligevel', 'ellers', 'snart', 'længe', 'tit', 'sammen',
    'hjemme', 'ude', 'inde', 'oppe', 'nede', 'frem', 'tilbage', 'videre',
    'væk', 'hen', 'netop', 'lige', 'først', 'sidst', 'især', 'omtrent',
    'vist', 'gerne', 'hellere', 'heller', 'ja', 'nej',
  ],
}

const ALL = new Set(Object.values(FUNCTION_WORDS).flat())

/**
 * Words out of a sentence. Hyphens and apostrophes stay inside a token; every
 * other punctuation mark is a boundary. Verified against a plain regex grep for
 * a dozen of the words below — the two agreed exactly, which is the only reason
 * to trust a tokeniser this simple.
 */
const tokens = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-zæøåéü\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

const seen = new Map()
for (const w of WORDS) for (const t of tokens(w.exampleDa)) seen.set(t, (seen.get(t) ?? 0) + 1)

const distinct = [...seen.keys()]
const nonDataset = distinct.filter((t) => !isDatasetWord(t))
const covered = [...ALL].filter((f) => seen.has(f))

console.log('=== the corpus ===')
console.log(`sentences            ${WORDS.length}`)
console.log(`running words        ${[...seen.values()].reduce((a, b) => a + b, 0)}`)
console.log(`distinct word forms  ${distinct.length}`)
console.log(`of which non-dataset ${nonDataset.length}   (not a headword, inflection or compound)`)

console.log('\n=== function-word coverage ===')
console.log(
  `${covered.length} of ${ALL.size} appear at least once  (${Math.round((covered.length / ALL.size) * 100)}%)`,
)
for (const [klass, list] of Object.entries(FUNCTION_WORDS)) {
  const uniq = [...new Set(list)]
  const hit = uniq.filter((f) => seen.has(f))
  const gone = uniq.filter((f) => !seen.has(f))
  console.log(
    `  ${klass.padEnd(23)} ${String(hit.length).padStart(3)}/${String(uniq.length).padEnd(3)}` +
      `  absent: ${gone.join(' ') || '—'}`,
  )
}

console.log('\n=== but how often ===')
const bucket = { never: 0, once: 0, '2-4': 0, '5-19': 0, '20+': 0 }
for (const f of ALL) {
  const n = seen.get(f) ?? 0
  if (!n) bucket.never++
  else if (n === 1) bucket.once++
  else if (n < 5) bucket['2-4']++
  else if (n < 20) bucket['5-19']++
  else bucket['20+']++
}
console.log(
  Object.entries(bucket)
    .map(([k, v]) => `${k}: ${v}`)
    .join('   '),
)
const top = [...seen.entries()]
  .filter(([w]) => ALL.has(w))
  .sort((a, b) => b[1] - a[1])
console.log('top 20:', top.slice(0, 20).map(([w, n]) => `${w}:${n}`).join(' '))

console.log('\n=== the words that prompted the feature ===')
for (const f of ['hvis', 'pludselig', 'fordi', 'selvom', 'eller', 'mens', 'hvornår']) {
  console.log(`  ${f.padEnd(11)} ${seen.get(f) ?? 0} of ${WORDS.length} sentences`)
}

/* ------------------------------------------------------------------ *
 * What a player actually meets: five sentences, not nine hundred.
 * Fixed seed, so the figure is reproducible.
 * ------------------------------------------------------------------ */
let rng = 12345
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const draw = () => {
  const pick = new Set()
  while (pick.size < 5) pick.add(Math.floor(rand() * WORDS.length))
  const fn = new Set()
  for (const i of pick) for (const t of tokens(WORDS[i].exampleDa)) if (ALL.has(t)) fn.add(t)
  return fn
}

const TRIALS = 20000
const sizes = []
const top20 = new Set(top.slice(0, 20).map((x) => x[0]))
let fromTop = 0
let total = 0
for (let t = 0; t < TRIALS; t++) {
  const fn = draw()
  sizes.push(fn.size)
  for (const w of fn) {
    total++
    if (top20.has(w)) fromTop++
  }
}
sizes.sort((a, b) => a - b)
console.log('\n=== one round: five sentences ===')
console.log(
  `distinct function words   mean ${(sizes.reduce((a, b) => a + b, 0) / TRIALS).toFixed(1)}` +
    `  median ${sizes[TRIALS >> 1]}  p10 ${sizes[TRIALS / 10]}  p90 ${sizes[(TRIALS * 0.9) | 0]}`,
)
console.log(`share drawn from the same top twenty: ${Math.round((100 * fromTop) / total)}%`)

const coveredSet = new Set(covered)
const met = new Set()
let rounds = 0
while (met.size < coveredSet.size && rounds < 200000) {
  rounds++
  for (const w of draw()) if (coveredSet.has(w)) met.add(w)
}
console.log(`rounds to meet all ${coveredSet.size} reachable function words once: ${rounds}`)
