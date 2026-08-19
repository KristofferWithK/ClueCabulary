# 900Words — Production Kanban

This board replaces the original build plan (M0–M8, fully shipped — see git
history). It is the working plan for reshaping ClueCabulary into **900Words**
and launching it on the App Store. Sessions pick up cards from it; the board
sections below are the live status.

## Context

The game already ships as a Capacitor iOS app (TestFlight pipeline working) and
a PWA. The API-key era is over: settings v7 cleared keys and the app talks to
the origin-locked Cloudflare proxy (`cluecabulary-proxy.kristoffer-kai.workers.dev`,
model alias `cluey`).

**Decisions settled with Kristoffer (2026-08-19):**

| Decision | Choice |
|---|---|
| Forbidden words | **Removed everywhere**, wrap-up included. Redemption (translate-everything last chance) **retired** — typed recall lives on in wrap-up packing. |
| Dataset | **9 cities × 100 = 900.** Drop frequency ranks 901–1000 and one route stop (default Viborg — confirm on pickup). |
| Mascot | **Casey the suitcase.** User-facing copy only; code identifiers, CSS classes (`cluey-*`), storage keys unchanged (the `klausVerifiedAt` precedent). |
| Launch scope | **Free v1**, Danish only, **baked neural TTS launch-blocking**. German, semantic layer, IAP = fast-follows. |
| App identity | `appId com.kristofferwithk.cluecabulary` **stays**. Display name becomes "900Words". |

## How to work this board

- Pick the **top-most card in Ready**. Move it to In progress (add the date),
  work it, and in the same PR that finishes it: move it to Done with the PR
  number and promote any card whose dependencies are now all Done from Blocked
  to Ready.
- One card ≈ one session. Don't split a card across PRs unless it says so.
- Every card: branch from `origin/main` (squash merges), `npm run verify`
  green, README + CLAUDE.md updated in the same PR when the card changes what
  they describe, measured numbers re-measured (selfplay/drives), persisted-store
  changes ship `version` bump + `migrate` in the same commit.

---

## Board

