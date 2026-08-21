# The clue engine: a cheap model that clues and guesses like a frontier one

Keywords: **chessbot report / plan**, chessbot, chess bot, clue engine, H3,
H7, cascade, cheap model, book, matrix, city-only boards, practice
companion, selfplay.

Written 2026-08-21 by a planning session. Status: **decided, nothing built.**
Four owner decisions were taken (listed under "Decisions"); one of them is a
one-line game-rule change that should land first and on its own. Read this
with `docs/PLAN-2.md` (cards H3, H7, L1) and `docs/word-selection.md` open —
the second one is a collision, explained below.

## 1. Report: what is there today

- **Casey is 100% a remote LLM.** `src/ai/companion.ts` → `chatJson`
  (`src/ai/client.ts:232`) → the Cloudflare proxy, alias `cluey` =
  `gpt-oss:120b` on ollama.com (`proxy/wrangler.toml:78`). Same model clues
  and guesses; only temperature differs (0.6 / 0.3).
- **H7, the cheap→flagship cascade, shipped in PR #76 and is switched off.**
  Its only trigger is "the validator rejected the reply" (`askValidated`,
  `companion.ts:138`, escalates on every corrective retry). The number the
  whole saving turns on — `r`, how often the cheap tier is refused — has
  never been measured (`proxy/README.md:255`). `proxy/worker.js:157` rejected
  the blueprint's design of escalating on the model's *self-reported* safety
  margin: "every trigger used here is a fact somebody checked".
- **H3, the engine, is a parked card with no pipeline** (`docs/PLAN-2.md:1007`).
  Nothing semantic ships: the offline "practice companion"
  (`src/ai/mock/mockCompanion.ts`) clues `mok1, mok2…` and guesses by hash.
  The only association data in the tree is 30 `concepts` tags on city 1's
  100 words (`src/ai/local/concepts.ts`).
- **The selfplay harness cannot measure a real clue-giver.** Its guesser is a
  biased coin (`p` in `src/ai/selfplay.test.ts:354`), which brackets the
  board numbers but says nothing about a model. The mock floor is 0–1.6% win.
- **The lookahead is already written — as prose.** `src/ai/prompts.ts:162`
  tells the model to score every non-target against its candidate clue and
  reject the clue if any fits better. That paragraph is the evaluator.
- **The firewall is the constraint on any new prompt.** Prompt builders may
  import only projection types; `projections.test.ts` asserts byte-identity
  under key permutation. A new prompt inherits that test.

## 2. The idea, stated properly

A chess engine is four things: a move generator, a static evaluation, a
search, and an opening book. The blueprint (§4) asked one cheap prompt to be
all four and then trusted its self-grade. Put three of them in code and let
the cheap model do the one job it is good at — generating candidates:

| piece | here |
|---|---|
| opening book | per-word and per-pair association clues, **authored once by Claude (Opus + Fable)**. Boards cannot be precomputed (10³⁷); words and pairs can. |
| static evaluation | a **judged 900×900 association matrix** ("how much does a clue for A pull B?", 0–3), not embeddings — a trap is an association, and the set is small enough to judge once. `sim(clue, word)` = direct book strength, else a two-hop estimate through the matrix. |
| search | enumerate target subsets of Casey's unrevealed greens (≤ ~800 for 12), candidates from the book, `checkClueLegality`, score by `margin = min sim(targets) − max sim(traps)`, pick. Milliseconds, offline. |
| generator | the cheap LLM proposes K candidates in one call; the evaluator judges them with the engine's own; margin below θ → escalate. **H7's trigger becomes a checked fact.** |

Quality comes from sampling × an honest evaluator, not model size.

Clue vocabulary = the 900 themselves (a non-board word at or below the
current city band is *known by construction*, and cluing with it is a
review) ∪ the book's association words. **This removes H3's dependency on
L1's wordlist and its licence question.**

## 3. Decisions (owner, 2026-08-21)

1. **Scope: build all the way to the hybrid** (stages 1–5 below), not just
   the offline engine. H3 is therefore no longer "parked post-launch".
2. **The book and the matrix are written by Claude in-session** (Opus and
   Fable subagents, votes merged), not baked by a keyed model. No new secret.
3. **Evaluation backbone is the judged matrix; embeddings are an optional
   backstop**, added only if the selfplay table shows missed traps.
4. **Ordinary journey boards become city-only.** Today they draw from
   `unlockedWords` — this city AND all earlier ones
   (`src/journey/progress.ts:56`, `src/stores/gameStore.ts:264`,
   pinned by `src/journey/pool.test.ts:38` and `:133`). The owner chose
   city-only knowing the consequence: earlier cities' words are then reviewed
   only by travelling back, since the wrap-up packs the current city only.

