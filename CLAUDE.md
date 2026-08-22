# Working on 900words

A Danish vocabulary game played solo on a phone with an AI companion — Casey,
a suitcase with eyes who also carries every word you learn. Vite + React +
TypeScript, shipped as a PWA to GitHub Pages. `README.md` is the
design document — the rules, the measured numbers behind them, and why each one
is what it is. This file is the shorter thing: what will waste your time if you
do not know it.

`docs/clue-engine.md` is the **chessbot report / plan** (keyword: *chessbot*): the
report on making a cheap model clue and guess like a frontier one, the four
owner decisions of 2026-08-21 — including that journey boards become
**city-only** — and the staged plan another session picks up from, carded as
**E0–E6**. **E0, E1 and E2 are built**: journey boards are city-only,
`src/data/matrix.da.json` is city 1's judged association matrix and
`src/data/book.da.json` is its opening book. E3 onward is not. Read the
document before touching `src/ai/`, the board pool, or the E-cards — and note
that each landed stage has an "as built" subsection under §6 which **overrides
the spec paragraph above it** (E1 corrected the `conflicts` rule, E2 the `why`
word band and the agent batch size).

## Where the work is planned

`docs/PLAN.md` is board 1 (the reshaping into 900words; O1–O4 shipped).
**`docs/PLAN-2.md` is board 2 and the master plan** — the owner's play notes
from 2026-08-21 carded, board 1's leftovers swept in, and everything sequenced
into seven waves. It opens with a live-status link and closes with **"Read this
before picking up a card"**, which is the handoff: where things are, what is
owner-gated, and the collisions worth knowing about.

`docs/grammar-da.md` is its nine-chapter Danish course, one per leg, checked by
`npm run validate:grammar`. Two documents from parallel sessions the same
evening overlap it and are authoritative where they do:
`docs/word-selection.md` (which words, which city) is carded there as **WS1–WS2**,
and `docs/clue-engine.md` above as **E0–E6**. PLAN-2's section **"The execution
plan, reviewed"** (2026-08-21, orchestration pass) is the current order: four
lanes rather than seven waves, a model tier per card (Sonnet / Opus / Fable —
the `m` field in `CARDS`), and the repo audit of what is stale or in the way.

The live board is `docs/dispatch/index.html`, republished to one artifact URL.
**A card that lands updates PLAN-2.md and that file's `CARDS` array in the same
PR.**

## Commands

```
npm run verify        typecheck + unit tests + dataset validator + every drive
npm run typecheck     tsc -b
npm test              vitest run
npm run drives        build, then run all 17 browser drives
npm run drives repeat layout      just those two
npm run drives --list             names (23; six are opt-in, not run by default)
npm run validate:words            the Danish dataset's own rules
node scripts/validate-words.mjs --lang de    once a second dataset exists
node scripts/make-audio.mjs --source words --dry-run   what a bake would cost
```

## Seven things that have each cost a session real time

**1. `npx tsc --noEmit` checks nothing here.** The root `tsconfig.json` is
`files: []` with project references, so that command exits 0 on a tree full of
type errors. Every "TS is clean" it has ever reported was vacuous. The real
check is `npm run typecheck` (`tsc -b`). It has since caught a
`newStats(w.id, NOW)` call in a test that vitest ran happily with a word id
where a timestamp belonged.

**2. The drives serve `dist/`, so build first or you are testing the last
build.** `e2e/preview-server.mjs` runs `vite preview`. Running a drive against
an unbuilt tree measures the *previous* bundle and looks exactly like a broken
feature — it has already produced one confidently-wrong measurement here, where
a fix was reported as not working because it simply was not in the bundle.
`npm run drives` builds first for you. `--no-build` opts out when you mean to.

**3. Changing a default in a persisted store does nothing for a device that
already stored one.** Three separate features shipped broken this way
(`studyPhase`, `clueLanguage`, `gridSize`): the default moved, every existing
phone kept the old value, and the change was invisible to the only player.
`settingsStore` has no `partialize`, so *every save ever written* carries every
field. A default change needs a `version` bump and a `migrate` step in the same
commit. `settingsStore.test.ts` documents all three.

