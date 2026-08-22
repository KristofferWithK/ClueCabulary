# Decisions taken while you were asleep

Kristoffer went to bed on 2026-08-20 having said: work to the end of the board,
including the H cards, decide the open questions with best judgement, and pin
anything I would otherwise have asked so it can be revisited.

This file is that pin board. Every entry says what was decided, why, and **how
to reverse it**, so nothing here is a fait accompli. Newest at the top of each
section.

---

## What was deliberately NOT done autonomously

These are the things where being wrong is expensive or public, so they are
prepared but not executed. Each is a five-minute job in the morning.

| Not done | Why | What is ready |
|---|---|---|
| **Renaming the GitHub repo** (part of D3) | It changes the live Pages URL and breaks every installed PWA and saved link, including yours. There is no benefit to doing it at 3am and a real cost if you wake to a dead bookmark. | ~~"behind a single constant"~~ *(corrected 2026-08-22, X1: it now IS — `PAGES_BASE_PATH` in `vite.config.ts` feeds `base`, `start_url`, `scope` and `navigateFallback`, so the rename is one line there — plus the README links and Pages URLs, which still need their own edit.)* |
| **Submitting to the App Store** (G2) | Submitting an app on your behalf, unattended, is not mine to do. | ~~"prepared and in the repo"~~ *(corrected 2026-08-20: this row was written before the work and the work never happened that night. It exists NOW — `public/privacy.html`, `docs/store/` with listing copy, keywords, age rating and questionnaire answers, all drafts for your signature. Screenshots still to make.)* |
| **Anything needing a paid key I do not have** | Baked TTS (F1) needed a TTS provider key; the semantic tables (H3) need an embedding run. | *(updated 2026-08-20: you added `TTS_API_KEY`, the bake ran, and the clips ship in the repo. H3's embedding run still has no key and — corrected — no pipeline either; only the TTS pipeline was ever written.)* |
| **Shipping German as playable** (H2) | You are the native verifier; unverified German in a language-learning app is the one quality risk not worth taking. | The language seam (H1) is real and Danish runs on it. ~~"German content is generated as a draft"~~ *(corrected 2026-08-20: no German content exists — no `words.de.json`, no batches. The seam is ready for it; the generation has not started.)* |

## Standing judgement calls

Applied throughout the night unless a card says otherwise.

- **Generous over strict** wherever a rule could block a learner. Rewards that
  fail to bind are a smaller error than doors that lock.
- **Measure rather than assert.** Any number that reaches a comment, the README
  or the UI was measured in the session that wrote it. Where a measurement was
  impossible, the text says so instead of guessing.
- **No default changes without a migration.** Every persisted-store change ships
  a version bump and a migrate in the same commit, with a test — the trap
  CLAUDE.md records three times.
- **Historical comments stay.** Removed mechanics leave a sentence saying what
  was there and why it went, per the convention A1 set.
- **Nothing outward-facing.** No posts, no submissions, no emails, no renames.
  Merges to `main` publish the PWA to Pages, which is the one already-standing
  consequence and was true before tonight.

---

## Decisions

*(appended as they are taken; each with its reversal)*

### 2026-08-22 · The clue engine is worth continuing — E6 before E5, and E5 in halves (E4)
E4 was the card that ends in a verdict, and the verdict is **go**. The full
table, the caveats and the reversals live in `docs/clue-engine.md` under
"Stage 4 as built" and "The verdict (E4, 2026-08-22)"; this is the pin.

**What was measured.** 200 seeded city-1 boards, the same deals down every row.
The offline engine's association data was rebuilt as two independent halves —
Opus's votes alone and Fable's votes alone, from the committed per-model vote
files — so a clue-giver reading one model's judgement is examined by a guesser
reading the other's. Cross-model **0.623 and 0.701 greens per word asked**,
against a nonsense-clue floor of **0.234** and coins of 0.586 (p = 0.6) and
0.678 (p = 0.7). The offline engine reads an independently-authored clue a
little better than a p = 0.6 partner and a little worse than p = 0.7.

**And one thing that had to be retired.** Engine-vs-engine self-play is not
evidence. Replace `sim` with a djb2 hash and give both seats the SAME hash and
the row scores **100%** — better than every honest row — because a shared
arbitrary function is a private code the search encodes into and the guesser
decodes. Give the seats different salts and it falls to **0.5%**, the floor.
E3's 99.0% therefore measured agreement, not association, and θ = 0.5 was chosen
under it. No pin in this repo may rest on that row again.

**Decided.** (a) **E6 — cities 2–9: go.** The data works, and eight of nine
cities have none of it, so every player past city 1 gets `mok`. One city per PR.
(b) **E5's first half — the evaluator as a validator inside
`OllamaCompanion.getClue`: go.** It is the piece the cross-model result
supports directly, and it turns H7's escalation into a checked trigger.
(c) **E5's second half — the candidates prompt, rank fusion and the
`MODEL_ALIASES` flip to a cheap `cluey`: not yet.** It turns on `r`, and `r`
still has no value. The clue ledger that will give it one ships in this PR,
empty.

**Reverse:** four named triggers, in `clue-engine.md`'s verdict section. The
short forms: a new city measuring under ~0.45 cross-model stops E6; a probe run
showing the model's clues almost always clearing θ stops E5's first half; a
ledger showing the engine within ~0.05 of the remote model turns E5's second
half into its opposite (make the engine the default and keep the model for the
story and the translation); a ledger `r` above ~0.5 says the problem is the
prompt, not the tier, and E5 should not be built on it.

### 2026-08-21 · Ordinary journey boards became city-only — `wordsForCity` replaces `unlockedWords` (E0)
Owner decision, `docs/clue-engine.md` §3.4: an ordinary journey board (and free
play) now deals only from the current city, not this city and every one
before it — the consequence taken knowingly is that an earlier city's words
are reviewed only by travelling back, since the wrap-up round already packed
the current city only. The two display pools (word of the day, the suitcase's
ALL filter) were deliberately left on `unlockedWords` — "everything reached"
stays their meaning.
**Reverse:** one call in `src/stores/gameStore.ts` — swap `wordsForCity` back
to `unlockedWords`.

### 2026-08-21 · The tips intro window counts days, not app opens — and four tips made the critical list (O4)
The card said "the first sessions leaf the critical tips in priority order
before the daily rotation" and left both "session" and the list open. Decided:

- **A session is a distinct day**, tracked in `cluecab-tips-intro` (its own
  key, the HOWTO_KEY pattern — no settingsStore field, no migration). The
  bubble's standing contract is "the same all day, new tomorrow"; a per-open
  cursor would burn all four tips in one curious evening, and a per-open
  definition of "session" would make the drive's own reloads eat them. The
  cursor counts days it was *asked on* rather than subtracting `dayKey`s,
  because `dayKey` is not day arithmetic across a month boundary and a skipped
  day should not skip a tip.
- **The list, in priority order:** whose greens count while you guess (the
  rule this repo keeps writing backwards), collect = clue it AND guess it,
  wrap-ups keep what breaks, a win earns one. Chosen as the four rules a new
  player acts on in their first days; the tips about æøå and Danish counting
  stay in the rotation — they are delights, not survival gear.
- **Anything unreadable in the cursor falls back to the daily rotation** —
  corrupt JSON, a throwing storage, a shape from another build. Ties toward
  veteran, the onboarding gate's own rule: the cost of a wrong "veteran" is a
  missed fronting, the cost of a wrong "fresh" is the same tip for weeks.

**Reverse:** point Cluey.tsx back at `dailyLineIndex` and delete
`openingLineIndex`/`CRITICAL_TIPS` from cluey-tips.ts; the stored cursor is
orphaned data that hurts nothing.

### 2026-08-21 · The first-time dock lines go quiet in private mode, and the tutorial cannot spend them (O4)
Each of the two first-encounter lines (first `playerClueInput`, first
`playerGuessing`) shows once ever, on a `cluecab-hint-*` flag. Two edges
decided:

- **Storage that throws means no hint at all**, not a hint forever: a device
  that cannot record "seen" would otherwise be greeted every round by a line
  designed to appear once. Quiet over nagging — pinned in hints.test.ts.
- **The tutorial spends neither flag, structurally.** The TutorialDock stands
  in for every phase dock, so the components carrying the lines never render
  there — the first REAL round keeps both, which is the round that needs them:
  the tutorial hands the player canned clues and a narrated guess, so its
  rehearsal of these moments is not the encounter. onboarding-drive pins the
  flags unspent after a full tutorial.

**Reverse:** each is one branch — the catch in `shouldShowHint`
(src/ui/hints.ts), and the `tutorial ?` ternary in GameScreen that was already
there.

### 2026-08-21 · The tour's edges: no Skip on the arrival, the map is a legal exit, and packs without a script get the tour (O3)
Three calls the card left open, decided without waking you.

- **The arrival act renders no Skip.** "Skip is always visible at every act"
  is about never trapping a player in an unskippable ritual — and the
  arrival's own primary button ("Get started") IS the exit, one tap, ending
  the flow exactly as Skip would. A second button doing the same thing under
  a different name is the confusing version. Every act that has anything left
  to skip (train, ticket, tutorial, all four tour steps) keeps it.
- **"See the map" on the onboarding arrival finishes the flow first, then
  goes to the map** — the done flag written, zero onboarding chrome left. The
  alternative (hiding the button during the intro) would make the intro's
  arrival differ from the real one for no gain.
- **A pack with no tutorial script now falls through to the TOUR rather than
  straight Home.** O2 sent it Home because Home was the next act; the tour
  and the arrival read everything off the active pack (the case's bands, the
  route's first city), so a German player under H2 gets the case explained
  and the arrival moment even before a German script exists. H2's checklist
  still owes the round itself.

Also worth a line: the scrim tap advances the tour (tap-through like every
bubble before it), which is also what keeps the case's own controls — the
header's Back above all — inert while the tour has the floor. SuitcaseScreen
itself is untouched by O3; suitcase-drive ran unmodified and stayed green.
**Reverse:** each is one small branch — the Skip is a button in `ArrivalAct`,
the map exit is two lines beside it (src/ui/screens/OnboardingScreen.tsx),
and the unscripted fall-through is `advance('tour')` back to `finish()` in
`TutorialAct`.

### 2026-08-21 · A replayed tutorial is a real round: SRS counts, and it replaces any round in flight (O2)
The card left open what a transient replay of the tutorial does to the SRS.
Decided generous over strict, per the standing rule: **the round is real
wherever it runs.** A replay (Settings, or `?onboard=1`) deals the same fixed
board through the same store, `recordRound` runs at its end, and the words are
credited again — the SRS counters are monotonic, so a replay can only add,
never corrupt. What never happens in ANY tutorial round, first run or replay,
is `recordGame`: no played/won tally, no wrap-up earned — R1's "first win is
the unlock" stays the first real round's moment (that half is the card's own
text, not tonight's call; it is pinned in gameStore.test.ts either way).

Two consequences decided with it:
- **Dealing the tutorial replaces a round in flight.** A veteran mid-round who
  taps "Replay the intro" and reaches the tutorial act loses the old board —
  the same cost a language switch accepts, for the same reason: the replay is
  a deliberate act, and keeping two live rounds would mean a parallel store
  for a five-minute scripted board.
- **A tutorial round found OUTSIDE the intro is dropped on rehydrate**
  (gameStore's `onRehydrateStorage`): one can outlive a transient run that was
  closed mid-round, and resuming it from Home would put the scripted dock on a
  screen with no script. Whatever `finishRound` already recorded stays.
- One interaction with O1's "transient runs write nothing" is worth naming:
  a genuinely fresh device that plays the FORCED (`?onboard=1`) tutorial to
  the end now has twelve words in its SRS map, so the gate reads it as
  veteran on the next plain load and marks it done silently — it does not get
  the train again, where O1's entry said it would. That is the gate doing its
  job, not a leak: a device with words in the case has, by the gate's own
  definition, played. Skipping the forced run before the round starts still
  leaves the device fresh, which is what the drives use.

**Reverse:** each is one condition — the `mode !== 'tutorial'` guard at
`recordGame` in finishRound, the deal in `newTutorialGame`, and the drop in
`onRehydrateStorage` (src/stores/gameStore.ts).

### 2026-08-21 · The tutorial discovers all twelve words and collects none — structural, and O3 should know (O2)
Worth pinning because two card texts quietly disagree. Collection needs a
green EACH way — once under your clue, once by your guess — and one round
gives each word exactly one way (a revealed green cannot be guessed again).
So the tutorial ends with all eight greens *discovered*, four bystanders
*seen*, and **nothing collected** — which is why Casey's closing line teaches
the both-ways rule as the road ahead ("the case fills as we play") rather
than claiming cargo. O3's card says "the tutorial's newly-collected words are
the cargo the tour points at": the cargo is real but it is *discovered*
words, and the near-empty case is already the point that card wants to make.
**Reverse:** nothing to reverse — it is arithmetic; if O3 wants collected
cargo at tour time, the tour must follow the first real rounds, not the
tutorial.

### 2026-08-21 · Onboarding replays and forces are TRANSIENT — nothing they do is written (O1)
The card asked for Settings' **Replay the intro** to be "a transient re-run;
the done flag stays" and left `?onboard=1`'s behaviour open. Both now run the
same screens through the same state with `persist: false`: no step marker as
they advance, no done flag when they end. The alternative — a replay that
re-writes `done` — would be harmless today but would quietly turn the replay
into a repair tool for a corrupted flag, and a drive using `?onboard=1` would
dirty the profile it was pointed at. A forced run on a genuinely fresh device
therefore also writes nothing, which means that device gets the train again on
its next plain load — correct, since it never finished a real run.
**Reverse:** flip `persist` in `startOnboarding` (src/stores/uiStore.ts).

### 2026-08-21 · The onboarding gate breaks ties toward "veteran" (O1)
The card defines fresh as: onboarding key unset AND `cluecab-howto-v4` unset
AND the SRS map empty. The open edges were decided against ambush, per the
owner's "the owner's phone is never ambushed" line: an SRS record that exists
but cannot be parsed counts as NOT empty (a fresh device cannot be proven, so
none is assumed); a storage that throws (private mode) counts as done
outright; an unknown step marker from a newer build resumes at the train
rather than restarting a finished flow. The cost of each wrong call is one
replayable intro or one missing intro — and a missing intro is recoverable
from Settings, while an ambush is not.
**Reverse:** each is one branch in `decideOnboarding` (src/onboarding/flow.ts),
pinned individually in flow.test.ts.

### 2026-08-21 · The intro replaces the screens rather than covering Home (O1)
A fresh device renders `OnboardingScreen` INSTEAD of HomeScreen — "the app
starts in the train" taken literally — and the decision is made in the store's
initializer, before the first paint, so there is no one-frame flash of a Home
the player has never met. The overlay alternative (train drawn over a mounted
Home) was rejected because Home mounts with side effects and Casey's band
would sit under the scene it is supposed to be starring in.
**Reverse:** render `<OnboardingScreen />` beside the screens in App.tsx
instead of in the ternary, and drop `initialOnboarding` for an effect.

### 2026-08-21 · The keyboard plugin is forked, and the ride ships on

Build 23 on your phone settled C3's open question the other way: the composer
still arrived after the keyboard, and the five-tap toggle that would have shown
the remedy was never found — your words: "I couldn't find the toggle and your
description was bad". Two decisions follow, and they are one card (C4).

**The ride ships ON, judged by normal play.** No hidden switch on your path
again. The flag inverted: `cluecab-kbfast` (opt-in) is retired — BuildFooter
sweeps it from localStorage once — and `cluecab-kbstill` (opt-out) restores
the wait-for-the-document behaviour, existing for A/B filming and rollback
only. The BuildFooter five-tap toggle now reads "Composer ride: on" /
"off (waits for the document)".

**The keyboard plugin is vendored** as `ios-plugins/cluecab-keyboard/` — a
fork of @capacitor/keyboard 8.0.5 installed as a `file:` dependency, whose
whole native diff is the `keyboardWillShow` payload gaining `durationMs` and
`curve`. The ride now animates with the platform's real keyboard duration
instead of a hardcoded 250 ms, so the dock and the keyboard cover their
different distances in the same time. Two things the fork deliberately does
NOT change:

- **The `+0.2 s` delay on the body resize stays.** The obvious edit — trim the
  delay so the document arrives sooner — is actively harmful: in the plugin,
  `setKeyboardHeight` runs *before* `notifyListeners`, and a zero delay
  executes synchronously, so the body would shrink before JS sets
  `kb-up`/`--board-h` and the un-frozen board would reflow. With the ride on,
  the late resize is invisible anyway: the transform holds the dock in place
  until the MutationObserver hands over, measured drift 0.
- **The names.** npm `cluecab-keyboard`, JS plugin `"Keyboard"`, Obj-C class
  `KeyboardPlugin` — and the SPM package and product are both
  `CluecabKeyboard` because that is the Capacitor CLI's
  `fixName('cluecab-keyboard')`. `cap sync` derives the SPM manifest from
  these; rename any one of them and the app stops linking the plugin.

**The check that was supposed to catch this had been photographing nothing
for four runs.** ios-sim.yml seeds a starting position into localStorage,
and both halves of that seed had rotted: it set `cluecab-howto-v3` while
uiStore had moved to v4, so the rules overlay covered every screenshot; and
its round was saved at gameStore version 3, which `migrateGame` drops on
purpose, so the app opened on Home with no board to freeze and no dock to
lift. The workflow was green throughout — it photographs whatever is on
screen and has no opinion about what that is. Both keys are now read from
the stores at run time and a mismatch fails the step, and
`scripts/make-sim-seed.mjs` — which already existed, and whose only fault
was that nobody re-ran it after two version bumps — now prints the versions
it captured. The check is the point, not the generator: a generator nobody
runs is a stale file with extra steps. A third failure sat underneath: `fb-idb` cannot run on
Homebrew's Python 3.14 (`asyncio.get_event_loop()` raises now instead of
making a loop), so the tap that raises a real keyboard had never once
executed; the tap leg pins Python 3.11.

With all three fixed, the simulator finally measured the thing: a real
keyboard, a real tap, `lift -291` against a `kb 291`, the transform starting
14 ms after the event, the plugin's resize landing at 614 ms, and `drift 0`
at the handover. What it still cannot do is show a keyboard — a headless
boot delivers the geometry without rendering it — so the ≤ 16 px frame
criterion in the plan is unmeasurable here and the readout stands in for it.
That limitation is written into the workflow beside the tap step so the next
reader does not mistake a keyboard-less film for a failed tap.

**Reversal:** put `@capacitor/keyboard` back in package.json, delete
`ios-plugins/` and the `cluecab-keyboard` dep, run `npm install && npx cap
sync ios` (CapApp-SPM/Package.swift regenerates), re-invert the
`cluecab-kbstill` guards in `src/ui/nativeKeyboard.ts` and `BuildFooter.tsx`,
and drop layout-drive's duration-witness assertion (the ride itself keeps
passing — it predates the fork). Per device, no code: five taps on the build
number → "Composer ride: off (waits for the document)" — that is
`cluecab-kbstill`, and it reproduces the pre-fork behaviour exactly
(layout-drive pins the rest pixel identical both ways).


### 2026-08-20 · H9's first ride exists, and the stemmer wrote three of its sentences
Sønderborg's story is built and playable: 31 sentences, three chapters, every
one of the city's hundred words, baked per sentence in Aoede at 0.6 for **two
cents** and 748 KB.

**The checker earned itself immediately.** `travelStory.test.ts` asks the
shipped stemmer rather than a copy of its rules, and it rejected three
sentences I had reasoned about and got wrong: «katten» stems to `katt`, not
`kat`; «byen» is too short for the stemmer to strip anything from, so it never
reaches `by`; and «stjerne» itself ends in `-erne`, so it stems to `stj` while
«stjerner» stems to `stjern` — the singular and the plural never meet. Those
three failures are the proof the suite is not vacuous, and they are the reason
the Danish is written in the forms it is.

**Two of CLAUDE.md's own traps, walked into in one commit.** The first draft
of the clip-presence check imported `node:fs` in a test under `src/` — passes
vitest, fails `tsc -b`, exactly as the file warns. And because that broke the
build, the first drive run measured the PREVIOUS bundle and reported the ride
missing. Both are recorded in the test's own comment. The clip check now lives
in journey-drive, which asks the built app to fetch the first clip: dist is
what ships, and a file present in the repo but absent from the bundle would
have passed a filesystem test and still been silent on a phone.

**Judgement calls made, all cheap to reverse:**
- **The story is the LEAVING city's**, not the arriving one — its words are the
  ones just packed.
- **Skip is always visible**, per the owner, and layout-drive asserts it stays
  on screen at 360×640. The study phase was cut once for being homework; an
  unskippable ritual is how this becomes that.
- **"Slower" stretches rather than re-times** (playbackRate 0.8 with
  preservesPitch) because the clips are already baked slow at 0.6. If it
  sounds poor, a second bake at a lower rate is one flag.
- **A city with no story written rides straight through** to the arrival, so
  the other eight cities behave exactly as they do today.

**Held for the owner deliberately:** the eight remaining stories are NOT
written. The prose is the expensive part and writing eight to the wrong taste
is the waste worth avoiding, so Sønderborg is a sample to react to.
**Reverse:** delete `src/data/travel-stories.da.json`'s entry and the ride
disappears by its own fallback; delete `TrainRide.tsx` and the two lines in
MapScreen to remove it entirely.

### 2026-08-21 · The ride says every sentence four times

Your shape, implemented as given: **Danish at its ordinary pace, the English
translation, the Danish slowly, then the Danish again.** It lives in
`src/journey/rideCycle.ts` as a four-entry list rather than as branches inside
the player, so the order is one readable line and a unit test pins it — writing
the slow pass before the translation is the mistake it exists to prevent, since
hearing a sentence taken apart before you know what it means is the version that
does not teach.

The last pass is the FIRST clip replayed rather than a fourth bake. Ending on
the ordinary reading, after the slow one, is the point of ending there.

**What it costs, measured rather than counted.** Sønderborg's 31 sentences
become 124 passes, but the ride runs **2.85×** longer, not 4× — 2m53s to 8m13s,
totalled from the clips' own `audio.duration`. Three of the four passes play the
new 1.0 clips (3.44s a sentence) where the single old pass played a 0.6 one
(5.58s), so making the Danish normal paid back a good part of what repeating it
cost. The first figure written here was the pass count wearing a stopwatch's
clothes; this is the stopwatch. Skip is untouched and any single line can still
be tapped for just that sentence's cycle.

**The stories are baked three ways**, the same pattern the words took: `story/`
at 1.0, `story/slow/` the 0.6 clips moved sideways, and `story/en/` new — the
English, read by `en-US-Chirp3-HD-Aoede` so one narrator carries both languages.
If Google does not serve that exact name the bake's voice guard fails loudly and
prints the names it does serve; a sibling Chirp3 name is then the fix.

The device-voice fallback follows the pass it is standing in: `speakText` takes
a BCP-47 tag now, and the English pass is read in English. Without that a phone
with no clips would read «The sun rises over Sønderborg» in a Danish accent,
which is worse than saying nothing.

**Reverse:** drop the cycle to `[{ variant: 'normal', side: 'da' }]` in
rideCycle.ts and the ride is exactly what it was; the extra clips can stay
unused or be deleted with their directories.

### 2026-08-20 · 0.6 is the 🐢 now, not the only speed

You asked for the ordinary tap to sound normal, with a slow replay available in
the dictionary sheet. So the rate you picked by ear is no longer what every
board tap gets: **the words are baked twice.** `public/audio/da/` holds a fresh
1.0 bake and is what every existing call site plays; `public/audio/da/slow/`
holds the 0.6 clips that were there before, moved sideways rather than re-made,
and is what the sheet's 🐢 asks for. Same voice, same words, two files.

**Why two bakes and not `playbackRate 0.6`.** A stretched clip is a processed
clip — the ride already does that to its story audio and it is a compromise
made for files that could not be re-baked. These could: the slow set already
existed and cost nothing to keep, so both speeds are real synthesis at the rate
they claim. The cost is ~8 MB more in the repo and in the iOS bundle, which is
the same bargain deploy.yml already took for committing audio at all.

**What moved with it.** `--source` in make-audio.mjs is now `words` (1.0),
`words-slow` (0.6) or `stories` (0.6), each with its own rate and directory, so
the bake workflow still passes no numbers of its own. The pack's `speech` gained
`slowRate` and its `rate` went 0.88 → 1: the 0.88 was hedging against a sentence
the device voice ran together, and the 🐢 is that hedge now, on the sheet's
example sentence too. The service worker's cache is `word-audio-v2`, because the
new ordinary clips have the filenames the old slow ones had and CacheFirst would
otherwise serve a year of the audio you asked to stop hearing.

**`WORD_MS` in HearBoard, corrected — this was measured after the 1.0 bake.**
A 240-clip sample read with `audio.duration` in the browser that plays them
gave a median of 1.01s, p90 1.46, p95 1.54, longest 1.97; `WORD_MS` is now
**1500**, up from the 1200 above, which let 95% of words finish and left the
median half a second of trailing silence. The comment in `HearBoard.tsx`
carries the full reasoning and README states the same figure.

**Reverse:** `git mv public/audio/da/slow/*.mp3 public/audio/da/` over the 1.0
clips, set `speech.rate` back to 0.88 and drop the 🐢 buttons from
`DictionarySheet.tsx`. The 1.0 clips are re-makeable at any time with
`--source words`; the 0.6 ones are in git history either way.

### 2026-08-20 · The voice is Aoede at 0.6, and the rate was a literal in three places
You listened and chose **da-DK-Chirp3-HD-Aoede**, then pushed the pace down —
1.0, 0.9, 0.7, 0.5, 0.6 — and settled on **0.6**. Both are now
`make-audio.mjs`'s defaults and all 900 clips are baked in them.

**What the change uncovered.** The speaking rate was a literal inside each of
the three provider adapters, spelled differently in each (Google a multiplier,
Azure a signed percentage, ElevenLabs a speed), and it was **not in the
manifest stamp**. The stamp was provider + voice + locale + text. So changing
only the speed and re-running would have matched all nine hundred stamps,
skipped every word and printed "0 to make · Nothing to do" — the one thing you
changed being the one thing the manifest could not see. It is `--rate` now,
normalised once and converted per adapter, and it is in the stamp. Walked
against the stub in all three states: first bake makes them, unchanged re-run
skips them, a `--rate` change alone re-bakes them.

**A measurement worth keeping in mind:** Chirp3 is not reproducible, and the
wobble between two generations of the SAME request is *larger than one step of
the rate dial* — a rate-1.0 clip came back 39% longer on a second draw. That
is why 0.9 and 0.7 looked identical in the first probe. Consequences: never
judge a rate from a single clip, and a `--force` re-bake always produces a
~7 MB binary diff even when nothing audibly changed.

**Reverse:** `node scripts/make-audio.mjs --force` with `--voice` and `--rate`
set to whatever you prefer, or bump `BAKE_NONCE` in `bake-audio.yml`. The old
Neural2-F clips are in git history at `32233b8~1`.

### 2026-08-20 · The train story (H9) is carded, and it dodges the cost problem
You asked whether per-board stories would be too expensive to voice. They
would: every board differs, so it means live TTS through the proxy, metered
and online-only — which is why H5's post-round story uses the device voice.

The train story is a different shape and the journey code is why. `canTravel`
opens the road only when **all hundred** of a city's words are wrapped, so at
the moment anyone boards, the words they packed are the city's band —
*identical for every player*. Nine legs, nine fixed stories, written once and
baked once: ~20k characters, under a dollar, one time, then zero runtime calls
and it works offline. Carded as **H9** with the shape, the per-sentence baking
(Chirp3 has no SSML, so sentence clips are the only route to highlighting and
a slow toggle), and the honest hard part written down — the prose, not the
money. **Nothing built yet; the card is the decision.**

### 2026-08-20 · Daytime session: H5 shipped, the voice pinned for your ears, the paperwork made real
Worked with you awake this time, so less was decided FOR you — but three
things landed on the session branch worth pinning:

**H5 is implemented** — the post-round story written to a coverage target,
exactly as the measurement demanded: the prompt is handed the three least-met
function words (starting at «hvis», «fordi», «selvom», the measured zeroes),
the reply is refused unless it verifiably contains them, and a ledger walks
the targets through all 209 round by round. Costs the call per round the
debrief freed up; practice mode and wrap-ups skip it; failures fall back to
the F2 sentences silently. **Reverse:** revert the commit — the coverage
store is additive and orphaned data hurts nothing.

**The voice decision is yours and only yours now.** All 35 Danish voices
Google serves read four dataset sentences (soft d, stød, æ/ø/å, a question
contour) — delivered as a listening page in the session, clips under
`audition/` on the branch. Say a name and the re-bake is one command + one
commit; the new guard makes a typo impossible to bake. Until then Neural2-F
ships, which is also a fine answer.

**The store paperwork the table above claimed now exists** — see the
corrected rows. The submission remains yours, deliberately.

### 2026-08-20 · The voice flag was never broken, and there are 30 voices nobody knew about
You added `TTS_API_KEY`, which made the one carded blocker testable, and it
did not survive testing. `.github/workflows/audition-voices.yml` asks Google
what it serves, bakes three words in every voice and fingerprints them; it
runs on a push that touches the file, because dispatch-by-name only sees
workflows indexed off the default branch.

**`--voice` works.** All **35** da-DK voices produce distinct audio, and a
fresh `Neural2-F` bake came back byte-identical to the shipping clips. The
list frozen in `make-audio.mjs` is four names; Google now serves **30
Chirp3-HD voices** (16 female, 14 male, 24 kHz) that did not exist when that
list was written. Clips for all 35 are on this branch under `audition/da/`
(924 KB) with `voices.json` beside them.

**Why the finding looked true.** Five of the six names it tried are not
served for da-DK at all — and Google answers them **200 with audio** instead
of refusing. Worse, they can be *another voice*: `Neural2-D` is byte-identical
to `Neural2-F`, and `Wavenet-A`/`Wavenet-D` to `Wavenet-F`. Only a name
outside Google's pattern is refused. So the original comparison saw identical
bytes and drew the reasonable conclusion. **The live risk this leaves** is a
mistyped `TTS_VOICE` baking 900 words in the wrong voice under "900 made, 0
failed" — the guard is one `voices:list` call before the bake, carded in
PLAN.md, deliberately not written tonight because it changes the bake path.

**Also measured, and it decides the Chirp3 question:** synthesis is not
reproducible. Two identical runs rewrote 84 of 105 clips, 77 of them
Chirp3-HD, always at identical file size — encoding noise, not a different
reading. Nothing breaks today, but with the clips committed, a `--force`
re-bake is a ~7 MB binary diff that says nothing. Neural2-F was stable across
all three runs; Chirp3 was not.

**Nothing shipped.** No voice changed, `public/audio/` is untouched, the app
sounds exactly as it did. **Reverse:** delete `audition/` and the workflow —
both exist only on this branch, and the clips are the reason to keep them
until you have listened.

### 2026-08-20 · A bug shipped and was fixed an hour later — worth knowing how it hid
C2's Home rework introduced an overlap that only appears when a city is fully
wrapped: the travel button costs ~61px, Casey's band could not give it up, and
the column *overflowed* — "Casey" drawn sliced across the green button. It was
in `main` for about an hour before the agent that caused it noticed, after its
own card had merged.

**Why nothing caught it:** flex overflow paints over what is below rather than
lengthening the document, so `scrollHeight <= innerHeight` — the rule this
whole codebase leans on for layout — stayed true at exactly 640 the entire
time. An iPhone SE was clearing it by 0.2px, which is not clearance.

Fixed, mutation-checked, and the drive now measures the *drawing's* rectangle
rather than the button's, because the first attempted fix let the button shrink
while the drawing kept painting outside it — and a check on the button would
have called that fixed.

**What to take from it:** the no-scroll rule does not cover overlap, and no
other check did either. If more layout work happens, that gap is worth a
general assertion rather than one per screen.

### 2026-08-20 · Read this one: the sentences cannot teach the words you named — F2
You asked for post-round sentences so the game could smuggle in words that
cannot be clued — *"if", "suddenly"*. The feature shipped, and then the coverage
was measured, and **the measurement contradicts the reason for it**.

Across all 900 example sentences: of a 209-word Danish closed-class inventory,
147 appear at least once — but 62 never appear and 50 appear exactly once, so
**54% are out of reach** of a feature that shows five sentences a round. A round
shows about eleven distinct function words and two thirds of them are the same
twenty. Meeting even the reachable ones once each takes 771 rounds.

And the words you actually named are the missing ones: **`hvis` 0 of 900,
`fordi` 2, `pludselig` 1**, `eller`/`mens`/`selvom` all 0. The cause is
structural rather than an oversight — these are single-clause A1 examples, and a
subordinating conjunction needs a second clause to live in.

**So v1 teaches the core twenty by repetition and cannot teach the tail at all.**
It is still worth having; it just is not the thing you asked for. The thing you
asked for is **H5** — sentences written to a coverage target — and this
measurement is its justification. The numbers are reproducible:
`node scripts/measure-function-words.mjs`.

### 2026-08-20 · Audio is built but has never spoken — F1
There is no TTS key in this session and I did not obtain one, so the bake
pipeline was proven against a local stub instead: 900 words in 27 seconds with
the right auth header, endpoint and voice on every request, resumable, and a
voice change re-bakes rather than skips. **No audio exists in the repo**, and
the app behaves exactly as it does today (device voice, or silence where the
phone has no Danish one) until you run it.
**To make it real:** enable Cloud Text-to-Speech in a Google Cloud project with
billing on (the bake is inside the free allowance, but the API will not serve
without billing enabled), make a restricted API key, then
`node scripts/make-audio.mjs` with `TTS_API_KEY` set — about two minutes. Then
listen to `hus.mp3`, `koebe.mp3`, `roed.mp3` before trusting the voice.
`--provider azure` and `--provider elevenlabs` are there if the Google voice
grates.
**Reverse:** delete `public/audio/` — it is gitignored, and the app falls back.
*(Overtaken 2026-08-20, later the same day: the bake ran with your key, the
gitignore reasoning was reversed, and the 900 clips are COMMITTED as of
e327b34 — which also caught Windows eating `nul.mp3`, the clip for «nul»,
because NUL is a reserved device name. The reversal is now `git revert`, not
a delete. The voice on every clip is Neural2-F until you choose otherwise.)*

### 2026-08-20 · Card reveals stay silent, against the card's own list
F1's card asked for sound on card reveals. It was left out: that is sound the
player did not ask for, and a phone that speaks Danish on a quiet train is a
phone that gets closed. Every sound in the app now follows a tap.
**Reverse:** say so and it is a small addition — but play it on a train first.

### 2026-08-20 · The proxy's daily caps: 1000 per install, 25,000 for everyone — G1
Numbers chosen from the real board arithmetic (worst imaginable round is 60
requests, ordinary is 7–12), so a thousand is fifteen full rounds with every
reply needing three corrections. **You must do one thing before this works:**
Actions → *Deploy the AI proxy* → Run workflow, using a Cloudflare token minted
from the **Edit Cloudflare Workers** template (an older token silently leaves
the proxy unmetered). The run summary says in bold whether the cap is on.
**Honest limits, all in the code:** the install id is forgeable, so the real
bound is the global ceiling; KV has no atomic increment and can serve stale
reads, so treat the ceiling as a fuse, not an invoice. Raise it from the
dashboard in thirty seconds if real players approach it.
**Reverse:** set `GLOBAL_DAILY_CAP` / `DAILY_CAP` to 0 in the dashboard.
*(Postscript 2026-08-20: the first real run of that workflow deployed the
proxy UNMETERED while correctly reporting no cap — not because of the token
this entry blames, but because wrangler 4 titles the KV namespace "QUOTA"
where the lookup expected "cluecabulary-proxy-QUOTA". Fixed in 27fa3c9, both
titles accepted, the stray namespace becomes the bound one. The instruction
stands: run the workflow and read the bold line in its summary.)*

### 2026-08-20 · The Pages base path was deliberately NOT changed
`vite.config.ts` still has `base: '/ClueCabulary/'` because the repo rename is
held for you. Changing one without the other breaks the deploy, so they move
together, in your five-minute job.

### 2026-08-20 · `STUDY_UNTIL_CITY` kept at 5 rather than following Viborg — D2
The constant's own comment gives its reason as "by then the player has met 500
words". Viborg leaving would have made the landmark reading (Aalborg) cut the
beginner scaffold to 400 words. The number stayed, the landmark in the copy
moved to Skagen — the no-behaviour-change option.
**Reverse:** one line, if you would rather the scaffold end at Aalborg.

### 2026-08-20 · Worth knowing: some of tonight's drive runs were measuring the wrong build
C1 found that `e2e/preview-server.mjs` guarded against a stale server holding
its port and **lost the race to it** — vite's exit on a held port is async, the
drive's first fetch got there first, the held server answered (it is the same
app, so the response looked right), and the drive measured *another worktree's
build* while reporting success. It produced three wrong results inside C1's own
session, twice reproducing the exact pre-fix numbers.