### Ready
*(empty — next up: A2 and B1 unblock when A1's PR merges)*

### Blocked
- **A3** — Re-tune boards by measurement + rules docs rewrite *(needs A2)*
- **C1** — The board never moves *(needs A2 — the stake note dies there first)*
- **C2** — Home rework: nudge bug, Casey hero, one-line progress, scribbled map *(needs B1; Casey name lands with D1)*
- **D1** — Rebrand copy: 900Words + Casey + English chrome *(needs A3 — copy describes final rules)*
- **D2** — Dataset 900 + city removal + migrations *(needs A3)*
- **D3** — Repo/Pages rename + ASC display name *(needs D1)*
- **E1** — Suitcase interior redesign *(needs D1)*
- **F1** — Baked TTS pipeline + playWord + wiring *(needs C1)*
- **F2** — Post-round sentences v1 + hear-the-board *(needs B1, F1)*
- **G1** — Proxy quotas + friendly 429 *(anytime after A2; before launch)*
- **G2** — Store readiness + release *(needs everything above except C3)*

### In progress
- **A2** — AI layer + game-screen copy for the new rules — agent running (dispatched 2026-08-19)
- **B1** — Round summary: stats + collapsible transcript — agent running (dispatched 2026-08-19)

### Done
- **A1** — Engine: forbidden words out, redemption retired — merged 2026-08-19 ([PR #62](https://github.com/KristofferWithK/ClueCabulary/pull/62), squash a4517bf)
- **C3** — Keyboard ride behind cluecab-kbfast, ships off — merged 2026-08-19 ([PR #63](https://github.com/KristofferWithK/ClueCabulary/pull/63)); awaiting the owner's on-device slo-mo A/B before flipping the default

### Fast-follows (post-launch backlog, in order)
- **H1** — Language-pack seam (i18n architecture)
- **H2** — German content: 900 words, Germany route, German audio *(needs H1)*
- **H3** — Semantic local layer (build-time similarity tables → good offline companion)
- **H4** — 900 Pass IAP (StoreKit, first 2 cities free)
- **H5** — LLM sentence stories + function-word coverage tracking
- **H6** — Voice-recognition wrap-up unlock (prototype first)
- **H7** — Cascade tier on the proxy (cheap model + flagship escalation)

---

## Cards

### A1 — Engine: forbidden words out, redemption retired
**Size:** 1–2 sessions. **Deps:** none.
- `src/engine/config.ts`: delete `forbiddenPerSide/forbiddenBothSides/forbiddenVsGreen/forbiddenVsBystander`
  from `GridConfig`; delete `REDEMPTION_AFTER_ROUND` + its assertion in
  `assertConfigConsistent`. Freed slots become bystanders for now (3×5: 2
  neutrals → 4); A3 re-tunes.
- `src/engine/types.ts`: `CardRole` → `'green' | 'bystander'`; `Reveal` loses
  `forbidden`; `Outcome` loses `forbidden-hit`/`forbidden-failed`/`redeemed`;
  delete `GameState.redemption`, `SUBMIT_REDEMPTION`, `RedemptionResult`.
- `src/engine/game.ts`: delete the forbidden branch + redemption dealing in
  `GUESS`; sudden death keeps its rule (any non-green ends it) minus the
  forbidden reveal special-case.
- `src/engine/keygen.ts`: drop the `hazard` tier → `recall | produce | filler`.
  SRS bias still steers struggling words to `recall`; the "known words become
  hazards" channel is gone (README note in A3).
- Delete `src/engine/redemption.ts` + test; **keep `packing.ts`** (wrap-up
  grader). Delete `src/ui/components/RedemptionView.tsx`; strip the redemption
  phase from `GameScreen.tsx`.
- `src/stores/gameStore.ts`: delete `redemptionDraft`, `setRedemptionAnswer`,
  `submitRedemption`; `buzz` loses the forbidden pattern; daily-outcome reader
  tolerates stored `'redeemed'`. **Version bump + migrate: discard any
  in-flight persisted game** (may hold forbidden reveals) — one abandoned
  mid-round on update is acceptable.
- Tests: rewrite `game.test.ts` forbidden pins (keep the clue-giver's-key rule
  pinned for greens/bystanders); keygen invariants. Drives: delete
  `e2e/redemption-drive.mjs`; update `endgame-drive`, `smoke-drive`,
  `wrapup-drive`.
- **Accept:** verify green; grep finds no `forbidden`/`redemption` outside
  history notes and A2's pending AI files.

### A2 — AI layer + game-screen copy for the new rules
**Size:** 1 session. **Deps:** A1.
- `src/ai/prompts.ts`: rewrite `RULES` (no forbidden); clue prompt drops the
  forbidden block, keeps + sharpens distractor-avoidance (blueprint's
  adversarial lookahead: "score every non-target against your clue; name the
  riskiest neutral"); guess prompt updated; debrief prompt untouched (B1
  deletes it).
- `src/ai/projections.ts`, `schemas.ts`, `mock/mockCompanion.ts`: forbidden
  fields removed; firewall invariance tests still pass. `clue-hazards.test.ts`
  retired or repurposed for neutral-avoidance.
- `GameScreen.tsx`: legend loses the forbidden swatch; `PlayerGuessBar` loses
  the stake-note paragraph; phase captions checked. `HowToPlay.tsx` rewritten
  for the new rules.
- **Accept:** verify green incl. `ai-drive`; a full round plays in
  `smoke-drive`.

### A3 — Re-tune boards by measurement + rules docs rewrite
**Size:** 1 session. **Deps:** A2.
- Rerun the selfplay harness (`src/ai/selfplay.test.ts`) per board: win rate,
  sudden-death rate, mean clues used. Adjust `turnTokens`/`greenOverlap` only
  if measurement says so; record the new numbers in `config.ts` comments.
- Rewrite README's rules sections (forbidden words, redemption, measured
  percentages) and CLAUDE.md's "rule that is easiest to get backwards" section
  (the rule is gone; leave a pointer to git history).
- **Accept:** README/CLAUDE.md describe the shipped game; numbers in comments
  are re-measured, not inherited.

### B1 — Round summary: stats + collapsible transcript, debrief call deleted
**Size:** 1 session. **Deps:** A1.
- `gameStore.finishRound`: alongside `newlyLearned`, compute `newlyDiscovered`
  (board words with no SRS record before the round — same before/after pattern
  already in `finishRound`). Persist both.
- Replace `DebriefPanel.tsx` with `RoundSummary`: outcome banner + confetti
  (keep), wrap-up "Wrapped and packed" (keep), **stats block** — discovered N /
  collected N this round, city progress, total progress (reuse
  `countCollection` from `src/journey/progress.ts`) — and the turn log
  **collapsed by default** (React state, not `<details>` — README documents
  that trap). Flags (⚑) live inside the collapsed log, unchanged (they still
  feed prompts).
- Delete the debrief AI call end-to-end: `requestDebrief`, companion
  `getDebrief`, `buildDebriefView`, `buildDebriefPrompt`, `DebriefResponse`
  schema.
- **Accept:** smoke/endgame drives assert the summary; layout-drive covers the
  end screen; one fewer network call per round in `ai-drive`'s fake-server log.

### C1 — The board never moves
**Size:** 1 session. **Deps:** A2.
- Fixed board-area height per screen (generalize the `--board-h` freeze from
  `src/ui/nativeKeyboard.ts` / `.kb-up` in `index.css`); reserved dock heights;
  single-line ellipsis on Casey's clue line and `TranslateBox` result (no
  reflow while typing/looking up); `AiTurnPanel` fixed height.
- Delete the "Last turn —" block in `ClueInput.tsx`.
- **New layout-drive assertion: the board rect is byte-identical across all
  phases of one round** (clue → AI guessing → AI clue → guessing → sudden
  death).
- **Accept:** layout-drive green with the new assertion at 360×640.

### C2 — Home rework
**Size:** 1 session. **Deps:** B1 (D1 renames land later; build with current strings).
- Delete the stale `needsSetup` nudge (`HomeScreen.tsx` tests
  `settings.apiKey`, blank for everyone since settings v7 — it fires for every
  player). Keep only the unverified-connection state, moved into the mascot's
  speech line.
- Mascot becomes the hero (bigger); progress band compresses to one line (bar +
  counts, no wrap at 360px).
- Scribbled map: pencil treatment on `DENMARK_PATH` — roughened path baked in
  `scripts/make-map.mjs` or SVG `feTurbulence`+`feDisplacementMap` — matching
  the `cluey-hatch` style in `Cluey.tsx`. Applies to Home's `JourneyMap` and
  `MapScreen`.
- **Accept:** layout-drive green; no nudge on a fresh profile; map visibly
  hand-drawn in `map-preview.mjs` output.

### C3 — Keyboard responsiveness experiment (measured)
**Size:** 1 session. **Deps:** none — pick up anytime.
- Current: `Keyboard.resize 'body'` + board frozen at `keyboardWillShow`
  (`capacitor.config.ts`, `src/ui/nativeKeyboard.ts`). Hypothesis: translate
  the focused dock up immediately on `keyboardWillShow` (exact height arrives
  pre-animation) so it rides the keyboard instead of trailing the document
  resize.
- Extend `.github/workflows/ios-sim.yml` with video capture
  (`simctl io recordVideo`) so timing is measurable; verify on TestFlight
  before keeping. Final positions are already right — regressing them fails the
  card.
- **Accept:** side-by-side video shows the composer arriving with the keyboard,
  or the card is closed as "current behaviour kept" with the measurement
  attached. This area has eaten builds; no confident edits.

### D1 — Rebrand copy: 900Words + Casey + English chrome
**Size:** 1 session. **Deps:** A3.
- Names: `capacitor.config.ts appName`, `index.html` title, PWA manifest
  (`vite.config.ts`), Home `h1`, HowToPlay, README title. `appId` unchanged.
  **Check "900Words" availability in App Store Connect first** (names are
  unique storewide).
- Casey copy pass: all user-facing strings, `cluey-tips.ts`, the persona in
  `prompts.ts`, aria-labels. Code identifiers/CSS/storage keys stay `cluey-*`.
- English chrome audit: UI chrome speaks English ("Kufferten", "Spil videre",
  "Alt eller intet", "Rejs videre" → English); learning content stays Danish.
  Doubles as i18n groundwork for H1.
- **Accept:** grep of `src/ui` + `prompts.ts` finds no user-facing
  "Cluey"/"ClueCabulary"; drives that assert copy updated.

### D2 — Dataset 900 + city removal + migrations
**Size:** 1 session. **Deps:** A3.
- Trim `curriculumRank` 901–1000 from the dataset (`src/data/words.da.json` via
  `src/data/generated/` + `scripts/merge-batches.mjs`, or a one-time trim
  script); `scripts/validate-words.mjs` expects 900.
- Remove one city from `CITIES` (`src/journey/cities.ts`) — default **Viborg**;
  confirm with Kristoffer on pickup. `WORDS_PER_CITY` stays 100;
  `WRAP_TO_TRAVEL` stays 100. København's blurb "Tusind ord senere" → "Ni
  hundrede ord senere"; README's "ten stops" prose updated.
- **journeyStore migration** (version bump): `cityIndex > removedIndex →
  cityIndex − 1`, clamp to 8. Wrapped ledger untouched (keyed by wordId;
  trimmed ids stop counting toward anything).
- Update `FINAL_CITY_INDEX` consumers and every drive using `?city=N`.
- **Accept:** verify green; a save from before the trim loads with journey
  position and collection intact (add a migration test like
  `settingsStore.test.ts`'s).

### D3 — Repo/Pages rename + ASC display name
**Size:** ½ session. **Deps:** D1.
- Rename repo → `900words`; update `vite.config.ts base`, README links, any
  workflow that names the repo. Old Pages URL + installed PWAs break —
  acceptable now (testers only), never cheaper than today.
- Set the App Store Connect display name to "900Words".
- **Accept:** Pages deploy green at the new URL; TestFlight build shows the new
  name.

### E1 — Suitcase interior redesign
**Size:** 1 session. **Deps:** D1.
- `SuitcaseScreen.tsx`: the open case fills the screen — lid + tray as two
  compartments drawn in the `Cluey.tsx` pencil-SVG style (hatching, hand-drawn
  strokes). Collected in the tray, wrapped packed under the lid.
- **One suitcase, always**: city becomes a filter-chip row (All · reached
  cities), the header city-pager goes. Loose/undiscovered words demote to a
  compact strip. Paging stays (`Pager` reused) — the no-scroll rule holds.
- Tiles keep opening `DictionarySheet` (speak button already there).
- **Accept:** `suitcase-drive.mjs` + layout-drive updated and green at 360×640.

### F1 — Baked TTS pipeline + playWord + wiring
**Size:** 1–2 sessions. **Deps:** C1. **Launch-blocking.**
- `scripts/make-audio.mjs`: neural TTS (provider + Danish voice chosen with
  Kristoffer on pickup; needs his one-time key) →
  `public/audio/da/<wordId>.mp3` for all 900 (~9 MB). Runtime-cached by the
  service worker (not precached); bundled in the iOS build. Written
  per-language from day one (H2 reruns it).
- `src/ui/speak.ts` → add `playWord(wordId)`: baked asset first, Web Speech
  fallback (existing `speakDanish` stays for arbitrary text).
- Wire sound into: card reveal moments, the guess-confirm button ("Guess «hus»"
  speaks it), suitcase tiles, round-summary word lists, wrap-up packing
  success. DictionarySheet/TranslateBox already wired.
- **Accept:** `offline-drive` extended — a cached word plays offline; on-device
  spot-check of voice quality.

### F2 — Post-round sentences v1 + hear-the-board
**Size:** ½–1 session. **Deps:** B1, F1.
- RoundSummary shows `exampleDa`/`exampleEn` for up to ~5 of the round's greens
  (newly discovered/collected first) with speak buttons (Web Speech for
  sentences at launch). The LLM-woven story with function-word coverage is H5.
- Optional "hear the board" ▶ in the game header playing through the board's
  words — deliberately instead of a forced pre-game slideshow (the study phase
  was removed once for being homework).
- **Accept:** summary shows sentences with working audio in a drive; header
  button plays through without moving layout.

### G1 — Proxy quotas + friendly 429
**Size:** 1 session. **Deps:** A2 (error copy). **Before launch.**
- `proxy/worker.js`: per-install daily request cap — client sends a random
  install-id header; worker counts in KV. The origin lock is spoofable outside
  browsers; the quota is the real cost control. Confirm the Capacitor WKWebView
  origin is in `ALLOWED_ORIGIN`.
- Client maps 429 to "Casey is resting — practice companion offered" via the
  existing `fallBackToPractice` path.
- **Accept:** `proxy-drive.mjs` extended: the cap trips on the miniflare
  runtime and the client shows the fallback.

### G2 — Store readiness + release
**Size:** 1–2 sessions. **Deps:** A3, B1, C1, C2, D1–D3, E1, F1, F2, G1 (not C3).
- Privacy policy page (no accounts, localStorage-only, board words sent to the
  proxy for clues — spelled out); ASC privacy questionnaire; screenshots (the
  ios-sim workflow can produce them); description, keywords, age rating.
- Final `npm run verify`, an on-device TestFlight pass, then release via the
  existing `testflight.yml`/ASC flow.
- **Accept:** app submitted for review.

### H1–H7 — Fast-follow cards (summaries; expand on pickup)
- **H1 Language seam**: per-language modules for gender/articles (der/die/das),
  countability, legality stemming, `classifyClue` charset; prompts
  parameterized off "Danish"; SRS/journey/settings namespaced per language with
  a migration folding existing saves into `da`; Settings language picker.
- **H2 German content**: 900 words via the existing batch workflow (Kristoffer
  verifies natively — generation can start during F/G, it's user-paced);
  Germany route + map via `scripts/make-map.mjs` on German geodata;
  `make-audio.mjs` with a German voice.
- **H3 Semantic local layer**: build-time embedding similarity tables (900×900
  + clue-vocab×900, int8) → local guess ranking + clue-candidate ranking so the
  practice companion plays genuinely well; measured via selfplay. The
  structural cost control for free users.
- **H4 900 Pass IAP**: StoreKit via Capacitor plugin; first 2 cities free;
  restore purchases; decide the PWA channel's gating then.
- **H5 Sentence stories**: LLM-woven post-round narratives deliberately
  including untaught function words (`function-words.da.json`,
  coverage-tracked) — funded by the deleted debrief call.
- **H6 Voice-recognition wrap-up**: native speech plugin; prototype first —
  false rejections would poison the ritual.
- **H7 Cascade tier**: proxy routes to a cheap model by default, escalates to a
  flagship on low safety margin (blueprint §4).

## Verification (every card)

`npm run verify` (typecheck + unit + validator + all drives — drives build
first); selfplay measurements re-recorded when rules/boards change;
layout-drive's no-scroll and (from C1) board-stability assertions; on-device
TestFlight check for keyboard/audio work; README + CLAUDE.md updated in the
same PR that changes what they describe.