**The mirror image is NOT the same trap, and it costs a session to relearn:
REMOVING a persisted field needs no version bump and no migrate step.** N1
deleted `gridSize` and deliberately added nothing — `persist` merges
`{...initial, ...persisted}`, so an orphaned key is spread into state, read by
nothing, and written straight back out. There is no wrong value to fix because
there is no reader. Same for the backup file: `z.object` STRIPS unknown keys
rather than rejecting them, so every backup a player has ever kept still
restores. Both are pinned (`settingsStore.test.ts` "the retired board size",
`backup.test.ts` "restores a backup written before N1").

And one thing the seam adds to it: word ids carry their language (`da:mor`),
so anything keyed by a word id is ALREADY partitioned and must not be
namespaced again. `srsStore.stats` and `journeyStore.wrapped` hold every
language in one store on purpose. What genuinely needs namespacing is anything
route-relative — a city index counts different cities on a different route.
The reasoning, and the list of what is deliberately shared, is at the bottom of
`src/lang/index.ts`.

**4. PRs here are squash-merged, so start every new branch from `main`.** After
a merge, your local branch's commits are content-identical to `main` but not
ancestors of it. Stack new work on top and the next PR lists an already-merged
commit and shows its diff twice.

Two consequences worth knowing before you go looking. `git merge-base
--is-ancestor` will say NO for work that plainly shipped, and so will a search
for the squash SHA — the web container clones SHALLOW (~68 commits), so old
history is simply absent rather than missing. To ask whether a branch's work
landed, look for the work itself in the tree, not for its commit. And **a
session cannot delete a remote branch**: the agent proxy answers a delete
refspec with `403`, and the GitHub MCP server has `create_branch` and no
counterpart. So merged branches accumulate and only the owner can clear them
(GitHub → Branches, or `git push origin --delete` from their own machine).
`ios-sim.yml` force-pushes one `sim-film/latest` branch for exactly this
reason; the numbered `sim-film/9…15` are litter from before that.

```
git fetch origin main && git checkout -B <branch> origin/main
```

**5. The app is called 900words and the mascot Casey, but the code says
neither.** The rename is user-facing copy ONLY. Every identifier keeps the old
name: the `cluey-*` CSS classes, `ClueyFace`, `ClueyMood`, `ConnectCluey`,
`Cluey.tsx`, `cluey-tips.ts`, `markClueyVerified`, every `cluecab-*`
localStorage key, the backup format's `app: 'cluecabulary'` literal, and the
Capacitor `appId com.kristofferwithk.cluecabulary`. This is the
`klausVerifiedAt` precedent — a field named after an even older mascot — and
the reason is that renaming a stored key wipes progress (`src/journey/rescue.ts`
is the apology for the one time that happened) while renaming a class or a
component buys a stale-selector hunt across twenty-three drives for a label
nobody sees. `vite.config.ts`'s `base`, `start_url`, `scope` and
`navigateFallback` all read one exported `PAGES_BASE_PATH` constant (`/ClueCabulary/`,
X1) for a different reason: that is the repo name, and the repo rename is held
for the owner (D3). Move it without also renaming the repo and the Pages
deploy breaks.

So: change a string a player reads, leave everything else. If you are renaming
an identifier, you have misread this.

**6. Audio is baked per SOURCE, and the app finds a variant by its directory.**
There is no `playbackRate` in the word path and no rate in the app at all: a
word's ordinary clip is `audio/da/hus.mp3` and its slow one is
`audio/da/slow/hus.mp3`, both real synthesis, and the ride's sentences have a
third — `story/en/` — for the translation it says between them. Three things
follow that have each got in the way already.

The key is an Actions secret, so **a bake cannot happen in a session**: edit
`scripts/make-audio.mjs`, bump `BAKE_NONCE` in `.github/workflows/bake-audio.yml`
and push, and the workflow bakes and commits the clips back to your branch
(~9 minutes for the words, ~1 for the sentences). Between that push and that
commit the tree genuinely has no clips for the new set — which is why
smoke-drive and journey-drive count what is in `dist/` and say "no bake yet"
rather than either failing or passing quietly.

