# 900words

Learn Danish one clue at a time. 900words is a single-player, mobile-first
word game inspired by cooperative word-association games: a board of Danish
words, a secret key, and an AI companion — Casey — who gives and guesses clues
**without ever seeing your key**. Vocabulary sticks because every clue forces
you to build connections between words.

## The journey

900words is a journey through Denmark: nine stops from **Sønderborg** in the
far south, up Jutland to the tip at **Skagen**, then back across Funen and
Zealand to **København** — made with **Casey**, the suitcase with eyes who is
also the companion cluing and guessing beside you. Each city owns 100 words —
the most frequent hundred first — and only words from the cities you have
reached appear on your boards. Nine cities of a hundred is the whole dataset:
900 words, and the route length and the word count are one number, checked
against each other by `scripts/validate-words.mjs`.

Every word is in one of four states, leafed through in **the suitcase** (tap
Casey on Home): **undiscovered** until you meet it, **discovered** once you
have, **collected** after it has earned a green each way — once under your
clue, once by your own guess — and **wrapped** once a wrap-up round has packed
it safely.

Collected words still break on the road; **wrap-up rounds** are how you pack
them. A wrap-up board is 4×5, dealt entirely from the city's collected words,
and every card starts English-side up: type the Danish to pack a card before
the clues begin — the dictionary is closed, the first miss on a word is
remembered — or start early and leave cards unpacked at your own risk, playing
English-side up all round and ineligible to wrap. Every packed word that ends
the round green is wrapped for good, win or lose. The board's clue economy is
deliberately the forgiving one — 16 distinct greens over 10 shared tokens, the
beginner ratio, and measured against the others it is the softest board in the
game — because the packing gate is the difficulty and putting a second one in
the clue budget would only tax the same ritual twice. Wrap all hundred words of
a city — `WRAP_TO_TRAVEL` in `src/journey/progress.ts` — and the road onward
opens.

## How a round works

1. The board is 3×4 (beginner), 3×5 (middle) or 4×5 (standard) Danish words —
   **3×5 by default**, chosen under Settings → Board size —
   from the 900 most common, each noun with its gender in front of it —
   **et hus**, the way the pair is learned — and where a noun has no ordinary
   indefinite singular, the card says the gender instead: **(com)** or
   **(neut)**. Gender decides the definite ending and every agreeing adjective,
   so it is shown whether or not the word can be counted.

   Countability is a rule applied to all 366 nouns, not a list of exceptions
   (`src/lang/da/grammar.ts`): a noun is uncountable when "en X" / "et X"
   would be wrong or clearly odd in everyday Danish — mass and abstract nouns,
   plus the plural-only ones. Where **both** readings are ordinary the article
   stays, because *en øl*, *et brød*, *en ost*, *et hår* and *et papir* are all
   things Danes say and they teach the gender in the form a learner meets. The
   validator refuses any drift between the module and the data. Words outside
   the shipped nine hundred get the same treatment from Casey, who is asked for
   gender and countability along with the translation — *trafik* comes back
   `(com)`, not `en trafik`.

   Your own key is the card's border: a solid green frame around each of your
   targets and nothing at all around the rest, so the only thing your key tells
   you is what to clue toward. There was a second, dashed black border for a
   long time — a forbidden word, fatal if it was ever named — and no board has
   one now.
2. You open: you give a one-word clue, Casey guesses — then Casey clues and you
   guess. A clue's number is the whole allowance: guess that many right and the
   turn ends itself. (There is no Codenames-style bonus guess. It existed to
   pick up a word left over from an earlier clue, and in practice only read as
   the turn refusing to end once you had found everything the clue promised.)
   Stopping short is still yours to choose. Guesses are judged against the
   clue-giver's key. Casey is told how
   many of his greens are left against how many clues remain, so he aims for
   two or three words a clue rather than picking off one at a time — and on his
   last clue, for everything he has left, since a green he never points at is
   one you cannot find in sudden death.
