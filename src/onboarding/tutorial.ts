import type { GameState } from '../engine/types'

/**
 * The tutorial round (O2): a real beginner board on the real engine, played
 * through a fully scripted first round with Casey narrating every beat.
 *
 * ── WHY EVERYTHING HERE IS FIXED ────────────────────────────────────────────
 *
 * A scripted fake board could teach a rule the game does not have — and the
 * clue-giver's-key rule has been written backwards in copy six times in this
 * repo. So the board is `GRID_CONFIGS.beginner` dealt by `createGame` with a
 * FIXED word list and a FIXED seed: the keys are deterministic, which is what
 * makes a hand-written script pinnable. `tutorial.test.ts` plays every beat
 * below through `applyEvent` and fails if any claim Casey makes stops being
 * what the engine does.
 *
 * The word order below is board order (it is shuffled onto the grid by the
 * deal); the SEED is what decides which words land on which key. 42931 was
 * searched for (not chosen at random) so that the roles come out exactly as
 * `TUTORIAL_ROLES` says — the search is reproducible from the constants here,
 * and the test asserts the roles rather than trusting this comment.
 */

/** The language this script is written for. Another pack skips the round and
 *  goes straight to the tour, which is language-agnostic (H2 brings its own
 *  script for the round itself). */
export const TUTORIAL_LANGUAGE = 'da'

export const TUTORIAL_SEED = 42931

/**
 * Sønderborg's first twelve frequency ranks, in rank order — the exact words a
 * fresh device would meet first anyway. Pinned by the test against
 * `wordsForCity(WORDS, 0)` and against the sampler's `conflicts()` pairwise,
 * so a dataset edit that renames, re-ranks or collides one of them fails loudly.
 */
export const TUTORIAL_WORD_IDS = [
  'da:mor',
  'da:far',
  'da:barn',
  'da:hund',
  'da:kat',
  'da:hus',
  'da:bord',
  'da:seng',
  'da:mad',
  'da:æble',
  'da:mælk',
  'da:vand',
]

/**
 * What the seed deals, stated as the script relies on it. The interesting card
 * is «barn»: green on the player's key, bystander on Casey's — the scripted
 * miss lands on it under Casey's clue (burned against him only) and Casey then
 * finds it under the player's clue, which is the directional rule taught
 * forwards for once.
 */
export const TUTORIAL_ROLES = {
  /** Green on both keys. Both fall in Casey's «drikke» turn. */
  sharedGreens: ['da:mælk', 'da:vand'],
  /** Green on Casey's key only — the player finds these under his clues. */
  aiOnlyGreens: ['da:hund', 'da:kat', 'da:seng'],
  /** Green on the player's key only — Casey finds these under «familie». */
  playerOnlyGreens: ['da:mor', 'da:far', 'da:barn'],
  /** On nobody's key. */
  bystanders: ['da:hus', 'da:bord', 'da:mad', 'da:æble'],
}

/**
 * Casey's clues, in the order his clue turns come round. Danish dataset words
 * OFF the board — owner's call, no English glosses — so the lookup the script
 * points at answers each one instantly and offline from the shipped
 * dictionary. Each is legality-checked against the board by the test.
 */
export const TUTORIAL_AI_CLUES = [
  {
    text: 'dyr',
    number: 2,
    targetWordIds: ['da:hund', 'da:kat'],
    rationale: 'hund and kat are both animals',
  },
  {
    text: 'drikke',
    number: 2,
    targetWordIds: ['da:mælk', 'da:vand'],
    rationale: 'mælk and vand are both things you drink',
  },
  {
    text: 'sove',
    number: 2,
    targetWordIds: ['da:kat', 'da:seng'],
    rationale: 'a cat sleeps all day, and a bed is where you sleep',
  },
]

/**
 * The player's clue turn offers three canned clues instead of free typing —
 * the game's highest-friction act is deferred to real play, and three visible
 * options teach what a clue looks like. All three point at the same three
 * greens (mor, far, barn), tightest fit first, so whichever the player picks
 * the scripted guesses that follow stay honest. Dataset words, off the board,
 * legality-checked by the test like Casey's own.
 */