Decisions considered and **not** taken (owner declined): a
simulate-the-guesser objective in place of the margin; a ledger schema
designed as future training data; restricting Casey's clues to the 900.

## 4. The collision: `docs/word-selection.md`

A parallel session decided (not yet applied) which 900 words ship and which
city each belongs to — cities 2–9 get reshuffled, function words leave the
cards, **city 1 stays hand-curated**. The book and the matrix are keyed by
word id and authored per city, so **do not author cities 2–9 until that
change has landed**, and key everything by `id` so a word that moves city is
a validator error rather than a silent miss. City 1 is safe to author now.

## 5. Card 0 — city-only boards (land first, alone)

One PR from `origin/main` (squash-merge rule: `git fetch origin main && git
checkout -B city-only-boards origin/main`; note this session found
uncommitted parallel work in the tree — use a worktree or wait).

- `src/stores/gameStore.ts:264`: `unlockedWords` → `wordsForCity`. Leave the
  daily-challenge branch global, and the wrap-up untouched.
- `src/journey/pool.test.ts`: the `:38` test becomes "never returns a word
  from another city"; `:133` builds its 200-word pool with `unlockedWords` —
  change to `wordsForCity(WORDS, 1)` (100 words) and re-check the new-word
  cap still holds.
- `src/ui/cluey-tips.ts:69` (word of the day) and
  `src/ui/screens/SuitcaseScreen.tsx:286` (the ALL filter) use
  `unlockedWords` as a *display* pool; decide deliberately — the suitcase
  "All" meaning "everything reached" is probably right to keep.
