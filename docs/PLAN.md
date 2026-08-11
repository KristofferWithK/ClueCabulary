# ClueCabulary — Implementation Plan

## Context

ClueCabulary is a single-player, mobile-first Danish vocabulary game inspired by
Codenames Duet mechanics (original naming throughout — "forbidden words", not
assassins; no Codenames word lists). The player learns the ~1000 most common
Danish content words by playing cooperative rounds with an AI companion that
genuinely cannot see the player's key card. Words stick because every clue forces
building semantic connections between them (elaborative encoding + generation
effect + retrieval practice).

Decisions already made with the user:

- **Stack**: Vite + React + TypeScript PWA (vite-plugin-pwa), zustand stores,
  zod validation. Mobile-first, installable, offline except AI calls.
- **AI backend**: Ollama Cloud with a user-supplied API key (entered in
  Settings, stored only in localStorage). OpenAI-compatible endpoint
  `https://ollama.com/v1/chat/completions`, Bearer auth, model name is a
  setting. CORS support is unverified → configurable base URL, CORS-failure
  detection, and a bundled Cloudflare Worker proxy (`proxy/worker.js`) as
  fallback.
- **Base language**: English (translations, dictionary, UI).
- **Deployment**: GitHub Pages via GitHub Actions on push to `main`;
  Vite `base: '/ClueCabulary/'`.

## Game rules (Duet-scaled)

Both keys exist: the player's and the AI's. Correctness of a guess is always
judged against the **clue-giver's** key. Roles alternate: player clues → AI
guesses; AI clues → player guesses. Guesser must guess ≥1, may continue while
hitting greens, capped at `number + 1`, turn ends on first non-green or stop.
Shared pool of turn tokens; all distinct greens found = win; tokens exhausted =
loss; forbidden word revealed = **redemption round**: translate every
not-yet-revealed board word (Danish→English, dictionary locked, forgiving
grading — case/articles/"to " stripped, Levenshtein tolerance scaled by gloss
length, any stored gloss accepted). All correct = win ("redeemed"), any miss =
loss.

Bystander reveals are **directional** (Duet fidelity): a word revealed as
bystander under an AI clue stays guessable under a player clue, and vice versa.
Green/forbidden reveals are global.

| Config (`src/engine/config.ts`) | beginner 3×4 | standard 4×5 | (Duet 5×5) |
|---|---|---|---|
| total words | 12 | 20 | 25 |
| greens per side / overlap | 5 / 2 | 7 / 2 | 9 / 3 |
| distinct greens | 8 | 12 | 15 |
| forbidden per side | 1 | 3 | 3 |
| cross-identity (both/vs-green/vs-bystander) | 0/0/1 | 1/1/1 | 1/1/1 |
| turn tokens | 6 | 8 | 9 |
| max new (unseen) words per board | 4 | 6 | — |

All numbers live in `GRID_CONFIGS` and are tunable; `keygen.ts` derives dealing
from the config and asserts internal consistency.

## Architecture

```
src/
├── data/        words.da.json (~1000 entries), types.ts
├── engine/      PURE TS, no React/fetch: config, types, rng (seeded mulberry32),
│                keygen (constructive dual-key dealing), board, game (applyEvent
│                reducer, exhaustive phase×event switch), legality, redemption
├── srs/         scheduler (Leitner boxes 0–4, intervals 0/1/3/7/14 days),
│                sampler (frequency-ordered new-word frontier + weighted review
│                pool + same-board exclusions: shared stems, Levenshtein ≤ 1,
│                shared English gloss)
├── ai/          projections.ts (THE FIREWALL: AiClueView = own key only,
│                AiGuessView = no keys), prompts, schemas (zod), client
│                (base URL, retry, CORS/auth error taxonomy), companion
│                (confidence-ordered guess execution, stop rules, caps),
│                mock/mockCompanion (deterministic, for dev + e2e)
├── stores/      zustand: settings, srs, game + localStorage persistence
│                (versioned)
└── ui/          screens: Home, Game, Redemption, Debrief, Settings, Stats
                 components: BoardGrid, WordCard, ClueBar/Input, AiTurnPanel,
                 TurnTokens, DictionarySheet, TranslationToggle, BottomSheet,
                 ErrorBanner
```

**Firewall enforcement**: prompt builders accept only projection types, and a
vitest invariance test builds prompts from games with *permuted player keys*
asserting byte-identical output (plus a string leak scan over many seeds). The
guess projection is additionally invariant under permuting *both* keys.

**AI robustness**: strict-JSON requests (`response_format: json_object` +
prompt), fence-strip → parse → zod, one retry with the error appended, then a
typed error surfaced as an in-UI banner with Retry — never a crash, game state
untouched. Clue legality (exact/substring ≥4/Danish-suffix stem match/
Levenshtein ≤1) is checked engine-side for BOTH the AI's and the player's clues.

**Debrief**: AI clue responses carry hidden `targets` + `rationale`; the debrief
screen reveals them per clue and adds one `getDebrief` call with vocabulary
takeaways (fallback: stored rationales alone).

## Dataset

`{ id, da, en[], pos, article?, exampleDa, exampleEn, freqRank }` — single-word
citation forms, content words only (noun/verb/adjective/adverb/numeral/
interjection), noun gender via `article`, glosses bare-form and synonym-rich for
fair grading, A1–A2 example sentences. Produced by a generation workflow
(7 POS/frequency slices) + bilingual verification pass per batch;
`scripts/validate-words.mjs` enforces schema, uniqueness, single-token `da`,
POS whitelist; `freqRank` computed by proportional interleave of slices.

## Milestones

M0 scaffold+pipeline ✓ → M1 dataset generation (workflow, runs in parallel) →
M2 engine core + tests → M3 redemption + SRS + tests → M4 AI layer vs mock +
firewall tests → M5 game UI on mock → M6 redemption/debrief/settings/stats UI →
M7 dataset integration at ~1000 + validator + sampler stats at volume →
M8 ship: proxy, icons, PWA polish, Playwright smoke (mock Ollama server,
390×844 viewport), README, deploy workflow.

## Verification

- `npm test`: engine invariants (hundreds of seeds per grid), full simulated
  games to every outcome, redemption grading matrix, SRS transitions + sampling
  statistics, legality table, firewall invariance + leak scan, schema
  round-trips, client error taxonomy (mocked fetch).
- `npm run build` + `tsc -b` clean.
- Playwright e2e against `vite preview` + `e2e/mock-ollama.mjs`: win a seeded
  beginner game; force a forbidden reveal and walk redemption both ways; CORS
  failure message path.
- Real-network testing is impossible in this sandbox (ollama.com egress
  blocked): the user validates with a real key on their phone after the first
  Pages deploy; Settings' "Test connection" + error taxonomy + bundled proxy
  cover the CORS unknown.

## Risks

1. **ollama.com CORS unknown** → configurable base URL, explicit CORS error
   message, ready-to-deploy worker proxy. Worst case: 5-minute Cloudflare
   setup, not a redesign.
2. **AI clue/guess quality** → all game-critical judgment is engine-side
   (legality, caps, stop rules); model is a free-text setting; mock companion
   isolates tuning.
3. **Dataset volume/quality** → game is playable from the first verified
   batches; validator + review pass make expansion mechanical; board-time
   exclusions defang residual near-duplicates.