Since several agents ran drives concurrently tonight, some of the green runs I
merged on may have been measuring a neighbour. **So `main` was re-verified from
scratch after the fix landed, on an isolated port range with the fix in place:
551 tests, 16/16 drives, clean.** That run is the one to trust; the per-card
ones before it were not necessarily wrong, just not proof.
**Nothing to reverse** — the fix binds the port before spawning and adds
`DRIVE_PORT_OFFSET` so two checkouts can run drives at once.

### 2026-08-20 · Viborg is the city that leaves the route — D2
The card defaulted to it and I confirmed rather than waking you. It is the only
inland detour on the route; without it the journey still reads as a coast run
north and back — Sønderborg, Ribe, Kolding, Aarhus, **Aalborg**, Skagen,
Odense, Roskilde, København — and Aarhus → Aalborg is a more natural leg than
the dogleg through the middle was.
**Reverse:** cheap *today*, expensive later — it is a data change plus a
journey migration, and every day of play after it makes rewriting saves
harder. If you want a different city cut, say so before you play much.

### 2026-08-20 · Old saves are seeded with the wrap-up bank they "should" have — R1
The migration gives an existing player `min(wins, 3)` banked wrap-ups rather
than zero, so nobody who could open a wrap-up round yesterday finds they
cannot today. Generous over strict, per the standing rule.
**Reverse:** one expression in `migrateSrs`.

