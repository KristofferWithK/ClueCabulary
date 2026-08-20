import { danish } from './da'
import type { LanguageCode, LanguagePack } from './types'

export type { LanguageCode, LanguagePack } from './types'

/**
 * The languages that actually ship.
 *
 * `LanguageCode` is wider than this on purpose — see the comment on that type.
 * H2 adds one line here and Settings' picker grows a second entry by itself.
 */
export const LANGUAGES: Partial<Record<LanguageCode, LanguagePack>> = {
  da: danish,
}

/**
 * What a device with nothing stored plays, and what an unknown stored code
 * falls back to. Danish is the launch language and the only verified one.
 */
export const DEFAULT_LANGUAGE: LanguageCode = 'da'

export const packFor = (code: LanguageCode): LanguagePack =>
  LANGUAGES[code] ?? LANGUAGES[DEFAULT_LANGUAGE]!

/** The playable packs, in the order the picker should list them. */
export const availableLanguages = (): LanguagePack[] => Object.values(LANGUAGES)

export const isLanguageCode = (v: unknown): v is LanguageCode => v === 'da' || v === 'de'

/**
 * ── STORE NAMESPACING: what is per-language and what is not ────────────────
 *
 * This is the part of the seam most likely to be got wrong, so the reasoning is
 * written down rather than left to be inferred from five persist() calls.
 *
 * **Already namespaced, and must not be namespaced again.** Every word id
 * carries its language: `da:mor`, and a German one would be `de:Mutter`. So
 * anything keyed by word id is partitioned by construction —
 *
 *   - `srsStore.stats`      (wordId -> WordStats)
 *   - `journeyStore.wrapped` (wordId -> when it was packed)
 *
 * — and both stay in ONE store under their existing keys. Splitting them per
 * language would move real progress between storage keys for no gain, and
 * renaming a stored key is the one mistake in this repo that has actually wiped
 * a player's collection (`src/journey/rescue.ts` is the apology). The
 * partitioning is asserted directly by `src/lang/seam.test.ts` rather than
 * trusted.
 *
 * **Route-relative, so genuinely per-language.** A city index means nothing
 * without the route it indexes, and Denmark's route is not Germany's:
 *
 *   - `journeyStore.cityIndex`
 *   - `journeyStore.arrivedAt` (keyed by city index)
 *
 * These are stamped with `routeLanguage` and parked under `parked` when the
 * language changes. Journey v5 adds those two fields and touches nothing else,
 * which is why the wrapped ledger provably cannot be harmed by it.
 *
 * **Deliberately shared, and this is a choice rather than an oversight.**
 *
 *   - `srsStore.games` — a round you played is a round you played.
 *   - `srsStore.wrapUpsBanked` — a win earns a wrap-up token, and spending a
 *     German win on a Danish wrap-up is fine. Per the standing "generous over
 *     strict" rule: a shared bank can only ever hand the learner more, and
 *     splitting it would strand tokens in a language they have stopped playing.
 *   - everything in `settingsStore` — Base URL, model, sound, grid size and the
 *     study phase are opinions about the app, not about a language.
 *
 * **Discarded on a language change.** `gameStore`'s in-flight game holds a
 * board of one language's words; it is stamped with its language and dropped
 * when that does not match. One abandoned mid-round on a switch is the same
 * cost A1 already accepted for a mid-round update.
 */