3. Find every green word before the shared clue tokens run out and you both
   win. Beginner is five clues, middle six, standard seven.
   Running out is not the end: the clues stop but the board does not, and
   **sudden death** lets you keep naming words with nothing left to go on. Name
   a green and you are still alive; name anything else and the round is over.
   Walking away there is allowed, and is a loss — the difference between
   deciding you are beaten and being told.

   **A guess is judged against the clue-giver's key and nothing else.** Every
   other rule hangs off that one, and it is the easiest thing here to read
   backwards. Under *your* clue, Casey's guesses are read off *your* key: a card
   you marked green scores, and one you did not costs the turn even if it is
   green on his. Under *his* clue it is his key that is read. So a card can be
   spent one way round and still be worth finding the other — a bystander reveal
   is directional, burning the card for the side that named it and leaving it
   live for the side that did not. Sudden death is the one exception, because
   there is no clue-giver: a green on **either** key counts, and anything else
   ends it. `game.test.ts` pins the whole rule; two mutations of the engine were
   checked to fail it.

   Nothing on a board is fatal any more. Duet's assassin — which this game
   called a forbidden word — is gone, and so is the translate-every-unsolved-word
   last chance that existed to soften it. Every key now holds greens and nothing
   else. That removed the only ending that could arrive early, which makes the
   tokens the whole clock, so we re-measured what they are worth rather than
   assuming they survived the change.

   `src/ai/selfplay.test.ts` plays both sides against themselves on one dial:
   the chance **p** that a guess finds a word the clue-giver actually meant. At
   0 it is board arithmetic and nothing else; at 1 every clue is read perfectly.
   Over 2000 seeded games a cell, both sides cluing for what is left up to three
   at a time:

   | board | p=0 | 0.6 | 0.7 | 0.8 | perfect | clues a perfect pair spends |
   |---|---|---|---|---|---|---|
   | 3×4, 5 clues | 1.6% | 76.1% | 89.0% | 96.9% | 100% | 3.51 |
   | 3×5, 6 clues | 0.7% | 67.1% | 85.4% | 94.7% | 100% | 4.18 |
   | 4×5, 7 clues | 0.0% | 58.1% | 80.7% | 95.5% | 100% | 4.44 |
   | wrap-up 4×5, 10 clues | 1.2% | 84.8% | 95.2% | 99.2% | 100% | 6.00 |

   Those are a floor and a ceiling with a made-up dial between them, not a
   forecast: a biased coin is not Danish word association, and a real round sits
   somewhere inside. What the brackets are good for is the shape, and the shape
   says three things. A guesser that knows nothing spends every token on every
   board — sudden death on 99.7% to 100% of seeds, and the tokens go with 5.1 of
   the 3×4's 8 greens and 8.8 of the 4×5's 12 still hidden — and wins at most
   1.6% of the time, so the floor did not rise when the hazards went, it moved
   *later*: every loss now happens in sudden death, from a board barely touched.
   A perfect pair wins every seed with
   clues to spare, which is what a fair budget looks like. And in between, each
   board still has a real losing side, and still comes down to the wire often
   enough to be worth playing — at p=0.7 the clues run out on 30.8% of 3×4
   rounds, 38.8% of 3×5 and 42.0% of 4×5, and 54% to 64% of those are still won
   from there. Sudden death is a second act, not a formality.

   **The 4×5 was re-tuned, and it was the only one.** It was the one board dealt
   three forbidden words a side — five distinct cards, three of them pure
   hazards — so its difficulty lived in the danger rather than the clue economy,
   and it could afford the loosest budget in the game. With the danger gone it
   measured 71.3% at p=0.6 against the 3×5's 67.1%: the big board had become
   easier than the one it is supposed to escalate from. Taking one token off it
   puts the three boards back in order and costs nothing at the top, since a
   perfect pair only ever needed 4.44 of them.

   Giving it more greens instead — the obvious answer to a board where eight of
   twenty cards are on nobody's key, and where 76.2% of missed guesses land on
   one — was measured and does the opposite of what it promises. Dealing those
   slots as greens makes the board *harder and longer* (64.3% at p=0.7, a
   perfect pair spending 6.00 clues of the 7), because a dead card is a card
   nobody ever has to point at. The padding made that board easier, not slower.
   What the twenty cards should be is a design question with the deal behind it;
   it is not a tuning fix, and nothing measured here asked for one.