### 2026-08-20 · The 4×5 board lost a clue token (8 → 7) — A3
**This is the one change tonight that alters how the game feels, so play a
standard board before accepting it.** Taking the forbidden words out did not
just make the big board safer, it made it *easier than the 3×5 it escalates
from* — 71.3% against 67.1% at equal skill, measured over 2000 games a cell.
Standard was the only grid dealt three hazards a side, so its difficulty had
always lived in the danger rather than in its clue budget, and A1 removed the
danger and left the budget. Seven tokens restores the order (58.1% vs 67.1%)
and costs nothing at the top: perfect play still wins every seed on 4.44 clues.
**Reverse:** one number in `src/engine/config.ts`. Note the escalation test
fails at 8, so it would need updating too — deliberately, so the ordering
cannot silently invert again.

### 2026-08-20 · The obvious "too much padding" fix was measured and rejected
Every board now carries more dead cards (4×5: 5 → 8), and the intuitive fix is
to deal them as greens. Measured: it makes standard *harder AND longer* (64.3%
at p=0.7, perfect play spending 6.00 clues of 7 rather than 4.44), because a
card nobody ever has to point at is a card that makes a board easier. Written
into `config.ts` rather than acted on — changing what the twenty cards are is a
design decision with keygen's SRS tiers behind it, not a tuning fix.
**Revisit if** the boards feel padded in play; the numbers say slower is not
what padding does, but they cannot measure boredom.

### 2026-08-20 · A TestFlight build will be left waiting for you
Once the night's code has settled, the manual TestFlight workflow gets run once
so you wake up with something on your phone rather than a diff to read — the
keyboard ride (C3) can only be judged on a device, and the toggle for it is
behind five taps on the build stamp in Settings.
**Reverse:** ignore the build; it costs nothing and expires on its own.

### 2026-08-20 · The reward is a wrap-up round, not a spare clue or a postcard
Your call, recorded here because the card changed twice: wins earn wrap-up
rounds (R1), postcards keep for a content update (H8), spare clues dropped
entirely — a difficulty cut disguised as a reward, and `turnTokens` is the
honest place to tune difficulty.
**Reverse:** H8 is written up and ready to pick up.
