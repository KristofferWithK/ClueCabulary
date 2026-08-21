/**
 * Generates src/lang/da/map.ts — a small inline SVG path of Denmark's
 * coastline, so the map screen needs no runtime fetch and the PWA stays
 * offline-capable.
 *
 * Source: the official Danish administrative geography (DAGI) regions,
 * published as WGS84 GeoJSON. Fetched once here, projected, simplified with
 * Douglas–Peucker, and committed as generated code.
 *
 * The coastline is then drawn *by hand* — see "the pencil pass" below. That
 * happens here rather than in an SVG filter at render time so the runtime pays
 * nothing, the result is reviewable in the diff, and the same bytes ship to
 * every phone. (`feTurbulence` + `feDisplacementMap` was the alternative the
 * card offered; it costs a filter region the size of the map on every paint,
 * on the one screen that also animates, and it displaces the *rendered* pixels
 * — so it smears the route line and the city dots too unless they are lifted
 * out of the filtered group, which is more plumbing than a seeded sine wave.)
 *
 *   node scripts/make-map.mjs
 */
import { writeFileSync } from 'node:fs'

const SOURCE =
  'https://raw.githubusercontent.com/Neogeografen/dagi/master/geojson/regioner.geojson'

// Projected units per unit of the cos-compressed lon/lat grid. FIXED rather
// than derived from a target width, and that is load-bearing: every constant in
// the pencil pass below (STEP, the wobble wavelengths and amplitudes, MIN_AREA,
// the hatch spacing) is in projected units and calibrated against this number.
// Derive the scale from a target frame instead and cropping the frame silently
// rescales the drawing — a tighter crop would come back with a finer resample
// and half the wander, for no reason anybody could see in the diff.
//
// 239.18 is the number the uncropped 1000-wide map was built at, so the
// coastline this writes is the same coastline it always wrote. The viewBox is
// what the crop moves, and since both maps are letterboxed by HEIGHT — which
// the crop leaves alone — everything the app draws in viewBox units (the city
// dots, the labels, their offsets) keeps the size it was measured at.
const SCALE = 239.18
const PADDING = 24
// Everything east of this is dropped. Bornholm sits 1.9° of empty Baltic east
// of Zealand — a third of the map's width was sea holding one island the route
// never visits, and the frame now stops just past Zealand's east coast (12.80°)
// where the journey actually ends. Nothing lies between 12.80° and Bornholm's
// 14.68°, so this cuts no ring in half; the check below insists on that.
const CROP_EAST_LON = 13.5
// Rings smaller than this (in projected units²) are dropped — removes the
// hundreds of islets while keeping Als, Samsø, Læsø, Langeland…
const MIN_AREA = 40
// Douglas–Peucker tolerance in projected units. Higher = smaller file.
const TOLERANCE = 1.6
const LAT0 = 56 // mid-Denmark, for the longitude scale factor

const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
const geo = await res.json()

/** Collect every outer ring of every polygon in the file. */
const all = []
for (const feature of geo.features ?? []) {
  const g = feature.geometry
  if (!g) continue
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  for (const poly of polys) if (poly[0]?.length > 3) all.push(poly[0])
}
if (all.length === 0) throw new Error('no rings found — source format changed?')

// The crop. A ring that straddles the line would come out with a coast the
// Baltic cut off square, so this refuses rather than draws it.
const rings = all.filter((ring) => {
  const lons = ring.map((p) => p[0])
  const west = Math.min(...lons)
  const east = Math.max(...lons)
  if (west <= CROP_EAST_LON && east > CROP_EAST_LON) {
    throw new Error(
      `a ring straddles the ${CROP_EAST_LON}° crop (lon ${west.toFixed(2)}–${east.toFixed(2)}) — ` +
        `move CROP_EAST_LON into open water`,
    )
  }
  return east <= CROP_EAST_LON
})
const cropped = all.length - rings.length
if (cropped === 0) throw new Error(`nothing east of ${CROP_EAST_LON}° — is Bornholm still in the source?`)

const allLon = rings.flat().map((p) => p[0])
const allLat = rings.flat().map((p) => p[1])
const lonRange = [Math.min(...allLon), Math.max(...allLon)]
const latRange = [Math.min(...allLat), Math.max(...allLat)]
if (lonRange[0] < 7 || lonRange[1] > 16 || latRange[0] < 54 || latRange[1] > 58.5) {
  throw new Error(
    `coordinates do not look like WGS84 Denmark: lon ${lonRange}, lat ${latRange}`,
  )
}

