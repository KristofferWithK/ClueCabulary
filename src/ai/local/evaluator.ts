import { normalize } from '../../engine/text'
import { ACTIVE } from '../../lang/active'
import { isOpenFor, type AiClueView } from '../projections'

/**
 * The static evaluation of the clue engine (docs/clue-engine.md §6 Stage 3):
 * `sim(clue, word)` read off the opening book and the judged association
 * matrix, and `scoreClue` — the margin the search maximises.
 *
 * DATA IS LOADED LAZILY, AND SHARDED BY CITY. A city's book is ~105 KB
 * gzipped and its matrix ~2 KB, so the practice seam must not put either in
 * the main bundle and nine cities must not arrive as one asset (E2's size
 * note, carried into E6's brief by E4). `loadEvaluator(city)` dynamic-imports
 * exactly one city's pair of files and Vite splits each pair into its own
 * chunks — see `SHARDS` at the bottom of this file, which is the whole of what
 * shipping a new city costs the app.
 */

/** One opening-book association, as `src/data/book.da.<city>.json` ships it. */
export interface BookEntry {
  da: string
  en: string
  why: string
  s: number
  v: number
}

export interface BookFile {
  lang: string
  city: number
  words: Record<string, { assoc: BookEntry[] }>
  pairs: Record<string, BookEntry[]>
}

export interface MatrixFile {
  lang: string
  city: number
  n: number
  bits: number
  ids: string[]
  data: string
}

/**
 * The sim scale, stated once.
 *
 * Direct book strength and matrix cells share the 0–3 scale on purpose (E2
 * merged both with the same `ceil(mean)` so the two paths would not carry a
 * silent rounding bias), and sim keeps them comparable:
 *
 *   direct   — the clue is a book entry for this word: its strength `s`, 1–3.
 *   one-hop  — the clue IS another city word: the matrix cell M[clue][word],
 *              0–3. No attenuation: the cell is itself a judgement of exactly
 *              this question ("how much does a clue for A pull B?").
 *   two-hop  — the clue is a book entry of strength s for some OTHER city
 *              word w': min(s, M[w'][word]) − 0.5. The chain is only as strong
 *              as its weaker link, and the half-point knocks an estimate below
 *              the equivalent judged fact, so a direct 2 always outranks a
 *              two-hop through two 2s. Half steps are the only non-integers
 *              sim produces.
 *
 * sim is the max over every path that applies; a word outside the loaded
 * city's data scores 0 on all of them.
 */
export const TWO_HOP_DISCOUNT = 0.5

export interface ClueScore {
  /** min sim over the targets − max sim over the traps (0 with no traps). */
  margin: number
  /** The trap sim is highest for — the neutral the rationale must name. */
  riskiest: { id: string; sim: number } | null
  /** How many targets the clue is being scored for. */
  coverage: number
}

export interface Evaluator {
  city: number
  /** Every word id the matrix knows, in the city's curriculum order. */
  ids: readonly string[]
  has(wordId: string): boolean
  sim(clue: string, wordId: string): number
  scoreClue(clue: string, targets: readonly string[], traps: readonly string[]): ClueScore
  /** The book's associations for one headword, [] off-book. */
  assocFor(wordId: string): readonly BookEntry[]
  /** The book's pair clues for two headwords, [] when the pair has none. */
  pairFor(a: string, b: string): readonly BookEntry[]
  /** The `why` of the strongest book path from this clue to this word, if any. */
  whyFor(clue: string, wordId: string): string | null
}

/**
 * THE TRAP SET, and it is directional — the rule this repo has written
 * backwards more than once (CLAUDE.md; `game.test.ts` "a guess is judged
 * against the clue-giver key, and only that key" pins the engine side of it).
 *
 * Under Casey's clue the player's guesses are judged against CASEY's key, so a
 * trap is any card the player could still name that is not green on that key:
 * `roleOnMyKey === 'bystander'` and open for the giver `'ai'` — the same
 * `isOpenFor` that `aiTargetableIds` reads, and the same direction.
 *
 * The direction is the whole content of the rule: a card revealed neutral
 * under the PLAYER's own clue is burned `against: ['player']` only, which
 * leaves it exactly as nameable under Casey's clue as it ever was — the player
 * has watched it turn grey once and has every reason to believe it is settled.
 * Get the side backwards (`isOpenFor(reveal, 'player')`) and the engine scores
 * that card as dead and happily clues straight into it. Pinned in
 * `engine.test.ts` next to a restatement of the game.test.ts rule, with the
 * flipped direction checked to fail.
 *
 * Casey's own non-target greens are NOT traps: a guess is judged against the
 * giver's key, so a player who names one scores it — it costs coverage
 * planning nothing and the turn nothing.
 */
