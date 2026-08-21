/**
 * Onboarding flow state: which act of the intro a device is in, and whether it
 * should see the intro at all.
 *
 * ── WHY ITS OWN localStorage KEY, NOT A settingsStore FIELD ────────────────
 *
 * The HOWTO_KEY pattern (src/stores/uiStore.ts). `settingsStore` has no
 * `partialize`, so every save ever written carries every field — a default
 * added there reaches no device that has already stored a save without a
 * version bump and a migrate, which is the trap CLAUDE.md records three
 * times. A key of its own has no default to move and nothing to migrate:
 * unset IS the state "never onboarded", exactly like `cluecab-howto-v4`.
 *
 * ── THE GATE ────────────────────────────────────────────────────────────────
 *
 * Onboarding runs only on a genuinely fresh device: this key unset, AND the
 * rules overlay never seen (`cluecab-howto-v4` unset), AND the SRS map empty.
 * Any other device — the owner's phone above all — is marked done silently
 * and never ambushed by a tutorial for a game it has been playing for weeks.
 * `?howto=0`, already in dozens of drive URLs, suppresses the flow too, so
 * the sixteen existing drives did not have to change; `?onboard=1` behind
 * `devSwitchesAllowed()` forces a transient run (see uiStore).
 */

export const ONBOARD_KEY = 'cluecab-onboard-v1'

/**
 * The acts, in order. O1 ships the train (Casey's welcome) and the ticket
 * (the language pick); O2 adds the tutorial — a real scripted round on the
 * real engine — after the ticket, and O3 will add the tour. A step is written
 * to the key as the flow advances so a reload — and in particular the reload
 * `setActiveLanguage` performs on a real language choice — resumes where it
 * left off rather than starting over.
 */
export type OnboardStep = 'train' | 'ticket' | 'tutorial'

export const isOnboardStep = (v: unknown): v is OnboardStep =>
  v === 'train' || v === 'ticket' || v === 'tutorial'

export type OnboardDecision =
  /** Nothing anywhere says this device has played: run the flow. */
  | { kind: 'fresh' }
  /** The flow was started and not finished — a reload mid-flow, or the
   *  language-choice reload. Pick up at the recorded step. */
  | { kind: 'resume'; step: OnboardStep }
  /** No onboarding record, but the device has clearly played (rules seen, or
   *  words in the SRS map). The caller marks it done silently. */
  | { kind: 'veteran' }
  | { kind: 'done' }

/**
 * Mirrors `HOWTO_KEY` in src/stores/uiStore.ts. A literal rather than an
 * import so this module has no dependencies and no cycle with the store that
 * will import it; flow.test.ts pins the two spellings to each other, so a v5
 * bump over there cannot silently strand this one.
 */
const HOWTO_SEEN_KEY = 'cluecab-howto-v4'

/** srsStore's persist key. Read raw, the `rescueStrandedJourney` precedent. */
const SRS_KEY = 'cluecab-srs-v1'

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

const local = (): Storage | undefined =>
  typeof localStorage === 'undefined' ? undefined : localStorage

/**
 * Whether the SRS map holds no words. The key never written counts as empty;
 * a record that PARSES to an empty stats map counts as empty; anything else —
 * words in it, an unexpected shape, corrupt JSON — counts as not empty,
 * because the gate must only open when the device can be PROVEN fresh. A
 * wrong "veteran" costs a replayable intro; a wrong "fresh" ambushes a
 * player, so ties break toward veteran.
 */
function srsMapEmpty(storage: ReadableStorage): boolean {
  const raw = storage.getItem(SRS_KEY)
  if (raw === null) return true
  try {
    const stats = (JSON.parse(raw) as { state?: { stats?: unknown } })?.state?.stats
    return (
      typeof stats === 'object' && stats !== null && Object.keys(stats).length === 0
    )
  } catch {
    return false
  }
}

/**
 * The gate, as one total function. Storage that throws (private mode) lands
 * on `done` — never ambush a device we cannot read.
 */
export function decideOnboarding(storage: ReadableStorage | undefined = local()): OnboardDecision {
  if (!storage) return { kind: 'done' }
  try {
    const marker = storage.getItem(ONBOARD_KEY)
    if (marker === 'done') return { kind: 'done' }
    if (isOnboardStep(marker)) return { kind: 'resume', step: marker }
    // Any other non-null marker is a step this build does not know — written
    // by a newer build, then downgraded. The flow was begun; restart it.
    if (marker !== null) return { kind: 'resume', step: 'train' }
    if (storage.getItem(HOWTO_SEEN_KEY) !== null) return { kind: 'veteran' }
    if (!srsMapEmpty(storage)) return { kind: 'veteran' }
    return { kind: 'fresh' }
  } catch {
    return { kind: 'done' }
  }
}

/** Record the act the flow has reached, so a reload resumes there. */
export function writeOnboardStep(step: OnboardStep, storage: WritableStorage | undefined = local()): void {
  try {
    storage?.setItem(ONBOARD_KEY, step)
  } catch {
    // Private mode or full quota: the flow still runs, it just cannot resume.
  }
}

/** Finished, skipped, or inferred from a device that has clearly played. */
export function markOnboardDone(storage: WritableStorage | undefined = local()): void {
  try {
    storage?.setItem(ONBOARD_KEY, 'done')
  } catch {
    // Same bargain as above: worst case the intro offers itself again.
  }
}