// Equirectangular projection with the longitude compressed by cos(lat) so the
// country keeps its true proportions.
const kx = Math.cos((LAT0 * Math.PI) / 180)
const rawX = (lon) => lon * kx
const rawY = (lat) => -lat

const xs = allLon.map(rawX)
const ys = allLat.map(rawY)
const minX = Math.min(...xs)
const maxX = Math.max(...xs)
const minY = Math.min(...ys)
const maxY = Math.max(...ys)
const scale = SCALE
const WIDTH = Math.round((maxX - minX) * scale + 2 * PADDING)
const HEIGHT = Math.round((maxY - minY) * scale + 2 * PADDING)
const offsetX = PADDING
const offsetY = PADDING

const project = (lon, lat) => [
  (rawX(lon) - minX) * scale + offsetX,
  (rawY(lat) - minY) * scale + offsetY,
]

/** Shoelace area of a projected ring. */
const areaOf = (pts) => {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  }
  return Math.abs(a / 2)
}

const perpDist = (p, a, b) => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
  const cx = a[0] + Math.max(0, Math.min(1, t)) * dx
  const cy = a[1] + Math.max(0, Math.min(1, t)) * dy
  return Math.hypot(p[0] - cx, p[1] - cy)
}

function simplify(points, tolerance) {
  if (points.length < 3) return points
  let maxDist = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1])
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }
  if (maxDist <= tolerance) return [points[0], points[points.length - 1]]
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ]
}

const round = (n) => Math.round(n * 10) / 10

const shapes = rings
  .map((ring) => ring.map(([lon, lat]) => project(lon, lat)))
  .filter((pts) => areaOf(pts) >= MIN_AREA)
  .map((pts) => simplify(pts, TOLERANCE))
  .filter((pts) => pts.length >= 4)
  .sort((a, b) => areaOf(b) - areaOf(a))

/* ---------- the pencil pass ------------------------------------------------
 *
 * Douglas–Peucker leaves a coastline that reads as *digitised*: long dead-
 * straight runs meeting at hard corners. The map is drawn about a third of a
 * pixel to the projected unit on a phone, so that is most of what survives to
 * the screen, and it clashes with Casey — who is a pencil drawing, hatching
 * and all.
 *
 * So each ring is resampled at even spacing, low-passed to take the
 * digitiser's edge off the corners, and pushed off its true line by a wander
 * built from two sine waves plus a little grain. The waves are *periodic in
 * the ring* — their frequencies are whole numbers of cycles per lap — so the
 * shape closes on itself with no seam where the pen came back round.
 *
 * Everything is driven by one seeded generator, so `node scripts/make-map.mjs`
 * twice running gives byte-identical output and the diff means something.
 */
const SEED = 20260820
// Resample spacing in projected units — ~3px on a phone, so the segments
// themselves are invisible and only the wander they carry reads.
const STEP = 9
// Passes of a [¼ ½ ¼] moving average over the resampled ring. Two is enough to
// round the DP corners without eating a fjord.
const SMOOTH_PASSES = 2
// The wander: a long slow drift plus a shorter one. Wavelengths are in
// projected units, so they are the same size on Jutland and on Bornholm.
const WOBBLE = [
  { wavelength: 165, amplitude: 5.4 },
  { wavelength: 61, amplitude: 2.2 },
]
// Per-sample jitter — the graphite catching on the paper.
const GRAIN = 0.75
// A ring narrower than this gets proportionally less wander, or the amplitude
// would be a good fraction of the islet and Anholt would come out a blob.
const REF_EXTENT = 170
// The second pencil line is only drawn round shapes big enough to show it.
const SKETCH_MIN_EXTENT = 70
// It is drawn *from the first line*, not from the true coast, and with a much
// shorter, shallower wander — a hand going round an edge it has already drawn,
// missing it by a little. Wandering it independently of the first (the obvious
// way, and the first thing tried) puts the two lines up to twenty units apart
// where the waves fall out of phase, and the map reads as two coastlines with
// a channel between them rather than as one edge gone over twice.
const SKETCH_WOBBLE = [
  { wavelength: 88, amplitude: 1.9 },
  { wavelength: 33, amplitude: 0.85 },
]

/* The shading. Casey's `.cluey-hatch` is four parallel 45° strokes tucked into
 * the corners "a right-hander would have rested on"; this is the same hand
 * doing the same thing to a coastline. Every stroke is parallel, up and to the
 * right, and only the coasts that stroke runs *into* get any — so the shading
 * falls on the south-west edges and the map has a light source instead of a
 * fringe. */
