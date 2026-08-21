import { create } from 'zustand'
import {
  decideOnboarding,
  markOnboardDone,
  writeOnboardStep,
  type OnboardStep,
} from '../onboarding/flow'

export type Screen = 'home' | 'game' | 'settings' | 'suitcase' | 'map'

/**
 * The intro being on screen, and whether walking it writes anything.
 * `persist: true` is the real first run — each act advances the stored step
 * marker and finishing writes the done flag. `persist: false` is a transient
 * run (Settings' "Replay the intro", or `?onboard=1` in a drive): the same
 * screens, no storage touched, so the done flag stays exactly as it was.
 */
export interface OnboardingRun {
  step: OnboardStep
  persist: boolean
}

interface UiState {
  screen: Screen
  /** Word id shown in the dictionary bottom sheet, if open. */
  sheetWordId: string | null
  translationsOn: boolean
  /** Fixed board seed from the ?seed= URL param (dev/e2e). */
  pendingSeed: number | null
  /** Dev switch only: ?first=player starts the round with the player cluing. */
  pendingFirstGiver: 'player' | 'ai' | null
  howToOpen: boolean
  /** The intro (the train in), when it is on screen. See App.tsx. */
  onboarding: OnboardingRun | null
  goTo: (screen: Screen) => void
  openSheet: (wordId: string) => void
  closeSheet: () => void
  toggleTranslations: () => void
  resetTranslations: () => void
  openHowTo: () => void
  closeHowTo: () => void
  /** A transient re-run — replay from Settings, or ?onboard=1. */
  startOnboarding: () => void
  advanceOnboarding: (step: OnboardStep) => void
  /** Done or skipped, either way: mark it (when real) and land Home. */
  finishOnboarding: () => void
}

/**
 * Bumped when a rule in the dialog changes, because this dialog opens itself
 * exactly once ever and there is no other moment the app states the rules.
 *
 * v2: a forbidden word ended the round outright until four clues had been
 * given. Without the bump, everyone who had already played kept "hit a
 * forbidden word and one chance remains" as the last thing the app told them,
 * and then lost a round to a rule no screen ever showed them.
 *
 * v3: the whole meta-game changed — collect by cluing AND guessing, wrap in
 * wrap-up rounds, travel on a packed suitcase. Everyone gets the rules once
 * more.
 *
 * v4: forbidden words and the last chance are gone entirely — the two rules v2
 * existed for. A player still on v3 has been told about a mechanic that is no
 * longer in the game, which is the same failure v2 was bumped to avoid, in the
 * other direction. One bump per release: the overlay's copy is being rewritten
 * properly on top of this, and that rewrite ships with this key, not another.
 *
 * Since O1 the overlay never opens ITSELF — onboarding owns first-run and the
 * ? button is the only door — so the bump-on-rule-change duty has passed to
 * the intro. The key still matters twice over: closing the overlay writes it,
 * and the onboarding gate reads it as proof a device predates the intro.
 */
export const HOWTO_KEY = 'cluecab-howto-v4'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', ''])

/**
 * Whether the ?city / ?learned / ?seed switches are honoured. They rewrite the
 * collection without asking, which is right for a test and wrong for a link
 * someone was sent. Dev server, Playwright drives and a local preview qualify;
 * a deployed origin never does.
 *
 * Defined ABOVE the store on purpose: `initialOnboarding` calls this while
 * `create()` is evaluating, and `LOCAL_HOSTS` as a `const` below that point
 * is a temporal-dead-zone crash — in the PRODUCTION bundle only, because dev
 * returns early on `import.meta.env.DEV`. onboarding-drive caught it live:
 * every `?onboard=1` load went white while every other URL worked.
 */
export function devSwitchesAllowed(): boolean {
  if (typeof window === 'undefined') return false
  if (import.meta.env.DEV) return true
  return LOCAL_HOSTS.has(window.location.hostname)
}

/**
 * What the intro should be doing when the page opens, resolved before the
 * first paint rather than in an effect — the one frame of Home a fresh device
 * would otherwise see is exactly the "opens inside the train" promise broken.
 *
 * Precedence, and why each rung sits where it does:
 *  1. `?onboard=1` (dev/e2e only) forces a TRANSIENT run, beating everything —
 *     it exists so drives can put the train on screen against any profile.
 *  2. `?howto=0` suppresses the flow, writing nothing. It has suppressed the
 *     rules overlay in dozens of drive URLs since v1; onboarding inherits the
 *     switch so those drives keep meaning "no first-run chrome".
 *  3. The gate (src/onboarding/flow.ts): fresh runs, mid-flow resumes,
 *     anything else stays null — App marks veterans done silently.
 */
