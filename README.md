# ClueCabulary

Learn Danish one clue at a time. ClueCabulary is a single-player, mobile-first
word game inspired by cooperative word-association games: a board of Danish
words, a secret key, and an AI companion — Klaus — who gives and guesses clues
**without ever seeing your key**. Vocabulary sticks because every clue forces
you to build connections between words.

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
often.

## Setup

The app is a PWA — open the deployed page on your phone and "Add to Home
Screen". To wake Klaus up:

1. Create an API key at https://ollama.com/settings/keys
2. In the app: **Settings → Ollama API key** — the key is stored only on your
   device.
3. Tap **Test connection**. If it reports a CORS problem, deploy the tiny
   bundled proxy (see [`proxy/README.md`](proxy/README.md)) and set it as the
   Base URL.

No key? Enable the offline **practice companion** in Settings to learn the
rules (it plays legally but not cleverly).

## Development

```bash
npm install
npm run dev            # local dev server
npm test               # engine, SRS, AI-layer and firewall tests
npm run build          # typecheck + production build
npm run validate:words # dataset sanity checks
node e2e/smoke-drive.mjs  # Playwright smoke drive of the built app
```

Useful dev URLs: `?mock=1` forces the offline companion, `?seed=N` fixes the
board.

### Architecture notes

- `src/engine/` — pure TypeScript game rules: dual-key generation
  (Duet-scaled, configurable in `config.ts`), turn state machine, clue
  legality, redemption grading. No React, no network.
- `src/ai/` — the companion. `projections.ts` is the **firewall**: prompt
  builders can only consume views that structurally exclude the player's key
  (clue-giving sees the AI's own key; guessing sees no key at all). Tests
  assert prompts are byte-identical under player-key permutations.
- `src/srs/` — Leitner scheduler + board sampler (frequency-ordered
  introduction, overdue/struggling words oversampled).
- Deployment: GitHub Actions → GitHub Pages on push to `main`.