const HATCH_MIN_EXTENT = 70
const HATCH_DIR = [Math.SQRT1_2, -Math.SQRT1_2]
const HATCH_SPACING = 15 // units of coast between strokes
const HATCH_LENGTH = 19
const HATCH_SKIP = 0.22 // dropped at random, so it reads as a hand, not a comb
// Started just inside the line rather than on it. Small: the coastline is a
// non-scaling 1.6 CSS px, which is about five projected units on the map screen
// and ten on Home, so at phone sizes the outline covers the root of the stroke
// whatever this is — it earns its place at the detail zoom the preview renders.
const HATCH_INSET = 2

/** mulberry32 — small, fast, and the same everywhere node runs. */
function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const perimeterOf = (pts) => {
  let total = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

const extentOf = (pts) => {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}

/** Even-spaced samples round a closed ring. GeoJSON repeats the first point. */
function resampleClosed(ring, step) {
  const pts = ring.slice()
  const last = pts[pts.length - 1]
  if (pts.length > 1 && last[0] === pts[0][0] && last[1] === pts[0][1]) pts.pop()
  const n = pts.length
  if (n < 3) return pts
  const segments = pts.map((a, i) => {
    const b = pts[(i + 1) % n]
    return Math.hypot(b[0] - a[0], b[1] - a[1])
  })
  const perimeter = segments.reduce((s, d) => s + d, 0)
  // Twelve samples even for a rock, so the wander has something to ride on.
  const count = Math.max(12, Math.round(perimeter / step))
  const out = []
  let seg = 0
  let walked = 0
  for (let k = 0; k < count; k++) {
    const target = (perimeter * k) / count
    while (seg < n - 1 && walked + segments[seg] < target) walked += segments[seg++]
    const a = pts[seg]
    const b = pts[(seg + 1) % n]
    const t = segments[seg] ? (target - walked) / segments[seg] : 0
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return out
}

/** Cyclic [¼ ½ ¼] low-pass — the corners of the simplifier, softened. */
function smoothClosed(pts, passes) {
  let cur = pts
  for (let pass = 0; pass < passes; pass++) {
    const n = cur.length
    const next = new Array(n)
    for (let i = 0; i < n; i++) {
      const a = cur[(i - 1 + n) % n]
      const b = cur[i]
      const c = cur[(i + 1) % n]
      next[i] = [0.25 * a[0] + 0.5 * b[0] + 0.25 * c[0], 0.25 * a[1] + 0.5 * b[1] + 0.25 * c[1]]
    }
    cur = next
  }
  return cur
}

/** Push a ring off its line, along the normal, by one of the wanders above. */
function pencil(pts, rand, wobble, grainScale = 1) {
  const n = pts.length
  const perimeter = perimeterOf(pts)
  const size = Math.min(1, extentOf(pts) / REF_EXTENT)
  const octaves = wobble.map((w) => ({
    // Whole cycles per lap, so the wave meets itself at the start point.
    cycles: Math.max(1, Math.round(perimeter / w.wavelength)),
    amplitude: w.amplitude * size,
    phase: rand() * Math.PI * 2,
  }))
  const grain = GRAIN * grainScale * size
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n]
    const next = pts[(i + 1) % n]
    const tx = next[0] - prev[0]
    const ty = next[1] - prev[1]
    const len = Math.hypot(tx, ty) || 1
    const t = i / n
    let d = (rand() - 0.5) * 2 * grain
    for (const o of octaves) d += o.amplitude * Math.sin(2 * Math.PI * o.cycles * t + o.phase)
    // Normal to the local tangent; which side is "out" does not matter, the
    // wander is symmetric about the true line either way.
    return [p[0] + (ty / len) * d, p[1] - (tx / len) * d]
  })
}

/**
 * Pencil shading along the coasts that face the stroke. Emitted as loose line
 * segments rather than clipped by an SVG `<clipPath>` over the coastline: the
 * clip would be a 16 KB path re-evaluated on every paint of the one screen
 * that also animates, and the strokes start on the coast and run inland by
 * design, so there is nothing to clip.
 */
function hatchFor(pts, rand) {
  const n = pts.length
  const strokes = []
  let since = HATCH_SPACING
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    since += Math.hypot(b[0] - a[0], b[1] - a[1])
    if (since < HATCH_SPACING) continue
    since = 0
    if (rand() < HATCH_SKIP) continue
    const len = HATCH_LENGTH * (0.6 + rand() * 0.7)
    const at = (d) => [a[0] + HATCH_DIR[0] * d, a[1] + HATCH_DIR[1] * d]
    const from = at(HATCH_INSET)
    const to = at(HATCH_INSET + len)
    // Which coasts get shading is decided by the stroke itself: keep it only
    // where a 45° line run inland from here stays inland. That picks out the
    // south-west edges without anyone having to know which way a ring winds —
    // deriving "out" from the normal at the topmost point (the first attempt)
    // silently inverted on rings whose top is a spike, and hatched whole
    // islands into the sea.
    if (!inside(pts, at(HATCH_INSET + len * 0.5)) || !inside(pts, to)) continue
    strokes.push([from, to])
  }
  return strokes
}