function initialOnboarding(): OnboardingRun | null {
  // Not just `typeof window`: the store tests stub a window that is ONLY
  // { localStorage } — zustand needs no more — and this runs at module load,
  // inside create(), where reaching for a location that is not there took
  // two whole suites down rather than one test.
  if (typeof window === 'undefined' || !window.location) return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('onboard') === '1' && devSwitchesAllowed()) {
    return { step: 'train', persist: false }
  }
  if (params.get('howto') === '0') return null
  const decision = decideOnboarding()
  if (decision.kind === 'fresh') return { step: 'train', persist: true }
  if (decision.kind === 'resume') return { step: decision.step, persist: true }
  return null
}

/**
 * Each screen/overlay pushes a history entry so the Android back gesture (and
 * browser back) closes the sheet or returns home instead of quitting the
 * installed PWA. App.tsx handles popstate.
 */
/** Entries this app has pushed and not yet consumed. */
let depth = 0
/** Set while unwinding an entry ourselves, so App's popstate handler stands down. */
let selfPop = false

const pushHistory = () => {
  try {
    history.pushState({ cluecab: true }, '')
    depth++
  } catch {
    // History can be unavailable in exotic embeds — navigation still works.
  }
}

/**
 * Closing a layer from inside the app must consume the entry that opening it
 * pushed. Without this the entry is orphaned and the next system Back press is
 * swallowed unwinding it — the user taps Back and nothing happens.
 */
const popHistory = () => {
  if (depth === 0) return
  depth--
  selfPop = true
  try {
    history.back()
  } catch {
    selfPop = false
  }
}

/** Returning home consumes every entry the screens above it pushed. */
const unwindToFloor = () => {
  if (depth === 0) return
  const steps = depth
  depth = 0
  selfPop = true
  try {
    history.go(-steps)
  } catch {
    selfPop = false
  }
}

/** True when the popstate now firing is one we asked for; clears on read. */
export function consumeSelfPop(): boolean {
  const was = selfPop
  selfPop = false
  if (!was) depth = Math.max(0, depth - 1)
  return was
}

export const useUi = create<UiState>((set, get) => ({
  screen: 'home',
  sheetWordId: null,
  translationsOn: false,
  pendingSeed: null,
  pendingFirstGiver: null,
  howToOpen: false,
  onboarding: initialOnboarding(),
  goTo: (screen) => {
    const from = get().screen
    // Home is the floor. Hopping screen to screen used to push a second entry
    // and returning home popped only one, so the strays piled up and a system
    // Back press went to unwinding them instead of leaving the app.
    if (screen === 'home') unwindToFloor()
    else if (from === 'home') pushHistory()
    set({ screen, sheetWordId: null })
  },
  openSheet: (wordId) => {
    if (!get().sheetWordId) pushHistory()
    set({ sheetWordId: wordId })
  },
  closeSheet: () => {
    if (get().sheetWordId) popHistory()
    set({ sheetWordId: null })
  },
  toggleTranslations: () => set((s) => ({ translationsOn: !s.translationsOn })),
  resetTranslations: () => set({ translationsOn: false }),
  openHowTo: () => {
    if (!get().howToOpen) pushHistory()
    set({ howToOpen: true })
  },
  closeHowTo: () => {
    localStorage.setItem(HOWTO_KEY, 'seen')
    if (get().howToOpen) popHistory()
    set({ howToOpen: false })
  },
  startOnboarding: () => {
    // Only replay/force paths come through here — a REAL first run arrives via
    // initialOnboarding() so the train is there before the first paint. Hence
    // always transient: the done flag on a device replaying the intro stays.
    set({ onboarding: { step: 'train', persist: false } })
  },
  advanceOnboarding: (step) => {
    const run = get().onboarding
    if (!run) return
    // The marker goes down as the flow moves so a reload resumes mid-flow —
    // including the reload setActiveLanguage() performs on a real language
    // choice at the ticket (src/lang/active.ts).
    if (run.persist) writeOnboardStep(step)
    set({ onboarding: { ...run, step } })
  },
  finishOnboarding: () => {
    const run = get().onboarding
    if (!run) return
    if (run.persist) markOnboardDone()
    // Home is the floor (see goTo): consume any history entries screens above
    // it pushed, so the system Back press after the intro leaves the app
    // rather than unwinding strays.
    unwindToFloor()
    set({ onboarding: null, screen: 'home', sheetWordId: null })
  },
}))

/*
 * There was a `shouldShowHowTo()` here: first visit, the rules overlay opened
 * itself once, NYT-style. Onboarding owns first-run now (O1) — the overlay
 * never auto-opens and is reached only through the ? button. HOWTO_KEY stays:
 * closing the overlay still writes it, and the onboarding gate reads it as
 * evidence that a device predates the intro (src/onboarding/flow.ts).
 */
