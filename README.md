# ClueCabulary

Learn Danish one clue at a time. ClueCabulary is a single-player, mobile-first
word game inspired by cooperative word-association games: a board of Danish
words, a secret key, and an AI companion — Klaus — who gives and guesses clues
**without ever seeing your key**. Vocabulary sticks because every clue forces
you to build connections between words.

## The journey

ClueCabulary is a journey through Denmark: ten stops from **Sønderborg** in the
far south, up Jutland to the tip at **Skagen**, then back across Funen and
Zealand to **København**. Each city owns 100 words — the most frequent hundred
first — and only words from the cities you have reached appear on your boards.

Every word is in one of three states, tracked like a Pokédex in **Samlingen**:
**undiscovered** until you meet it, **grey** once you have, and **green** after
you have clued or guessed it three times — or banked it by passing an exam.

Every ten green words in a city buys one attempt at a **rejseprøve**: twenty
words — your green ones first, then whatever the paper needs to fill up —
translated into English with no mistakes and no dictionary. Drawing the paper
spends the attempt whether you pass or fail. Passing banks those twenty words
and earns a **stempel**; five stempler fill the passport page and open the road
north, unlocking the next city's hundred words. Once ninety of a city's hundred
words are green it stops counting attempts.

## How a round works

1. The board is 3×4 (beginner), 3×5 (middle) or 4×5 (standard) Danish words
   from the ~1000 most common, each noun with its gender in front of it —
   **et hus**, the way the pair is learned. Your own key is the card's border:
   solid green for a target, dashed black for forbidden **on your key** — which
   is a word Klaus must never be led to, not a word you must never tap.
2. You open: you give a one-word clue, Klaus guesses — then Klaus clues and you
   guess. A clue's number is the whole allowance: guess that many right and the
   turn ends itself. (There is no Codenames-style bonus guess. It existed to
   pick up a word left over from an earlier clue, and in practice only read as
   the turn refusing to end once you had found everything the clue promised.)
   Stopping short is still yours to choose. Guesses are judged against the
   clue-giver's key. Klaus is told how
   many of his greens are left against how many clues remain, so he aims for
   two or three words a clue rather than picking off one at a time — and on his
   last clue, for everything he has left, since a green he never points at is
   one you cannot find in sudden death.
3. Find every green word before the shared clue tokens run out and you both
   win. Beginner is five clues, middle six, standard eight.
   Running out is not the end: the clues stop but the board does not, and
   **sudden death** lets you keep naming words with nothing left to go on. Name
   a green and you are still alive; name anything else and the round is over.
   **Forbidden words cut one way at a time**, because a guess is judged against
   the clue-giver's key and nothing else. Your dashed cards end the round only
   when *Klaus* names one under *your* clue — they are safe for you to tap while
   you guess his, where it is his forbidden words that are fatal and you cannot
   see those. (Sudden death is the exception: no clue-giver, so either key ends
   it. `game.test.ts` pins the whole rule; two mutations of the engine were
   checked to fail it.)

   Once **four clues** have been given, a forbidden word leaves one last chance
   instead of ending the round: **translate every unsolved word on the board** —
   dictionary locked, one shot, all or nothing. It closes again when the clues
   run out.

   That threshold is `REDEMPTION_AFTER_ROUND` in `src/engine/config.ts`, and
   two measured facts sit beside it there. The guessing side alternates
   strictly with the clue index — you open, so odd clues are Klaus guessing —
   which on the 3×4 board makes the fifth clue, the only eligible one, always
   his; and the board is barely more solved by then (9.3 of 12 words still
   unsolved at clue five, against 11.6 at clue one), so what the threshold
   changes is when the last chance is offered, not how long it takes.