export const TUTORIAL_CANNED_CLUES = [
  { text: 'familie', number: 3, hint: 'mother, father, child — one word holds all three' },
  { text: 'menneske', number: 3, hint: 'they are all people — true, but looser' },
  { text: 'ven', number: 3, hint: 'people you love — the loosest fit of the three' },
]

/**
 * Casey's guesses under the canned clue, in the order he takes them. «barn»
 * deliberately last: it is the card the scripted miss burned two turns
 * earlier, and finding it here is the payoff of the directional lesson.
 * Confidences are descending so `planGuessExecution` keeps this exact order.
 */
export const TUTORIAL_AI_GUESSES = [
  { wordId: 'da:mor', confidence: 0.92, reasoning: 'a mother is the middle of any family' },
  { wordId: 'da:far', confidence: 0.88, reasoning: 'where there is a mor there is a far' },
  {
    wordId: 'da:barn',
    confidence: 0.62,
    reasoning: 'it cost us a turn under my clue — but yours can still earn it',
  },
]

/**
 * One beat, one concept. The dock walks these top to bottom:
 *
 * - `say`        a bubble, tap-to-advance. `lookup` renders the dictionary
 *                below it, prefilled with Casey's current clue.
 * - `tapCard`    waits for any card tap — the first sound follows the first
 *                tap, the standing rule.
 * - `guess`      the player taps the NAMED card and confirms with the real
 *                guess-confirm; `expect` is the claim the commentary makes
 *                about what the engine will say.
 * - `chooseClue` the three canned clues.
 * - `watchGuess` a tap steps one of Casey's planned guesses.
 * - `win`        confetti, the case line, and the door to Home.
 */
export type TutorialBeat =
  | { kind: 'say'; text: string; mood?: 'idle' | 'thinking' | 'happy' | 'oops'; lookup?: boolean }
  | { kind: 'tapCard'; text: string }
  | { kind: 'guess'; wordId: string; expect: 'green' | 'bystander'; text: string; lookup?: boolean }
  | { kind: 'chooseClue'; text: string }
  | { kind: 'watchGuess'; wordId: string; expect: 'green'; text: string }
  | { kind: 'win'; text: string }

/**
 * The script. Where a line states a rule, the test pins the rule to the
 * engine at that exact position in the round — re-read game.test.ts ("a guess
 * is judged against the clue-giver key, and only that key") before editing any
 * of these sentences.
 */