4. **Reroll before you start.** If nothing on the board connects, **↻**
   in the header deals a different board of the same size. Only before the
   first clue — once one is on the table the round has a history, and re-dealing
   under it would be a way to unsee a bad guess — and never on the daily
   challenge, which is one shared board per date.

   Two rules meet here and they pull opposite ways. Every board carries exactly
   three words out of the last one (`CARRY_OVER` in `src/srs/sampler.ts`), and a
   rejected board is precisely the one whose words must *not* come back. So the
   reroll replaces the head of the two-board window rather than pushing onto it,
   and passes the rejected board to the sampler's `avoid` set. Before that
   second half existed a 3×4 reroll came back measuring **7 of the same 12
   words**; it is 0 now, carry-over included, because the rejected board took
   only three words off the played one and the quota can be drawn from the other
   nine.
5. **Clue in Danish.** Tap ⓘ on any board word for the built-in dictionary
   (translation, gender, example sentence), or type into **Look up a word** in
   the clue dock to go the other way — English in, Danish out — which is the
   direction composing a clue actually needs. It is a field, not a drawer: it
   was a `<details>` and the lid cost a tap every turn, because the dock
   unmounts with the phase and a `<details>` keeps its open state on the element
   rather than in React. Casey clues in Danish too, and one tap loads his clue
   into the same box. **Both sides speak Danish**: type an
   English word into the clue box and it says so, with the lookup one tap away,
   because Casey is handed the clue as a bare string beside a Danish board and
   an English word there is one he cannot place.

   The nine hundred settle most of it offline and recognise far more Danish than
   they contain — æ/ø/å can only be Danish, an inflection of a headword is that
   headword (*hunden*, *bilerne*), and a compound of two of them is Danish
   (*dyreliv*, *morgenmad*). Anything else is **unknown**, which is permission
   rather than suspicion: that is where every Danish word we do not ship lives,
   *trafik* included. Only a word that looks positively English is questioned,
   and even then the offline guess is never the last word — the button becomes
   *Give clue anyway* and Casey judges it, so a Danish word we happen not to
   ship is never refused by a list.
   Toggle **Aa** to overlay every translation — off to start with, so the board
   opens as a grid of Danish words rather than twice as many lines of text, and there
   is no opening study phase either (Settings can turn one back on; a save from
   before that default changed is migrated, since a persisted setting kept the
   old behaviour alive long after the default moved). Every lookup tells the practice
   scheduler which words to bring back sooner — including one done in the
   lookup box, which costs exactly what tapping ⓘ costs, and neither is
   available during the translation challenge or a wrap-up packing phase. A clue may be
   any Danish word, so the lookup answers any word: the shipped nine hundred come
   back instantly and offline, and anything else is asked of Casey without
   being asked twice. A hit that is already on the board says so, since it is
   the right translation and an illegal clue.
6. After each round the summary shows **what was said, and why** —
   every clue and every guess with the reasoning behind it, including what Casey
   deliberately steered away from and how sure he was of each guess. Tap ⚑ on
   anything of his that was a bad call: flags are kept (newest 24) and quoted
   back to him in later rounds, with his own sentence attached, so the
   correction has something to bite on. They carry a clue word, a board word and
   his own reasoning — no key data — so they pass the AI firewall by
   construction, which `src/ai/flags.test.ts` asserts directly.
7. The summary also puts the round's green words back into Danish: each with
   its example sentence, and then — when Casey is connected — woven into a
   tiny **story written to a coverage target**. The story exists for the words
   no board can hold. Nothing in the nine hundred is a conjunction, a pronoun
   or a particle, because none can be clued, and the shipped example sentences
   were measured to reach barely half of that inventory, with «hvis», «fordi»
   and «selvom» effectively absent (`scripts/measure-function-words.mjs`
   reproduces the numbers). So each story is *asked* for the least-met of them
   by name, the reply is verified to actually contain them before anything is
   recorded (`storyProblem` in `src/ai/companion.ts` — a story is rejected and
   retried rather than trusted), and a ledger (`coverageStore`) walks the
   targets through the whole 209-word inventory round by round. The line under
   the story names what was smuggled in. It costs the one model call per round
   that the retired debrief used to spend; offline or in practice mode the
   sentences stand alone, exactly as before.