4. **Clue in Danish.** Tap ⓘ on any board word for the built-in dictionary
   (translation, gender, example sentence), or open **Look up a word** in the
   clue dock to go the other way — English in, Danish out — which is the
   direction composing a clue actually needs. When Klaus clues in Danish, one
   tap loads his clue into the same box.
   Toggle **Aa** to overlay every translation — off to start with, so the board
   opens as twelve Danish words rather than twenty-four lines of text, and there
   is no opening study phase either (Settings can turn one back on; a save from
   before that default changed is migrated, since a persisted setting kept the
   old behaviour alive long after the default moved). Every lookup tells the practice
   scheduler which words to bring back sooner — including one done in the
   lookup box, which costs exactly what tapping ⓘ costs, and neither is
   available during the translation challenge or a travel exam. A clue may be
   any Danish word, so the lookup answers any word: the shipped thousand come
   back instantly and offline, and anything else is asked of Klaus without
   being asked twice. A hit that is already on the board says so, since it is
   the right translation and an illegal clue.
5. After each round Klaus debriefs: what his clues meant and which words
   deserve another look.

Progress is tracked per word with a spaced-repetition scheduler; new words are
introduced along the frequency ranking while struggling words return more
often. Every board carries exactly three words over from the one before —
weighted toward the three that went worst, and no word may carry twice running
— so a board is mostly new without ever dropping what you just struggled with.

The same signal steers the deal itself: words you keep forgetting become
Klaus's green targets, so you have to recall them, while words you know well
become the forbidden hazards you must knowingly avoid. A word is never both at
once on the 3×4 and 3×5 boards: nothing there is forbidden for one side and
green for the other, because Klaus cannot see your key and so cannot steer a
clue around a hazard only you can see.

### Keeping your collection

It lives in this phone's localStorage and nowhere else, so **Settings → Your
collection** writes it to a single JSON file. Restoring offers a merge that
keeps the better record for every word — it can never turn a green word grey —
or a wholesale replace. The file never contains your API key.

## Setup

