import { ACTIVE } from '../lang/active'

/**
 * The active language's country, drawn by hand.
 *
 * `src/lang/da/map.ts` is the generated Denmark art (`scripts/make-map.mjs`
 * still writes it, unchanged); `src/lang/da/route.ts` packages it. This is the
 * facade the two map-drawing screens import, so neither of them names a
 * country.
 */
export const MAP = ACTIVE.route.map