Progress is tracked per word with a spaced-repetition scheduler; new words are
introduced along the frequency ranking while struggling words return more
often. Every board carries exactly three words over from the one before —
weighted toward the three that went worst, and no word may carry twice running
— so a board is mostly new without ever dropping what you just struggled with.

The same signal steers the deal itself. Every slot on a board asks the player
for one of three things (`SlotTier` in `src/engine/keygen.ts`), and the words
are handed out in that order: **recall** is green on Casey's key, so you have to
retrieve the word from his clue, and the words you keep forgetting go here
first; **produce** is green only on yours, which needs enough command of a word
to find an association for it; **filler** is on neither key and asks nothing, so
the words you know best drift into it. There used to be a fourth — **hazard**,
filled last, which turned your best-known words into the traps you had to
knowingly steer around. Forbidden words are gone and that channel went with
them, so a word you know cold now costs a card rather than earning one. Recall
was always the half that taught, and it is untouched.

### Keeping your collection

It lives in this phone's localStorage and nowhere else, so **Settings → Your
collection** writes it to a single JSON file. Restoring offers a merge that
keeps the better record for every word — it can never turn a green word grey —
or a wholesale replace. The file is your learning record and nothing else —
there has been no API key anywhere in the app to worry about since settings
v7 retired them.

## Hearing it

Every word is baked to an mp3 twice, in the same neural voice
(`da-DK-Chirp3-HD-Aoede`, chosen by ear from a 35-voice audition): once at the
ordinary reading speed, which is what every tap plays, and once at **0.6**,
which is what the 🐢 in the dictionary sheet plays. Two files rather than one
file slowed down at playback — a stretched clip is a processed clip, and both
of these are real synthesis at the rate they claim. A phone with no clips in
the build falls back to its own voice at the same two rates, so the buttons
mean the same thing either way.

The clips ship in the repository and are runtime-cached, never precached: 900
words twice over is too much to make an install download before the app will
open offline. `HearBoard`'s tour paces the board at **1500ms** a word, which is
measured rather than chosen — 240 clips read with `audio.duration` in the
browser that plays them give a median of 1.01s and a p95 of 1.54.

The train ride out of a city says each of its sentences **four times**: the
Danish, its English translation, the Danish slowly, then the Danish again. The
order is `src/journey/rideCycle.ts` and the last pass is the first clip
replayed — ending on the ordinary reading, after the slow one has taken it
apart, is the point of ending there. That makes the ride roughly four times as
long as a single reading would, which is why it has always been skippable and
why any single line can be tapped for just that sentence.

The bake is `scripts/make-audio.mjs`, run by `.github/workflows/bake-audio.yml`
because the TTS key is an Actions secret. Each source carries its own rate and
its own directory, so nothing else has to remember what "slow" means:

| `--source` | rate | writes to |
|---|---|---|
| `words` | 1.0 | `public/audio/<lang>/` |
| `words-slow` | 0.6 | `public/audio/<lang>/slow/` |
| `stories` | 1.0 | `public/audio/<lang>/story/` |
| `stories-slow` | 0.6 | `public/audio/<lang>/story/slow/` |
| `stories-en` | 1.0, in `en-US` | `public/audio/<lang>/story/en/` |

A manifest per directory records the provider, voice, rate and a per-clip stamp,
so a run only pays for what actually changed — and a rate change alone re-bakes
everything, which is the trap that was fixed by putting the rate in the stamp.

## Setup

There isn't one. Open the deployed page on your phone, "Add to Home Screen",
press play. No account, no API key, no model to choose.

That is worth saying plainly because it used to be false. For most of this
project's life the first screen after install asked you to go and fetch a
Gemini key, paste it in, and pick a model name off a list — three chores
between a person and a vocabulary game, and the last one had a wrong answer
that looked like a broken app. Casey's key now lives on a Cloudflare Worker
([`proxy/`](proxy/README.md)) as a server-side secret, the app sends no key at
all, and there is no longer a field to type one into. Settings v7 cleared the
keys already stored on devices, because a stale one would have been sent ahead
of the proxy's own and rejected mid-round.

The app does not name a model either. It asks for `cluey`, which is an alias
the worker resolves — so which model answers is a proxy setting rather than an
app release every installed PWA has to notice, and a model id retired upstream
is fixed in one place instead of breaking every install at once.

