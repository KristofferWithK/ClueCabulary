# 900words to do list — board 2

Board 1 is [`PLAN.md`](PLAN.md): the reshaping into 900words and the onboarding
rework, O1–O4 shipped on 2026-08-21. This board is the owner's notes from
playing that build — the composer, the voice, the board while Casey guesses,
the post-game, the wrap-up economy, the grid, and a second pass at the intro —
checked against the tree and turned into cards. Sessions pick up cards from it
exactly as they do from board 1; the board section below is the live status.

## The live board

The board's status is published as a page that is updated at the end of each
working session: **https://claude.ai/code/artifact/4369cb58-bac4-4d74-a029-01be1f3d6f26**

Its source is `docs/dispatch/index.html`, and the whole board is one `CARDS`
array at the bottom of that file — a status change is a one-line edit plus a
republish to the same URL, so the link never moves. **Whoever finishes a card
updates two things in the same PR: this document, and that array.** A page that
is only sometimes true is worse than no page.

## How to work this board

The rules are board 1's, unchanged:

- Pick the **top-most card in Ready**. Move it to In progress (add the date),
  work it, and in the same PR that finishes it: move it to Done with the PR
  number and promote any card whose dependencies are now all Done from Blocked
  to Ready.
- One card ≈ one session. Don't split a card across PRs unless it says so.
- Every card: branch from `origin/main` (squash merges), `npm run verify`
  green, README + CLAUDE.md updated in the same PR when the card changes what
  they describe, measured numbers re-measured (selfplay/drives), persisted-store
  changes ship `version` bump + `migrate` in the same commit.
- User-facing copy only, ever: `cluey-*`, `Cluey*`, `cluecab-*`, the backup
  literal and the appId stay what they are (CLAUDE.md §5).

---

## The master plan — one order to execute, across both boards

Both boards' open work, sequenced by what actually blocks what. A session
picks the top-most unstarted card of the lowest unfinished wave. Waves 2–3 and
wave 4 are independent of each other and can run side by side; everything else
is a chain.