export function engineTrapIds(view: AiClueView): string[] {
  return view.words
    .filter((w) => w.roleOnMyKey === 'bystander' && isOpenFor(w.reveal, 'ai'))
    .map((w) => w.id)
}

const pairKey = (a: string, b: string): string => `${a}|${b}`

/**
 * Build an evaluator over one matrix and one book. Exported because E4's
 * measurement builds THREE of them: the shipped pair, and one per authoring
 * model, so a clue-giver reading Opus's judgement can be examined by a guesser
 * reading Fable's (`engine-selfplay.test.ts`). Nothing in the app calls it —
 * `loadEvaluator()` below is the app's door.
 */
export function buildEvaluator(matrix: MatrixFile, book: BookFile): Evaluator {
  const { fold } = ACTIVE.orthography
  const n = matrix.n
  const index = new Map<string, number>()
  matrix.ids.forEach((id, i) => index.set(id, i))

  // Two bits a cell, row-major over the full square — the packing
  // `scripts/matrix-pack.mjs` writes. atob rather than Buffer: this runs in
  // the browser.
  const bin = atob(matrix.data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const cell = (a: number, b: number): number => {
    const i = a * n + b
    return (bytes[i >> 2]! >> ((i & 3) * 2)) & 0b11
  }
  const M = (a: string, b: string): number => {
    const ia = index.get(a)
    const ib = index.get(b)
    return ia === undefined || ib === undefined ? 0 : cell(ia, ib)
  }

  // A clue reaches a word by its spelling, so every index below is keyed by
  // the normalized (and, separately, folded) form of both sides of an entry —
  // Casey clues in Danish or English (`view.clueLanguage`) and the player may
  // type either.
  const keysOf = (s: string): string[] => {
    const norm = normalize(s)
    const folded = fold(norm)
    return folded === norm ? [norm] : [norm, folded]
  }

  /** clue form → strongest direct book entry per word it is an entry FOR. */
  const direct = new Map<string, Map<string, BookEntry>>()
  const addDirect = (form: string, wordId: string, e: BookEntry) => {
    let per = direct.get(form)
    if (!per) direct.set(form, (per = new Map()))
    const prior = per.get(wordId)
    if (!prior || e.s > prior.s) per.set(wordId, e)
  }
  const indexEntry = (wordId: string, e: BookEntry) => {
    for (const form of [...keysOf(e.da), ...keysOf(e.en)]) addDirect(form, wordId, e)
  }
  for (const [wordId, w] of Object.entries(book.words)) {
    for (const e of w.assoc) indexEntry(wordId, e)
  }
  // A pair clue is a direct book clue for BOTH its words — E2 defined its `s`
  // as the coverage of the weaker half, so one strength serves both sides.
  for (const [key, entries] of Object.entries(book.pairs)) {
    const [a, b] = key.split('|') as [string, string]
    for (const e of entries) {
      indexEntry(a, e)
      indexEntry(b, e)
    }
  }

  /** clue form → the city word ids this form IS the headword (or a gloss) of. */
  const headwords = new Map<string, string[]>()
  // The matrix has no spellings, so headword forms come from the ids
  // themselves (`da:mor` → «mor» — the id scheme `validate-words` enforces).
  for (const id of matrix.ids) {
    const da = id.slice(id.indexOf(':') + 1)
    for (const form of keysOf(da)) {
      const list = headwords.get(form)
      if (list) list.push(id)
      else headwords.set(form, [id])
    }
  }

  // The search re-scores the same few thousand candidate forms against the
  // same hundred words, board after board; memoising here is what keeps a
  // whole engine turn in the milliseconds §2 promised.
  const simCache = new Map<string, number>()

  const sim = (clue: string, wordId: string): number => {
    const cacheKey = `${clue} ${wordId}`
    const hit = simCache.get(cacheKey)
    if (hit !== undefined) return hit
    let best = 0
    for (const form of keysOf(clue)) {
      // Direct: the clue is in this word's own book.
      const per = direct.get(form)
      const own = per?.get(wordId)
      if (own && own.s > best) best = own.s
      // One-hop: the clue is another city word; the matrix judged this pull.
      const heads = headwords.get(form)
      if (heads) {
        for (const h of heads) {
          const m = M(h, wordId)
          if (m > best) best = m
        }
      }
      // Two-hop: the clue is in some other word's book; chain through the
      // matrix at the strength of the weaker link, discounted.
      if (per) {
        for (const [via, e] of per) {
          if (via === wordId) continue
          const m = M(via, wordId)
          if (m === 0) continue
          const est = Math.min(e.s, m) - TWO_HOP_DISCOUNT
          if (est > best) best = est
        }
      }
      if (best >= 3) break
    }
    simCache.set(cacheKey, best)
    return best
  }

  const scoreClue = (
    clue: string,
    targets: readonly string[],
    traps: readonly string[],
  ): ClueScore => {
    let minTarget = Infinity
    for (const t of targets) minTarget = Math.min(minTarget, sim(clue, t))
    if (targets.length === 0) minTarget = 0
    let riskiest: { id: string; sim: number } | null = null
    for (const t of traps) {
      const s = sim(clue, t)
      if (!riskiest || s > riskiest.sim) riskiest = { id: t, sim: s }
    }
    return {
      margin: minTarget - (riskiest?.sim ?? 0),
      riskiest,
      coverage: targets.length,
    }
  }

  const whyFor = (clue: string, wordId: string): string | null => {
    let best: BookEntry | null = null
    for (const form of keysOf(clue)) {
      const e = direct.get(form)?.get(wordId)
      if (e && (!best || e.s > best.s)) best = e
    }
    return best?.why ?? null
  }

  return {
    city: matrix.city,
    ids: matrix.ids,
    has: (wordId) => index.has(wordId),
    sim,
    scoreClue,
    assocFor: (wordId) => book.words[wordId]?.assoc ?? [],
    pairFor: (a, b) => book.pairs[pairKey(a, b)] ?? book.pairs[pairKey(b, a)] ?? [],
    whyFor,
  }
}

/**
 * ONE CHUNK PER CITY, and the map is written out rather than globbed because
 * Vite splits on a static specifier: each entry below is its own pair of
 * chunks, and a board only ever pulls the city it is dealt from.
 *
 * E2 measured the reason. City 1's book is 104.7 KB gzipped and city 2's is
 * 107.5 KB; nine at that rate is ~940 KB, which is fine arriving one city at a
 * time and is not fine as one asset. E6 adds a line here per city it authors —
 * that, and nothing else, is what shipping a new city costs the app.
 */
const SHARDS: Record<number, () => Promise<[MatrixFile, BookFile]>> = {
  1: async () => {
    const [m, b] = await Promise.all([
      import('../../data/matrix.da.1.json'),
      import('../../data/book.da.1.json'),
    ])
    return [m.default as unknown as MatrixFile, b.default as unknown as BookFile]
  },
  2: async () => {
    const [m, b] = await Promise.all([
      import('../../data/matrix.da.2.json'),
      import('../../data/book.da.2.json'),
    ])
    return [m.default as unknown as MatrixFile, b.default as unknown as BookFile]
  },
}

/** The cities E6 has authored, ascending. */
export const authoredCities: readonly number[] = Object.keys(SHARDS)
  .map(Number)
  .sort((a, b) => a - b)

const loaded = new Map<number, Promise<Evaluator | null>>()

/**
 * The evaluator over one city's shipped data, built once per city per session.
 * The dynamic imports are the lazy seam — see the module comment.
 *
 * NULL rather than a throw for a city E6 has not reached: the caller's answer
 * to "no data" is the mock, not an error, and an unauthored city is an
 * ordinary state of the game until all nine are authored.
 */
export function loadEvaluator(city = 1): Promise<Evaluator | null> {
  const hit = loaded.get(city)
  if (hit) return hit
  const shard = SHARDS[city]
  const p: Promise<Evaluator | null> = shard
    ? shard().then(([m, b]) => buildEvaluator(m, b))
    : Promise.resolve(null)
  loaded.set(city, p)
  return p
}
