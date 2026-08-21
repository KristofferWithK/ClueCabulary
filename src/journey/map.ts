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

/** A projected point, which is what `MAP.project` hands back. */
export type MapPoint = { readonly x: number; readonly y: number }

/**
 * How far a leg bows off its own chord, as a fraction of the leg's length.
 *
 * The bulge you see is HALF this — a quadratic Bézier reaches only halfway to
 * its control point — so this puts a few tens of units of curve on the long
 * Skagen crossing and a couple on the short run into København. Measured
 * against the drawing, not chosen: the ceiling is the value that still leaves
 * the Kattegat leg in open water rather than over Djursland.
 */
const BOW = 0.14

/**
 * The journey, as a line that was drawn rather than plotted.
 *
 * Nine stops joined by straight segments left one leg — Skagen down to Odense,
 * 555 units almost due south — reading as a ruler laid down the middle of the
 * country. The rail route it stands for is real (Skagensbanen to Frederikshavn,
 * down Jutland, over the Little Belt); it was the DRAWING that was wrong, on a
 * map whose every coastline is a hand-drawn wander.
 *
 * So each leg is one quadratic, its control point the chord's midpoint pushed
 * along the LEFT-hand normal. Left is the whole trick and not a coin toss: the
 * Skagen leg runs south, so its left is EAST, and the line bows out into the
 * Kattegat and reads as a crossing rather than a ruler.
 *
 * Each leg is computed from its own two endpoints and nothing else, which is
 * what makes the route splittable: Home and the map screen both draw
 * `points[0..here]` and `points[here..]` as two lines, and a leg has to come
 * out byte-identical whichever of the two it lands in. `map.test.ts` pins that.
 */
export function routePath(points: readonly MapPoint[], bow: number = BOW): string {
  const first = points[0]
  if (!first) return ''
  const n = (v: number) => v.toFixed(1)
  let d = `M${n(first.x)} ${n(first.y)}`
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    // (dy, -dx) is the leg turned a quarter left, and it is already as long as
    // the leg — so scaling it by `bow` IS "a fraction of the leg's length",
    // with no hypot and nothing to guard when a leg has no length at all.
    const cx = (a.x + b.x) / 2 + dy * bow
    const cy = (a.y + b.y) / 2 - dx * bow
    d += `Q${n(cx)} ${n(cy)} ${n(b.x)} ${n(b.y)}`
  }
  return d
}
