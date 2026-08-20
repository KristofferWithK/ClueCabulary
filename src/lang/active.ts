import { DEFAULT_LANGUAGE, isLanguageCode, packFor } from './index'
import type { LanguageCode, LanguagePack } from './types'

/**
 * Which language this session is playing.
 *
 * ── WHY THIS IS NOT IN `settingsStore` ─────────────────────────────────────
 *
 * Two reasons, and the first is fatal on its own.
 *
 * 1. **It would be an import cycle.** The dataset is needed at MODULE SCOPE —
 *    `src/data/lookup.ts` builds three indexes over it as its top-level body,
 *    and `src/data/words.ts` builds four more. So `data/words` must be able to
 *    ask which language is active while it is still being evaluated. Route that
 *    question through `settingsStore` and the graph is
 *    `data/words -> lang/active -> stores/settingsStore -> journey/progress ->
 *    data/words`, which resolves to a half-initialised module and an empty
 *    dataset, intermittently, depending on which screen imported first.
 *
 * 2. **A rehydrated store is not available early enough to be trusted.** Even
 *    without the cycle, persist() rehydrates when the store module is first
 *    evaluated, and nothing guarantees that happens before the dataset is
 *    indexed. Reading localStorage directly is the same data one step earlier,
 *    with no ordering to get wrong. `rescueStrandedJourney` sets the precedent
 *    for reaching past zustand to the storage underneath.
 *
 * The cost is that **switching language reloads the app**. That is the right
 * behaviour anyway: every board, every index, every route and the whole word
 * list change at once, and a reload is both simpler and more honest than trying
 * to swap them live.
 */

/**
 * Its own key rather than a field inside `cluecab-settings-v1`, for the reasons
 * above. Not versioned: the value is one of a closed set of two-letter codes,
 * an unreadable one falls back to Danish, and there is nothing here a migration
 * could ever need to reshape.
 */
export const LANGUAGE_KEY = 'cluecab-language'

/**
 * Read the stored code, defaulting to Danish. Total: a device that has never
 * chosen (every device today), a corrupt value, a language that has since been
 * removed from the build, and a storage that throws in private mode all land on
 * the same answer.
 */
export function readStoredLanguage(storage?: Pick<Storage, 'getItem'>): LanguageCode {
  try {
    const raw = storage?.getItem(LANGUAGE_KEY)
    return isLanguageCode(raw) ? raw : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

const stored = readStoredLanguage(
  typeof localStorage === 'undefined' ? undefined : localStorage,
)

/**
 * THE ACTIVE PACK. Resolved once, at module load, and constant for the life of
 * the page.
 *
 * Every module that needs "the language we are playing" reads this. Every
 * module that could be handed a DIFFERENT language takes a pack as a parameter
 * instead — the engine, the graders, the prompt builders — so the seam is
 * exercised by tests with a fake pack rather than only by whatever this
 * happens to be.
 */
export const ACTIVE: LanguagePack = packFor(stored)

/**
 * Change language and reload, which is the only way to change it. Writing the
 * key before reloading is the whole mechanism; `ACTIVE` is resolved from it on
 * the way back up.
 *
 * Progress is not touched. The SRS map and the wrapped ledger are keyed by word
 * id and so hold both languages side by side; the journey position is parked by
 * `journeyStore` under the language it belongs to and comes back untouched when
 * that language does.
 */
export function setActiveLanguage(code: LanguageCode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LANGUAGE_KEY, code)
  } catch {
    // Private mode, or a full quota. Nothing useful to do: the picker will
    // simply come back showing the language that is still active.
    return
  }
  location.reload()
}
