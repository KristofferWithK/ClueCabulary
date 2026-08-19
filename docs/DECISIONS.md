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
