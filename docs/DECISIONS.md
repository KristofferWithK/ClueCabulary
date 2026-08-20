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
| **Renaming the GitHub repo** (part of D3) | It changes the live Pages URL and breaks every installed PWA and saved link, including yours. There is no benefit to doing it at 3am and a real cost if you wake to a dead bookmark. | ~~"behind a single constant"~~ *(corrected 2026-08-20: it is an inline literal — `base: CAP ? './' : '/ClueCabulary/'` in `vite.config.ts` — plus the README links and Pages URLs. Still a small job; there is no constant.)* |
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
