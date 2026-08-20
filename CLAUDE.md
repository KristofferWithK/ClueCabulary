# Working on 900Words

A Danish vocabulary game played solo on a phone with an AI companion — Casey,
a suitcase with eyes who also carries every word you learn. Vite + React +
TypeScript, shipped as a PWA to GitHub Pages. `README.md` is the
design document — the rules, the measured numbers behind them, and why each one
is what it is. This file is the shorter thing: what will waste your time if you
do not know it.

## Commands

```
npm run verify        typecheck + unit tests + dataset validator + every drive
npm run typecheck     tsc -b
npm test              vitest run
npm run drives        build, then run all 16 browser drives
npm run drives repeat layout      just those two
npm run drives --list             names (19; three are opt-in, not run by default)
npm run validate:words            the Danish dataset's own rules
```

## Five things that have each cost a session real time

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

**4. PRs here are squash-merged, so start every new branch from `main`.** After
a merge, your local branch's commits are content-identical to `main` but not
ancestors of it. Stack new work on top and the next PR lists an already-merged
commit and shows its diff twice.

```
git fetch origin main && git checkout -B <branch> origin/main
```

**5. The app is called 900Words and the mascot Casey, but the code says
neither.** The rename is user-facing copy ONLY. Every identifier keeps the old
name: the `cluey-*` CSS classes, `ClueyFace`, `ClueyMood`, `ConnectCluey`,
`Cluey.tsx`, `cluey-tips.ts`, `markClueyVerified`, every `cluecab-*`
localStorage key, the backup format's `app: 'cluecabulary'` literal, and the
Capacitor `appId com.kristofferwithk.cluecabulary`. This is the
`klausVerifiedAt` precedent — a field named after an even older mascot — and
the reason is that renaming a stored key wipes progress (`src/journey/rescue.ts`
is the apology for the one time that happened) while renaming a class or a
component buys a stale-selector hunt across nineteen drives for a label nobody
sees. `vite.config.ts`'s `base`, `start_url` and `scope` are `/ClueCabulary/`
for a different reason: that is the repo name, and the repo rename is held for
the owner (D3). Move one without the other and the Pages deploy breaks.

So: change a string a player reads, leave everything else. If you are renaming
an identifier, you have misread this.

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

`src/engine/config.ts` states a number for every board choice and the
measurement behind it. Those come from `src/ai/selfplay.test.ts`, which is two
harnesses: a know-nothing floor, and a sweep that walks one dial — the chance a
guess finds a word the clue-giver meant — from that floor to perfect play. Print
the whole table with

```
SELFPLAY_GAMES=2000 SELFPLAY_REPORT=1 npx vitest run src/ai/selfplay.test.ts
```

Two traps in it. The seeds are fixed, so a result is reproducible but *not*
independent of the sample size: change `SELFPLAY_GAMES` and every figure moves a
little, which is why the pins are bands. And the file must not name `process` —
`src/` compiles with DOM libs and no node types, so `process.env` passes vitest
and fails `npm run typecheck`; there is an `envVar` helper at the top for this.

## Layout of the code

- `src/engine/` — pure game rules, no React, no data. `config.ts` holds the
  three boards plus `WRAPUP_CONFIG` and the tuning constants, each with the
  measurement behind it. `packing.ts` grades the wrap-up round's
  English→Danish answers, with the dataset injected rather than imported.
- `src/data/` — the 900 Danish words plus the systems over them:
  `countability.ts` (a stated rule applied to all 366 nouns, not a list of
  exceptions), `gender.ts`, `words.ts` (`classifyClue`).
- `src/srs/` — the scheduler and `sampler.ts`, which decides what is on a board.
  `CARRY_OVER` and `avoid` pull opposite ways on purpose; read the comments.
- `src/ai/` — `projections.ts` is a firewall: prompt builders may import only
  the projection types, so no key data can reach a prompt by accident. Tests
  assert byte-identity under key permutation.
- `src/journey/` — the four word states (`wordState` in `progress.ts`:
  collected needs a green EACH way — one under your clue, one by your guess),
  `wrapup.ts` (the wrap-up board draw), and travel on a packed suitcase.
- `src/ui/` — screens and components. Phone-first; 360×640 is the tight case,
  and **no screen may scroll the document** — layout-drive measures
  `scrollHeight <= innerHeight` on every screen and game phase. Settings
  scrolls inside `.screen-scroll`; the shell never clips (clipping would make
  that assertion lie).
- `e2e/` — browser drives. Each opens the built app in Chromium and uses it.

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
