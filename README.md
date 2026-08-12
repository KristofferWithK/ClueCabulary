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

1. The board is 3×4 (beginner) or 4×5 (standard) Danish words from the ~1000
   most common. You and Klaus each have a secret key marking green targets and
   **forbidden words**.
2. You alternate: you give a one-word clue, Klaus guesses — then Klaus clues
   and you guess. Guesses are judged against the clue-giver's key.
3. Find every green word before the shared clue tokens run out and you both
   win. Hit a forbidden word and there is one way out: **translate every
   unsolved word on the board** — dictionary locked, one shot, all or nothing.
4. Tap ⓘ on any word for the built-in dictionary (translation, gender,
   example sentence); toggle **Aa** to overlay translations. Every lookup tells
   the practice scheduler which words to bring back sooner.
5. After each round Klaus debriefs: what his clues meant and which words
   deserve another look.

Progress is tracked per word with a spaced-repetition scheduler; new words are
introduced along the frequency ranking while struggling words return more
often. The same signal steers the deal itself: words you keep forgetting become
Klaus's green targets, so you have to recall them, while words you know well
become the forbidden hazards you must knowingly avoid.

### Keeping your collection

It lives in this phone's localStorage and nowhere else, so **Settings → Your
collection** writes it to a single JSON file. Restoring offers a merge that
keeps the better record for every word — it can never turn a green word grey —
or a wholesale replace. The file never contains your API key.

## Setup

The app is a PWA — open the deployed page on your phone and "Add to Home
Screen". To wake Klaus up you need the bundled proxy; there is no way around
it. **A browser cannot call ollama.com at all** — its API answers the CORS
preflight with a redirect, and browsers forbid redirects on preflight, so the
request is refused before it is sent. No key, model name or app setting
changes that. `curl` works because `curl` is not a browser.

So:

1. Create an API key at https://ollama.com/settings/keys
2. Deploy the worker in [`proxy/`](proxy/README.md) — `npx wrangler deploy`,
   then `npx wrangler secret put OLLAMA_API_KEY`. Five minutes on a free
   Cloudflare account.
3. In the app: **Settings → Base URL** → your worker URL plus `/v1`. Leave the
   API key field empty; the worker holds it, so it is never in this repository,
   the app bundle, or your phone.
4. Tap **List models this server accepts** and pick one, rather than guessing
   between `gpt-oss:120b` and `gpt-oss:120b-cloud`.

Prefer the key on the phone? Skip step 2's secret and paste it into Settings
instead — a key the app sends wins over the worker's own.

## Development

```bash
npm install
npm run dev            # local dev server
npm test               # engine, SRS, AI-layer and firewall tests
npm run build          # typecheck + production build
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
node e2e/redemption-drive.mjs # hit a forbidden word, translate the board back
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
board, `?howto=0` skips the rules overlay, and `?city=N&learned=K&almost=K&stamps=G`
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