Nothing about this needs the network to be good, or to exist. Casey is the only
part of the game that talks to a server: if he cannot be reached, the error
banner offers **Play on without Casey** and the round finishes with a practice
companion that runs entirely on the phone. The same offer appears if the
proxy's [daily cap](proxy/README.md#the-daily-caps) is spent.

### Running it against something else

The **Base URL** field in Settings is still free text, and it is the escape
hatch — for a local Ollama, for your own copy of the worker, or for any other
OpenAI-compatible endpoint. Point it somewhere and tap **List models this
server accepts**, which asks the server for real names rather than leaving you
to guess between `gpt-oss:120b` and `gpt-oss:120b-cloud`; a wrong guess returns
a 404 that reads exactly like a broken endpoint. Tapping the **Casey** chip
puts it back.

There is no key field, so a service that wants one needs the key at build time:
paste it into `src/ai/bundled-key.ts`, which is empty by default. Worth knowing
before you do — this is a static site, so anything in the bundle is readable by
anyone who opens the page. A key sent by the app takes priority over the
worker's own secret, and requests carrying one are not counted against the
proxy's daily cap — they are spending your budget rather than the worker's.

To deploy the worker yourself, [`proxy/README.md`](proxy/README.md) has the
whole thing — including the phone-only route, where three repository secrets
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OLLAMA_API_KEY`) and the
**Deploy the AI proxy** workflow in the Actions tab do it with no terminal
involved. One worker fronts either Ollama Cloud or Gemini; the origin lock and
the daily caps are documented there too.

## Development

```bash
npm install
npm run dev            # local dev server
npm test               # engine, SRS, AI-layer and firewall tests
npm run build          # typecheck + production build
npm run typecheck      # the typecheck alone — and note it is `tsc -b`, not
                       # `tsc --noEmit`, which silently checks NOTHING here:
                       # the root tsconfig is files:[] with project references
npm run validate:words # dataset sanity checks
node scripts/make-audio.mjs --source words --dry-run   # what a bake would cost
node scripts/make-map.mjs # regenerate the Denmark outline
node scripts/make-icons.mjs                   # regenerate the PWA icons
```

Playwright drives run against the built app and each start their own preview
server, so `npm run build` first — or use `npm run drives`, which builds for you
and runs all sixteen. (`node scripts/run-drives.mjs --list` names them; three
more are opt-in and not in the default set, since they want a real key, a real
Worker, or produce a PNG to look at rather than a pass.)

```bash
node e2e/smoke-drive.mjs      # a round played end to end
node e2e/wrapup-drive.mjs     # the packing gate: type the Danish, then play
node e2e/journey-drive.mjs    # a packed suitcase opens the road → travel → arrival
node e2e/suitcase-drive.mjs   # the suitcase: four word states, paging, the wrap-up button
node e2e/key-visible-drive.mjs # your own key is drawn on the board
node e2e/backup-drive.mjs     # export, wipe, restore, merge without loss
node e2e/update-drive.mjs     # a new service worker is noticed and applied
node e2e/nav-drive.mjs        # system Back peels one layer at a time
node e2e/layout-drive.mjs     # fold, map labels, journey's end — and the
                              # no-scroll rule: every screen fits the phone
node e2e/offline-drive.mjs    # the dictionary works with the network off
node e2e/ai-drive.mjs         # the real AI client against a fake Ollama:
                              # messy JSON, retries, the HTTP error taxonomy,
                              # and the key firewall asserted on the wire
node e2e/translate-drive.mjs  # look up a word mid-round, both directions,
                              # and the two rules that stop it reading the board
node e2e/article-drive.mjs    # en/et on every card, across all nine cities, on
                              # a 360px phone — and costing the word no line
node e2e/endgame-drive.mjs    # Casey opens; the 3x5 board; and sudden death
                              # won, lost and walked away from
node e2e/repeat-drive.mjs     # every board shares exactly three words with the
                              # one before it — across a reload and a v1 save
node e2e/proxy-drive.mjs      # the bundled CORS proxy, on the real Cloudflare
                              # runtime, fixing a CORS failure that is really
                              # there — including the key living on the worker
