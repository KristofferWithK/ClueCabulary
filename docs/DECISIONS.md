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
| **Renaming the GitHub repo** (part of D3) | It changes the live Pages URL and breaks every installed PWA and saved link, including yours. There is no benefit to doing it at 3am and a real cost if you wake to a dead bookmark. | Every code-side change is done and merged — `vite.config.ts` base path, README links, workflow references — behind a single constant, so the rename plus one commit finishes it. |
| **Submitting to the App Store** (G2) | Submitting an app on your behalf, unattended, is not mine to do. | Privacy policy, store copy, keywords, age rating and screenshots prepared and in the repo. |
| **Anything needing a paid key I do not have** | Baked TTS (F1) needs a TTS provider key; the semantic tables (H3) need an embedding run. | The pipelines are written, tested against a stub, and run end-to-end the moment a key exists. One command each. |
| **Shipping German as playable** (H2) | You are the native verifier; unverified German in a language-learning app is the one quality risk not worth taking. | The language seam (H1) is real and Danish runs on it. German content is generated as a **draft**, not wired into the picker. |

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