The app is a PWA — open the deployed page on your phone and "Add to Home
Screen". Then, in **Settings**: tap **Gemini**, paste a
[Gemini key](https://aistudio.google.com/apikey), tap **List models this server
accepts**, pick one. That is the whole setup, and it has been played on from a
phone with no proxy involved.

Gemini is the default because it is the one measured to work. Its
[OpenAI-compatible endpoint](https://ai.google.dev/gemini-api/docs/openai)
speaks exactly what this app sends, it answers a browser directly, and its keys
can be [restricted to one HTTP referrer](https://ai.google.dev/gemini-api/docs/api-key)
— which is what makes a key held in a browser reasonable.

**Ollama Cloud is also preset, and needs more.** Measured on a real phone, it
refuses browser requests outright: its API answers the CORS preflight with a
redirect, which browsers will not follow, so no key or model name helps. To use
that service, deploy the small worker in [`proxy/`](proxy/README.md) — no
terminal required: add three secrets to this repository
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OLLAMA_API_KEY`) and run the
**Deploy the AI proxy** workflow from the Actions tab. Its summary prints the
Base URL to paste, and the key is uploaded as a Worker secret, so it lives at
Cloudflare rather than on your phone. One worker serves either service: set
`UPSTREAM` to `https://generativelanguage.googleapis.com` for Gemini.

No model name is preset anywhere. Ollama and Gemini publish conflicting ids for
the same model, and a wrong one returns a 404 that reads as a broken endpoint,
so Settings asks the server which names it accepts.

`src/ai/bundled-key.ts` is the one place to paste a key that ships with the
build, if you would rather not enter one on the device. It is empty by default,
and worth knowing before you fill it: this is a static site, so anything in the
bundle is readable by anyone who opens the page.

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
node scripts/make-map.mjs # regenerate the Denmark outline
node scripts/make-story.mjs story/story.json  # regenerate champions.ts + letter.ts
node scripts/make-icons.mjs                   # regenerate the PWA icons
```

The narrative — the opening letter and the ten city champions — is authored in
`story/story.json` and generated into `src/journey/letter.ts` and
`src/journey/champions.ts`. The generator refuses a roster that would read
badly: two champions sharing a name, a surname, a motif, a trade, or a first
name that differs only by spellings Danish tolerates.

Playwright drives run against the built app and each start their own preview
server, so `npm run build` first:

```bash
node e2e/smoke-drive.mjs      # a round played end to end
node e2e/redemption-drive.mjs # a forbidden word both sides of the threshold:
                              # the round ending on the spot, and the last
                              # chance opening and being translated back
node e2e/journey-drive.mjs    # travel exam → stempel → travel → arrival
node e2e/collection-drive.mjs # the Pokedex, a failed exam, a passed one
node e2e/key-visible-drive.mjs # your own key is drawn on the board
node e2e/backup-drive.mjs     # export, wipe, restore, merge without loss
node e2e/update-drive.mjs     # a new service worker is noticed and applied
node e2e/story-drive.mjs      # the letter opens, a champion sets the exam
node e2e/nav-drive.mjs        # system Back peels one layer at a time
node e2e/layout-drive.mjs     # fold, map labels, journey's end
node e2e/offline-drive.mjs    # the dictionary works with the network off
node e2e/ai-drive.mjs         # the real AI client against a fake Ollama:
                              # messy JSON, retries, the HTTP error taxonomy,
                              # and the key firewall asserted on the wire
node e2e/translate-drive.mjs  # look up a word mid-round, both directions,
                              # and the two rules that stop it reading the board
node e2e/article-drive.mjs    # en/et on every card, across all ten cities, on
                              # a 360px phone — and costing the word no line
node e2e/endgame-drive.mjs    # Klaus opens; the 3x5 board; and sudden death
                              # won, lost and walked away from
node e2e/repeat-drive.mjs     # every board shares exactly three words with the
                              # one before it — across a reload and a v1 save
node e2e/proxy-drive.mjs      # the bundled CORS proxy, on the real Cloudflare
                              # runtime, fixing a CORS failure that is really
                              # there — including the key living on the worker
node e2e/map-preview.mjs      # render the map to a PNG for inspection
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

It plays one round and prints the clue Klaus actually gave, so the prompts can
be judged against real output. Without a key it prints `LIVE DRIVE SKIPPED` and
exits 0. Set `OLLAMA_BASE_URL` to your Cloudflare Worker (see
[`proxy/README.md`](proxy/README.md)) if ollama.com refuses browser requests,
and `OLLAMA_MODEL` to try another model. The key is read from the environment,
never placed in a URL and never printed.

Useful dev URLs: `?mock=1` forces the offline companion, `?seed=N` fixes the
board, `?first=player` makes the player open the round instead of Klaus,
`?howto=0` skips the rules overlay, and `?city=N&learned=K&almost=K&stamps=G`
jumps the journey to a given stop with K words green (or one handling short of
it) and G stempler already earned.

### Architecture notes

- `src/engine/` — pure TypeScript game rules: dual-key generation
  (Duet-scaled, configurable in `config.ts`), turn state machine, clue
  legality, redemption grading. No React, no network.
- `src/ai/` — the companion. `projections.ts` is the **firewall**: prompt
  builders can only consume views that structurally exclude the player's key
  (clue-giving sees the AI's own key; guessing sees no key at all). Tests
  assert prompts are byte-identical under player-key permutations.
- `src/srs/` — Leitner scheduler + board sampler (frequency-ordered
  introduction bounded by the journey, overdue/struggling words oversampled).
- `src/journey/` — pure progression logic: the ten cities, word bands, the
  three word states, the exam paper and its attempt economy, and travel rules.
  Both routes to green only ever move forward, so the collection cannot
  regress. `denmark.ts` is
  generated by `scripts/make-map.mjs` from the official DAGI region polygons,
  simplified into an inline SVG path so the map needs no runtime fetch.
- `src/backup/` — pure export, validation and merge of a saved collection,
  separate from the stores it reads and writes.

## Credits

The map of Denmark is derived from Danish public-sector geodata: **DAGI**
(Danmarks Administrative Geografiske Inddeling), Geodatastyrelsen and Danske
Kommuner, FOT dataset at 1:500 000. The outline is reprojected and simplified
by `scripts/make-map.mjs`; the source data is unmodified upstream.
- Deployment: GitHub Actions → GitHub Pages on push to `main`.