node e2e/map-preview.mjs      # (opt-in) render the map to a PNG for inspection
```

`proxy-drive` runs [`proxy/worker.js`](proxy/worker.js) unmodified on workerd
(via miniflare), with the app talking to it from a browser and an upstream that
deliberately sends no CORS headers — so it checks that the proxy solves a
problem that is actually present, that the key and the HTTP status both survive
the extra hop, and that the README's optional origin lock both lets you in and
shuts everyone else out. Without miniflare installed it prints
`PROXY DRIVE SKIPPED` and exits 0.

Two things no drive here can settle, because they need a key and a network.
First, whether a browser is allowed to talk to ollama.com at all — ten seconds,
plain node, no build and no browser:

```bash
OLLAMA_API_KEY=... node e2e/ollama-probe.mjs
```

It reads the CORS preflight rather than guessing from "the request worked"
(node enforces no CORS, so a successful call there proves nothing about a
phone), and says either "no proxy needed" or "this is what `proxy/` is for".
`OLLAMA_BASE_URL`, `OLLAMA_MODEL` and `ORIGIN` override the defaults; re-run it
against your worker to confirm the proxy fixed it.

Second, whether the clues are any good:

```bash
OLLAMA_API_KEY=... node e2e/live-drive.mjs
```

It plays one round and prints the clue Casey actually gave, so the prompts can
be judged against real output. Without a key it prints `LIVE DRIVE SKIPPED` and
exits 0. Set `OLLAMA_BASE_URL` to your Cloudflare Worker (see
[`proxy/README.md`](proxy/README.md)) if ollama.com refuses browser requests,
and `OLLAMA_MODEL` to try another model. The key is read from the environment,
never placed in a URL and never printed.

Useful dev URLs: `?mock=1` forces the offline companion, `?seed=N` fixes the
board, `?first=player` makes the player open the round instead of Casey,
`?howto=0` skips the rules overlay, `?grid=middle` picks the board *Spil
videre* deals, and `?city=N&collected=K&almost=K&wrapped=W` jumps the journey
to a given stop with K words collected (or one interaction short of it) and W
already wrapped into the suitcase.

### Architecture notes

- `src/engine/` — pure TypeScript game rules: dual-key generation
  (Duet-scaled, configurable in `config.ts`), turn state machine, clue
  legality, and `packing.ts`, which grades the wrap-up round's typed
  English→Danish answers. No React, no network. Every board number in
  `config.ts` carries the measurement it came from; `src/ai/selfplay.test.ts`
  is where they are measured and re-measurable.
- `src/ai/` — the companion. `projections.ts` is the **firewall**: prompt
  builders can only consume views that structurally exclude the player's key
  (clue-giving sees the AI's own key; guessing sees no key at all). Tests
  assert prompts are byte-identical under player-key permutations.
- `src/srs/` — Leitner scheduler + board sampler (frequency-ordered
  introduction bounded by the journey, overdue/struggling words oversampled).
- `src/journey/` — pure progression logic: word bands, the four word states,
  the wrap-up board draw and travel rules. Every route forward is monotonic —
  counters only rise, the wrapped ledger only grows — so the collection cannot
  regress. `cities.ts` and `map.ts` are facades over the active language's
  route; the Denmark data lives in `src/lang/da/`.
- `src/lang/` — **the language seam.** One pack per language, holding
  everything the game knows about it: orthography, morphology, grammar, the
  route and map, the language-specific half of the prompts, and the few UI
  strings that are not English. The engine and the graders take a pack as a
  parameter and never import one; everything above them reads the single
  active pack, resolved once from localStorage at load. Danish is the only
  pack that ships. `src/lang/types.ts` is the interface and, at the top of it,
  the checklist for adding German. `src/lang/da/map.ts` is generated by
  `scripts/make-map.mjs` from the official DAGI region polygons, simplified
  into an inline SVG path so the map needs no runtime fetch.
- `src/backup/` — pure export, validation and merge of a saved collection,
  separate from the stores it reads and writes.

## Credits

The map of Denmark is derived from Danish public-sector geodata: **DAGI**
(Danmarks Administrative Geografiske Inddeling), Geodatastyrelsen and Danske
Kommuner, FOT dataset at 1:500 000. The outline is reprojected and simplified
by `scripts/make-map.mjs`; the source data is unmodified upstream.
- Deployment: GitHub Actions → GitHub Pages on push to `main`.