- README: state the rule in the journey section (it is unstated today; only
  the wrap-up's "dealt entirely from the city's collected words" exists).
- `docs/DECISIONS.md` entry, PLAN-2 note, dispatch `CARDS` in the same PR.
- Verify: `npm run verify`; `npm run drives` (build first) — journey-drive
  and layout-drive deal boards.

## 6. The engine plan

### Stage 2 first: the matrix (`src/data/matrix.da.json`, packed at build)

`M[a][b]` ∈ 0–3, symmetrised by max. **Within a city judge every pair
explicitly** — 4,950 per city, ~150 pairs per agent → ~33 agents per model
per city, Opus + Fable, merged with a vote count. (Explicit judgement beats
recall; with city-only boards there is no cross-city layer at all.)
`scripts/merge-matrix.mjs` emits a `Uint8Array` (state the measured size;
~100 KB gzipped). `scripts/validate-matrix.mjs`, added to `npm run verify`:
ids exist, symmetry, every `sampler.ts` `conflicts` pair scores ≥ 2, and
for city 1 every same-`concepts` pair scores ≥ 1 (the free cross-check).

### Stage 1: the book (`src/data/book.da.json`)

Per word, ~25–35 associations:
`{ "da": "kæledyr", "en": "pet", "why": "a household pet", "s": 3, "v": 2 }`
— both languages (Casey may clue in either), a 3–8-word `why` that becomes
the templated rationale, strength `s`, votes `v`. **Pair-first where it
counts:** for every within-city pair with `M ≥ 1` (~10–15 per word, ~1k for
city 1) a `pairs` section holds 2–4 clues that evoke *both*; triples compose
from pairs at search time. Agent brief: learner-level Danish, common over
clever, never a form/compound/translation of the word itself, æøå never
ae/oe/aa, category words, places, verbs-you-do-with-it. 60 words per agent.
`scripts/merge-book.mjs`, `scripts/validate-book.mjs` (ids, legality of each
entry against its own word via `src/engine/legality.ts:84` logic,
orthography, counts, non-empty `why`).

### Stage 3: evaluator + local engine (`src/ai/local/`)

- `evaluator.ts` — `loadEvaluator()`, `sim(clue, wordId)`,
  `scoreClue(clue, targets, traps) → { margin, riskiest, coverage }`.
  **Trap set** = unrevealed non-targets the *player* could still name under
  Casey's clue — the directional rule of `isOpenFor`
  (`src/ai/projections.ts:163`; export it). A card revealed neutral under the
  player's clue is still a trap; pin it next to `game.test.ts`'s rule.
- `search.ts` — candidates = book pairs for related target pairs ∪
  `book[t].assoc` ∪ (city words off the board, earlier-band first); subsets
  of `aiTargetableIds` sizes 1–4; max coverage subject to `margin ≥ θ`,
  tie-break margin; on the last clue prefer coverage (mirror
  `prompts.ts:70`). θ lives in `src/engine/config.ts` style, stated with its
  measurement.
- `engineCompanion.ts` — `implements Companion` (`companion.ts:37`).
  `getClue` returns the real `ClueResponse` with a templated rationale naming
  the riskiest neutral; `getGuesses` ranks `aiGuessableIds` by `sim` with a
  confidence that respects `planGuessExecution`'s 0.35 stop; `translate` /
  `getStory` keep the existing fallbacks. Clue language from
  `view.clueLanguage`.
- Seam: `gameStore.ts:216` — `useMock || practiceFallback` →
  `EngineCompanion`. Check `e2e/*.mjs` for drives asserting `mok` clues
  before retiring `MockCompanion` from that path. Rewrite or delete the
  round-screen apology ("random guesses, Casey is not playing") according to
  the Stage 4 number. Load the data lazily (dynamic import) so the main
  bundle is untouched; state the chunk size.

### Stage 4: measurement

1. `src/ai/local/engine-selfplay.test.ts` — reuse `playOneGame`'s shape
   (`selfplay.test.ts:77`) with a real clue-giver, three guessers side by
   side: engine-vs-engine (upper bound), **Opus-half clues vs Fable-half
   guesser** and the reverse (the authoring halves kept apart before the
   merge, so the exam does not share the product's judgement). City-1 boards
   first. Print win rate / mean clues / sudden-death rate per board next to
   the mock floor and the shipped p-curve; pin bands only; mutation-check
   that swapping `sim` for the djb2 hash fails the pins.
2. `e2e/engine-probe.mjs` (opt-in, spends proxy calls) — engine clues / LLM
   guesses and LLM clues / engine guesses for N rounds via `chatJson`;
   prints hits-per-number. The first honest "as well as a frontier model"
   number.
3. The clue ledger — per Casey clue `{ number, hits, arm }` from `gameStore`
   (`runAiClue` / player-guess resolution), `arm` = alias or `engine`, small
   persisted store, shown in Settings diagnostics. With the alias table's
   blind A/B (`wrangler.toml:70–76`) this measures cheap vs flagship vs
   engine on real play — it is how `r` finally gets a value.

### Stage 5: the hybrid (`src/ai/hybridCompanion.ts`)

- **Evaluator as validator first** (ships alone, lowest risk): in
  `OllamaCompanion.getClue` (`companion.ts:223`), after legality, reject a
  clue with `margin < θ` with a *concrete* correction — «x» fits the neutral
  «y» (why) as well as your target «z» — which the retry can act on. Because
  `askValidated` escalates on every retry, this alone turns H7 on with a
  checked trigger.
- **Generator/judge:** `buildClueCandidatesPrompt` (projection types only;
  extend `projections.test.ts`) asks for K=5 candidates with targets;
  `ClueCandidatesSchema`. Merge with the engine's search, score all, pick;
  below θ_escalate and online → one flagship call with the named conflict.
  Offline or proxy error → the engine's own answer, never `mok`.
- **Guess side:** rank fusion of LLM confidences and engine sims; keep the
  LLM's reasoning text; engine alone offline.
- Flip `MODEL_ALIASES` so `cluey` is a cheap model with `escalate` to
  `gpt-oss:120b` (a proxy deploy, `client.ts:49–65`) once the ledger and the
  probe say the hybrid holds its hit rate.

### Order of work

Card 0 (city-only) → matrix city 1 → book city 1 → engine → measurement on
city-1 boards → **decide** → (after `word-selection.md` lands) cities 2–9,
matrix then book → hybrid. Each stage its own PR from `origin/main`; each
landing updates `docs/PLAN-2.md` and `docs/dispatch/index.html`'s `CARDS`.

## 7. Board and docs to update when the first card lands

- `docs/PLAN-2.md`: rewrite H3 as **H3a** (matrix + book + engine +
  selfplay) and **H3b** (hybrid + escalation + ledger); move both out of
  wave 8; note H3 no longer shares L1's licence question; add the
  word-selection collision to "Read this before picking up a card".
- `proxy/README.md` "Making it cheaper": the trigger is the evaluator; `r`
  is measured by the ledger. `README.md` gets the measured numbers.

## 8. Open questions for the owner

- Confirm the two display pools (word of the day, suitcase "All") stay
  "everything reached" after boards go city-only.
- θ and θ_escalate are to be measured, not chosen; the PR states both.
- Whether the practice companion should *replace* `MockCompanion` in the
  drives or sit beside it (determinism matters to several e2e drives).