/** Ray casting, so a stroke can ask whether it is still on land. */
function inside(pts, [x, y]) {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

const toPath = (rings) =>
  rings.map((pts) => `M${pts.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`).join('')

const rand = makeRng(SEED)
const drawable = shapes.map((pts) => smoothClosed(resampleClosed(pts, STEP), SMOOTH_PASSES))

// Pass one is the land itself: filled, and the outline you actually read.
const drawn = drawable.map((pts) => pencil(pts, rand, WOBBLE))
const path = toPath(drawn)
// Pass two goes round pass one again, close enough to be the same edge.
const sketch = toPath(
  drawn
    .filter((pts) => extentOf(pts) >= SKETCH_MIN_EXTENT)
    .map((pts) => pencil(pts, rand, SKETCH_WOBBLE, 0.8)),
)
// Pass three is the shading.
const hatchStrokes = drawn
  .filter((pts) => extentOf(pts) >= HATCH_MIN_EXTENT)
  .flatMap((pts) => hatchFor(pts, rand))
const hatch = hatchStrokes
  .map(([a, b]) => `M${round(a[0])} ${round(a[1])}L${round(b[0])} ${round(b[1])}`)
  .join('')

const out = `// GENERATED by scripts/make-map.mjs — do not edit by hand.
//
// Map data: DAGI (Danmarks Administrative Geografiske Inddeling) — Danish
// public-sector geodata from Geodatastyrelsen & Danske Kommuner, FOT dataset,
// scale 1:500 000. Reprojected equirectangular at lat ${LAT0}° and simplified
// with Douglas–Peucker (tolerance ${TOLERANCE}); the upstream data is unmodified.
// Credit this source wherever the map is shown.
//
// Cropped at ${CROP_EAST_LON}°E: Bornholm and its rocks are ${cropped} rings of land the
// route never reaches, and holding them cost a third of the frame in empty
// Baltic. The scale is fixed (${SCALE} units per projected degree), so the crop
// narrows the viewBox and changes nothing about what is drawn inside it.
//
// The coastline below is then hand-drawn: resampled every ${STEP} units,
// low-passed, and pushed off its true line by a seeded wander of up to about
// ${WOBBLE.reduce((s, w) => s + w.amplitude, 0).toFixed(1)} units. It is a *drawing of* Denmark, not a survey of it — do not
// measure anything off it. \`projectCity\` below is unroughened and exact, which
// is why the city dots still land where they belong.

export const MAP_WIDTH = ${WIDTH}
export const MAP_HEIGHT = ${HEIGHT}

/** Place a real coordinate on the same projection as the coastline. */
export function projectCity(lon: number, lat: number): { x: number; y: number } {
  const kx = ${kx}
  const x = (lon * kx - ${minX}) * ${scale} + ${offsetX}
  const y = (-lat - ${minY}) * ${scale} + ${offsetY}
  return { x, y }
}

/** The land: filled, and the coastline you read. */
export const DENMARK_PATH =
  '${path}'

/**
 * The second pencil line round the big shapes — stroke only, no fill, drawn
 * over DENMARK_PATH. Two lines that nearly agree is the whole trick; drop this
 * and the map goes back to looking plotted.
 */
export const DENMARK_SKETCH =
  '${sketch}'

/**
 * Pencil shading on the coasts a 45° stroke runs into — the map's version of
 * Casey's \`.cluey-hatch\`. Loose segments, stroke only; render it under the
 * route so the journey stays the thing you read first.
 */
export const DENMARK_HATCH =
  '${hatch}'
`

// Inside the Danish pack since the language seam: the map is part of the
// language's route, and src/lang/da/route.ts packages what this writes.
writeFileSync(new URL('../src/lang/da/map.ts', import.meta.url), out)

const points = drawable.reduce((n, s) => n + s.length, 0)
console.log(
  `${all.length} rings, ${cropped} cropped east of ${CROP_EAST_LON}° -> ` +
    `${shapes.length} shapes in a ${WIDTH}x${HEIGHT} viewBox, ${points} drawn points, ` +
    `${(path.length / 1024).toFixed(1)} KB land + ${(sketch.length / 1024).toFixed(1)} KB sketch + ` +
    `${hatchStrokes.length} hatch strokes (${(hatch.length / 1024).toFixed(1)} KB)`,
)
