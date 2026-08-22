# The clue engine: a cheap model that clues and guesses like a frontier one

Keywords: **chessbot report / plan**, chessbot, chess bot, clue engine, H3,
H7, cascade, cheap model, book, matrix, city-only boards, practice
companion, selfplay.

Written 2026-08-21 by a planning session; the plan is carded as **E0–E6** in
`docs/PLAN-2.md`. **THE DECISION E4 WAS BUILT TO TAKE IS TAKEN — see "The
verdict (E4, 2026-08-22)" below §6: GO, E6 before E5, and E5 in halves.** Read
it and "Stage 4 as built" before E5 or E6, because the first thing E4 measured
is that engine-vs-engine self-play cannot tell knowledge from a shared code and
so is not evidence about anything.

Status as of 2026-08-22: **E0, E1, E2, E3 and E4 are built** —
journey boards are city-only, `src/data/matrix.da.json` holds city 1's 4,950
judged pairs, `src/data/book.da.json` holds its 3,490 associations and
2,314 pair clues, and `src/ai/local/` is the engine itself, playing the
practice seam, and it is measured. E5 and E6 are not built. Four owner
decisions were taken
(listed under "Decisions"). Each stage that has landed carries an "as built"
subsection under §6 with the corrections it found; **those corrections
override the paragraph they sit under**, which is left in place so the change
is legible.

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

#### Correction to the paragraph above (E1, 2026-08-22)

The sentence "every `sampler.ts` `conflicts` pair scores ≥ 2" is **wrong and
must not be restored**. It was written before anyone read what `conflicts()`
does, and it fails twice:

1. **The pairs it names can never share a board.** `conflicts()` reaches the
   board through `fitsBoard()`, which `drawWeighted()` applies to every pick,
   and every draw in `sampler.ts` (`:176`, `:192`, `:203`, `:248`) goes through
   `drawWeighted`. So the rule gated pairs that cannot co-occur — no player
   ever reads the clue «hund» with "hånd" in front of them. It had no play
   meaning at all.
2. **Two of its three arms are orthographic, not semantic.** Same stem and
   edit distance ≤ 1 catch `hus`/`bus`, `hund`/`hånd`, `bog`/`tog` — words that
   look alike and mean nothing to each other. **All 17** of city 1's conflicts
   are that kind. Asserting they are associated puts a lie in a semantic table,
   and `sim()` walks that table two-hop: `M[hus][bus] = 2` tells the engine a
   house-flavoured clue *reaches* "bus". Harmless if "bus" is a trap, but an
   **unsound clue** if "bus" is a target — exactly the failure the evaluator in
   §2 exists to prevent. Orthographic confusion is real and the sampler already
   handles it; it must not be restated as association.

The third arm — a **shared English gloss** — is genuinely semantic, and that is
what the validator gates, at ≥ 2. City 1 contains no instance of it; the whole
900-word dataset has eight, in cities 8 and 9. So the threshold is inherited
from this document rather than calibrated, and city 8 is where it gets its
first real test.

The same-`concepts` rule is softened for a related reason: it is **reported,
not gated**. Failing (or flooring) on it would only hide what it found, and the
judges may be right — see the numbers below.

#### Stage 2 as built — city 1 (E1)

The brief each judging agent was handed is generated by
`scripts/matrix-pairs.mjs` and is the same text for both models: the question
("how much does a clue for one of these two words pull the other?", scoring
the stronger direction), the four rungs with two worked examples each, and six
rules — judge association as a clue would use it and not dictionary similarity;
the everyday learner-level sense only; **ignore spelling**; be sparing, because
a matrix of all 1s makes the engine reject every clue; judge every pair
explicitly; read nothing else in the repo. 150 pairs an agent, 33 batches, both
models, 66 agents. Votes land in `src/data/generated/matrix-city1/` and are
committed — the pair index they are keyed by is defined by `cityPairs()` and
nowhere else.

**What ships is what the two models said, with no floors on top.** Two
judgement calls, both argued in `merge-matrix.mjs`'s header:

- **Merge rule** — `ceil(mean(opus, fable))`: the mean, ties to the higher
  vote, because an unseen trap loses a turn and an over-cautious clue only
  loses coverage. The two models agreed outright on 93.9% of the 4,950 and
  split on 304, **every split by exactly one**, so on this city ceil(mean) and
  plain max are the same function. Opus is the more generous judge (775
  non-zero to Fable's 713, 50 threes to 31); the ties-up rule inherits that,
  which is why the merged matrix has more non-zero cells (849) than either
  judge alone.
- **Diagonal** — 3. A word is never its own trap, but the two-hop estimate
  walks the matrix and a diagonal of 0 would make a word its own worst path.

Final distribution over the 4,950 pairs: **0: 4,101 · 1: 587 · 2: 210 · 3: 52.**
Measured size: 2,500 B packed (two bits a cell, full square), 5.3 KB of JSON,
**2.1 KB gzipped**. Nine cities at this rate is ~19 KB gzipped, well under the
~100 KB this document budgeted.

**The concepts cross-check, as a report.** 46 of city 1's 421 same-tag pairs
were judged 0. Printed per tag by `validate-matrix.mjs`, worst first:

| tag | judged 0 | share |
|---|---|---|
| `leisure` | 2 / 3 | 67% |
| `nature` | 18 / 36 | 50% |
| `place` | 13 / 28 | 46% |
| `age` | 2 / 10 | 20% |
| `building` | 4 / 21 | 19% |
| `people` | 7 / 78 | 9% |
| `food` | 1 / 91 | 1% |

That is a statement about the **tags**, not about the matrix. `food` and
`people` predict association well; `nature` and `place` are wide enough to hold
two unrelated words (`træ`/`hav`, `hav`/`butik`), and half their pairs are not
associated at all. **E2 should not treat a shared `nature` or `place` tag as a
reason to write a pair clue** — the matrix's own `M ≥ 1` test is the gate the
book uses, and it already disagrees with those two tags half the time.

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

#### Correction to the paragraph above (E2, 2026-08-22)

Two sentences in it are wrong and must not be restored.

1. **The `why` is 2–8 words, not 3–8.** The brief handed to the authoring
   agents said three, and the merge then threw away 56 entries on the word
   count alone — every single one of them exactly two words, and every one of
   them a link with no honest longer phrasing: «its opposite» (stor/lille,
   gammel/ung, glad/trist, elske/hade, ven/fjende), «its young» (hund/hvalp,
   kat/killing, hest/føl), «its colour» (mælk/hvid, smør/gul, salt/hvid).
   Both models produced them independently and scored most of them **3**, so
   the three-word floor was deleting the strongest entries in the book. The
   templated rationale reads «"lille" — its opposite», which is the copy you
   want; padding it to «it is the opposite» is worse on every axis. The floor
   moved to the data rather than the data to the floor. The ceiling of 8 is
   unchanged and nothing came near it.

2. **"60 words per agent" was too many, and the failure is silent.** 25 words
   an agent (≈750 entries) is what completed reliably; the pair half at ~213
   pairs an agent did **not**. Fable truncated twice at almost exactly the same
   place — one batch of 210 stopped at 107 entries, another at 109 with a
   literal `@@CHUNK3@@` placeholder key where the rest should have been — and
   in neither case did the agent say so: both reported success. That is an
   output ceiling, not an opinion about the pairs, and the only reason it was
   caught is that `merge-book.mjs` re-derives the full key set from the matrix
   and refuses to merge a model that is missing one. **Author to the key set
   and check coverage; never trust the agent's own count.**
   `book-brief.mjs --from --to --tag` re-briefs any slice for exactly this.

#### Stage 1 as built — city 1 (E2)

The brief each authoring agent is handed is generated by
`scripts/book-brief.mjs` and is the same text for both models: what an opening
book is for, the seven rules an entry must obey (one word a side; never the
headword in any disguise; æøå intact; lowercase Danish letters; learner-level;
both languages carrying the same idea; a 2–8-word `why` that says what the link
IS), nine association shapes worth reaching for, and the 1–3 strength scale.
The pair brief adds what a pair clue is — the word that wins two cards on one
number — and defines `s` for a pair as the coverage of the **weaker** half.
**Which** pairs get a section is decided by the matrix at `M ≥ 1` and never by
a shared `concepts` tag, exactly as E1 asked: 849 pairs, not the 421 same-tag
ones, and the two sets disagree in both directions.

Batches: 4 × 25 words and 4 × ~213 pairs per model, both models over
everything, 16 agents plus 2 re-runs for the truncation above. Output lands in
`src/data/generated/book-city1/` and is committed.

**Merge rule — UNION**, keyed by the normalised Danish side, and this is where
the book deliberately parts company with the matrix. A matrix cell is a single
judgement that both sides must live with, so E1 merged toward caution. A book
entry is a **candidate**: a weak one is scored and rejected by the search at
play time, while a missing one is a clue the engine can never give at all. So
everything both models proposed ships, `v` ∈ {1,2} records who reached for it,
and where the union overshoots the 35-a-word cap the places go to the `v = 2`
consensus first (351 trimmed). Where both proposed the same clue, `s` is
`ceil(mean)` — the same function `merge-matrix.mjs` uses, on purpose: `sim()`
compares a book strength against a matrix cell, and two rounding rules on one
scale would be a silent bias between the direct and the two-hop path. The `why`
and the English side come from the higher-`s` model, ties to Opus (2,783 from
Opus, 129 from Fable), because a rationale is read aloud and wants one voice.

Final: **3,490 associations** over 100 headwords (33–35 a word, 1,898 with
`v = 2`), **2,314 pair clues** over 849 pairs (1–5 a pair; 9 pairs got only
one). Strengths 1/2/3 = 953 / 1,692 / 845. Dropped in the merge: 2 malformed
and 31 illegal against their own word. Measured size: **865,877 B of JSON,
104,664 B gzipped** — see the size note below.

**What `checkClueLegality` actually rejects, which the brief undersold.** The
30-odd illegal entries are almost all one thing: the containment arm fires on
the ENGLISH gloss, in both directions, whenever the gloss is ≥ 4 letters. «te»
is illegal for *vand* because "te" ⊂ "water"; «he» for *far* because ⊂
"father"; «air» for *fly* because ⊂ "airplane"; «pot» for *kartoffel*; «eat»
for *kød*; «man» for *kvinde*. None is a morphological relation and none is
something an author would predict. Short English clue words are
disproportionately at risk, and E3 should expect the same rule to thin its
candidate list at play time.

**The size, which this document did not budget for.** The matrix is 2.1 KB
gzipped a city; the book is **104.7 KB** — fifty times as much, and nine cities
at this rate is roughly 940 KB gzipped. That is fine for E3, which loads it
lazily and is measured on city 1 only, and it is **not** fine as a single
eager asset. E6 should ship one file per city and E3's dynamic import should
be keyed by city, or the format should stop repeating `"da"/"en"/"why"/"s"/"v"`
five thousand times.

**Which words were hard.** No word came in under the band, but the two models
agreed least on `aften` "evening" (12 of 35 entries proposed by both),
`stjerne` "star" (13), `hjerte` "heart" (14), then `stor`, `mor`, `ung`,
`sove`, `finger`, `køre` (15 each); and Fable proposed fewest raw entries for
`stor` "big", `far`, `aften` and `uge` "week". They agreed most on `træ`
"tree" (26), `hvid` (24), `kage`, `kød`, `fugl`, `ben` (23 each). The pattern
is the same one E1 found from the other side: **concrete food and body nouns
have a tight, shared association neighbourhood; adjectives and time words have
a diffuse one.** E1 measured it as `food` 1/91 and `people` 7/78 against
`nature` 18/36 and `place` 13/28; E2 sees it as agreement between two
independent authors. A word in the diffuse group is one where the engine's
book is two models' opinions rather than one fact, and E4 should read the
per-word agreement alongside the win rate before concluding anything about a
board that happened to hold `aften`.

The 9 pairs that yielded only one honest clue, all of them wide: æble/salt,
arm/tand, finger/hår, hår/hjerte, nat/uge, uge/kirke, stor/ung, park/butik,
park/bank.

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

#### Stage 3 as built — E3 (2026-08-22)

Built as specified — `evaluator.ts`, `search.ts`, `engineCompanion.ts`, the
seam, the lazy chunks — with five findings the spec could not have known.

1. **θ measured at 0.5, the smallest step sim produces.** The sweep
   (engine-vs-engine on real city-1 boards, both seats through the same
   search, 400 seeded games a cell, `ENGINE_THETA_SWEEP=1` on
   `src/ai/local/engine.test.ts`) gives 91.0 / **99.0** / 97.5 / 59.0 /
   21.3 % for θ = 0 / 0.5 / 1.0 / 1.5 / 2.0. θ=0 lets a clue tie its own
   trap and the sim-ranked guesser takes the trap half the time; above 0.5
   the search trades coverage for safety the guesser never redeems. The
   caveat is structural: self-play shares one evaluator between the seats,
   so 99% is §2's honest-evaluator **upper bound**, not a claim about a
   human — E4's human-facing measurement may move θ up. At 0.5 the
   below-θ fallback never fired (0 of 2,337 clues); at 1.0 it fires on 49
   of 2,630, so the "escalate below θ" trigger Stage 5 needs is real and
   already plumbed (`CluePlan.belowTheta`).

2. **sim has three paths, not two.** Direct book strength; the raw matrix
   cell when the clue IS another city word (the cell judges exactly that
   question, no attenuation); and the two-hop `min(s, M) − 0.5`, the chain
   priced at its weaker link and a half-point under the equivalent judged
   fact so an estimate can never outrank one.

3. **The directional trap set is `engineTrapIds` and it is pinned twice
   over.** `isOpenFor` is exported from `projections.ts` as asked;
   `engine.test.ts` restates `game.test.ts`'s rule beside the pin, and both
   mutations — the flipped side and the direction-blind version — were run
   and fail it (recorded in the E3 commit).

4. **Legality thins the play-time candidate list far less than the
   authoring side suggested.** 306.3 candidates on a mean opening board,
   11.1 illegal (3.6%), and only 1.3 of those via the gloss-containment arm
   E2 warned about — a board is 18 words, not a whole city of glosses. The
   E2 warning stands for authoring; at play time it is noise.

5. **§8's open question is answered: the engine replaces `MockCompanion`
   in the drives.** Twelve drives were run against it — every one that
   plays or touches a round — and pass unchanged
   (the engine is exactly as deterministic as the hash was); smoke-drive's
   practice-note assertion was re-pointed at the new copy; endgame-drive's
   `mok` is injected state, not the companion. The mock survives inside
   `EngineCompanion` as the fallback for boards the book does not cover —
   a daily board drawing outside the authored cities, a city E6 has not
   reached — and for `translate`, which was never the engine's to answer.
   The new `e2e/engine-drive.mjs` is the acceptance: a practice round end
   to end with every non-preview request blocked, clues asserted real,
   legal and rationaled, and the two data chunks observed arriving late
   (`matrix.da` 2.19 KB gz, `book.da` 91.94 KB gz; the main bundle carries
   +1.88 KB gz of engine code and none of the data).

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

#### Stage 4 as built — E4 (2026-08-22)

Built as specified, and the first thing it measured was that **one of the three
rows the spec asked for cannot be read as a result at all.**

**1. THE SHARED-EVALUATOR ROW IS A CODE, NOT A SCORE.** The mutation this card
was asked to run — `sim` replaced by djb2 over (clue, wordId), everything else
in the engine untouched — does not fail the pins. It scores **100%**, above
every honest row in the table, in 4.68 clues a game. The reason is structural
and it retires the 99.0% figure as evidence: the search picks whatever the
shared function happens to rank high on its targets and low on its traps, and a
guesser reading the SAME function reads it straight back. A shared arbitrary
function is a private code between the seats, and self-play over one measures
agreement rather than association. Salt the two seats differently and the same
engine collapses to **0.5%**, at the floor. So the mutation is run twice in
`engine-selfplay.test.ts` — one shared hash (the finding) and two independent
ones (the check) — and **no pin in this repo may rest on engine-vs-engine
again**. θ = 0.5 was chosen on that row; it is not thereby wrong (the sweep's
neighbours fail for legible reasons that survive the objection), but it is now a
number chosen under a measurement that cannot tell a code from knowledge, and a
human-facing measurement may still move it.

**2. The honest number is the cross-model row**, and it is the reason the votes
were kept per model. `src/data/generated/matrix-city1/<model>-NN.json` and
`book-city1/<model>-*.json` split cleanly by authoring model, so
`engine-selfplay.test.ts` rebuilds an Opus-only and a Fable-only evaluator from
the committed votes — no duplicated data in the tree, and nothing read from the
merged artifact except its `ids`, which is an ordering rather than a judgement.
A clue-giver reading one model's judgement is then examined by a guesser reading
the other's. Both halves are complete (4,950 pairs each, 100 headwords each) and
they genuinely differ: **1,947 associations one proposed and the other did not,
against 1,901 both reached for.**

**The table. 200 seeded city-1 boards, the same eighteen-card deals down every
row**, 3×6 8/3/8:

| row | win % | last-chance % | clues | hits/number | greens left at SD |
|---|---|---|---|---|---|
| mock floor (nonsense clues, p = 0) | 0.5 | 100.0 | 8.00 | 0.234 | 7.41 |
| p-curve p = 0.6 | 73.5 | 51.5 | 7.47 | 0.586 | 2.46 |
| p-curve p = 0.7 | 90.5 | 24.5 | 7.03 | 0.678 | 2.20 |
| p-curve p = 0.8 | 98.0 | 5.5 | 6.38 | 0.786 | 1.55 |
| engine ↔ engine (UPPER BOUND — see 1) | 99.0 | 1.0 | 5.86 | 0.934 | 1.00 |
| **Opus clues / Fable guesses** | **53.5** | 48.5 | 7.62 | **0.623** | 2.24 |
| **Fable clues / Opus guesses** | **61.5** | 40.5 | 7.49 | **0.701** | 1.80 |
| MUTATION — djb2, one shared hash | 100.0 | 0.0 | 4.68 | 1.000 | 0.00 |
| MUTATION — djb2, two independent | 0.5 | 99.5 | 8.00 | 0.187 | 7.38 |

Reproduce with

```
ENGINE_SELFPLAY_GAMES=200 ENGINE_SELFPLAY_REPORT=1 \
  npx vitest run --reporter=verbose src/ai/local/engine-selfplay.test.ts
```

— and note the `--reporter=verbose`: vitest 4's default reporter swallows a
PASSING test's console output, so without it the table prints only when
something has already gone wrong. The committed default is 40 games (about 20 s
of `npm test`); every pin was checked at 40 and at 200.

**3. READ hits/number, NOT win rate.** The engine's win rate is depressed by
something that is a harness artifact rather than a product fact. Both seats are
the engine, so the engine also plays SUDDEN DEATH — where there is no
clue-giver and it therefore ranks the open cards against the last clue it heard,
whose targets are by then already found. It is a placeholder policy and it loses
almost every last chance: the p = 0.6 coin converts 25 points of win rate out of
sudden death, the engine converts 2. **In the app the engine never plays sudden
death at all** — `playerGuess`/`playerStop` own that phase and nothing asks
Casey. The comparator that is not distorted is "cleared inside the tokens",
i.e. 100 − last-chance %: **51.5% and 59.5%, against the p = 0.6 coin's 48.5%
and the p = 0.7 coin's 75.5%.** Together with hits/number of 0.62–0.70 against
the coins' 0.586 and 0.678, the offline engine reads an independently-authored
clue **a little better than a p = 0.6 partner and a little worse than p = 0.7**
— against a floor of 0.19–0.23. That is the number this card was built to
produce.

**4. Fable's clues read better than Opus's.** 0.701 against 0.623 hits/number,
in the direction nobody predicted: the more generous judge (E1: Opus, 775
non-zero cells to Fable's 713; E2: 3,126 raw associations to Fable's 2,623) is
the one whose clues an independent reader follows LESS well. One city and one
run is not enough to act on, but E6 should keep the per-model split rather than
merging blind, and should re-measure this on the first new city.

**5. The probe is built, opt-in, and has not been run for money.**
`e2e/engine-probe.mjs` plays engine-clues/model-guesses, model-clues/
engine-guesses and a free engine/engine reference row, printing hits/number for
each with the call count and the wall time. It is **not** a browser drive: the
configuration it needs — the engine cluing while a model guesses — is one the
app deliberately does not have, so there is no screen to drive. It loads the
app's own modules through Vite's SSR loader instead, which means it measures the
same `searchClue`, the same `sim`, the same prompts and the same `chatJson` a
phone runs. It **refuses to start without `OLLAMA_API_KEY`** rather than falling
back to something free and calling the result a measurement.

This session had no key (and the deployed proxy is origin-locked), so it was run
only against `e2e/fake-ollama.mjs` — 15 calls, 0.5 s, **nothing paid**. That run
proves the plumbing and measures no model whatever; its one useful figure is the
free reference row, **0.929 hits/number engine ↔ engine on seed 1**, which
reproduces the offline table's 0.934 and is the check that the probe's harness
and the test's agree. The first real "as well as a frontier model" number costs
about 16 calls a round and is the single measurement that would most change what
follows.

**6. The clue ledger ships, and `r` now has somewhere to land.**
`src/stores/ledgerStore.ts` is a counter per arm — `{clues, asked, hits,
refused}` — written by `gameStore` when a turn under Casey's clue ends, and
shown in Settings under "Casey's clues". `arm` is the model alias, or `engine`,
or `mock` when even the engine had no board to work from (the two offline arms
are told apart deliberately: a board the book does not cover is exactly the case
worth seeing separately). `refused` is `r`: `askValidated` already knew the
answer every time it retried — a retry IS a refusal, and it is the retry that
asks the proxy for the better model — and nothing was writing it down. It now
reports its attempt count through `CallReport`.

The store holds four integers and a name and **no clue text and no word id**,
pinned by a test, because the owner declined a ledger schema designed as future
training data (§3). It is transient across a reload mid-turn (`gameStore` has a
`partialize` and `pendingClueArm` is not in it): one lost row is nothing against
a rate, and a row with the wrong arm attached is a lie.

## The verdict (E4, 2026-08-22): GO — but E6 before E5, and E5 in halves

**E6 — matrix and book for cities 2–9: GO.** The association data measurably
works. Two independently authored halves, neither sharing the other's opinion
and neither sharing the merged book the app ships, read each other at 0.62–0.70
hits per word asked against a floor of 0.19–0.23, and the djb2 mutation that
removes the association and keeps everything else falls to that floor. Eight of
the nine cities have none of that data today, and boards are city-only since E0,
so every player past city 1 gets `mok` from the fallback: E6 is not polish, it
is the difference between the practice companion existing and not existing for
8/9 of the game. Carry E2's size finding into it — one file per city, imported
by city, or nine cities is ~940 KB gzipped in one asset.

**E5's FIRST HALF — the evaluator as a validator inside
`OllamaCompanion.getClue`: GO.** This is the half the measurement supports
directly. A validator is only worth having if its verdict is not an echo of the
thing it judges, and that is exactly the property the cross-model rows
demonstrate and the shared-hash mutation shows engine-vs-engine cannot. It ships
alone, it is the lowest-risk piece, and it turns H7's escalation into a checked
trigger.

**E5's SECOND HALF — the candidates prompt, rank fusion, and the
`MODEL_ALIASES` flip to a cheap `cluey`: NOT YET.** Nothing measured today
supports it. The whole saving turns on `r`, `r` still has no value, and the
ledger that will give it one shipped in this PR empty. Do it when the ledger has
a few hundred clues in it, not before.

**What would reverse each of these, stated now so it cannot be argued
afterwards:**

- **Reverse E6** if the first new city's cross-model hits/number comes in below
  ~0.45 — near the p = 0.5 region rather than 0.6–0.7. That would say the city-1
  result was about city 1's hand-curated hundred rather than about the method,
  and the remaining seven cities are not worth ~80 agent runs each. E6 runs one
  city per PR for exactly this reason: measure the first, then decide about the
  rest.
- **Reverse E5's first half** if the probe (with a real key, ~3 rounds, ~48
  calls) shows the model's own clues clearing θ almost always. A validator that
  never fires is a retry path that costs a round trip and buys nothing.
- **Reverse E5's second half into something better** if the ledger shows the
  ENGINE's hits/number within ~0.05 of the remote model's over ~200 clues. That
  would not mean "flip the alias to a cheap model"; it would mean the remote
  model is not buying anything on these boards, and the right move is the
  opposite one — make the engine the default clue-giver and keep the model for
  the story and the translation, which were never the engine's to answer.
- **Stop at the offline engine entirely** if the ledger's `r` comes back above
  ~0.5. `proxy/README.md`'s own arithmetic says the cascade still saves money up
  to r = 0.96, but an app whose validator refuses the model's first answer half
  the time does not have a cheap-model problem, it has a prompt problem, and E5
  would be building on it.

**The one measurement that would settle the most:** the probe with a real key.
Everything above is offline evidence that the engine plays like a decent
partner; nothing yet says how it compares to the thing it would replace.

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
