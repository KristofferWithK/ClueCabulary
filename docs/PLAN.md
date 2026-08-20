# 900words — Production Kanban

This board replaces the original build plan (M0–M8, fully shipped — see git
history). It is the working plan for reshaping ClueCabulary into **900words**
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
| App identity | `appId com.kristofferwithk.cluecabulary` **stays**. Display name becomes "900words". |

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
- **H9** — The train story: a city's hundred words read aloud on the way out *(owner's idea; card below. Unblocked by V1 — the voice it needs now exists.)*

### Blocked
- **D3** — Repo/Pages rename + ASC display name *(needs D1; the rename itself is held for the owner — see DECISIONS.md)*

- **G2** — Store readiness + release *(paperwork half done 2026-08-20 on the session branch: privacy policy page in `public/`, listing copy + questionnaire in `docs/store/`. Screenshots and the submission remain, and the submission is held for the owner)*

### In progress
- **H5** — Sentence stories written to a coverage target — implemented 2026-08-20 on branch `claude/plan-decisions-overview-l4bpxi` (verify green there), awaiting merge

### Done
- **V1** — The voice is **da-DK-Chirp3-HD-Aoede at rate 0.6** — decided by the owner 2026-08-20 from a 35-voice audition and a five-point rate audition, both under `audition/`. `--rate` became a real flag (it was a literal in three adapters) and entered the manifest stamp, without which a speed change would have skipped all 900 words and reported success. Baked and committed by `bake-audio.yml`.
- **H7** — Cascade tier: escalation rides the corrective retry — merged 2026-08-20 ([PR #76](https://github.com/KristofferWithK/ClueCabulary/pull/76), squash 2f2a0d8). Zero extra round trips; shipped alias table carries no cascade, byte-for-byte today's behaviour.
- **H1** — Language-pack seam; Danish runs on it — merged 2026-08-20 ([PR #77](https://github.com/KristofferWithK/ClueCabulary/pull/77), squash 6bee696). H2 adds one registry line and the picker appears by itself.
- **A1** — Engine: forbidden words out, redemption retired — merged 2026-08-19 ([PR #62](https://github.com/KristofferWithK/ClueCabulary/pull/62), squash a4517bf)
- **C3** — Keyboard ride behind cluecab-kbfast, ships off — merged 2026-08-19 ([PR #63](https://github.com/KristofferWithK/ClueCabulary/pull/63)); awaiting the owner's on-device slo-mo A/B before flipping the default
- **A2** — Rules rewritten for two roles + neutral lookahead pinned — merged 2026-08-20 ([PR #64](https://github.com/KristofferWithK/ClueCabulary/pull/64))
- **B1** — Round summary replaces the debrief; the debrief call is gone — merged 2026-08-20 ([PR #65](https://github.com/KristofferWithK/ClueCabulary/pull/65), squash 6a80497). Found layout-drive's end-screen section vacuous since it was written.
- **A3** — Boards re-measured; standard 8 → 7 tokens; README + CLAUDE.md rewritten — merged 2026-08-20 ([PR #66](https://github.com/KristofferWithK/ClueCabulary/pull/66), squash 151b812). See DECISIONS.md — the token change alters game feel.
- **C2** — Home given to Casey, key-prompt bug deleted, coastline drawn by hand — merged ([PR #73](https://github.com/KristofferWithK/ClueCabulary/pull/73), 69c4140)
- **E1** — One open hand-drawn suitcase, city as a filter — merged ([PR #74](https://github.com/KristofferWithK/ClueCabulary/pull/74), 45a44ed)
- **F2** — Post-round sentences + hear-the-board — merged ([PR #75](https://github.com/KristofferWithK/ClueCabulary/pull/75), aaca1ed). Its coverage measurement is the case for H5 — see DECISIONS.md.
- **F1** — playWord with baked-clip pipeline (unrun, no key) and device-voice fallback — merged 2026-08-20 ([PR #72](https://github.com/KristofferWithK/ClueCabulary/pull/72), squash fa68f97)
- **D1** — 900words and Casey everywhere a player reads; chrome in English — merged 2026-08-20 ([PR #71](https://github.com/KristofferWithK/ClueCabulary/pull/71), squash c9f1315). Storage keys and CSS classes proven unmoved.
- **D2** — Dataset trimmed to 900, Viborg off the route, journey migrated — merged 2026-08-20 ([PR #69](https://github.com/KristofferWithK/ClueCabulary/pull/69), squash a17588c)
- **G1** — Proxy daily caps in KV, friendly 429, README setup rewritten — merged 2026-08-20 ([PR #70](https://github.com/KristofferWithK/ClueCabulary/pull/70), squash 8047731)
- **C1** — Board rect identical in every phase; 200px of drift to zero — merged 2026-08-20 ([PR #68](https://github.com/KristofferWithK/ClueCabulary/pull/68), squash a92f7c8). Found the preview-server race — see DECISIONS.md.
- **R1** — A won round earns a wrap-up round, bank of three — merged 2026-08-20 ([PR #67](https://github.com/KristofferWithK/ClueCabulary/pull/67), squash 69844df). Measured: the collected-words gate binds first, so the win gate is phase-shifted rather than idle.

### Found along the way, not yet carded
- ~~**`make-audio.mjs --voice` does nothing.**~~ **Wrong, and measured wrong
  on 2026-08-20** once a TTS key existed — see the audition below. The flag
  works: all 35 voices Google serves for da-DK produce distinct audio. What
  the finding actually caught is a Google behaviour worth keeping in mind,
  now recorded in DECISIONS.md.
- **README's Setup section is stale** — it still tells the player to paste a
  Gemini key, but settings v7 cleared keys and the app talks to the proxy.
  A3 left it deliberately (out of card). **G1 owns it** — the quota work is
  the same subject. *(Done — G1's rewrite shipped; the one survivor is the
  backup paragraph still promising a file that "never contains your API key",
  which is now a sentence about a field nobody has.)*
- **A retired voice name is served, not refused, and can silently be another
  voice.** `da-DK-Neural2-D` returns 200 and is byte-identical to
  `da-DK-Neural2-F`; `Wavenet-A` and `Wavenet-D` are byte-identical to
  `Wavenet-F`. Only a name that does not fit Google's pattern is refused
  (`da-DK-NotAVoice-Z` → 400 "does not exist. Is it misspelled?"). So a
  mistyped `TTS_VOICE` can bake all 900 words in the wrong voice and report
  "900 made, 0 failed". *(Guarded 2026-08-20 on the session branch:
  `make-audio.mjs` now checks `--voice` against `voices:list` before spending
  a bake and refuses with the live list; a failed listing warns and
  continues, so stub and offline runs still work.)*
- **Synthesis is not reproducible, and Chirp3-HD least of all.** Two
  byte-identical runs of the audition rewrote 84 of 105 clips — 77 of 90
  Chirp3-HD, 7 of 15 legacy — always at identical file size, so it is
  encoding noise rather than a different reading. Neural2-F happened to be
  stable across all three runs, which is why the shipping clips reproduce
  exactly. It costs nothing today (the manifest skips on
  provider+voice+locale+text, never on content, and `deploy.yml` bakes only
  missing words) but it means **any `--force` re-bake is a ~7 MB binary diff
  even when nothing changed** — worth knowing before picking a Chirp3 voice,
  given the clips live in the repo.
- A test file under `src/` cannot name `process`: `tsc -b` rejects it while
  vitest runs it happily. `envVar` helper added; noted in CLAUDE.md.

### Fast-follows (post-launch backlog, in order — H1/H7 done, H5 in progress above)
- **H2** — German content: 900 words, Germany route, German audio *(seam is live; content not started — the owner verifies natively)*
- **H3** — Semantic local layer (build-time similarity tables → good offline companion; needs an embedding key)
- **H4** — 900 Pass IAP (StoreKit, first 2 cities free)
- **H6** — Voice-recognition wrap-up unlock (prototype first)
- **H8** — City postcards: wins uncover a souvenir of the city, kept in the suitcase lid *(the v1 reward is R1; this is the content update that follows, and the reason to re-shoot the store listing)*

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

### R1 — Wins earn wrap-up rounds
**Size:** 1 session. **Deps:** B1 (same persisted stores, and the round summary is where the reward is announced). NOT gated on A3 — but A3's win rate is the number the earn rate is set against.

**The problem.** Winning has no consequence. A lost round still greens words,
still collects them, still shows the same summary — and taking the forbidden
cards out made losing gentler, so the two endings converged. A win should leave
something behind.

**The mechanic** (owner, 2026-08-20): a won round earns one wrap-up round. Bank
at most three. Chosen for v1 over the postcards idea (now H8) because it needs
no art and no new screen — a counter, a gate, and a line on the summary B1 is
already building — and because it points at the right thing: wrap-ups are the
only way words get packed for good, and packing is what opens the road onward.
So winning advances the journey.

**The risk this card must not realise.** Wrap-ups are the progress spine. A
strict economy can BLOCK the journey — a learner on a losing run would stop
being able to bank words at all, which is the game refusing to teach because
they are not yet good enough at it. Hence the bank, and hence losing costing
nothing. If in doubt, err generous: a reward that never quite binds is a much
smaller failure here than a door that locks.

**The two gates race each other.** A wrap-up board structurally needs 20
collected words to deal (`wrapUpWords`), so vocabulary progress is ALREADY a
gate; wins are a second one, and whichever is slower binds. If collecting is
slower — likely — the player sits on three unspent tokens and the reward is
hollow. Read A3's win rate and the measured wins-per-city before fixing the earn
rate, and say which gate binds in practice.

**Shape.**
- Earning hook already exists: `srsStore.recordGame(outcome)` tallies wins. Put
  the bank beside it (persisted → version bump + migrate in the same commit).
- **Only normal rounds earn.** If a wrap-up win earned another wrap-up, they
  chain indefinitely and the rationing evaporates.
- **The first win is the unlock.** Replaces the current "collect N more to open
  wrap-up rounds" counter in `SuitcaseScreen` with a natural tutorial beat. Keep
  the structural 20-collected-words requirement — it cannot go away, the board
  cannot be dealt without it — but say the two conditions plainly on that screen.
- Announced on the round summary (B1's screen) at the moment it is earned, and
  shown as a count on the suitcase's wrap-up button.
- A daily-challenge win earns one like any other round.

**Accept:** verify green; a win banks exactly one, capped at three, spent by
starting a wrap-up, never earned by a wrap-up win or a loss, and surviving a
reload; the suitcase says why the button is disabled when it is; the earn/spend
rules pinned by tests, one checked to fail without the fix.

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

### D1 — Rebrand copy: 900words + Casey + English chrome
**Size:** 1 session. **Deps:** A3.
- Names: `capacitor.config.ts appName`, `index.html` title, PWA manifest
  (`vite.config.ts`), Home `h1`, HowToPlay, README title. `appId` unchanged.
  **Check "900words" availability in App Store Connect first** (names are
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
- Set the App Store Connect display name to "900words".
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
- **H5 Sentence stories** — NOW MEASURED AND JUSTIFIED. F2 shipped v1 (the
  shipped example sentences) and measured what it can teach: 147 of a 209-word
  closed-class inventory appear at all, but 62 never do and 50 appear once, so
  54% is unreachable at five sentences a round, and the words the owner named
  are absent outright — hvis 0/900, fordi 2, pludselig 1, eller/mens/selvom 0.
  Structural: single-clause A1 examples give a subordinating conjunction no
  second clause. So H5 is LLM-woven post-round narratives written TO a coverage
  target, with function-words.da.json tracking what has been met. Reproduce the
  numbers with node scripts/measure-function-words.mjs. Funded by the debrief
  call B1 deleted.
- **H6 Voice-recognition wrap-up**: native speech plugin; prototype first —
  false rejections would poison the ritual.
- **H7 Cascade tier**: proxy routes to a cheap model by default, escalates to a
  flagship on low safety margin (blueprint §4).
- **H8 City postcards**: a won round uncovers one piece of a postcard of the
  city you are in; a finished card lives in the suitcase lid, beside the words
  in the tray (E1 draws it open). Overflow rolls into the next city's card, so a
  win late in a city is still worth something. Nine cards — Koldinghus, Skagen's
  two seas, Nyhavn — and the open question is how they get drawn: everything
  else here is hand-rolled pencil SVG (Casey's hatching, the Denmark outline,
  C2's scribbled map) and they should match it. Held back from v1 only because
  the art is the slow part; the mechanic itself is small, and it stacks with R1
  rather than replacing it.

### H9 — The train story: a city's hundred words, read aloud on the way out
**Size:** 2–3 sessions (one of them writing). **Deps:** the Aoede bake (done).
**Owner's idea, 2026-08-20.**

**Why this escapes the cost problem that H5 has.** A post-round story cannot be
voiced by the baked pipeline — every board differs, so it would mean live TTS
through the proxy, metered, online-only. The train story is the opposite shape,
and `canTravel` is the reason: the road opens only when **all hundred** of a
city's words are wrapped (`WRAP_TO_TRAVEL = WORDS_PER_CITY`,
`src/journey/progress.ts`). So at the moment anyone boards, the set of words
they packed is *the city's band, identical for every player*. Nine legs, nine
FIXED stories, written once and baked once. About 20k characters — under a
dollar, one time — and then zero runtime calls, offline, forever.

**The moment.** Travel happens on the map and lands on `Arrival` (never
silent, by that component's own note). The ride goes between them: pencil train
car in the `Cluey.tsx` hatching style, Casey at the window, the story on screen
with the wrapped words set bold — the payoff being *you can read this now*.
Play is a tap (every sound in this app follows a tap — the standing rule) and
**Skip is always visible**, per the owner.

**Shape.**
- Baked PER SENTENCE, not one file per story: Chirp3 has no SSML and therefore
  no timing marks, so sentence-level clips are the only way to get
  sentence-by-sentence highlighting, tap-to-replay, and the slow toggle. Two
  bakes per sentence — 0.6 and the slow variant — is still pennies.
- Coverage is CHECKED, not hoped: reuse H5's stemmed matcher to assert every
  one of the city's hundred appears. "All the words they wrapped" is a promise
  the validator can keep.
- The H5 function-word ledger plugs straight in — a 100-word story has room for
  «hvis», «fordi», «selvom» in a way five single-clause examples never did, and
  this is where the unreachable tail finally gets met.
- Replayable from the map afterwards; a leg already travelled keeps its story.

**The honest hard part is prose, not money.** A hundred specific words in a
story that does not read like a packing list is a real writing constraint.
Mitigations: three short chapters a ride rather than one monolith, machine
coverage report per draft, and **Sønderborg written first as the proof piece**
before committing to nine. Danish quality sits in the same trust class as the
shipped example sentences — generated, machine-validated, awaiting a native
pass.

**Accept:** verify green; Sønderborg's story covers 100/100 by the checker;
the ride plays, skips, replays a sentence and survives a reload mid-ride; no
scroll at 360×640; a drive asserts the story is reachable from the map after
travelling.

## Verification (every card)

`npm run verify` (typecheck + unit + validator + all drives — drives build
first); selfplay measurements re-recorded when rules/boards change;
layout-drive's no-scroll and (from C1) board-stability assertions; on-device
TestFlight check for keyboard/audio work; README + CLAUDE.md updated in the
same PR that changes what they describe.