Re-baking into filenames that already exist needs the service worker's
`cacheName` bumped in the same commit (`vite.config.ts`), or an installed phone
keeps the old audio for a year. And durations are measured in a browser, never
from byte size: DECISIONS.md records Chirp3 answering the same request 39%
longer on a second draw.

**7. A fresh profile opens in the TRAIN, not on Home.** Onboarding owns
first-run since O1, and the gate (`src/onboarding/flow.ts`) opens only for a
device with no onboarding key, no `cluecab-howto-v4` and an empty SRS map — so
your own phone never sees it, and Settings → *Replay the intro* is how you look
at it. What this costs a session is drives: `?howto=0` suppresses the intro,
and every drive URL that wants to start on Home carries it — the exceptions
are onboarding-drive and smoke-drive, which ride the intro on purpose. So a
NEW drive written without that param opens in Casey's introduction and fails
on a Home selector that is perfectly correct. `?onboard=1` forces a transient
run for the opposite case, and neither switch writes anything. The intro
REPLACES the screens rather than covering them (App.tsx), so while it is up
there is no Home in the DOM to query.

## The rule that is easiest to get backwards

A guess is judged against the **clue-giver's** key and nothing else.

That survived the removal of forbidden words and is still the rule everything
turns on. Under *your* clue, Casey's guesses are read off *your* key — a card
that is green on his and not on yours costs the turn. Under *his* clue it is his
key that is read, so the same card is worth finding. A bystander reveal is
therefore **directional**: it burns the card for the side that named it
(`Reveal.against`) and leaves it live for the other, which is why
`isGuessable` and `targetableGreenIds` both check `against` rather than just
`kind`. Sudden death is the only exception — no clue-giver, so a green on either
key counts and anything else ends it.

I have written this backwards in six places at once. `game.test.ts` pins it and
two engine mutations were checked to fail it. Re-read that suite before the UI
copy.

