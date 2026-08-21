import { describe, expect, it } from 'vitest'
import { CITIES } from './cities'
import { MAP, routePath } from './map'

const ROUTE = CITIES.map((c) => MAP.project(c.lon, c.lat))

/** The Q control point of each leg, read back out of the path string. */
function legs(d: string): { cx: number; cy: number; x: number; y: number }[] {
  return [...d.matchAll(/Q([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)/g)].map((m) => ({
    cx: Number(m[1]),
    cy: Number(m[2]),
    x: Number(m[3]),
    y: Number(m[4]),
  }))
}

describe('routePath', () => {
  it('draws one curve per leg and ends on every stop', () => {
    const d = routePath(ROUTE)
    const drawn = legs(d)
    expect(drawn).toHaveLength(ROUTE.length - 1)
    for (const [i, leg] of drawn.entries()) {
      const stop = ROUTE[i + 1]!
      expect(leg.x).toBeCloseTo(stop.x, 1)
      expect(leg.y).toBeCloseTo(stop.y, 1)
    }
    expect(d.startsWith(`M${ROUTE[0]!.x.toFixed(1)} ${ROUTE[0]!.y.toFixed(1)}`)).toBe(true)
  })

  /**
   * The point of the whole exercise. Every leg has to leave its own chord, or
   * the line is a polyline again with extra syntax — which is exactly what a
   * `bow` of zero produces, and what this fails on.
   */
  it('bows every leg off its chord', () => {
    for (const [i, leg] of legs(routePath(ROUTE)).entries()) {
      const a = ROUTE[i]!
      const b = ROUTE[i + 1]!
      const chord = Math.hypot(b.x - a.x, b.y - a.y)
      // A quadratic reaches halfway to its control point, so this is the
      // deviation you can actually see at the middle of the leg.
      const bulge = Math.hypot(leg.cx - (a.x + b.x) / 2, leg.cy - (a.y + b.y) / 2) / 2
      expect(bulge).toBeGreaterThan(0.5)
      expect(bulge / chord).toBeCloseTo(0.07, 2)
    }
  })

  /**
   * Skagen (5) to Odense (6) is the leg the curve exists for, and WHICH WAY it
   * bows is the whole point: the leg runs south, so its bow must land east of
   * it, out in the Kattegat. Bow it the other way and the line crosses Jutland.
   */
  it('bows the Skagen crossing out to sea', () => {
    const leg = legs(routePath(ROUTE))[5]!
    const a = ROUTE[5]!
    const b = ROUTE[6]!
    expect(a.y).toBeLessThan(b.y) // Skagen is north of Odense: the leg runs south
    expect(leg.cx).toBeGreaterThan(Math.max(a.x, b.x)) // and the curve is east of both
  })

  /**
   * Both screens draw the route as TWO lines — travelled and ahead — split at
   * the current stop. A leg is drawn by whichever of them holds it, so it has
   * to come out identical either way, or the seam shows as a kink at the city
   * you are standing in.
   */
  it('draws a leg the same whichever half of the split it lands in', () => {
    const whole = legs(routePath(ROUTE))
    for (let here = 0; here < ROUTE.length; here++) {
      const done = legs(routePath(ROUTE.slice(0, here + 1)))
      const ahead = legs(routePath(ROUTE.slice(here)))
      expect([...done, ...ahead]).toEqual(whole)
    }
  })

  it('has nothing to draw for one stop or none', () => {
    expect(routePath([])).toBe('')
    expect(legs(routePath([ROUTE[0]!]))).toHaveLength(0)
  })
})