**Wave 0 is cleared as of 2026-08-21** — nothing blocks waves 1–6, and the
only owner-gated item left (D3's rename) sits in front of wave 7 alone.

### Wave 0 — cleared, 2026-08-21 *(nothing blocks waves 1–6)*

The owner asked for this wave to be emptied so execution could start without
them. Four of the five dissolved on inspection or on measurement; the fifth
turned out never to have blocked what it was listed against. Each resolution is
reversible and says how.

- **C4's ordering constraint was too strong — withdrawn.** The claim was "judge
  the composer before K1, or you cannot tell the ride from the new box". That
  is false: `cluecab-kbstill` is read **live at `keyboardWillShow`**
  (`nativeKeyboard.ts:299` and `:413`), not latched at mount, and BuildFooter's
  five-tap toggle flips it without a rebuild — the code comment says so in as
  many words: *"the one way to stand yesterday's behaviour up next to today's
  without a rebuild."* layout-drive pins both arms independently. So the A/B
  survives K1 intact and the verdict can be taken on any future build. **C4
  becomes ordinary feedback rather than a gate**; C5 stays parked unless the
  verdict comes back negative.
- **The two Aoedes: measured, and not distinguishable.** Rather than wait for a
  listen, both were decoded to 16 kHz mono and their fundamental frequency
  estimated by autocorrelation over voiced frames, with six other da-DK Chirp3
  voices measured alongside for scale:

```
da-DK Aoede — the ride, Danish     median 203 Hz   IQR 176–258
en-US Aoede — the ride, English    median 182 Hz   IQR 155–219
da-DK Aoede — baked words          median 178 Hz   IQR 172–254
  calibration: Puck 145 · Fenrir 182 · Charon 186 · Achernar 222 · Zephyr 235 · Kore 239
```

  The two Aoedes differ by 21 Hz — but **the same Danish Aoede moves 25 Hz
  between words and sentences**, which is more than the difference being
  tested, and the whole voice family spans 95 Hz. So F0 cannot separate them:
  the result is *consistent with* one voice and cannot prove it, and the test
  has no more resolution to give. **Decision: bake with `en-US-Chirp3-HD-Aoede`
  as planned.** The reversal is one `--voice` flag and a nonce bump, which is
  cheaper than the wait. Ears still overrule the number whenever they get to it.
- **Reading Sønderborg was never a blocker for this board.** It gates H9's eight
  unwritten rides, and H9 is parked. S3 changes how a ride is *baked and
  played*, not its prose. So nothing in waves 1–7 waits on it, and it moves to
  the parked list where it belongs.
- **M1 has a recommendation on the card**, so H4 is no longer waiting on a
  conversation. It is written to be vetoed rather than assumed — see M1.
- **D3 stays yours** — renaming a GitHub repo needs owner access and breaks
  every installed PWA, so no session should do it. But it blocks only **G2's
  screenshots**, which is wave 7. Waves 1–6 do not touch it. X1 shrinks the
  code half to a single constant so the eventual rename is one edit plus the
  rename itself.

**Answered since, 2026-08-21:**

- **C4 is closed — "it feels attached enough."** The ride ships as it is and
  **C5 is closed with it**, unbuilt: it existed only for a "still not attached"
  verdict. The white box the same verdict mentions is not the legend — it is the
  dock's own `--surface` paint, and K1 now carries that decision.
- **The English voice is not good enough** — "the danish aoede sounds nicer, the
  english sounds ai artificial". S2 gains an en-US audition before the bake, and
  S3 records the option of simply not speaking the translation at all.

**Answered 2026-08-21, later the same evening:** T2 is decided — the grammar
**replaces** the story, so the eight unwritten rides are cancelled and
Sønderborg's survives as an option. The nine chapters are written
(`docs/grammar-da.md`) and machine-checked. English is never spoken.

**What is still genuinely yours:** a **Danish speaker must read
`docs/grammar-da.md`** before it ships — a wrong rule is believed and repeated,
and it is the one thing on this board a machine cannot check. Rename the repo
before wave 7. Neither blocks a card starting now.

### Wave 1 — cheap cards, no dependencies *(≈3 sessions)*

**D4** Casey is she · **D5** sudden death becomes the last chance (one PR with
D4) · **X1** the stale-copy sweep · **U1** tap speaks, ⓘ opens
· **S1** Casey's guesses are spoken · **T1** the train becomes the travel
control, plus the dev switch that makes playtesting nine cities possible at
all · **T2** the ride teaches the grammar (the chapters are written) · **E0**
city-only boards (before N1, alone) · **WS1** apply the word selection, then
**WS2** its bake. Half a session each bar T1, T2 and WS1; no ordering between
them — *orchestration pass, 2026-08-21: E0, WS1 and T1 are the three to start
in parallel; see "The execution plan, reviewed".* Nothing else waits
on them except I1 (which wants D4's pronoun) and U3 (which wants S1) —
but **do T1 first if you intend to playtest anything downstream**, because
without it you cannot reach city two on a phone.

### Wave 2 — the composer *(≈3 sessions, after C4's verdict)*

**K1** the composer never changes size → **K2** every dock the same height,
the legend gone. This is the spine of the whole board: the height K1 and K2
hand back is what makes the 3×6 possible, and the fixed rectangle is what U3,
P1 and I2 all draw inside.

### Wave 3 — the board *(≈3 sessions, after wave 2)*

**N1** one board, 3×6 8/3/8, and the sizes go → **N2** the wrap-up on 3×6.
N1 is the biggest single card on either board — a persisted setting, a
Settings control, a dev switch and 27 drive URLs — but it *removes* an axis
rather than adding one, and everything after it is simpler for it.

### Wave 4 — audio and the dictionary *(≈5 sessions, independent of waves 2 and 3)*

**S2** bake the 900 example sentences in Aoede → **P2** needs it later; **S3**
the ride as one performance; **U3** Casey thinks aloud (needs K2 and S1, so it
lands after wave 2 even though it is an audio card); **L1** the offline
dictionary, which is independent of all of them and whose licence question
should be settled early because it is the part that can block. ~~S2 is
push-gated: the bake runs in Actions and commits back, so start it early.~~
**Struck 2026-08-21:** S2 runs after WS1 → T2 → T3, last of the three, or the
bake is paid for twice. Its card said so; this paragraph did not.

### Wave 5 — the economy and the post-game *(≈5 sessions, after waves 3 and 4)*

**W1** one gate for wrap-ups → **P1** the summary as one pencil screen with
Casey → **P2** the sentence review · **P3** retire the live story call · **P4**
the turn log behind a sheet. W1 first because P1 prints its counter, and P1
before the three small P cards because it is the screen they all sit on.

### Wave 6 — the intro *(≈5 sessions, after wave 5)*

**I1** station, ticket, train → **I2** the practice round the player actually
plays → **I3** the post-match Casey → **I4** the tour and the map act → **I5**
the docs pass. A strict chain; I2 is the biggest and is the one that answers
your "biggest critique right now".

### Wave 7 — the Pass, then launch *(≈4 sessions plus your submission)*

**M1** the pricing session → **H4** the 900 Pass (board 1's IAP card, promoted
out of the fast-follows on the owner's call: the launch is a full one) →
**G2** screenshots and the store submission. Screenshots last, always: K1/K2,
N1, P1 and I1–I4 all change what the app looks like, and a screenshot taken
before them is a screenshot taken twice. M1 should happen **early** even
though H4 is late — the free-tier answer changes the store copy, and the
per-language question changes what the first purchase promises.

### Parked, with reasons

**C5** the native composer (only on a "still not attached" C4 verdict).
**H9**'s eight remaining stories (yours to unlock, and S3 first). **H2**
German, **H3** the semantic layer, **H6** the voice unlock, **H8** the
postcards — board 1's fast-follows. **H4 is no longer among them**: the launch
is a full one, so it moved into wave 7.

### Roughly what this costs, and the one thing worth deciding early

About **twenty to twenty-five sessions** end to end, plus your Wave 0 evening
and the submission itself.

**Settled 2026-08-21: the launch includes H4**, so the launch date and the
revenue date are the same day and the argument below is about quality rather
than about money arriving. Two honest options:

- **Ship all of it, then launch** (waves 0–7). The intro is the first thing
  every new player meets and it is the thing you are most critical of;
  shipping it as it stands to your one launch audience is the expensive
  mistake.
- **Cut after wave 5, launch, ship the intro as 1.1** (≈14 sessions). Buys
  maybe a week. Worth it only if the store clock matters more to you than the
  first session does — and note that the screenshots would then be reshot for
  1.1 anyway.

The measurement that should inform the choice, from W1's harness: **a city is
69–100 rounds, or six to ten hours of play.** Whichever option you take, the
free tier is generous — which is the input M1 needs.

## The execution plan, reviewed — 2026-08-21, orchestration pass

Written by the session that will dispatch this board, after reading it with
`docs/clue-engine.md` and `docs/word-selection.md` open and auditing the tree.
It does four things: folds the chessbot and word-selection work in as cards,
evaluates the order, lists what in the repo is stale or in the way, and ranks
every card by which Claude model should run it. The live page carries the same
information as a column and a filter.

### Four lanes, not seven waves

The waves are right as dependency chains but hide that there are **four lanes
with almost no edges between them**, which is what lets several sessions run
at once. Each lane is a strict chain inside itself; across lanes the only
touch-points are listed.

| Lane | Chain | Touches other lanes at |
|---|---|---|
| **UI** | wave-1 UI cards → K1 → K2 → N1 → N2 → U3 → W1 → P1 → P2/P3/P4 → I1 → I2 → I3 → I4 → I5 | N1 and E0 both edit the deal in `gameStore.ts` (E0 first, alone). K2 and U3 both redraw `AiTurnPanel`. P2 needs S2's clips. |
| **Content** | WS1 → WS2 (bake) → T2 → T3 → S2 (bake) → S3 | T3 writes the sentences the engine's book will sit beside; E6 waits for WS1. |
| **Engine** | E0 → E1 ‖ E2 → E3 → E4 → *decide* → E6 (after WS1) → E5 | E0 before N1. E6 keys on the post-WS1 ids. |
| **Launch** | M1 → H4 → D3 (owner) → G2 | G2 last of everything visual. |

**Start of play:** three sessions in parallel — **E0** (engine lane, half a
session, must precede N1), **WS1** (content lane; it is upstream of the most
things), and **T1** (UI lane, so a phone can reach city two). Then K1 as soon
as E0 lands.

### What the review changed in the order

1. **The collision is misdescribed, and it is sharper than written.** The
   handoff says `word-selection.md` "§2 rewrites the 900 sentences to a
   scenery floor". It does not: its step 4 *re-measures* coverage and hands
   any shortfall to H5/T3. The real collision is that WS1 **removes 113
   headwords — their sentences leave with them — and adds 113 that have no
   sentence at all.** So T3 is not "alongside" word selection, it is
   **after** it: sentences written before WS1 are written for words about to
   leave, and 113 new words need theirs written from scratch (WS1's job, to
   both budgets). Order: WS1 → T2 → T3 → S2. Unchanged consequence: S2 bakes
   once, last.
2. **S2 was listed Ready on this board while its own card says "not before
   T3".** Dispatch had it right. Fixed below; the "start it early" in the
   wave-4 paragraph is struck.
3. **E0 (city-only boards) goes into wave 1**, because N1 deals from the same
   pool and `clue-engine.md` asks for it first and alone.
4. **WS1 goes into wave 1**, ahead of T3/S2/E6 and the grammar's vocabulary
   gate: renumbering `curriculumRank` moves words between cities, and
   `validate-grammar.mjs` will fail loudly — WS1 owns re-gating the chapters
   (move a word or reword the example), not T2.
5. **The Danish read of `grammar-da.md` is now the content lane's real
   critical path.** T3 writes 800 sentences to the chapters; if the reader
   changes a rule afterwards, sentences and a bake follow it. It is not
   needed to *start* anything, but it is needed before T3 is written to a
   chapter. Ask for it now, not at wave 4.
6. **L1 no longer shares a wordlist or a licence with the engine** (the
   engine's clue vocabulary is the 900 ∪ the book). The L1 card's "read this
   with H3 open" is stale; L1 is only a dictionary decision.
7. **App size is not a constraint until 2 GB** (owner, 2026-08-21). Today's
   audio is **11.4 MB by bytes** (the "16 MB" in Context item 7 is NTFS
   cluster rounding over 1,893 small files); S2 adds ~14 MB, L1 ~1 MB, the
   matrix ~100 KB, the book well under a megabyte. Nothing on this board
   should be sequenced, trimmed or argued for on size — "saves 13 MB" is
   true and irrelevant. The one size-shaped thing that *is* a bug is the
   service worker's entry cap (audit, below).

### The new cards, in brief

Word selection (from `word-selection.md`, "The change to make"):

- **WS1** — Apply the selection: 113 out, 100 back from the pool, 13 new
  (with sentences written to T3's and the scenery budget), ledger classes,
  `curriculumRank` renumbered under the quotas, the validator rules, the
  grammar chapters re-gated, the migration check, the per-city selfplay
  pins, and the false closed-class sentence in `README.md:216` and
  `src/lang/types.ts:131` corrected. 1–2 sessions. The 13 new words are the
  owner's to verify in the PR.
- **WS2** — The bake for the 113 new headwords: `BAKE_NONCE` bump, push,
  the workflow commits back. No `cacheName` bump (new filenames).

The engine (from `clue-engine.md` §5–6; H3a/H3b as that document asked):

- **E0** — City-only journey boards (`clue-engine.md` §5, Card 0). ½.
- **E1** — The judged matrix, city 1: 4,950 pairs, Opus and Fable judges,
  `merge-matrix.mjs`, `validate-matrix.mjs` in verify. 1.
- **E2** — The book, city 1: ~30 associations a word, pair clues where
  M ≥ 1, both languages, `merge-book.mjs`, `validate-book.mjs`. 1. Runs
  beside E1.
- **E3** — Evaluator + search + `EngineCompanion` behind the practice seam,
  lazily loaded. 2.
- **E4** — Measurement: engine selfplay with the authoring halves kept
  apart, `engine-probe.mjs` (opt-in), the clue ledger. 1–2. **Ends in a
  decision** — the table says whether E5/E6 are worth it.
- **E6** — Matrix and book for cities 2–9. After WS1 and the E4 decision.
  2–3 sessions of orchestration; ~530 judging agents across two models.
- **E5** — The hybrid: evaluator as validator (turns H7 on), the candidates
  prompt, rank fusion, the alias flip. 1–2.

### Model ranking — who runs which card

Three tiers. **Sonnet** for copy sweeps, deletions, small UI, pipeline
plumbing with a spec to follow. **Opus** for anything that makes a design
call, changes a persisted store, rewrites drives, or measures. **Fable** only
where the work is both hard and unverifiable by the owner — Danish prose at
scale that no one on the project can read, the engine's core search, and the
exhaustive tutorial commentary. The page shows the same tier beside every
card and filters by it.

| Model | Cards | Why |
|---|---|---|
| **Fable** | T3 · E3 · I2 | T3 is 800 Danish sentences to two budgets that the owner cannot proof-read — the cost of a wrong one is a learner repeating it. E3 is the search/evaluator with the directional trap rule and the prompt firewall; a subtle error there is invisible until E4. I2 is the first thing every player meets and its commentary must be exhaustively pinned. |
| **Opus** | T1 T2 WS1 K1 K2 N1 S2 S3 U3 L1 W1 P1 I1 I4 M1 H4 G2 · E1 E2 E4 E5 E6 (orchestrating; E1/E2/E6's judging agents are Opus **and** Fable by the owner's decision, votes merged) | Design calls, store migrations, drive rewrites, measurement, money-bearing bakes. |
| **Sonnet** | D4 D5 X1 U1 S1 E0 WS2 N2 P2 P3 P4 I3 I5 | A spec exists, the change is bounded, the tests say when it is done. |
| **Owner** | D3, the Danish read, the 13 new words, on-device verdicts | Not a model's to take. |

### The audit — what is stale or in the way

Severity: **blocks** / *misleading* / cosmetic. Each names the card that clears it.

- **blocks — four dirty worktrees on stale bases.** `.claude/worktrees/`
  holds four registered worktrees (`compassionate-khorana`, `keen-lalande`,
  `modest-dhawan` on `6bee696` = #77; `fervent-wilbur` on `8e101d7` = #64,
  ~30 PRs back) with uncommitted edits to `vite.config.ts`,
  `scripts/run-drives.mjs`, `src/index.css`, `CLAUDE.md` and six drives —
  the files K1/K2/N1 rewrite. Plus three orphan `agent-*` directories, one
  with its own `node_modules`. **Owner's call per worktree: salvage or
  `git worktree remove`.** Nothing in them looks like unmerged work (the
  drive/preview-server changes resemble what later shipped), but deleting
  is not a session's to do unasked.
- **blocks — the service worker's `maxEntries: 2000`** (`vite.config.ts:101`)
  against 1,893 clips today and 2,793 after S2: an installed phone would
  evict word clips as soon as it hears sentences. The comment also
  miscounts (it forgot `story/en` and `story/slow`). **S2 raises the cap**
  and states the new number; no `cacheName` bump needed for that.
- **blocks — board vs page disagreed on five cards** (S2 Ready/blocked, T2's
  wave, C4/C5 Done, H3 held/parked). Reconciled in this pass; the rule
  stands — both move in one PR.
- *misleading* — "16 MB of audio" is 11.4 MB by bytes (above). Context
  item 7 now points here.
- *misleading* — `README.md:216` and `src/lang/types.ts:131` say nothing in
  the 900 is a closed-class word; 69 are. **WS1.**
- *misleading* — this board's Context was verified against `f684bc6`, three
  PRs before #93/#94/#95. Items 1–7 still hold on inspection; the H3 and T3
  consequences are in this section.
- *misleading* — `DECISIONS.md:382` says `WORD_MS` is unmeasured and 1200; it
  is 1500 and measured. **X1** (already carded).
- *misleading* — `docs/PLAN.md:25/:88/:393` still frame ranks 901–1000 as
  dropped; WS1 re-adds them. **WS1** adds a line to PLAN.md.
- *misleading* — the L1 card's "read with H3 open". Struck by this section.
- *misleading* — the `audition/` deletion in X1 must wait for **S2's en-US
  audition**, which A/Bs against those Danish clips. X1 keeps the deletion
  but after S2, not before.
- cosmetic — `docs/store/listing.md:42` still says "he" (D4 lists the
  directory, not the line). `bake-audio.yml:67` says "all three sources";
  it loops five, six after S2. **D4 / S2.**
- cosmetic — drives with literals the UI cards invalidate, so nobody is
  surprised: `suitcase-drive.mjs:210` ("Wrapped — 20 of 900", W1/N2), `:234`
  (the twenty-collected gate, W1), `journey-drive.mjs:148` (a 4.5 s
  Sønderborg timing, S3), `offline-drive.mjs:6` ("~9 MB"). Each is on the
  card that changes it.
- **Verified not stale**, so nobody re-opens them: the tutorial's fixed
  board and its six off-board clue words are all outside WS1's removal
  list and city 1 is untouched, so `TUTORIAL_SEED` holds; no drive hardcodes
  a word id; the 17/21 drive counts and N1's "27 URLs across ten drives" are
  exact; every documented script exists; no unused dependency; every
  "forbidden"/"redemption"/"Viborg"/"klaus" hit is a deliberate historical
  comment or a persisted field that must not move; 0 orphan clips and 0
  words without one in both word manifests. Thirty-eight merged remote
  branches remain — owner-only cleanup, already on X1.

### Roughly what it costs now

Board 2 was 26–29 sessions. The engine adds about 10–12 (E0 ½ · E1 1 · E2 1
· E3 2 · E4 1–2 · E6 2–3 · E5 1–2) and word selection 1½–2½, so **about 38
to 43 sessions** end to end — but across four lanes, so the wall-clock is
the longest lane (UI, ~18), not the sum. E4's decision can shorten the engine
lane by five sessions if the city-1 numbers say the hybrid is not worth it.

## Context — what the notes turned up when checked against the tree

Facts the cards rest on, each verified on 2026-08-21 against `main`
(`f684bc6`):

1. **Three board sizes today; one from now on.** `GRID_CONFIGS` holds
   beginner (3×4), middle (3×5, what Play deals) and standard (4×5), chosen
   in Settings and stored as `gridSize`. The owner's call on 2026-08-21:
   **one standardised board, 3×6**, and the wrap-up round moves to 3×6 with
   it. That deletes a persisted setting, a Settings control, a `?grid=` dev
   switch used in 27 drive URLs, and a whole axis of measurement — cards N1
   and N2. The 3×4 survives as the tutorial's own board, not as a size
   anybody picks.
2. **The voice is still Aoede — at a different pace, and not everywhere.**
   `public/audio/da/manifest.json`: `da-DK-Chirp3-HD-Aoede`, rate **1**, all
   900 words, baked 2026-08-21 00:05 (commit `4f39ca2`, PR #79 — "Normal
   speed by default, 0.6 behind a 🐢"). The 0.6 reading the owner chose now
   sits behind the dictionary sheet's 🐢. Chirp3 is not reproducible
   (DECISIONS: the same request came back 39% longer on a second draw), so the
   1.0 bake is also a fresh reading of every word.

   **Nothing is ever stitched out of word clips.** A word clip is one request
   for that word; a ride sentence is one request for that whole sentence
   (`make-audio.mjs`'s story branch, one job per sentence) — so within a
   sentence the reading is a single performance with real intonation. What is
   NOT one performance is a whole story: Sønderborg's 31 sentences are 31
   independent draws, and Chirp3 varies between draws. Card S3.

   **The post-round sentences have never been Aoede at all**:
   `RoundSentences.tsx` and the sheet's example sentence call `speakText` —
   the phone's own Danish voice, or silence on a phone that has none. That is
   the biggest single reason "the sentences" sound different, and card S2 is
   the fix.

   **Aoede speaks English, and already does here.**
   `public/audio/da/story/en/manifest.json` says `en-US-Chirp3-HD-Aoede`, 31
   clips — the ride's translation half, baked and shipped. Chirp3-HD offers
   the same character names per locale, so no second narrator is needed;
   whether the two Aoedes sound like one person is a listening question with
   a sample already in the tree (`story/en/0-000.mp3` beside
   `story/0-000.mp3`). If they do not match, the fallback is another en-US
   Chirp3 voice chosen by ear — never the Danish Aoede reading English, which
   would put a Danish accent on the translation.
3. **Two wrap-up gates, one of them structural.** `WRAP_UP_UNLOCK` is an
   alias of `WRAPUP_CONFIG.totalWords` (20): a wrap-up board is 4×5 of
   collected words and cannot be dealt from fewer. The bank is the second:
   one win = one token, cap 3 (`bankAfterRound`). Measured in `wrapup.ts`'s
   comment: the collected gate binds for a city's first 11–13 rounds, then
   only the win gate is live and the cap is the whole of the rationing.
4. **Casey's reasoning already exists before each guess.** `aiGuessQueue`
   holds `{wordId, confidence, reasoning}` for every planned guess; the panel
   shows a confidence phrase only *after* the reveal, and the sentence itself
   only in the collapsed turn log — which is also the only home of the ⚑
   flags that feed `flaggedBlock` in both prompts.
5. **The composer's slot is fixed; the panel is not.** `--dock-h` (12.5rem,
   200px) reserves the same height in every phase (C1, then #90 made the
   panel hug its content inside it). The composer is 126px empty and grows:
   +a verdict line, +the O4 first-time hint (191px), +up to four dictionary
   answers in a 4.6rem scroller. The guess bar wants 154px; the tutorial dock
   16.25rem. Every extra line is drawn out of a reserve that the board paid
   for in every phase.
6. **Casey is she/her — settled 2026-08-21.** Every line of copy still says
   *he/his*: five user-facing strings in `src` (`cluey-tips.ts:32`,
   `client.ts:99` and `:294`, `companion.ts:293`, `GameScreen.tsx:449`),
   fourteen lines of README, the store drafts and this repo's own prose. The
   tutorial and tour speak in the first person and are unaffected. Card D4.
7. **The example sentences are fixed content.** All 900 words carry
   `exampleDa` (25,656 characters) and `exampleEn` (27,458), none missing —
   the exact shape the ride bakes per sentence. At Sønderborg's measured clip
   sizes that is roughly 14 MB for the Danish and 27 MB for both halves;
   `public/audio/da` is 16 MB today — *11.4 MB by bytes; the 16 is cluster
   rounding over 1,893 files. Size is not a constraint under 2 GB; see "The
   execution plan, reviewed".*

## Decisions to settle with Kristoffer

The cards are written to the recommendation; each is one constant or one copy
pass to flip.

| # | Question | Options | Recommendation, and why |
|---|---|---|---|
| ~~1~~ | ~~Casey's pronoun~~ | **Settled 2026-08-21: she/her.** Card D4. |  |
| ~~2~~ | ~~The 3×6's greens and tokens~~ | **Settled 2026-08-21: 8 a side, 3 shared, 8 tokens**, as the one board. Measured on N1. |  |
| ~~2b~~ | ~~Replace or add a size~~ | **Settled 2026-08-21: one board, the sizes go.** Cards N1 and N2. |  |
| ~~2c~~ | ~~The wrap-up board~~ | **Settled 2026-08-21: the same board as a normal round** — 3×6, 8/3/8. One config for everything. Card N2. |  |
| ~~2d~~ | ~~Forbidden words~~ | **Settled 2026-08-21: no.** What makes a wrap-up special is the packing gate and the closed dictionary, both of which already exist. Card N3 deleted. |  |
| ~~3~~ | ~~Wins per wrap-up token~~ | **Settled 2026-08-21: 3** — and simulation says it is not merely safe but *faster* than 1. See W1. |  |
| ~~4~~ | ~~Collected-words floor~~ | **Settled 2026-08-21: none** beyond the one word a board needs to have anything to pack. The tip does the advising instead. |  |
| 11 | Free tier before the 900 Pass | 1 city · 2 cities · a round count | **Brainstorm session, card M1.** The measurement that should decide it: one city is a median of **69–100 rounds**. One free city is already 6–10 hours of play; two is a working fortnight. Nothing to settle from the armchair — M1 lays out the options. |
| 12 | A bigger offline dictionary | ship one · keep asking Casey | **Card L1, worth doing.** The lookup is already local-first over the 900 words; only words *outside* them cost a proxy call. A bundled Danish–English wordlist would take the proxy out of the dictionary entirely — the real constraint is licensing, not size. |
| 5 | Post-game: the live story or the sentences | live story (H5, one proxy call a round) · baked sentences | **Baked sentences with the review player** (S2, P2); retire the live call (P3). One fewer proxy request per round in a money-constrained launch, offline, and one narrator. H9's rides are where the function words get met. |
| 6 | The turn log and its ⚑ flags | delete · behind a sheet | **Behind a sheet** ("Casey's calls"): zero height on the summary, and the only channel that tells Casey a call was bad survives. Your "wouldn't miss it" is noted — P4 says what deleting it takes out. |
| ~~7~~ | ~~Confetti~~ | **Settled 2026-08-21: keep it, drawn in pencil.** Folded into P1. |  |
| 7b | The ride, as one performance | per sentence (today) · one pass per chapter | **One pass per chapter** (card S3) — it is the only way a story reads as a story. It costs an ffmpeg step in the bake and a seeking player; the post-round review stays per sentence, because five examples of five different words are not one performance by nature. |
| ~~8~~ | ~~Sentence bake scope~~ | **Settled 2026-08-21: Danish only. English is never spoken** — on the ride or in the review. Saves ~13 MB and half the bake; `story/en/` becomes dead. |  |
| 9 | The practice round needs the proxy for free-typed clues | accept · keep it offline-only | **Accept**, per your note. The three suggestions stay the offline path, so a train with no signal still finishes the round. |
| 10 | The sentence review starts | by itself · on one Listen tap, then runs | **One tap, then the chain** — the ride's rule (DECISIONS, "card reveals stay silent"). The chain runs through every sentence after that. |

---

## Board

### Ready
- **D4** — Casey is she *(settled; no dependencies)*
- **D5** — Sudden death becomes the last chance *(settled; ships with D4)*
- **K1** — The composer never changes size
- **U1** — A tap says the word; ⓘ opens the dictionary
- **S1** — Casey's guesses are spoken
- **X1** — The stale-copy sweep
- **W1** — One gate: a wrap-up is earned by wins alone *(decisions 3 and 4 settled — ready)*
- **T2** — The ride teaches the grammar *(decided; the nine chapters are written and machine-checked)*
- **WS2** — Bake the new headwords *(WS1 landed; the 113 slugs are waiting)*
- **E1** — The judged matrix, city 1 *(city 1 is final; may start now)*
- **E2** — The book, city 1 *(beside E1)*
- **S3** — The ride as one performance *(after decision 7b; H9's eight cities are the other half)*
- **L1** — A dictionary that never needs the network *(after decision 12)*
- **M1** — The 900 Pass: recommendation written 2026-08-21, awaiting a veto rather than a decision

### Blocked
- **T3** — The next city's sentences reinforce the chapter *(T2 — WS1 landed, so the 787 that stay are known)*
- **S2** — Bake the 900 example sentences *(T3 — last of the three; push-gated, the bake runs in Actions)*
- **E3** — The evaluator, the search and the engine companion *(E1 · E2)*
- **E4** — Measure the engine, and decide *(E3)*
- **E6** — Matrix and book for cities 2–9 *(E4's decision)*
- **E5** — The hybrid *(E4's decision)*
- **K2** — Every dock the same fixed height, the legend gone, the drive measuring the panel *(K1)*
- **N1** — One board: 3×6, and the sizes go *(K1 + K2: measured, a sixth row does not fit until they land)*
- **N2** — The wrap-up round on 3×6 *(N1)*
- **U3** — Casey thinks aloud before each guess *(K2; S1 for the spoken reveal)*
- **P1** — The round summary as one fixed screen, in pencil, with Casey *(W1 for the token line; K2 for the style)*
- **P2** — The sentence review *(S2, P1)*
- **P3** — Retire the live story call *(P1 — the section it removes is redrawn there)*
- **P4** — The turn log and its flags behind a sheet *(P1)*
- **I1** — The station, the ticket, the train *(D4; W1 for the copy)*
- **I2** — The practice round: the player plays, Casey reacts *(I1, K2, U3)*
- **I3** — The post-match Casey and the door to the case *(I2, P1)*
- **I4** — The tour retold, and the map act *(I3, W1)*
- **I5** — Docs: README's Setup, DECISIONS, the tips *(I1–I4)*

### Parked (deliberately, with a reason)
*(empty — H3 left this list on 2026-08-21: the owner un-parked it, it is
owned by `docs/clue-engine.md` (PR #95), and it is carded here as **E0–E6**.)*

### In progress
*(empty)*

### Done
- **T1** — The train is the way you travel, and a dev switch to ride it *(2026-08-21, PR #97)*
- **E0** — City-only journey boards, closed 2026-08-21 (PR #98) — ordinary
  boards (and free play) now deal from `wordsForCity`, not `unlockedWords`;
  the daily challenge stays global and the wrap-up untouched. The word of the
  day and the suitcase’s ALL filter stay on `unlockedWords` on purpose.
- **WS1** — Apply the word selection — 2026-08-21 (PR #100). 113 out, 113 in,
  `curriculumRank` re-dealt by `scripts/apply-word-selection.mjs`; the ledger
  rule is a hard error in `validate:words` with a mutation recorded.
- **C4** — closed 2026-08-21, "it feels attached enough"; the ride ships as it is
- **C5** — closed unbuilt with it

### Found along the way, not yet carded
- Everything found in the sweep is carded as **X1** below.
- `HearBoard`'s `WORD_MS` was re-measured after the 1.0 bake and is fine —
  1500ms off a 240-clip sample (median 1.01s, p95 1.54). DECISIONS' "not yet
  measured" note is what is stale, and X1 corrects it.
- At 360×640 a card is 44px (its `min-height` floor) inside a 41.5px grid
  row, so every card spills 1.25px into the 8px gap above and below it. Not a
  bug — the gap absorbs it — but it means today's 3×5 is already sitting on
  the floor, which is the measurement N1 turns on.

---

## Cards

### K1 — The composer never changes size
**Size:** 1–2 sessions. **Deps:** none. **Owner's rule, 2026-08-21:** "I don't
want the size of the composer to change ever. Below clue and dictionary should
be enough space for one small line of text where the translation, or the clue
warning can be."

**The shape.** One box, three rows, one height:

```
┌────────────────────────────────────────────────┐
│ [ Your clue            ] [ Dictionary         ] │  field row
│ «nice» looks English — tap it   en hund 🔊 — dog│  ONE line: verdict left · answer right
│ [−] 2 [+]                         [ Give clue ] │  action row
└────────────────────────────────────────────────┘
```

- **The line is shared.** A flex row: the verdict (or the first-time hint) on
  the left, the dictionary's answer on the right, both `min-width: 0` with an
  ellipsis. When only one is present it takes the whole width — that is "the
  translation can move to the left when it is running out of space". When
  both are present the verdict keeps its tappable word and the answer gives
  way first. Measured at 360px with the longest verdict and the longest
  answer on screen together ("nice" has seven glosses in the shipped set).
- **The dictionary answers with ONE entry**, the best local hit —
  article, word, 🔊, first gloss — and tapping the line opens the
  `DictionarySheet` for the rest (every gloss, the example, the 🐢). The
  four-row `translate-hits` scroller, the "Ask Casey" button and the separate
  error paragraph all fold into the same line: Casey is already asked
  automatically once typing settles (`TranslateBox`'s 700 ms effect), so the
  line reads "Asking Casey…", then the answer, or the error. The "on your
  board, so you cannot clue with it" note shortens to "— on the board", dim,
  in the same line. `noteLookup`'s charge is unchanged.
- **Every verdict fits the line.** `checkClueLegality`'s reasons are already
  one clause; the English-looking warning becomes "«nice» looks English — tap
  it, or give it anyway" with the word still the button that fills the
  dictionary. The full sentence survives as the line's `title`/aria text.
- **The O4 first-time hint becomes one line** ("One Danish word. Stuck? The
  Dictionary beside it translates.") — onboarding-drive's regexes (`/One
  Danish word/`, `/Dictionary/`) keep matching. It still shares the `!trimmed`
  moment with the verdict, so they can never stack.
- **Is the composer painted at all? Decide it here.** The owner, on build 23:
  *"there is only a white box that also moves up with the your target and look
  up — but since those get removed I think the white box will go too."* It will
  not. The legend is a bare `<p>`; the white box is **the dock itself**, which
  `.dock` paints `var(--surface)` (`#f7f7f5`) with a border and a radius. K2
  deletes the legend and the box stays.
  PR #90 already took the paint off the *reserve* for exactly this complaint
  ("it's still way too much grey"), leaving the slot invisible and the panel
  content-sized inside it. Taking it off the **panel** is the same move one
  step further: the composer sits on the page ground with a single hairline
  rule above it, and the fields carry their own borders as they already do.
  Recommended, since the board is frozen and the scrim already separates the
  two layers — but it is a design call, so make it deliberately and say so in
  the CSS rather than leaving `--surface` there by inheritance.
- **The height is measured, not declared.** `--dock-h` becomes the composer's
  own fixed height (it will land near 9.25rem — two 44px rows, a 20px line,
  the gaps and padding) and is written down with the measurement in
  `index.css`, replacing the 126/154/191/200 story there. In rem, as today,
  so a large-text phone still fits.
- Nothing in `ClueInput.tsx` may render a fourth row. The stepper-and-send
  row and its "Give it anyway" wrapping rule stay as they are.

**What this ripples into, and the answer for each** (the owner asked for the
list; K2 carries the other docks so this card can land alone):

| Ripple | Why it moves | Answer |
|---|---|---|
| `PlayerGuessBar` (guess phase) | Embeds the same `TranslateBox`, plus a title and a swap row | K2: one line + two rows — title line, hint/stop/confirm row, then Dictionary field beside its answer |
| `AiTurnPanel` (Casey guessing) | U3 wants two lines of reasoning in it | K2/U3: face + a two-line clamped bubble, then the clue/result line |
| `SuddenDeathBar` | Its prose was the give-way region (94px) | K2: one line — "Name greens to win. Anything else ends it." |
| `PackingDock` (wrap-up) | Five rows today, incl. a wrapping ghost button | K2: "Pack «house» — 3 of 12" title, the input row, one line for the miss note, start-early as a nowrap link in the title row |
| `TutorialDock` | 16.25rem, Casey's bubble inside it | I2: the bubble moves into the band the 3×4 board frees; the dock is the real one |
| `.dock-slot` / #90 | The slot held the reserve because docks differed | Once every dock is the same height the panel IS the reserve again; the slot can go or stay as a no-op — K2 decides and says why in the CSS |
| layout-drive "board never moves" | Measures the slot, and the fullest guess-dock state by spill | K2: measures the **panel** rect (x, y, w, h) on every frame instead — a stronger invariant — and asserts the long answer is ellipsized inside its line |
| The key legend line | Not a dock, but 22px between board and dock | K2 deletes it (owner's call); the board takes the space |
| C4's ride | "nothing about the composer changes size while lifted" | True by construction now; `.kb-up` and `--board-h` untouched |
| Board size | Everything above comes off the slot | Measured in K2 and recorded: the 3×5 card row at 360×640 before and after |

**Accept:** verify green; layout-drive shows the composer panel the same
rectangle across typing, an illegal clue, an English-looking clue, a
four-gloss lookup, "Asking Casey…", and the first-time hint — sampled per
frame like the board check; a mutation that adds a second line to the
composer fails it; no scroll at 360×640.

### K2 — Every dock the same fixed height, the legend gone, the drive measuring the panel
**Size:** 1 session. **Deps:** K1.

- Each phase dock redrawn to K1's height: the guess bar (title line → swap
  row → Dictionary field + answer line side by side), the AI panel (ready for
  U3: face + two-line bubble, then one line), sudden death, packing and the
  study dock, as the K1 table says. Titles are `nowrap` + ellipsis: "Casey's
  clue «kæledyr» (2) · 2 guesses left".
- Delete the `key-legend` paragraph in `GameScreen.tsx` and its CSS: the
  border IS the legend (README already says so) and ⓘ explains itself.
- `index.css`: one `--dock-h`; the slot either deleted or kept as a
  documented no-op; the long comment block rewritten with the new measured
  numbers (the composer's height, the board row at 360×640 before/after).
- layout-drive: the "board never moves" block measures `.game-screen .dock`
  (rect, every frame, every phase incl. packing and the tutorial) rather than
  the slot; keeps "stop and confirm share one row"; replaces the spill check
  with "the longest answer is on screen and ellipsized inside its line"
  (`scrollWidth > clientWidth` on the line with «nice» typed); keeps the
  four-gloss requirement as "the sheet opens from the line with four".
- README's board-stability paragraph and CLAUDE.md §"src/ui" re-measured.

**Accept:** verify green; every phase of a normal round AND a wrap-up round
(packing → clues) renders the dock as the same rectangle at 360×640; the
legend is gone and the board is measurably taller (number in the PR).

### U1 — A tap says the word; ⓘ opens the dictionary
**Size:** ½ session. **Deps:** none. **Owner:** "The translation and definition
of the word should only appear if you click on the i symbol and not just the
word. The audio should still play though."

- `BoardGrid.tsx`: `tapLooksUp` goes. Outside a guessing turn a card is still
  a button, and its tap does exactly one thing: `playWord`. ⓘ (`card-info`)
  keeps `onInfoTap` → `useOpenDictionary` (which records the lookup and opens
  the sheet). Face-down cards in packing stay as they are.
- A side effect worth stating in the PR: hearing a word is now free and
  reading its meaning costs a lookup — the card tap used to charge
  `recordLookup` by opening the sheet, so the SRS's lookup signal gets
  cleaner, not noisier.
- aria: "Tap to look up" → "Tap to hear"; ⓘ's label unchanged.
- Drives: smoke-drive's "the tap may have opened the dictionary" tolerance
  (around line 130) becomes an assertion that it did NOT; key-visible-drive's
  card tap at line 87 re-read for what it expects.

**Accept:** verify green; a drive taps a non-guessable card, hears the clip
request, and finds no `.sheet`; ⓘ still opens it.

### U3 — Casey thinks aloud before each guess
**Size:** 1 session. **Deps:** K2 (the fixed AI panel), S1 (the spoken reveal).
**Owner:** "When Casey is guessing I want her to be in the composer and share
her thoughts and reasoning for picking a word before selecting it."

- `AiTurnPanel.tsx` becomes two beats per planned guess, paced in the panel
  (the store keeps the queue; `GUESS_INTERVAL_MS` becomes a think beat and a
  reveal beat): **think** — `ClueyFace` thinking, the bubble shows
  `aiGuessQueue[0].reasoning` (two lines, `-webkit-line-clamp: 2`, the full
  text as `title`), about two seconds; **reveal** — `stepAiGuess()`, the card
  flips, S1 speaks it, the face goes happy/oops, the line says "«hund» — got
  one!" / "— neutral", about a second; then the next. A tap on the panel
  hurries to the next beat — the tutorial's "Watch Casey guess" gesture, so a
  three-guess turn is nine seconds only if you let it be.
- The reasoning is the model's own sentence (the guess prompt asks for "why
  THIS word and not another"); nothing new is requested. Under the player's
  clue it can name any board word without leaking anything — the player
  holds that key.
- The phase caption "Casey is guessing" stays in the header; the confidence
  phrases ("I'm quite sure about…") go — the reasoning says it better.
- ai-drive / smoke-drive / endgame-drive wait on phase changes with timeouts;
  check each tolerates the slower turn or hurries it with the tap.

**Accept:** verify green; a drive reads the bubble text before each reveal
and matches it to the guess that follows; the panel is K2's rectangle in both
beats; reduced-motion users get the same beats without the face animation.

### S1 — Casey's guesses are spoken
**Size:** ½ session. **Deps:** none. **Owner:** "When Casey guesses and selects
words they should also be spoken out."

- When `lastAiGuess` changes in `AiTurnPanel`, `playWord(id, da)`. The sound
  setting already gates `playWord` at the source.
- **Prime on the tap.** iOS grants the audio element its unlock inside a
  gesture, and Casey's guesses are the first sound in the app that does not
  follow one directly. Export a `primeWordAudio()` from `speak.ts` (the
  existing `prime` port) and call it in the composer's Give-clue `onClick`,
  so the element is unlocked before the first guess arrives. The `prime`
  comment says it was never verified on a device: this card is that check —
  one TestFlight build, the owner listens.
- Pin in DECISIONS the amendment to the standing rule: a sound follows a tap,
  **or follows from one** — the ride's Listen button is the precedent (one
  tap, then the chain). Card reveals on the player's own taps stay as they
  are (the confirm button already speaks).

**Accept:** verify green; ai-drive sees a clip request per AI guess; the
owner hears them on a phone with sound on and hears nothing with it off.

### S2 — Bake the 900 example sentences
**Size:** 1 session + one Actions run. **Deps:** none. The other half of the
voice note: the sentences sound different because they are not Aoede.

- **The English voice is the half a learner can actually judge — audition it.**
  The owner's verdict, 2026-08-21: *"the danish aoede sounds nicer. the english
  sounds ai artificial."* Two things make that expected rather than surprising.
  Chirp3-HD voices are **separate per-locale models sharing a character name**,
  not one voice speaking two languages, so quality genuinely varies by locale.
  And more importantly: **you can hear flaws in a language you know and cannot
  hear them in one you are learning.** A Danish learner cannot yet hear wrong
  stress or an odd stød; the same person hears every artefact in English. Since
  most learners will have serviceable English, the English half is the half that
  costs credibility for the whole app.
  The F0 measurement that cleared this in Wave 0 answered a different question —
  it asked "is this the same speaker's pitch", and artificiality lives in
  prosody and phoneme transitions, which a median F0 does not see at all. The
  measurement was not wrong; it was aimed elsewhere.
  **So: run the existing audition workflow over the en-US Chirp3 voices** the
  way it was run over the 35 Danish ones, and pick by ear before baking 900
  English sentences. That is one workflow run against a decision that is
  otherwise repeated 900 times.
- **One request per sentence, never a stitch of word clips.** That is already
  how the ride's sentences are made, and it is what gives a sentence real
  intonation; gluing `hus.mp3` to `er.mp3` would sound like a ransom note.
  Each example is a single sentence, so each is one performance — the
  across-sentences question is S3's, and it does not arise here: five examples
  of five different words are five separate things.
- **ONE source, not two — English is never spoken** (owner, 2026-08-21).
  `scripts/make-audio.mjs` gains `examples` alone (rate 1, out
  `public/audio/<lang>/example/`), slug = the word's own slug (`slugForId`, so
  `speak.test.ts`'s collision proof covers them), text from `exampleDa`. No
  English bake and no slow bake.
  **What that saves and what it kills:** roughly **13 MB** and half the bake;
  `story/en/`'s 31 clips become dead weight (delete with the card); and the
  `TRANSLATION_TAG` device-voice path in `speak.ts` has nothing left to read.
  Decision 8 is settled as Danish-only.
- `speak.ts`: `exampleAudioUrl(wordId, 'da' | 'en')` beside `wordAudioUrl`,
  and `playWord`'s player generalised by variant so the memo, the absent
  set, the ticket and the fallback all apply (fallback: `speakText(exampleDa)`
  / `speakText(exampleEn, …, TRANSLATION_TAG)`). Call sites:
  `RoundSentences`'s `SpeakSentence` (gate on `canPlayWords` now, not
  `canSpeak`), `DictionarySheet`'s sentence 🔊; its sentence 🐢 stretches
  the baked clip at 0.8 with `preservesPitch` — the ride's own "Slower"
  precedent — rather than keeping a device-voice path beside a baked one.
- `bake-audio.yml`: the two sources added, `BAKE_NONCE` bumped; ~1,800
  requests at 8 rps is under five minutes; 53k characters is a couple of
  dollars at list price. New filenames → **no `cacheName` bump**; the
  service worker's `/audio/.*\.mp3$` runtime rule already covers the path.
- **Size, stated in the PR:** expect ~14 MB in the repo and the iOS bundle on
  top of today's 16 MB (Sønderborg's per-sentence sizes scaled) — half what it
  would have been before the English half was dropped. The PWA caches on
  demand and is unaffected.
- **Do not run this before T3.** The sentences are being rewritten to carry the
  grammar; baking them first pays for the bake twice.
- smoke-drive: the "no bake yet" pattern for the new directory (count clips
  in `dist/`, say so rather than fail or pass quietly).

**Accept:** verify green; after the bake commit, a drive hears
`example/<slug>.mp3` from a summary sentence and from the sheet; the manifest
says Aoede for both halves; the repo-size delta is in the PR description.

### S3 — The ride as one performance
**Size:** 1–2 sessions. **Deps:** decision 7b. **Owner:** "it needs to sound
like one performance."

**What is wrong today, precisely.** Every sentence is already one performance
— one request, real intonation, nothing stitched. A *story* is not:
Sønderborg's 31 sentences are 31 independent Chirp3 draws, and this repo has
measured how much Chirp3 varies between draws of the same request (39% on
duration alone, DECISIONS). So the seams are where the telling resets.

**And there is a second, larger obstacle worth naming first.** The ride says
every sentence four times — Danish, English, slow Danish, Danish again
(`rideCycle.ts`). Nothing baked in one pass can sound like one telling while
the structure repeats each line four times. So this card ships **two modes**,
and one bake serves both:

- **Listen to the story** — the chapter start to finish, one continuous
  reading, the current line highlighted as it goes. This is the payoff the
  card is about, and the thing to reach for once the words are packed.
- **Work through it** — today's four-pass cycle, unchanged, for the line you
  want taken apart.

**The bake.** A new source bakes one request per **chapter** rather than per
sentence (`stories-chapter` → `story/chapter/<city>-<n>.mp3`; Sønderborg's
three chapters replace 31 requests with 3, at the same character count and
the same price). Sentence boundaries inside that clip come from a silence pass
at bake time (`ffmpeg -af silencedetect`, present on the Actions runner),
written to `story-timings.<lang>.json`, and **validated**: the number of gaps
must equal the number of sentences minus one, or that chapter fails loudly and
keeps its per-sentence clips. That validation is the whole reason this is safe
to try — it either produces a timing map that is right, or it says so.

**The player.** `TrainRide` plays the chapter clip and seeks: highlighting
compares `currentTime` against the offsets, tapping a line seeks to its
offset, and the cycle's Danish passes become seek-and-stop-at-the-next-offset
inside the same clip. So the per-sentence Danish clips at 1.0 can go
altogether — the chapter clip serves both modes — while `story/slow/` and
`story/en/` stay per sentence, because those passes are per sentence by
nature. Net effect on the repo is a small saving, not a cost.

**A question this raises, worth answering before the bake.** If the English
voice stays the weak link after an audition, the ride's second pass could
simply be **silent** — the English on screen, unread. Nothing pedagogical is
lost: the translation exists to be understood, not listened to, and nobody is
learning English here. It would shorten the ride by a quarter and remove the
weakest audio in the app. Against it: the owner asked for spoken English in the
post-round review (P2) specifically, and a silent pass in one place and a spoken
one in the other is an inconsistency worth being deliberate about. Not decided
here — but cheaper to decide now than after two bakes.

**Fallback, always.** A city whose timings failed validation, or a build with
no chapter clip, plays exactly what it plays today. The ride's existing
device-voice fallback is untouched.

**This is also O5's pipeline.** PLAN.md's uncarded O5 (voice the intro's
welcome) wants the same thing for I1's station and train lines — a few
sentences read as one performance. Whichever lands second gets it for free.

**Accept:** verify green; Sønderborg's three chapters bake, validate, and play
start to finish with the highlight tracking the reading; tapping a line seeks
to it; the four-pass mode still works off the same clip; a chapter with
deliberately broken timings falls back to per-sentence without a visible
error; journey-drive covers both modes; the owner listens and says whether it
reads as one telling.

### D4 — Casey is she
**Size:** ½ session. **Deps:** none — settled 2026-08-21.

- User-facing strings: `cluey-tips.ts:32`, `client.ts:99` and `:294`,
  `companion.ts:293`, `GameScreen.tsx:449`; README (fourteen lines); the
  store listing drafts in `docs/store/`; the PLAN.md Context table's mascot
  row gets a line. Comments may follow or not — they are not copy.
- **Nothing else.** `ClueyFace`, `cluey-*`, `Cluey.tsx`, `markClueyVerified`
  and every storage key stay — CLAUDE.md §5, the `klausVerifiedAt` precedent.
- `prompts.ts` addresses Casey in the second person and needs no change; the
  persona line ("a cheerful travelling suitcase") can carry "she" if the
  model is ever asked to refer to itself in the third person.

**Accept:** `grep -n "\bhe\b\|\bhis\b\|himself" src/ui src/ai README.md`
finds no user-facing line about Casey; drives asserting copy updated.

### D5 — Sudden death becomes the last chance
**Size:** ½ session. **Deps:** none — settled 2026-08-21. Ships in one PR with
D4; they are the same kind of change.

**Owner's call:** "let's call it last chance, because sudden death is Codenames
terminology." Right on both counts — it is Duet's word, and this game has been
shedding Duet's vocabulary since the forbidden words went.

**Copy only, and the split is the `cluey-*` rule again.** The phase identifier
`'suddenDeath'` and the outcome reason `'sudden-death'` **stay**: the outcome is
persisted inside the saved round (`game.outcome`) and `RoundSummary` keys its
copy table off `` `${result}:${reason}` ``, so moving either string orphans
every round in flight and buys a migration for a label. Same for
`SuddenDeathBar` and the drive selectors.

**The player-facing strings, all six of them:**

- `GameScreen.tsx:24` — `PHASE_CAPTION.suddenDeath`, "Sudden death — no clues left"
- `GameScreen.tsx:338` — the dock title, "All or nothing — no clues left"
- `RoundSummary.tsx:56` — `OUTCOME_COPY['lost:sudden-death'].title`, "Sudden death"
- `HowToPlay.tsx:67` — rule 3
- `cluey-tips.ts:42` — "Out of clues is not out of game: sudden death lets you keep naming words."
- README's rules section (lines 84, 88, 129, 132) and the drive comment at 422

**And the one that will collide if nobody looks.** `prompts.ts` names it twice —
once in the shared `rules` block and once inside `paceLine`, which already
says *"This is your **last chance** or close to it"* about the final clue. Rename
the phase without rewording that sentence and Casey's prompt reads "this is your
last chance… the round goes to last chance", which is the kind of thing a model
happily repeats back to the player in a rationale. Reword the pace line at the
same time — "this is the last clue you are likely to get" — and the collision
never exists.

**Worth deciding in the same breath:** whether the dock title stays "All or
nothing" (it is good, and it is not Codenames' phrase) or becomes "Last chance —
no clues left" to match the caption above it. One says the stake, the other says
the name; today they already differ.

**Accept:** verify green; `grep -rn "udden death"` finds nothing outside engine
identifiers, historical comments and this card; a drive reads the caption and
the summary title and sees the new wording; the prompt no longer uses the phrase
twice for two different things.

### X1 — The stale-copy sweep
**Size:** ½ session. **Deps:** none. Everything the board-1 sweep turned up
that is wrong in the tree today.

- **`SettingsScreen` says "4×5 — Standard, 8 clues"; it is 7.** A3 cut the
  token (`config.ts`, `turnTokens: 7`) and the picker kept the old label. It
  is the only place in the app that states a token count, so it is the only
  place that can be wrong about one — and it has been since A3 merged. **N1
  deletes the whole control**, so fix it here only if X1 ships first; if N1
  is closer, let it take the label with it and note the reason in this card.
- **DECISIONS' "Not yet measured: `WORD_MS`" is stale.** It was measured after
  the 1.0 bake — 1500ms off a 240-clip sample, median 1.01s, p95 1.54 — and
  the reasoning now sits in `HearBoard.tsx`. Correct the entry rather than
  delete it; the measurement is the interesting part.
- **PLAN.md's In-progress list conflates H5 and H9.** H5 (the live post-round
  story) shipped whole; the eight unwritten cities belong to H9. Fix the line
  so a session picking up "H5" knows what is actually left.
- **`audition/` is 2.2 MB of 35 voice samples** kept for a decision that has
  been taken. Delete once Kristoffer confirms he is done listening — the clips
  are in git history and the workflow can remake them.
- **Shrink D3 to one edit.** The Pages base is an inline literal in four
  places (`vite.config.ts`'s `base`, `start_url`, `scope` and
  `navigateFallback`) plus two comments. Extract it to one exported constant
  with the value unchanged, so the owner's rename is a single line rather than
  a hunt. DECISIONS' "behind a single constant" correction says there is no
  constant; this makes that sentence true.
- **Owner-only, and worth a line so it is not lost:** about twenty merged
  remote branches have piled up because a session cannot delete one (the agent
  proxy answers a delete refspec with 403 — CLAUDE.md). GitHub → Branches, or
  `git push origin --delete` from your own machine.

**A finding rather than a fix, recorded so it is not lost:** the owner believed
sudden death had been removed from the game. It has not — the engine enters it
at `game.ts:101`, it fires on a quarter to two-fifths of rounds at ordinary
skill, and it is one of only three endings the summary knows. If the person who
designed the game thinks a whole phase is gone, that phase is not announcing
itself. D5 renames it; whether it needs more than a name is a question for the
next round played, not for a card written now.

Checked and found NOT stale, so nobody re-opens them: README's "the train to
Kolding" is an illustrative sentence from the map screen and is right from
Ribe; the backup paragraph that used to promise a file with no API key in it
is already gone.

**Accept:** verify green; the picker's labels match `GRID_CONFIGS`, with a
test tying the two together so they cannot drift again.

### N1 — One board: 3×6, and the sizes go
**Size:** 2 sessions. **Deps:** K1 **and** K2 — measured, a sixth row does not
fit a 360×640 phone until the composer work hands the height back.
**Owner, 2026-08-21:** "We no longer have beginner. We have one standardized
board" — 3×6, eight greens a side, three shared, eight tokens.

**Does it fit?** Measured on the built app in the opening clue phase (a
throwaway probe against `dist/`, not committed):

```
360x640  board area 239.3px · 5 rows of 41.5px · card 44px (its min-height floor) · word 11.5px
         slot 200px · header 58px · legend 17.3px · document 640 of 640
390x844  board area 443.3px · 5 rows of 82.3px · card 82.3px · word 16px
```

A sixth row **today** would be 33.2px — under the 44px floor a card cannot go
below, so the board would overflow (invisibly: flex overflow paints over, the
trap DECISIONS records, and `scrollHeight` would stay honest at 640). Hand
back what K1 and K2 free — the legend's 17.3px plus its 8px gap, and about
52px of dock reserve — and a sixth row measures **46.1px**: above the floor,
and *taller than today's 41.5px rows*. The bigger board makes the cards
roomier, not tighter — but only in that order.

One boundary to settle rather than inherit: `index.css` has `@container
(max-height: 46px)`, which drops the English gloss and shrinks the word on a
card riding its floor. A 46.1px card misses it by 0.1px. Decide which side the
3×6 sits on and re-measure the threshold.

**What it plays like.** 2000 seeded games a cell, both sides cluing up to
three (a copy of `selfplay.test.ts`'s sweep pointed at candidates, not
committed):

```
board                      greens dead tok  g/tok   p=0.6   p=0.7   p=0.8  SD%@.7  clues@1
3x5 today       7/3/6          11    4   6   1.83    67.1    85.4    94.7    38.8     4.18
PLAY 3x6        8/3/8          13    5   8   1.63    74.7    90.0    98.2    24.6     5.00
  (3x6 8/2/8)                  14    4   8   1.75    69.8    87.8    97.2    30.4     5.56
  (3x6 8/4/8)                  12    6   8   1.50    79.8    93.4    98.8    17.9     4.52
tutorial 3x4    5/2/5           8    4   5   1.60    76.2    89.0    96.8    30.8     3.51
```

8/3/8 is thirteen distinct greens over eight tokens: **74.7% at p=0.6**
against today's 67.1%, sudden death on 24.6% of rounds at p=0.7 against 38.8%,
and a perfect pair spends 5.00 of the 8. A little kinder than today, with
thirteen greens a round against eleven — about 18% more green events, which
is what feeds the collection (W1's gate) and what a bigger board is for.

**Why this only works now that there is one board.** Measured, and it is worth
recording because it nearly cost a broken suite: 8/3/8 sits within a point of
the 3×4's win rate, and at `npm test`'s default sample size it lands *above*
it — 75.0% against 74.3% at n=300, 76.0% against 75.6% at n=500, crossing over
only at n=1000. `selfplay.test.ts` asserts `beginner > middle` precisely so
the ordering cannot silently invert again (A3 found it inverted once). With
three sizes, 8/3/8 would have failed `npm run verify` on the sample size alone.
With one board there is no ladder to defend, that assertion has nothing left
to compare, and the number is free to be whatever plays best.

**One thing decided elsewhere that lands in this card's code.**
`docs/clue-engine.md` (PR #95) records the owner's decision that **ordinary
journey boards become city-only** — `dealBoard` draws from `unlockedWords`
today, this city and every earlier one. Its **Card 0 makes that change and
lands first, alone**, by its own instruction. N1 touches the same deal. Read
them together and let Card 0 go first; N1 changes the board's *shape*, Card 0
changes the *pool*, and doing both in one PR would make either hard to judge.

**Shape.**
- `config.ts`: `GRID_CONFIGS` and the `GridSize` union go. One exported
  `BOARD: GridConfig` — `rows: 6, cols: 3, totalWords: 18, greensPerSide: 8,
  greenOverlap: 3, turnTokens: 8, maxNewWordsPerBoard: 6` (the same 1-in-3
  new-word ratio). The 3×4 becomes `TUTORIAL_CONFIG`, beside `WRAPUP_CONFIG`
  and for the same stated reason: it is a mode you enter, not a difficulty you
  keep. `assertConfigConsistent` passes (13 key slots of 18; 8 tokens against
  a floor of 4).
- `settingsStore`: drop `gridSize`. **No migration needed and this is the one
  case where that is true** — the trap CLAUDE.md records three times is
  *changing* a default every save already carries; removing a field is safe,
  because zustand merges `{...initial, ...persisted}` and an orphaned key is
  simply never read. Say so in the commit so the next reader does not assume
  the rule was forgotten.
- `backup.ts`: drop `gridSize` from `PrefsSchema`. `z.object` strips unknown
  keys rather than rejecting them, so **every backup file ever written still
  restores** — check that with a test, since the enum's hard rejection is the
  thing the schema comment warns about.
- `SettingsScreen`: the Board size control goes (which also retires the wrong
  "8 clues" label — see X1).
- `App.tsx`: the `?grid=` switch goes, and with it **27 drive URLs across ten
  drives** (`ai`, `article`, `endgame`, `layout`, `live`, `onboarding`,
  `proxy`, `repeat`, `smoke`, `translate`). Most just drop the parameter; the
  ones that used `grid=standard` to get a big board or `grid=beginner` for a
  short one need re-reading rather than editing blind — layout-drive picks
  standard deliberately, "the widest board, so the tightest layout".
- `gameStore.newGame` loses its `gridSize` option; `NewGameOptions` keeps seed
  and dailyKey.

**Accept:** verify green; the numbers above in `config.ts`'s comment with the
argument, replacing the three per-board essays; `selfplay.test.ts` rewritten —
the escalation tests and the rejected-token test have nothing to compare and
go, the two that still mean something stay (perfect play wins every seed; the
board still has a losing side at p=0.6), and the know-nothing floor keeps one
row; README's board table becomes one row plus the wrap-up; layout-drive green
at 360×640 on the 3×6 with a new assertion — a grid row may never be shorter
than the card's 44px floor.

### N2 — The wrap-up round is the same board
**Size:** ½ session. **Deps:** N1. **Owner, 2026-08-21:** "wrap up boards should
have the same amount of greens like normal rounds… what makes the wrap up
rounds special is the initial translation and no looking up words on the board
with the dictionary."

**So there is one board config in the whole game.** `WRAPUP_CONFIG` stops being
a separate shape and becomes the same 3×6 8/3/8 that Play deals — thirteen
distinct greens, five bystanders, eight tokens. `maxNewWordsPerBoard` stays 0
for the wrap-up deal, which is the only field that still differs, and that is a
property of the *deal* rather than of the board.

**What already makes it special, and needs nothing built.** Both of the things
the owner named are shipped and working:

- **The packing gate.** Every card starts English-side up and you type the
  Danish to flip it (`PackingDock`). A skipped card keeps its English face all
  round and cannot be wrapped.
- **The closed dictionary.** `recordLookup`, `noteLookup` and `translate` all
  refuse while `mode === 'wrapup' && !packingDone`, and `BoardGrid` hides ⓘ
  entirely. The comment in `gameStore` says why: an open dictionary during
  packing "would not be a feature, it would be the answer key".

**What this changes about difficulty, stated plainly.** Today's wrap-up is the
softest board in the game on purpose — 84.8% at p=0.6, against the play board's
67.1% — because the packing gate was meant to carry the difficulty. Making it
the standard board moves it to **74.7%**, so the round gets harder *and* keeps
the gate. That is the owner's call and it is coherent, but two consequences
belong in the commit:

- A wrap-up now packs at most **13** words (the distinct greens) rather than 16.
  Simulated over a full city, that is already priced into W1's pacing numbers.
- Losing costs less than it looks: `finishRound` wraps every card that was
  packed *and* green regardless of outcome, so a lost wrap-up still banks its
  haul. This is the line that keeps a harder ritual from becoming a door that
  locks, and it should be said out loud on the summary.

**Shape.** Delete `WRAPUP_CONFIG` as a distinct shape; `newWrapUpGame` deals
`BOARD` with `wrapUpBias` and the wrap-up word list. `WRAP_UP_UNLOCK` (an alias
of `totalWords`) follows 20 → 18, though W1 removes the gate it feeds anyway.
The packing dock's counts follow the board. `selfplay.test.ts` loses its
wrap-up row — there is no separate board left to measure.

**Accept:** verify green; one exported board config and a grep that finds no
second one; wrapup-drive green on eighteen cards with packing counting to
eighteen; the dictionary still provably closed during packing (that assertion
already exists — keep it, it is the feature now); no scroll at 360×640 in
packing and in the clue phase.

### T1 — The train is the way you travel, and a dev switch to ride it
**Size:** 1 session. **Deps:** none *(reads better after K2, but does not need it)*.
**Owner, 2026-08-21:** "for development I should be able to travel to different
cities via train to play test it… could our train icon be the travel trigger?"

**How travel works today, since the question is fair.** Two taps and neither of
them is the train. `canTravel` opens when all hundred of a city's words are
wrapped; Home then grows a green **"Travel on → Ribe"** button whose only job
is `goTo('map')`; the map screen grows a second button of the same name, and
*that* one calls `journey.travel()`, which runs the ride and lands on `Arrival`.
So the train drawn on both screens — ten wagons filling as you wrap — is pure
readout, and the thing you actually press is a button beside it.

**Make the train the door.** When `canTravel` is true the `TrainProgress`
component becomes the control: full wagons, a soft pulse, and a tap that boards
it. It is the right affordance (the thing you filled is the thing you ride), it
removes Home's extra button, and it removes a measured layout hazard — the
travel button is exactly what Casey's band once overflowed onto, the bug
DECISIONS records as "Casey drawn sliced across the green button". Home's train
boards straight into the ride rather than detouring via the map; the map's
train keeps working the same way.

**And a dev switch, because playtesting nine cities is otherwise a fiction.**
The URL switches already exist and are the honest answer for drives —
`?city=N` jumps to a stop, `?collected=K` and `?wrapped=K` fill it — but they
need a keyboard and they do not exist on a phone. So: put **"Travel to the next
city"** behind the five-tap build-stamp gate in `BuildFooter`, beside the
keyboard readout that already lives there. That gate is `devSwitchesAllowed()`
plus a deliberate gesture, it is already the owner's path, and it ships to
TestFlight where the playtesting actually happens.

**Accept:** verify green; a drive with a fully wrapped city taps the train and
lands in the ride; Home shows no separate travel button; the five-tap dev
travel moves the journey on a build where dev switches are allowed and is
absent where they are not; `journey-drive` and `layout-drive` updated —
including a check that Casey's band clears whatever the train becomes.

### L1 — A dictionary that never needs the network
**Size:** 1–2 sessions. **Deps:** decision 12. **Owner, 2026-08-21:** "how does
the dictionary work right now? is it an api call and can't we just have a
normal smart dictionary?"

**What it does today — it is already smart, and already mostly offline.**
`TranslateBox` asks `lookupLocal` first, which is a real dictionary over the
shipped nine hundred with three indexes built at module load: exact Danish,
English gloss (with "to/a/an/the" stripped), and **stemmed** Danish, so
«hunden» finds «hund» and is marked as an approximate hit. It is instant, free
and offline, and it covers every word the game teaches. Only when all three
indexes miss — a word *outside* the nine hundred — does it wait 700 ms and ask
Casey through the proxy, which is one metered LLM call.

So the answer to the question is: it is not an API call for anything the game
is teaching. It is an API call for everything else, which is most of Danish.

**Why that is still worth fixing.** The lookup is the field you reach for when
you are stuck composing a clue, which means it is reached for *most* when the
word is one you do not know — precisely the case that leaves the local indexes.
Every one of those is a proxy request on a metered budget, it needs a signal,
and on a train it fails. A bundled wordlist would make the dictionary answer
everything, offline, for nothing, and would take a whole class of traffic off
G1's quota.

**Shape.** A build-time artefact, the same shape the audio bake takes: a script
that pulls a Danish–English wordlist, trims it to headword + a few glosses +
part of speech, and emits a compact index the app loads lazily (it is only
needed when the lookup field is used, so it must not sit in the main bundle).
Keep `lookupLocal`'s three-index behaviour and its stemmer over the larger set;
keep Casey as the last resort for what even that misses, which is now rare
enough to be worth the call.

~~**Read this card with H3 open.**~~ *(Struck 2026-08-21: the engine's clue
vocabulary is the 900 ∪ its own book — `clue-engine.md` §2 — so L1 shares
nothing with it. The paragraph stays for the record.)* The clue engine needs a Danish clue
vocabulary with frequency information so it can prefer a word a learner knows
over an obscure near-synonym — and that is **the same file** this card bundles.
Choosing a source for the dictionary alone risks one with no frequency data and
no coverage of the words a clue would want, and the licence has to be answered
once for both. Deciding them together costs nothing; deciding them apart may
cost the wordlist twice.

**The real constraint is licensing, not size.** A 40k-entry list is on the order
of a megabyte compressed, which is nothing beside the 16 MB of audio already
committed. But the source has to be one that may be redistributed in a shipped
app: a Wiktionary extract is CC BY-SA and needs attribution *and* share-alike
consideration, DanNet has its own terms, and a scraped commercial dictionary is
not an option. **Settle the source before writing the script** — that is the
half of this card that can actually go wrong.

**Accept:** verify green; the lookup answers a word outside the nine hundred
with the network cut (offline-drive); the added bundle weight is measured and
stated; the licence and its attribution are recorded in the repo and shown
wherever the app credits things; Casey is still asked when the wordlist misses.

### H3 — The clue engine → **see `docs/clue-engine.md`**
**Superseded 2026-08-21**, within hours of being written, by a parallel
session's report that merged as **PR #95** — and carded as **E0–E6** below
by the orchestration pass the same night. That document is authoritative;
this entry exists so nobody works from the version below.

**What it overturns here.** This card was written assuming H3 was parked
post-launch, needed an embedding key, and would be built on embedding
similarity. The owner decided otherwise, in `clue-engine.md` §3:

1. **H3 is no longer parked** — the scope is all the way to the hybrid.
2. **The book and the matrix are written by Claude in-session**, not baked by
   a keyed model. **No embedding key is needed**, which was this card's stated
   dependency.
3. **The judged matrix is the evaluation backbone; embeddings are an optional
   backstop**, added only if the selfplay table shows missed traps. So the
   embedding analysis below is a fallback, not the design.
4. **Ordinary journey boards become city-only** — they draw from
   `unlockedWords` today (this city and all earlier). That is a change to
   `dealBoard`'s pool and it lands **before** anything else in that document.

**The one thing here still worth keeping**, because it is arithmetic rather
than design: you cannot precompute clues per board. About **10^37** possible
18-card boards from 900 words, 10^19 within a single city — no table has a row
for your position. Whatever the evaluation ends up being, it is evaluated
against the board at runtime, not looked up. And if embeddings are ever used
as the backstop, store the **vectors** (900 × 256 int8 = 225 KB; a 20k clue
vocabulary 4.9 MB) rather than the flat similarity table (17.2 MB) that board
1's summary proposed.

**And one thing that reads better now than when it was written.**
`prompts.ts` already tells the model, in words, to score every non-target
against its candidate clue and reject the clue if any of them fits better.
That paragraph is the objective function, written as an instruction because
there was no engine to run it — which is the same observation
`clue-engine.md` builds its matrix around.

**What this board owes it.** Two of its own cards move:

- **N1** deals the board. City-only changes the pool it deals from, so N1 and
  `clue-engine.md`'s Card 0 touch the same code and should be read together —
  Card 0 lands first and alone, by its own instruction.
- **The pace measurement in W1 survives the change**, and it is worth saying
  why rather than leaving it to be re-run: the simulation drew from
  `wordsForCity(WORDS, 0)`, which is city-only already, and for the first city
  the two pools are identical anyway. So 69–100 rounds holds. For later
  cities under the *current* cumulative pool it is a floor, not a forecast.

### WS1 — Apply the word selection
**Size:** 1–2 sessions. **Deps:** none. **Model:** Opus. **Source:**
`docs/word-selection.md`, "The change to make" — that section is the spec;
this card only says what the orchestration pass adds to it.

- The 113 removals, the 100 from `src/data/generated/` ranks 901–1000, and
  the 13 new words (generated the batch way, appended to a batch so
  `validate-words` traces them; **the owner verifies the 13 in the PR**).
- **Every new word ships with `exampleDa`/`exampleEn` written to both
  budgets** — the scenery-word floor and the grammar chapter of the city it
  lands in (`docs/grammar-da.md`'s closing table). T3 then has 787
  sentences to rewrite, not 900, and none for words that are about to leave.
- The ledger's `greetings and replies` (and `numerals`) classes; the fourteen
  adverbs into `adverbs and particles`.
- `curriculumRank` renumbered 1–900, city 1 untouched, then the POS quota and
  the ≤15-per-domain rule with the 250-rank drift; opposites and
  near-synonyms never deliberately paired.
- **Re-gate the grammar chapters.** `validate-grammar.mjs` will fail on any
  chapter that now uses a word from a later city. Move the word or reword
  the example — this card owns it, and it is the one place a Danish
  sentence gets written without the Danish read having happened; keep such
  edits minimal and list them in the PR.
- `validate-words.mjs`: fail on a ledger headword, on numeral/interjection
  POS, on a broken quota; extend the gloss-collision check to whole cities.
- `measure-function-words.mjs` re-run; the number in the PR. Short of eight
  appearances is T3's problem, stated, not this card's.
- `migrateJourney` clamps checked; per-city wrap count against the new
  membership; `unlockedWords`/`wordsForCity` slices move for everything at
  rank ≥ 101 — E0's tests and `pool.test.ts` re-run.
- Per-city selfplay pins: no city below city 9's clue-hit floor.
- Fix the false sentence in `README.md:216` and `src/lang/types.ts:131`; a
  line in `docs/PLAN.md` where it still says ranks 901–1000 are dropped.
- `audio/da/` and `audio/da/slow/` lose 113 headwords' worth of live clips
  and gain 113 missing ones until WS2 — smoke-drive's "no bake yet" pattern
  already tolerates that; say so in the PR.

**Accept:** verify green; `validate:words` enforces the new rules and a
mutation (a ledger word slipped back in) fails it; the quota table from
`word-selection.md` re-printed for the new set; the grammar validator green
with the edits listed; the 13 new words flagged for the owner.

### WS2 — Bake the new headwords
**Size:** ½ session + one Actions run. **Deps:** WS1. **Model:** Sonnet.

`BAKE_NONCE` bump in `bake-audio.yml`, push; the workflow bakes `words` and
`words-slow` for the missing slugs only (the manifest stamp already skips
baked ones) and commits back. New filenames, so no `cacheName` bump. Delete
the 113 orphaned clips and their manifest rows in the same PR — size is not
the reason (2 GB is the ceiling); a manifest that lists words the dataset
does not have is. Re-run the manifest-vs-dataset cross-check that found
0/0 today and keep it as a test.

**Accept:** both word manifests cover exactly the 900 ids; smoke-drive
counts 900 ordinary and 900 slow clips in `dist/`.

### E0 — City-only journey boards
**Size:** ½ session. **Deps:** none — lands first and alone, before N1.
**Model:** Sonnet. **Spec:** `docs/clue-engine.md` §5 (Card 0), verbatim.

The two display pools (word of the day, the suitcase's ALL) stay
"everything reached" unless the owner says otherwise — the recommendation
in that document, taken as the default so the card does not wait. README's
journey section states the rule; DECISIONS gets the entry with the
reversal (`wordsForCity` → `unlockedWords`, one line).

**Accept:** as §5 — `pool.test.ts`'s two tests rewritten and failing
without the change; journey-drive and layout-drive green.

### E1 — The judged matrix, city 1
**Size:** 1 session of orchestration. **Deps:** E0 (for the city-only
framing only). **Model:** Opus orchestrates; **judges are Opus and Fable
subagents**, votes merged (owner's decision 2). **Spec:** `clue-engine.md`
§6 "Stage 2".

4,950 within-city pairs, ~150 per agent, both models, `M[a][b]` ∈ 0–3
symmetrised by max. `scripts/merge-matrix.mjs` → `src/data/matrix.da.json`
packed as a `Uint8Array`; `scripts/validate-matrix.mjs` in `npm run verify`
(ids exist, symmetry, every `sampler.ts` `conflicts` pair ≥ 2, every
same-`concepts` pair ≥ 1). State the measured size. Keyed by id, so WS1's
renumbering cannot move anything here.

**Accept:** validator green and mutation-checked (a conflicts pair forced to
0 fails); the agent brief and merge rule recorded in `docs/clue-engine.md`.

### E2 — The book, city 1
**Size:** 1 session of orchestration, beside E1. **Deps:** E1's matrix for
the pair section (author the per-word half first if E1 is still running).
**Model:** Opus orchestrates; Opus and Fable authors. **Spec:** §6 "Stage 1".

~25–35 associations a word in both languages with a `why`, strength and
votes; pair clues for every within-city pair with M ≥ 1; the brief as
written (learner-level, never a form/compound/translation of the word, æøå
intact). `merge-book.mjs`, `validate-book.mjs` (legality of every entry
against its own word via the `legality.ts` logic, orthography, counts,
non-empty `why`) in verify.

**Accept:** validator green and mutation-checked (an entry that is a
compound of its headword fails); size stated.

### E3 — The evaluator, the search and the engine companion
**Size:** 2 sessions. **Deps:** E1, E2. **Model:** **Fable.** **Spec:** §6
"Stage 3".

`src/ai/local/evaluator.ts` (`sim`, `scoreClue` with the **directional trap
set** — export `isOpenFor` from projections and pin the rule beside
`game.test.ts`'s), `search.ts` (candidates from the book, subsets of
`aiTargetableIds` sizes 1–4, max coverage subject to margin ≥ θ, θ stated
with its measurement in `config.ts` style), `engineCompanion.ts`
implementing `Companion` with a templated rationale and engine-ranked
guesses respecting `planGuessExecution`'s stop. Seam at `gameStore.ts:216`
for the practice/offline path; the data lazily imported and the chunk size
stated; drives asserting `mok` clues found and re-pointed. The prompt
firewall's byte-identity test extends to anything new.

**Accept:** verify green; a unit test deals a city-1 board and shows the
engine never clues a word that is illegal or a trap above θ; the practice
round plays end to end offline in a drive with real clues.

### E4 — Measure the engine, and decide
**Size:** 1–2 sessions. **Deps:** E3. **Model:** Opus. **Spec:** §6
"Stage 4".

`engine-selfplay.test.ts` — engine-vs-engine, Opus-half clues vs Fable-half
guesser and the reverse, city-1 boards, win rate / mean clues / sudden-death
rate beside the mock floor and the shipped p-curve; bands pinned; the
djb2-hash mutation fails them. `e2e/engine-probe.mjs` (opt-in, spends proxy
calls) for the first honest "as well as the frontier model" number. The
clue ledger (`{number, hits, arm}`) as a small persisted store shown in
Settings diagnostics — `r` finally measured.

**This card ends in a decision, written into `clue-engine.md` and
DECISIONS:** go to E6/E5, or stop at the offline engine. The numbers decide;
the card says which.

### E6 — Matrix and book for cities 2–9
**Size:** 2–3 sessions of orchestration. **Deps:** WS1 landed (the ids and
cities are final), E4's decision. **Model:** Opus orchestrates; Opus and
Fable judge/author. ~33 agents per model per city for the matrix, ~2 per
city per model for the book — about 530 agents; budget it, and run the
cities as separate PRs so a bad batch is one revert.

**Accept:** both validators green for every city; per-city size stated.

### E5 — The hybrid
**Size:** 1–2 sessions. **Deps:** E4's decision (E6 not required — city 1
suffices to ship the validator). **Model:** Opus. **Spec:** §6 "Stage 5".

In order, each its own commit: the evaluator as validator inside
`OllamaCompanion.getClue` with a concrete correction (this alone turns H7's
escalation into a checked trigger); `buildClueCandidatesPrompt` (projection
types only; `projections.test.ts` extended) and the merge with the engine's
search; rank fusion on the guess side; then the `MODEL_ALIASES` flip to a
cheap `cluey` with `escalate`, only once the ledger and the probe say the hit
rate holds. `proxy/README.md` "Making it cheaper" rewritten to the measured
`r`.

**Accept:** verify green; ai-drive's fake server sees the correction text on
a rejected clue; the ledger shows the arm per clue; README carries the
numbers.

### M1 — The 900 Pass: a pricing session, not a card
**Size:** one conversation, then H4. **Deps:** none. **Owner, 2026-08-21:**
"let's have a full launch with h4, but let's have one more brainstorming
session about the pricing… Money shouldn't be in the way of learning."

Nothing here should be decided by a session working alone. What a session *can*
do is put the numbers on the table, and there is one that matters more than the
rest.

**How big is a free city, really?** Simulated over a full city on the new board
(W1's harness): **69–100 rounds** to wrap all hundred words, median, across
skill levels. At four to six minutes a round that is **6–10 hours of play per
city**. So:

- **One city free** ≈ 6–10 hours before the wall. Generous by any mobile
  standard, and it ends at the first arrival — a natural, earned moment.
- **Two cities free** ≈ 12–20 hours, and the wall lands after the second train
  ride, when the ritual is fully learned and the habit is formed.

**The options worth weighing, and what each is really betting on.**

1. **One city free.** Bets that the first arrival is the strongest moment to
   ask, while the reward is fresh. Highest conversion pressure, and the least
   generous read of "money shouldn't be in the way".
2. **Two cities free** *(the current plan)*. Bets that a habit converts better
   than a peak. Twenty hours is a real course by itself, which is either the
   point or the problem.
3. **The whole first city plus a taste of the second.** The wall lands *during*
   a city rather than at an arrival — worse as a moment, better as a hook,
   because an unfinished suitcase is a stronger pull than a finished one.

**The free-code channel, which is the part with the most sharp edges.** An
address in the app that anyone can write to for a free code is a lovely
promise, and it needs three things thought through before it ships: Apple's own
mechanism is **promo codes**, issued per app version and finite, so the supply
is real and worth knowing before it is offered; someone has to *answer* those
mails, and an unanswered one is worse than never having offered; and the offer
should sit somewhere a person in that position will actually look — on the
paywall itself, in plain language, without making them explain themselves.

**Worth putting on the table too:** regional pricing (App Store price tiers
already vary by storefront and can be set per region), and whether the Pass is
one purchase or per-language once German lands — deciding that *before* launch
is much cheaper than after, because the first purchase sets the expectation.

## The recommendation, so H4 is not waiting on a conversation

The owner asked that nothing wait on them. So this is written to be **vetoed
rather than assumed**: it is what H4 should build if nobody says otherwise, and
every part of it is one value to change.

**Free: the first city.** Six to ten hours, ending at the first arrival — the
moment the ride has just played, the suitcase has just been packed and the map
has just opened a new stop. That is the strongest place in the whole game to
ask, and it is generous by any mobile standard. Two cities is a fortnight of
free course and asks at a flatter moment; a city and a half puts the wall
mid-city, which converts better but ends the free experience on a chore rather
than on an arrival. *One value: `FREE_CITIES = 1`.*

**One Pass, every language.** Not per-language. German is the same nine hundred
in another coat, and charging twice for it punishes exactly the learner who
values the thing most — while "buy once, learn everything we ever ship" is a
much stronger sentence on a paywall than "buy once per language". The revenue
trade is real and worth naming: a bilingual learner pays once instead of twice.
Taken deliberately, because the promise is worth more than the second sale, and
because it cannot be walked back after the first purchase without breaking
faith. *Reversal: only before launch. After it, never.*

**Price: the weakest number on this board, and it should be labelled as such.**
Nothing measured here says what a 900-word course is worth to a stranger. What
the plan *can* say is the shape: a **one-time unlock**, not a subscription — the
journey ends, and a subscription on a finite course invites the cancel the week
it finishes. Before submission, price should be set by looking at three to five
comparable one-time language purchases in the Danish and Nordic categories on
the storefronts that matter, not by instinct. Until someone does that, treat any
figure in this repo as a placeholder.

**The free-code channel, specified rather than gestured at.** On the paywall
itself, in plain language, at the bottom, in the same type as everything else:
*"If money is what is in the way, write to <address> and I will send you a
code. You do not have to explain."* Three things it needs to be real:

- **The mechanism is Apple promo codes** — issued per app version and finite
  (a fixed allocation per version), so the supply is a real number and worth
  knowing before the offer is made. Running out silently is worse than never
  offering.
- **Somebody answers.** An unanswered mail on that address is a worse outcome
  than the offer never existing. If that cannot be sustained, an autoresponder
  that sends a code is honest; a silent inbox is not.
- **No justification asked.** The sentence above deliberately does not ask why.
  A form that makes someone prove poverty is the thing this policy exists to
  avoid.

**Also worth setting before launch:** regional pricing, since App Store tiers
vary by storefront and Denmark, Germany and the US should probably not pay the
same; and whether the PWA channel is gated at all (it cannot take StoreKit, so
it is either free forever or it needs its own answer).

**Accept:** the four values above confirmed or overruled, recorded in
DECISIONS.md with reversals, and a price that somebody has checked against real
comparables. Then H4 becomes an ordinary card.

### T2 — The ride teaches the grammar *(the story is retired)*
**Size:** 1 session to build the frame. The nine chapters are **written** —
`docs/grammar-da.md`. **Deps:** none any more; the decision is taken.
**Owner, 2026-08-21:** "the grammar lessons could replace the story."

**The gap it fills.** The game teaches nine hundred words and **zero grammar**.
A player who finishes the journey knows nine hundred Danish words and cannot
put two of them in a sentence — they do not know the article glues to the end
of the noun, that the verb comes second, or where *ikke* goes. That is the
Duolingo complaint, and it is the most defensible thing this app can be
different about.

**Grammar replaces the story.** The ride out of a city now teaches one chapter
instead of telling a hundred-word tale. What that trades away, honestly: the
"you can read this now" moment, and Sønderborg's 31 validated sentences. What
it buys: the eight unwritten stories never have to be written, the hardest
constraint in the project (100/100 coverage in natural prose) disappears, and
the ride finally answers the thing the owner actually wants from a language
app. **Sønderborg's story is kept** — it is written, validated and baked, so it
stays as an optional "read the story" beside chapter 1 and nothing is thrown
away. If it earns its place there, more can follow later; if not, exactly one
exists.

**The nine chapters, written and machine-checked.** `docs/grammar-da.md` holds
them: en/et and the glued definite · plurals · present tense and V2 ·
questions and *ikke* · the past · adjective agreement · pronouns and the
*sin/hans* trap · subordinate clauses and the word that moves · modals and
register.

`scripts/validate-grammar.mjs` (wired into `npm run verify`) checks what a
machine can: **every article claim against `words.da.json`**, so a lesson can
never say *et kat* while the card says *en kat*; and a **vocabulary gate**, so
a chapter told leaving city N never teaches with a word from city N+1. Both
checks were mutation-tested — a flipped article and a forward-reaching word
each fail it.

**A thing worth recording, because nobody arranged it.** The constraint "a
chapter may only use words the player already has" looked like it would be
painful. It is free: the dataset is ordered by frequency, and frequency put 84
nouns in Sønderborg and every core verb in Ribe. So the order the grammar wants
— articles, then plurals, then verbs — is the order the word list already had.

**What a machine cannot check, and this card must not pretend otherwise.**
Naturalness, the irregular edges (`er` vs `har` in the perfect, which
adjectives refuse `-e`), and chapter 9's claims about politeness, which are
cultural rather than grammatical. **A wrong rule is much worse than a wrong
example sentence** — an example is forgotten, a rule is believed and repeated —
and the owner is a native German speaker learning Danish, so they cannot verify
this themselves. The doc opens with that warning. **A Danish speaker reads it
before it ships**, and that is a real gate on this card, not a nicety.

**Two risks kept from the earlier draft.** The study phase was cut once for
being homework, so the chapter is what the ride *is*, arriving after a city is
finished, with Skip working exactly as it does now. And the chapters must
**accumulate** — reachable after their ride, so a skipped one is not lost and a
player reaching København has earned a nine-chapter grammar rather than having
watched nine things go past.

**Accept:** the ride renders a chapter from `grammar-da.md`; the chapters
accumulate somewhere reachable; Skip still skips; `npm run verify` runs the
grammar validator; Sønderborg's story survives as an option beside chapter 1;
and the Danish has been read by someone who speaks it.

### T3 — The next city's sentences reinforce the chapter
**Size:** the writing is the cost — 800 sentences across eight cities.
**Deps:** T2. **Owner, 2026-08-21:** "the example sentences of the next city
should include and reinforce the grammar lessons from the train as much as
possible or makes sense."

**The loop.** You leave Sønderborg and are taught the glued definite. You
arrive in Ribe, and Ribe's hundred example sentences — the ones the post-round
review shows you (P2) — are written to use definite nouns. The rule is met once
on the train and then a hundred times in ordinary play, in words you are
learning anyway. The mapping is in `docs/grammar-da.md`'s closing table.

**Measured, not hoped for.** The same stemmed matcher that proves a ride covers
a city's hundred words can count how many of a city's example sentences contain
a definite form, a plural, a subordinate clause. **The target is a share, not
all hundred** — a sentence forced into a structure it does not want is worse
than one that misses it. Pick the share by measuring what the current sentences
already do before setting it.

**THE ORDERING CONSEQUENCE, and it changes the board.** S2 bakes the 900
example sentences. If those sentences are going to be rewritten, **S2 must not
run first** — baking 900 sentences and then changing them is the bake paid for
twice, plus a second ~14 MB commit. **S2 moves behind T3.** This is the kind of
thing that is obvious afterwards and expensive to notice late.

**Do not write these sentences without `docs/word-selection.md` open.** A
parallel session proposed rewriting the same 900 sentences to a *scenery-word*
coverage floor. The two targets mostly pull the same way — a subordinate clause
is exactly where *fordi* and *hvis* live — but as edits they overwrite each
other. Write to both budgets in one pass, and validate both.

**Accept:** a measured share per city, hit and pinned by a validator in
`npm run verify`; the scenery-word floor from `word-selection.md` §2 hit in the
same pass; the rewritten sentences still pass the dataset's own rules
(`validate:words`); the English glosses updated with them; and S2 baking only
once, afterwards.

### W1 — One gate: a wrap-up is earned, never unlocked by a word count
**Size:** 1–2 sessions. **Deps:** decisions 3 and 4. **Owner:** "I think we
should just have the one [gate] that can be earned by winning rounds. It could
remain as a tip that it's economical to wait till you have 10 words or so
collected before wrapping up." And from the post-game note: "3 won rounds earn
a wrap up."

**Why the structural gate can go.** A wrap-up board needs eighteen words on it
(twenty until N2 moves it to 3×6), not eighteen *collected* words: only the
collected ones were ever wrappable
(`finishRound` wraps packed ∧ green), and the four bystanders on today's
board are collected words that cannot wrap this round anyway. So the board
can be **topped up** — collected words first, then the city's discovered
words, then its undiscovered ones — and the rule becomes: **only a word that
was collected before the deal can be wrapped.** Filler plays like any other
card and counts toward the win; it just goes nowhere afterwards. That is
exactly what makes the owner's tip true: a token spent on eight collected
words packs at most eight, spent on sixteen it packs sixteen.

- **The economy.** `journey/wrapup.ts`: `WINS_PER_WRAP_UP = 3` (settled),
  **no collected-words floor** beyond the one word a board needs in order to
  have anything to pack (settled), `WRAP_UP_BANK_CAP` stays 3.
  `bankAfterRound` takes and returns the win counter too; `srsStore` gains
  `winsTowardWrapUp`, version 3 → 4 with a migrate that keeps the bank and
  seeds the counter at 0 (a token already earned is not taken back —
  generous over strict, R1's precedent). Only normal rounds count, as now.
- **The deal.** `wrapUpWords` fills the board from the three pools in order —
  `WRAPUP_CONFIG.totalWords`, never a literal, so N2's 20 → 18 needs no edit
  here —
  conflicts checked as today; `wrapUpUnlocked` becomes "the collected pool is
  at least the floor". The deal must put **collected words on the keys
  first, structurally** — `weightedOrder` in keygen is a weighted shuffle,
  which is a probability, not a rule — so either keygen learns a
  `greenPool` or the wrap-up deal orders its green slots itself; a test over
  many seeds pins that with ≥16 collected on the board no filler is green,
  and with fewer, filler fills exactly the remaining green slots.
- **The packing phase.** `gameStore` persists `wrappable: string[]` at deal
  time (a new field: old saves rehydrate it undefined → "every word", the
  old rule; no version bump, the `earnedWrapUp` precedent). Filler starts
  Danish-side up with nothing to pack and a quiet mark; `englishFace`,
  `PackingDock`'s count ("3 of 9 packed"), `finishRound`'s `toWrap` and the
  summary's wrapped list all read `wrappable`. "Start with N unpacked" counts
  only wrappable cards.
- **The suitcase.** With the floor gone there are only two states, and the
  second is advice rather than a refusal: no token → "Win 2 more rounds to
  earn a wrap-up"; a token → enabled, with the honest count beside it — **"9
  collected — this board can pack at most 9. A wrap-up packs up to 13."**
  That sentence is the whole of the "economical to wait" guidance and it is
  true rather than nagging: it states what the board would do if dealt now.
  The "Collect N more to open wrap-up rounds" line and its clash wording go.
  The button shows the bank as today.
- **Copy that states the economy:** `CRITICAL_TIPS[3]`, the tour's fourth
  step (`tour.ts` — "win a real round to earn one, and collect twenty", which
  is doubly stale once N2 lands),
  `RoundSummary`'s earned section (P1 shrinks it to one line: "One more win
  for a wrap-up round" / "Wrap-up round earned — 2 banked"), README's
  wrap-up paragraph, `wrapup.ts`'s comment that says THE NUMBER THREE IS
  UNMEASURED.
- **Which gate binds — MEASURED, 2026-08-21**, and it overturned the guess
  that preceded it. A harness played whole cities on the new board through the
  real sampler, the real `createGame` deal and the real scheduler, crediting
  greens exactly the way `finishRound` does, twelve runs a cell:

```
skill  wins/token   rounds to collect 100   rounds to wrap 100   wrap-ups   idle-token rounds
  0.6           1                     100                  101         43                  7
  0.6           2                      75                   81         22                  6
  0.6           3                      69                   82         16                  4
  0.7           1                      94                   97         43                  7
  0.7           2                      78                   80         25                  6
  0.7           3                      75                   78         18                  5
  0.8           1                      98                  101         47                  8
  0.8           2                      84                   86         28                  7
  0.8           3                      73                   78         19                  5
```

  Three things it settles. **Collecting binds at every setting** — wrapping
  finishes three to thirteen rounds after collecting does, never before, so the
  win gate is nowhere near the door and three wins a token is safe. **Three is
  not merely safe, it is FASTER than one** (82 rounds against 101 at p=0.6),
  which is the opposite of what the arithmetic predicted: a token spent on a
  thin pool wastes most of its thirteen green slots, so rationing makes each
  wrap-up fatter — sixteen wrap-ups do what forty-three did. That is the
  measured case for the "economical to wait" tip, and for having no floor:
  the tip does the advising, and the player who ignores it loses a token
  rather than being refused one. And **a city is 69–100 rounds**, which is the
  number M1's pricing session turns on.

  Honest limits, because this is a simulation: the guesser is a hash rather
  than a person, packing is assumed to succeed on every collected card, and no
  lookups are charged. Real play is slower than every figure above — these are
  a floor and an ordering, not a forecast.

**Accept:** verify green; pinned by tests that fail without the fix: the
counter and the bank across wins, losses, wrap-up wins and the cap; a reload
mid-count; a deal with 8, 12, 16 and 25 collected words (greens from the
collected pool first, filler never wrappable, only pre-collected words
wrapped at the end); the suitcase hint in all three states; wrapup-drive and
suitcase-drive updated; the tour's copy re-checked by onboarding-drive.

### P1 — The round summary as one fixed screen, in pencil, with Casey
**Size:** 1–2 sessions. **Deps:** W1 (the token line), K2 (the pencil style is
the board's). **Owner:** "Design upgrade. Remove the celebration emoji. Make
the boxes pencil style like we have the board cards. Have Casey be there.
Only show the stats that matter… keep it as one screen without scrolling."

```
[ Casey, happy/oops ]  We won!  ·  Every green found together.      ← pencil box; confetti on a win, no 🎉
[ 5 new ]  [ 2 collected — hund, kat ]                              ← pencil tiles (the #pencil-edge filter the cards use); the collected tile hides at 0
One more win for a wrap-up round                                    ← W1's one line
[ Sentence review — P2: one sentence at a time, da over en, ● ● ● ● ●, Listen ]
[ Play again ]  [ Home ]        Casey's calls ›                      ← P4's link, text-sized
```

- `RoundSummary.tsx`: `OUTCOME_COPY` loses the emoji; `RoundStats` keeps
  `discovered` and `collected` and drops the city and total tiles (Home and
  the suitcase carry them); the "Collected for Casey" list folds into the
  collected tile as names; the earned section becomes W1's line; the
  `.summary-scroll` wrapper goes — nothing on this screen scrolls, inner or
  outer. `ClueyFace` with the outcome's mood, `cluey-mini` sized up.
- Wrap-up rounds: the tiles read "7 wrapped for good — …" and "3 stayed",
  then the sentences as for any round.
- Sudden death's culprit line stays in the outcome box.
- **The confetti is redrawn in pencil** (owner, 2026-08-21). Today
  `.confetti-piece` is a plain coloured rectangle in a five-colour palette
  that belongs to nothing else on screen. It becomes small hand-drawn scraps
  in the board's own hand — a few `<path>`s in the `cluey-hatch` weight run
  through `#pencil-edge`, tinted from the card palette (`--green`,
  `--line`, the beige) — reusing the deterministic fall animation and the
  `prefers-reduced-motion` rule (line 2894) exactly as they are. Still no
  dependency and still one shot. `Confetti` stays exported for the tutorial's
  win, so I3 gets the same drawing.
- layout-drive's end-screen section (found vacuous once, B1) re-pinned for
  real: the summary with five sentences, both tiles and the token line fits
  360×640 with no document scroll and no inner scroller.

**Accept:** verify green; endgame-drive and smoke-drive assert the new
structure; no scroll at 360×640 and 390×844 in a normal, a wrap-up and a
sudden-death ending.

### P2 — The sentence review
**Size:** 1 session. **Deps:** S2 (the clips), P1 (the slot it sits in).
**Owner:** "…an audio review that automatically plays the sentence with
tracked highlighting and then the English audio translation as well. Like a
mini train ride."

- The ride's mechanism, not a copy of it: `rideCycle.ts` takes the cycle as
  a parameter and exports `REVIEW_CYCLE = [da, en, da]` beside `RIDE_CYCLE`
  (no slow pass — nothing slow is baked for examples); `nextPass` unchanged.
  The highlight follows the pass's side exactly as `TrainRide` does.
- One sentence visible at a time — that is how the section has a fixed
  height: two lines of Danish over one of English, clamped; dots for the
  three-to-five sentences, a tap on a dot jumps; Listen / Pause; the chain
  auto-advances to the next sentence and ends quiet. `pickSentenceWords`'s
  order is the playlist order (new words first; already tested).
- The first sound follows the Listen tap (decision 10). With no clip in the
  build the device voice reads the pass in its own language and the chain
  stops, the ride's bargain.
- `RoundSentences.tsx` keeps the selection logic and loses the list.

**Accept:** verify green; a drive presses Listen and sees the highlight move
da → en → da and on to the next sentence with a clip request per pass; the
section is the same rectangle throughout; works offline once the clips are
cached (offline-drive).

### P3 — Retire the live story call
**Size:** ½ session. **Deps:** P1. Decision 5.

- Delete `requestStory`, `story*` fields, `Companion.getStory` and its three
  implementations, `buildStoryPrompt`, `StoryResponseSchema`, `StoryView`,
  `RoundStory`, and `coverageStore` unless H9's rides read its ledger (check
  `travelStory.ts`; if they do, keep the ledger and drop only the story
  half). `fake-ollama.mjs`'s story branch and the ai-drive assertions on it
  go with them.
- One fewer proxy request per round: G1's "ordinary round is 7–12 requests"
  becomes 6–11; note it in `proxy/README.md` if the number is stated there.
- DECISIONS entry: H5's measurement stays true (the shipped sentences cannot
  teach the function-word tail); H9's rides are now the whole answer to it,
  and the reversal is `git revert` of this commit.

**Accept:** verify green; `grep -rn "getStory\|storyStatus"` finds nothing
outside history notes; ai-drive's fake server log shows no story request.

### P4 — The turn log and its flags behind a sheet
**Size:** ½ session. **Deps:** P1. Decision 6.

- A bottom sheet in `DictionarySheet`'s idiom ("Casey's calls", N turns),
  opened from a text-sized link under the summary's actions; the turn log
  markup and the ⚑ `FlagButton`s move into it verbatim; `feedbackStore`
  untouched.
- If decision 6 is "delete": the log, `FlagButton`, `feedbackStore`,
  `flagsFor`, `flaggedBlock` in both prompts, `flags.test.ts` and the backup
  format's flags field all go — a bigger card, and the prompts lose the one
  correction channel they have. Say so in the PR either way.

**Accept:** verify green; the summary's height is unchanged by the link; a
drive opens the sheet, flags a guess, and the flag reaches the next clue
request (ai-drive's fake server sees the block).

### I1 — The station, the ticket, the train
**Size:** 1 session. **Deps:** D4 (the copy), W1 (nothing said about tokens
here, but the acts are written together). **Owner:** "Maybe we should start at
a train station and Casey asks where we are going. Then inside the train to
kill the time Casey tells the story about how she is looking forward to
collect the first 100 out of 900 words in Sønderborg."

- `OnboardStep` becomes `'station' | 'ticket' | 'train' | 'tutorial' |
  'tour' | 'map'`. Resume markers from older builds: `'train'` (the old
  first act) → `'station'`, `'arrival'` → `'map'`; `flow.test.ts` pins both.
- **Station:** a new pencil scene in the `cluey-hatch` hand — platform edge,
  a sign, the `PencilTrain` pulling in small — Casey beside you. Two lines:
  "Hej! I'm Casey — a suitcase, and your travelling companion." then the
  ticket's question, which is the existing ticket act unchanged
  (`data-act="ticket"`, the confirm card, the `name — endonym` format).
- **Train:** the existing `TrainScene`. Three lines at most: the route
  ("Nine cities, a hundred words in each — nine hundred, door to door"), the
  first stop ("Next stop Sønderborg. Its first hundred words are mine to
  carry home, and I cannot wait"), and the bridge into I2 ("It's a long ride.
  Let's play a round to pass the time."). These are the lines O5 (PLAN.md,
  uncarded) would voice later; shipping them silent first is that card's
  own plan.
- Skip on every act, as today. onboarding-drive's act sequence and its
  "three distinct tapped lines" check updated to the new acts.

**Accept:** verify green; onboarding-drive walks station → ticket → train →
tutorial on a fresh profile, resumes at each marker, and an old `'arrival'`
marker lands on the map act; no scroll at 360×640.

### I2 — The practice round: the player plays, Casey reacts
**Size:** 2 sessions. **Deps:** I1, K2, U3. **Owner:** "Here the player should
already be allowed to guess and play and not be told what to do every time.
That's my biggest critique right now… Since the player clues already it can't
be offline only… I think the tutorial can be made shorter and more concise."

- **Same fixed deal** (`TUTORIAL_WORD_IDS`, `TUTORIAL_SEED`, the 3×4), same
  scripted Casey clues (`TUTORIAL_AI_CLUES`) — so every guessing turn is
  still offline and every claim is still pinnable. What changes is the
  player's side: **no named targets**. Casey clues «dyr» for 2 and the player
  taps whatever they like.
- **Reactive commentary, not a linear script.** `tutorial.ts` replaces
  `TUTORIAL_BEATS` with `commentary(game, event)`: Casey's line for what just
  happened, keyed on phase, whose clue, the card's role on each key and the
  result. `tutorial.test.ts` pins it **exhaustively** — every card on the
  fixed board, under every scripted clue, reachable state by reachable state
  — so no line can claim what the engine does not do. The directional rule is
  taught when a bystander that wears the player's green frame is tapped under
  Casey's clue («barn» is the bait, no longer the order); if the player never
  bites, Casey says it once at their clue turn instead.
- **The player's clue turn:** the real composer (K1) with **three suggestion
  chips** above it — today's canned clues — and free typing. A chip →
  `TutorialCompanion`'s scripted guesses, offline. Free text → the real
  `OllamaCompanion` (decision 9); offline with free text, Casey says "I can't
  hear you on this train — pick one of mine" and the chips stay, never the
  error banner.
- **Casey's band** — face + bubble — sits **above the board**, in the room the
  3×4 frees against the board Play deals (one card row against today's 3×5,
  two against N1's 3×6 — measured at 360×640), tap to advance narration,
  automatic for reactions. The dock below is the real
  fixed composer / guess bar / Casey panel (K2, U3), so the tutorial teaches
  the real screen. `TutorialDock` and `--tutorial-dock-h` go.
- **Shorter:** at most ten narration lines for the whole round (today: 27
  beats). The first one names the goal and the frames in one breath.
- SRS: the words count, no game is recorded — unchanged and pinned.
- onboarding-drive plays **freely** — a legal card per guess beat, asserting
  Casey's line matches the reveal — with one leg through a chip with the
  network cut, and one leg through free text against `fake-ollama.mjs`.

**Accept:** verify green; the exhaustive commentary test fails under a
flipped claim; both drive legs pass; no scroll at 360×640; a reload mid-round
resumes with the same reveals.

### I3 — The post-match Casey and the door to the case
**Size:** ½ session. **Deps:** I2, P1. **Owner:** "The post match can already
mimic the normal UI a little bit. So a big Casey talking and encouraging the
player to tap her to open the case."

- After the win: P1's summary shape — Casey large (Home's `cluey-band`
  idiom), confetti, one line ("We won! Every word we met today is riding in
  me. Tap me — let's open my case."), no stats. Tapping Casey is the door to
  the tour, the gesture Home uses for the suitcase. `Confetti` reused.
- No "Open my case" button: the tap IS the lesson.

**Accept:** onboarding-drive taps Casey and lands on the tour; the screen fits
360×640.

### I4 — The tour retold, and the map act
**Size:** 1 session. **Deps:** I3, W1. **Owner:** "The wrap up explain text
needs to be updated depending on what win token system we settle on. Also
say they need to wrap up the words so they don't break on this long journey
and fall out. After the suitcase we should be led to the map where Casey
explains that to unlock the next city they must collect and wrap up all 100
words from the current city. Then they'll take the train."

- `tour.ts` steps 3 and 4 rewritten to W1: the tray line adds "collected
  words break on a journey this long and fall out — wrapping them up is what
  keeps them"; the button line names the earn rate and the floor as
  constants interpolated, never as literals.
- A **map act** replaces the arrival in the intro: the real `MapScreen`
  under the `SuitcaseTour` overlay idiom (anchors on the current-city dot and
  on the `map-train`): "This is Sønderborg, where we are. To unlock Ribe we
  collect and wrap all hundred of its words — then we take the train." →
  "Let's go" → Home, done flag written. `Arrival` leaves the intro and stays
  exactly as it is for real travel.
- `OnboardStep` from I1 already carries `'map'`.

**Accept:** verify green; onboarding-drive walks tour → map → Home, the
overlay's anchors resolve on the live map, an `'arrival'` marker resumes at
the map act; Home shows zero coach marks; no scroll at 360×640.

### I5 — Docs: README's Setup, DECISIONS, the tips
**Size:** ½ session. **Deps:** I1–I4.

- README's Setup paragraph rewritten to the new acts; the wrap-up paragraph
  to W1; the board-stability paragraph to K2; the voice section to S2.
- DECISIONS entries for every decision in the table above, each with its
  reversal, in the file's own format.
- `CRITICAL_TIPS` re-read against W1 and D4; PLAN.md's O-cards get a pointer
  to this board.

**Accept:** README describes the shipped app; `npm run verify` green.

---

## The sweep of board 1 (`PLAN.md`), 2026-08-21

Every card still open over there, checked against the tree.

| Card | Where it actually stands | Verdict |
|---|---|---|
| **C4** composer rides | Shipped **on** by default and measured on the simulator (`lift -291` for a `kb 291`, the ride starting 14 ms in, drift 0). The owner's TestFlight verdict is the only thing left. | **Still open — and judge it BEFORE K1 lands.** K1 rewrites what is inside the composer; a verdict taken after it cannot separate "the ride feels wrong" from "the new box feels wrong". One build, one answer, then K1. |
| **C5** native composer | Blocked on that verdict. | Unchanged. Closes as unnecessary if C4 passes. |
| **D3** repo/Pages rename | Held for the owner; breaks installed PWAs and saved links. | Still owner-only. **Do it before G2's screenshots**, so the listing carries the final URL. |
| **G2** store readiness | Privacy page and listing drafts in `docs/store/`; screenshots and the submission remain. | **Re-sequence.** K1/K2, N1, P1 and I1–I4 all change what the app looks like. Screenshots taken now are screenshots taken twice. |
| **H9** the train story | Sønderborg is built, playable and on `main` — 31 sentences, three chapters, 100/100 coverage proved against the shipped stemmer. Eight cities unwritten, waiting on the owner reading it. | **Still the gate, and now the bigger one.** S3 changes how a ride is baked, so read and listen to Sønderborg before eight more are written — the prose is the expensive part either way. |
| **H5** post-round story | Shipped and working. | **P3 retires it** (decision 5). It is not "open for eight cities" — that was H9 all along; X1 fixes the line. |
| **O5** voice the intro | Uncarded; O1's lines ship as silent bubbles. | **Re-scope to I1's script.** I1 replaces those lines with the station and the train, so baking O1's would be baking copy that is about to go. Same pipeline as S3. |
| **H2** German content | The seam is live; no `words.de.json` exists. | Unchanged. Two notes for its checklist: I2's reactive commentary is one more per-language asset, and D4's pronoun is a per-language choice too. |
| **H3** the clue engine | **Owned by `docs/clue-engine.md` since PR #95.** Un-parked by the owner, no embedding key needed, judged matrix rather than embeddings, and journey boards become city-only. | Read that document, not this board, for H3. Board 2 keeps only the cross-references: its Card 0 (city-only boards) touches the same pool **N1** deals from, and W1's pace measurement survives the change because it already simulated a city-only pool. |
| **H4** IAP · **H6** voice unlock · **H8** postcards | Not started. | Unchanged. H8 still stacks with the wrap-up reward rather than replacing it. |

**The one thing this sweep changes about board 1's order:** C4's verdict and
D3's rename are both small, both owner-only, and both block work that follows
them. They are worth doing in the next few days rather than at the end.

---

## Read this before picking up a card

Written 2026-08-21 at the end of the session that opened this board, for
whoever works it next.

### Where things are

| | |
|---|---|
| **The cards** | this file. Every card carries its measurement and its reversal. |
| **The order** | "The master plan" above — seven waves, and Wave 0 is cleared. |
| **The live status** | `docs/dispatch/index.html`, published at the artifact URL at the top of this file. The whole board is one `CARDS` array at the bottom of that file. |
| **The grammar** | `docs/grammar-da.md` — nine chapters, checked by `scripts/validate-grammar.mjs` in `npm run verify`. |
| **Board 1** | `docs/PLAN.md`, and the sweep of what is still open over there is at the bottom of this file. |

### The one thing that will bite you: two documents want the same 900 sentences

> **Corrected by the orchestration pass, same night:** `word-selection.md` does
> not rewrite sentences — it removes 113 headwords (sentences and all) and
> adds 113 without any. So the order is **WS1 → T2 → T3 → S2**, not "both at
> once". The paragraphs below stand as written for the record.

`docs/word-selection.md` **was written by a different session on the same
evening as this board**, neither knew about the other, and it **merged to main
as PR #94** while this board was being written. It is authoritative. Read it before touching the dataset or the example
sentences, because it collides with this board in one specific place:

- **Its §2 rewrites the 900 example sentences** to a scenery-word coverage
  floor (every closed-class word in at least eight sentences).
- **This board's T3 rewrites the same 900 sentences** so each city drills the
  grammar chapter taught on the ride into it.

**Doing either one alone overwrites the other.** They are not in conflict as
ideas — a sentence can carry a subordinate clause *and* an under-met scenery
word, and in fact a subordinate clause is exactly where *fordi* and *hvis*
live, so the two targets mostly pull the same way. They are in conflict as
*edits*. Whoever writes those sentences should write them to both budgets at
once, and the validator should check both.

**And both sit upstream of S2**, which bakes the sentences. S2 must be the
last of the three or the bake is paid for twice.

### Two smaller interactions with that document, checked

- **Its first slice renumbers `curriculumRank`**, which moves words between
  cities. That would silently invalidate the grammar chapters' vocabulary
  gate — except that `validate-grammar.mjs` checks exactly this and runs in
  `npm run verify`, so it fails loudly instead. That check was written before
  the collision was known; it turns out to be the guard for it.
- **Its backfill source exists.** The document's step 2 draws replacement
  words from ranks 901+, and D2 trimmed those from `words.da.json` — but
  `src/data/generated/` still holds 1000 entries against the shipped 900, so
  there is a reserve of about a hundred. Verified rather than assumed.

### What is still owner-gated

- **A Danish speaker must read `docs/grammar-da.md`.** The validator checks
  articles and vocabulary; it cannot check naturalness, the irregular edges,
  or chapter 9's claims about register. A wrong rule is believed and repeated.
- **D3, the repo rename** — before wave 7's screenshots, and nothing sooner.

### The conventions this board runs on

Branch from `origin/main`, always: PRs are squash-merged, so a branch stacked
on a merged branch lists an already-merged commit and shows its diff twice.
`git merge-base --is-ancestor` will say NO for work that plainly shipped —
look for the work in the tree, not for its commit. `npm run verify` green
before a PR. Persisted-store changes ship a `version` bump and a `migrate` in
the same commit. Numbers in comments are measured, and when a claim is
load-bearing, check the test *fails* without the fix.

**And update two things when a card lands:** this document, and the `CARDS`
array in `docs/dispatch/index.html`. A status page that is only sometimes true
is worse than none.

## Verification (every card)

`npm run verify` (typecheck + unit + validator + all drives — drives build
first); selfplay measurements re-recorded when boards change (N1); layout-
drive's no-scroll and dock-rectangle assertions; on-device TestFlight check
for every audio card (S1, S2, P2) and the composer (K1, K2); README +
CLAUDE.md updated in the same PR that changes what they describe.