**Forbidden words are gone; do not put them back by accident.** `CardRole` is
`'green' | 'bystander'` and nothing on a board is fatal. If you find a comment,
a prompt or a piece of copy that assumes a third role or a "last chance"
translate-everything ending, it is stale — the removal is commit `a4517bf`
(PR #62) and the prompts followed in `8e101d7` (PR #64).

## Board numbers are measured, and there is a harness for it

**There is ONE board config in the whole game: 3x6, eighteen words, eight
greens a side, three shared, eight clue tokens (`BOARD` in
`src/engine/config.ts`).** The three sizes, the `GridSize` union, the Settings
picker, the persisted `gridSize` and the `?grid=` dev switch are all gone
(N1). One other config exists and is not a difficulty: `TUTORIAL_CONFIG` (3x4,
the scripted first round) — a mode you enter, not a size you pick. There used
to be a second, `WRAPUP_CONFIG` (4x5, ten greens a side) under the packing
ritual; N2 (2026-08-22) deletes it as a shape of its own — `newWrapUpGame`
deals `BOARD` now, on the owner's call that a wrap-up round should carry the
same number of greens as any other and lean on the packing gate and the closed
dictionary for its difficulty. A wrap-up round now packs at most thirteen
words a round (BOARD's distinct greens) rather than sixteen, and its own
engine win rate drops from 84.8% to BOARD's 74.7% at p=0.6 — `finishRound`
still wraps every packed-and-green card regardless of the round's outcome, so
losing a harder wrap-up costs nothing it did not already risk. If you find a
drive URL carrying `?grid=`, a test walking `['beginner','middle','standard']`,
or an import of `WRAPUP_CONFIG`, it is stale.

`src/engine/config.ts` states a number for every board choice and the
measurement behind it. Those come from `src/ai/selfplay.test.ts`, which is two
harnesses: a know-nothing floor, and a sweep that walks one dial — the chance a
guess finds a word the clue-giver meant — from that floor to perfect play. It
also prints the neighbours the shipped board was chosen over, which are not
asserted: the ordering test that used to defend the ladder went with the ladder.
Print the whole table with

```
SELFPLAY_GAMES=2000 SELFPLAY_REPORT=1 npx vitest run src/ai/selfplay.test.ts
```

Two traps in it. The seeds are fixed, so a result is reproducible but *not*
independent of the sample size: change `SELFPLAY_GAMES` and every figure moves a
little, which is why the pins are bands. And the file must not name `process` —
`src/` compiles with DOM libs and no node types, so `process.env` passes vitest
and fails `npm run typecheck`; there is an `envVar` helper at the top for this.

## Layout of the code

- `src/engine/` — pure game rules, no React, no data. `config.ts` holds
  `BOARD` plus `TUTORIAL_CONFIG` and the tuning constants, each with the
  measurement behind it. `packing.ts` grades the wrap-up round's typed
  answers, with the dataset injected rather than imported. Since the language
  seam it takes a **language pack** the same way: `checkClueLegality`,
  `matchesAnswer` and `applyEvent` all have one as a parameter, and nothing
  under `src/engine/` may import one.
- `src/lang/` — the language seam, and the first place to look before adding
  anything language-shaped. One pack per language; `types.ts` is the interface
  and its top comment is the checklist for German (H2). `src/lang/index.ts`
  holds the registry AND the note on what is namespaced per language and what
  is deliberately not — read that before touching a store.
- `src/data/` — the 900 words plus the systems over them. **Which** 900 and
  which city each belongs to was decided in `docs/word-selection.md` (keyword:
  word selection) — decided 2026-08-21, and applied and baked since (WS1 PR
  #100, WS2): the 113 words that cannot be clued are out, 113 replacements are
  in. Read the document before touching `curriculumRank`,
  `function-words.da.json` or the batches — it is still the record of *why*
  the current dataset is shaped this way. `dataset.ts`
  (`createDataset(pack)`, which builds the indexes and `classifyClue`),
  `words.ts` (the same thing bound to the active pack), `gender.ts` (prints
  whatever genders the pack declares). The Danish-specific parts —
  countability, the stemmer, the compound linkers — live in `src/lang/da/`.
- `src/srs/` — the scheduler and `sampler.ts`, which decides what is on a board.
  `CARRY_OVER` and `avoid` pull opposite ways on purpose; read the comments.
- `src/ai/` — `projections.ts` is a firewall: prompt builders may import only
  the projection types, so no key data can reach a prompt by accident. Tests
  assert byte-identity under key permutation.
- `src/journey/` — the four word states (`wordState` in `progress.ts`:
  collected needs a green EACH way — one under your clue, one by your guess),
  `wrapup.ts` (the wrap-up board draw), travel on a packed suitcase, and
  `rideCycle.ts` — the four passes the train ride says each sentence in.
- `src/onboarding/` — the intro a fresh device opens into, and the first
  place to look when a drive lands somewhere unexpected. `flow.ts` is the
  GATE and the resume marker; `tutorial.ts` holds the scripted round's
  fixed board, seed and script (pinned against the engine by
  `tutorial.test.ts`); `tour.ts` is the spotlight walked over the REAL
  suitcase screen, anchored by selector so it cannot drift from it. The
  screens live in `src/ui/screens/OnboardingScreen.tsx`.
- `src/ui/` — screens and components. Phone-first; 360×640 is the tight case,
  and **no screen may scroll the document** — layout-drive measures
  `scrollHeight <= innerHeight` on every screen and game phase. Settings
  scrolls inside `.screen-scroll`; the shell never clips (clipping would make
  that assertion lie).
  **Every dock in the game screen is one height, `--dock-h`, and there is only
  one of it (K2).** The composer, the guess bar, Casey's panel, the last-chance
  bar, the study dock and the wrap-up packing dock all declare
  `height: var(--dock-h)` — 9.375rem, which is the composer's own measured
  149.41px rounded up — so the flex board above them is handed the same
  leftover in every phase. There is no `.dock-slot` any more and no
  `--dock-slot-h`: the panel IS the reserve again, which is the whole of K2.
  What that costs you is that **a dock may not grow a row.** Each has three
  regions and exactly one that may vary, marked as the give-way region in
  `index.css`; a fourth row does not lengthen the dock, it hangs over the board
  and lengthens the *document*, which is what layout-drive's spill and
  no-scroll checks are for. Re-measure with `e2e/dock-probe.mjs` (opt-in,
  prints, asserts nothing) rather than reasoning about it — the study dock came
  in 0.2px TALLER than the composer on the first draft and nothing on screen
  said so. Measured at 360×640 after K2: board 318.56px, card row 57.31, dock
  150 at y=478, document 640 of 640. N1 then spent that row height on a sixth
  ROW: the same 318.56px board, six rows of 46.42, cards 46.42-47.34, document
  still 640 of 640. **A grid row may never be shorter than `.word-card`'s 44px
  `min-height` floor** - under it the card refuses to shrink, overflows its
  track and paints over the dock while `scrollHeight` stays honest, so
  layout-drive asserts the floor directly at 360x640 and 390x844. And
  `.word-card`'s `@container (max-height: 46px)` queries the card's CONTENT
  box, not its height: a 46.42px card is a 27-30px query, which is why that
  threshold is nowhere near the boundary it looks like it is on.
  That rule does NOT catch a Home band that grew too tall: a flex column
  overflows by painting OVER what is below rather than lengthening the
  document, so `scrollHeight` stays honest while Casey's name is drawn sliced
  across whatever is under him. The check that catches it is layout-drive's
  "Casey's band clears the train it boards", and it is what sets the ceiling on
  `.home-map`'s height — measured at 25vh and 30vh, both of which overlap at
  360×640 with no-scroll still passing. `e2e/home-space-probe.mjs` (opt-in)
  prints the budget that height is chosen against, including how much of the
  map's card is empty.
  That check used to be called "Casey clears the travel button", and there is
  no travel button on Home any more (T1): the TRAIN in the progress band is the
  control — tapping it boards straight into the ride — and the state that used
  to cost 61px under Casey now costs 12px of button padding above him. Do not
  go looking for `.btn-travel`; on Home it is `.train-board`, and the map keeps
  its own `btn-primary`.
- `e2e/` — browser drives. Each opens the built app in Chromium and uses it.
- `ios-plugins/` — vendored native forks, installed as `file:` npm packages
  (`npm ci` installs them from the tree; their `dist/` is committed, which is
  why `.gitignore` says `/dist` and not `dist`). `cluecab-keyboard` is
  @capacitor/keyboard 8.0.5 plus one payload field, and its naming is
  load-bearing: the SPM package and product are `CluecabKeyboard` because the
  Capacitor CLI derives that from the npm name (`fixName`) — rename the npm
  package, the SPM names, or the `KeyboardPlugin` class and `cap sync` writes
  a manifest that no longer links. `ios/App/CapApp-SPM/Package.swift` is a
  build artifact of `cap sync`: regenerate it, never hand-edit.

## What a change is expected to come with

Unit tests are cheap and the drives catch a different class of bug — several
real ones here were true in the module and false in the app. When a claim is
load-bearing, check that the test *fails* without the fix: this repo has caught
two vacuous suites that way, and both mutation checks are recorded in the
commits that added them.

Numbers in comments and in `README.md` are measured, not estimated. If you
change something they describe, re-measure rather than reasoning about it —
several confident predictions here have been reversed by a probe, including one
where giving Casey his own key while guessing made him measurably *worse*.

## Environment

Chromium is pre-installed at `/opt/pw-browsers/chromium` and
`PLAYWRIGHT_BROWSERS_PATH` points at it. **Never run `playwright install`** — it
re-downloads ~150MB that is already on disk. `.claude/hooks/session-start.sh`
installs npm dependencies on a fresh web container and exports `CHROMIUM_PATH`.