export const TUTORIAL_BEATS: TutorialBeat[] = [
  {
    kind: 'say',
    text: 'Our first board! Twelve Danish words. We each hold a secret key that marks some of them green — find every green and we win together.',
  },
  {
    kind: 'tapCard',
    text: 'First things first: tap any card to hear its word. Every card speaks when you tap it.',
  },
  {
    kind: 'say',
    text: 'See the framed cards? Those are the greens on YOUR key — the words your clues must lead me to. My key stays secret, like yours is to me.',
  },
  {
    kind: 'say',
    text: 'I clue first. My clue points at greens on MY key — your job is to work out which cards I mean.',
    mood: 'thinking',
  },
  {
    kind: 'say',
    text: 'My clue: «dyr» — for 2 of my words.',
    mood: 'happy',
  },
  {
    kind: 'say',
    // Names the gesture rather than quoting the button's exact words: the
    // label is «dyr»'s own now, and a script that spells a label out is a
    // script that goes stale the next time the label is shortened.
    text: 'Don’t know «dyr»? Tap the lookup below — ⓘ on a card and Aa up top work too. The dictionary is always open.',
    lookup: true,
  },
  {
    kind: 'guess',
    wordId: 'da:hund',
    expect: 'green',
    text: 'So — which two cards could «dyr» mean? I’d start with «hund». Tap it, then confirm.',
    lookup: true,
  },
  {
    kind: 'say',
    text: '«hund» is green on MY key. A guess is always judged on the clue-giver’s key — and this clue was mine. One guess left on «dyr».',
    mood: 'happy',
  },
  {
    kind: 'guess',
    wordId: 'da:barn',
    expect: 'bystander',
    text: 'Now, careful: «barn» wears your green frame. Tempting? Under MY clue only MY key counts. Try it — this one is on me.',
  },
  {
    kind: 'say',
    text: '«barn» is not green on my key, so the guess misses and our turn is spent. But it is only burned under MY clues — under yours it is still alive, and still your green.',
    mood: 'oops',
  },
  {
    kind: 'say',
    text: 'That turn cost one clue token — see them at the top. We share five for the whole round.',
  },
  {
    kind: 'chooseClue',
    text: 'Your turn to clue! Pick one — a clue is one Danish word plus how many of your greens it points at.',
  },
  {
    kind: 'say',
    text: 'Now I guess — and this time it is YOUR key that decides. Tap to watch me think.',
    mood: 'thinking',
  },
  { kind: 'watchGuess', wordId: 'da:mor', expect: 'green', text: 'Hmm… «mor» feels right.' },
  { kind: 'say', text: '«mor» — green on your key. Your clue earned it!', mood: 'happy' },
  { kind: 'watchGuess', wordId: 'da:far', expect: 'green', text: '«far» belongs with it…' },
  { kind: 'say', text: '«far» — green again. One more.', mood: 'happy' },
  { kind: 'watchGuess', wordId: 'da:barn', expect: 'green', text: '…and «barn».' },
  {
    kind: 'say',
    text: '«barn»! Burned under my clue, green under YOURS — that is the whole rule. All three found, so the turn ends by itself.',
    mood: 'happy',
  },
  { kind: 'say', text: 'My turn again. «drikke» — 2 words.', mood: 'happy' },
  {
    kind: 'guess',
    wordId: 'da:mælk',
    expect: 'green',
    text: 'What can you drink here? Tap «mælk» and confirm.',
  },
  { kind: 'guess', wordId: 'da:vand', expect: 'green', text: 'And the other one — «vand».' },
  {
    kind: 'say',
    text: 'Two of two — the number is the whole allowance, so my turn ended by itself. Two tokens left.',
  },
  {
    kind: 'say',
    text: 'Last stretch: «sove» — 2 words. A cat sleeps anywhere… and where do you sleep?',
    mood: 'happy',
  },
  { kind: 'guess', wordId: 'da:kat', expect: 'green', text: 'Tap «kat».' },
  { kind: 'guess', wordId: 'da:seng', expect: 'green', text: 'And «seng» — go!' },
  {
    kind: 'win',
    text: 'Every green found — we won! A word that goes green both ways — once under your clue, once by your guess — goes into my case for good. Today each word earned one way; the case fills as we play.',
  },
]

/** Total guesses recorded in the round so far, across every clue. */
const guessCount = (game: GameState): number =>
  game.clueHistory.reduce((n, c) => n + c.guesses.length, 0)

/**
 * Where a reload resumes: the beat after the last action the engine has
 * evidence of. Narration between actions replays — a bubble repeated after a
 * reload is cheaper than a bubble skipped — and the intro replays in full when
 * nothing has been guessed yet. Pure over GameState, so the same walk the
 * pinned test makes covers this too.
 */
export function tutorialResumeIndex(game: GameState): number {
  let guessesBefore = 0
  let resume = 0
  const total = guessCount(game)
  const playerClued = game.clueHistory.some((c) => c.by === 'player')
  for (let i = 0; i < TUTORIAL_BEATS.length; i++) {
    const beat = TUTORIAL_BEATS[i]!
    if (beat.kind === 'guess' || beat.kind === 'watchGuess') {
      guessesBefore += 1
      if (total >= guessesBefore) resume = i + 1
    } else if (beat.kind === 'chooseClue') {
      if (playerClued) resume = i + 1
    } else if (beat.kind === 'tapCard') {
      // No engine trace of its own: past it exactly when play has started.
      if (total > 0) resume = i + 1
    }
  }
  return Math.min(resume, TUTORIAL_BEATS.length - 1)
}
