// The canonical pair order for the judged association matrix, and the briefs
// the judging agents are handed.
//
// `docs/clue-engine.md` §6 "Stage 2": within a city every pair is judged
// explicitly — 4,950 for a hundred words — by two models whose votes are then
// merged. This file is what makes that reproducible. The pair index a vote
// file is keyed by is defined HERE and nowhere else: rank order within the
// city, then i<j, one-based. Change this ordering and every vote file already
// written points at the wrong pair, which is why `merge-matrix.mjs` re-derives
// the order from this module rather than trusting the vote files' own labels.
//
//   node scripts/matrix-pairs.mjs --city 1 --out tmp-matrix-briefs --size 150
//
// writes one brief per batch. The briefs are derivable and are not committed;
// the votes under src/data/generated/matrix-city<N>/ are.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

/** Words of one city, in the order the pair index counts them. */
export function cityWords(words, city, wordsPerCity = 100) {
  const lo = (city - 1) * wordsPerCity + 1
  const hi = city * wordsPerCity
  return words
    .filter((w) => w.curriculumRank >= lo && w.curriculumRank <= hi)
    .sort((a, b) => a.curriculumRank - b.curriculumRank)
}

/** Every unordered pair, one-based, in the canonical order. */
export function cityPairs(entries) {
  const pairs = []
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      pairs.push({ k: pairs.length + 1, i, j, a: entries[i], b: entries[j] })
    }
  }
  return pairs
}

export function loadWords(lang = 'da') {
  return JSON.parse(readFileSync(new URL(`../src/data/words.${lang}.json`, import.meta.url), 'utf8'))
}

const SCALE = `## The question

For every pair below, answer exactly one question:

**How much does a clue for one of these two words pull the other?**

Picture a clue-giver choosing a single word to make a guesser think of word A,
while word B sits on the board as a card that must NOT be picked. Your score
says how likely a natural clue for A is to drag B along with it. Score the
**stronger of the two directions** — the matrix is symmetric, so a pair where a
clue for A pulls B but not the reverse takes the higher number.

## The scale

- **0 — no pull.** A natural clue for one would essentially never make anyone
  think of the other. They live in different worlds. (bog "book" / regn "rain";
  sukker "sugar" / kirke "church")
- **1 — faint pull.** Same broad everyday domain, or a loose link a careless
  clue could brush. Not a natural trap, but not unrelated. (stol "chair" / hus
  "house" — both domestic; løbe "run" / bil "car" — both about getting
  somewhere; æble "apple" / kage "cake" — both things you eat, sweet-ish)
- **2 — strong pull.** A common, natural clue for one would often also point at
  the other: same tight category, part and whole, things that habitually turn
  up together. (kaffe "coffee" / mælk "milk"; hånd "hand" / finger "finger";
  regn "rain" / sne "snow")
- **3 — near-inseparable.** Most good clues for one land on the other too:
  synonyms and near-synonyms, the two halves of an everyday opposition, or a
  fixed pair people name in one breath. (mor "mother" / far "father"; dag "day"
  / nat "night"; mand "man" / kvinde "woman"; spise "eat" / mad "food")

## Rules

1. Judge **association as a clue would use it** — not dictionary similarity,
   not etymology, not part of speech. A verb and a noun can be a 3 (spise
   "eat" / mad "food").
2. Judge the **everyday, learner-level sense**. The English glosses printed
   here are the senses that ship; ignore rare or figurative ones.
3. **Ignore spelling.** Rhymes and near-identical Danish forms are handled by a
   separate rule in the build. Only meaning counts here.
4. **Be sparing.** Two everyday words drawn at random are usually a 0. A
   healthy batch is mostly 0, with a tail of 1s, fewer 2s and a handful of 3s.
   A matrix where everything is a 1 says nothing and is worse than useless — it
   makes the engine reject every clue.
5. **Judge every pair explicitly.** Do not skip one, do not copy a neighbour's
   score because the words look alike, do not batch-fill a run of 0s without
   reading them.
6. Everything you need is in this brief. Do not read other files in the repo,
   and do not look at any game board or key data — this is data authoring.`

function brief({ batch, batches, city, lang, pairs, outPath }) {
  const lines = []
  lines.push(`# Association matrix — ${lang} city ${city}, batch ${batch} of ${batches}`)
  lines.push('')
  lines.push(
    `Pairs ${pairs[0].k}–${pairs[pairs.length - 1].k} of the city's 4,950. ${pairs.length} judgements.`,
  )
  lines.push('')
  lines.push(SCALE)
  lines.push('')
  lines.push('## The pairs')
  lines.push('')
  lines.push(
    'Grouped by the first word of the pair. The number on the left is the pair index — it is what your output is keyed by.',
  )
  let current = null
  for (const p of pairs) {
    if (p.a.id !== current) {
      current = p.a.id
      lines.push('')
      lines.push(`### A = **${p.a.da}** — ${p.a.en.join(' / ')} (${p.a.pos})`)
      lines.push('')
    }
    lines.push(`- \`${p.k}\` ${p.b.da} — ${p.b.en.join(' / ')} (${p.b.pos})`)
  }
  lines.push('')
  lines.push('## Output')
  lines.push('')
  lines.push(`Write a JSON file to \`${outPath}\` with exactly this shape:`)
  lines.push('')
  lines.push('```json')
  lines.push(
    `{ "city": ${city}, "batch": ${batch}, "from": ${pairs[0].k}, "to": ${pairs[pairs.length - 1].k}, "scores": { "${pairs[0].k}": 0, "${pairs[0].k + 1}": 2 } }`,
  )
  lines.push('```')
  lines.push('')
  lines.push(
    `\`scores\` must have all ${pairs.length} keys, ${pairs[0].k} through ${pairs[pairs.length - 1].k}, each an integer 0–3. Nothing else.`,
  )
  lines.push('')
  lines.push(
    'Then reply with ONE line: the batch number, how many scores you wrote, and the distribution (`0:x 1:y 2:z 3:w`). Do not print the scores in your reply.',
  )
  lines.push('')
  return lines.join('\n')
}

function main() {
  const argv = process.argv.slice(2)
  const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`)
    return i === -1 ? fallback : argv[i + 1]
  }
  const city = Number(arg('city', '1'))
  const lang = arg('lang', 'da')
  const size = Number(arg('size', '150'))
  const outDir = arg('out', 'tmp-matrix-briefs')
  const voteDir = arg('votes', `src/data/generated/matrix-city${city}`)

  const entries = cityWords(loadWords(lang), city)
  if (entries.length === 0) {
    console.error(`no words with curriculumRank in city ${city} — nothing to brief`)
    process.exit(2)
  }
  const pairs = cityPairs(entries)
  mkdirSync(outDir, { recursive: true })
  const batches = Math.ceil(pairs.length / size)
  for (let b = 0; b < batches; b++) {
    const slice = pairs.slice(b * size, (b + 1) * size)
    const n = String(b + 1).padStart(2, '0')
    for (const model of ['opus', 'fable']) {
      writeFileSync(
        `${outDir}/${model}-${n}.md`,
        brief({
          batch: b + 1,
          batches,
          city,
          lang,
          pairs: slice,
          outPath: `${voteDir}/${model}-${n}.json`,
        }),
        'utf8',
      )
    }
  }
  console.log(
    `${entries.length} words, ${pairs.length} pairs, ${batches} batches of ${size} → ${outDir}/`,
  )
}

// Run only when invoked directly. `file://${argv[1]}` does not match on
// Windows (argv[1] is a backslashed drive path), so compare the basename.
if (process.argv[1]?.endsWith('matrix-pairs.mjs')) main()
