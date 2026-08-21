// Renders the generated Denmark map with the journey route to a PNG, so the
// coastline and city placement can be eyeballed after `node scripts/make-map.mjs`.
//   SHOT_DIR=/tmp node e2e/map-preview.mjs
//
// Drawn at the two sizes the app actually draws it — Home's strip and the map
// screen — and once large for detail, because the pencil pass is a judgement
// about how it looks on a phone and a 500px render flatters it. Colours are
// the app's own (index.css), so this sheet is what ships rather than a
// stand-in.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const src = readFileSync(new URL('../src/lang/da/map.ts', import.meta.url), 'utf8')
const path = src.match(/DENMARK_PATH =\s*\n?\s*'([^']*)'/)[1]
const sketch = src.match(/DENMARK_SKETCH =\s*\n?\s*'([^']*)'/)?.[1] ?? ''
const hatch = src.match(/DENMARK_HATCH =\s*\n?\s*'([^']*)'/)?.[1] ?? ''
const W = Number(src.match(/MAP_WIDTH = (\d+)/)[1])
const H = Number(src.match(/MAP_HEIGHT = (\d+)/)[1])
const kx = Number(src.match(/const kx = ([-\d.e]+)/)[1])
const xm = src.match(/const x = \(lon \* kx - ([-\d.e]+)\) \* ([-\d.e]+) \+ ([-\d.e]+)/)
const ym = src.match(/const y = \(-lat - ([-\d.e]+)\) \* ([-\d.e]+) \+ ([-\d.e]+)/)
const project = (lon, lat) => ({
  x: (lon * kx - Number(xm[1])) * Number(xm[2]) + Number(xm[3]),
  y: (-lat - Number(ym[1])) * Number(ym[2]) + Number(ym[3]),
})

const CITIES = [
  ['Sønderborg', 54.909, 9.792],
  ['Ribe', 55.33, 8.768],
  ['Kolding', 55.491, 9.472],
  ['Aarhus', 56.163, 10.203],
  ['Aalborg', 57.048, 9.921],
  ['Skagen', 57.724, 10.581],
  ['Odense', 55.403, 10.402],
  ['Roskilde', 55.642, 12.087],
  ['København', 55.676, 12.568],
]
const pts = CITIES.map(([n, lat, lon]) => ({ n, ...project(lon, lat) }))

// The route is bowed in the app (routePath in src/journey/map.ts), and this
// sheet exists to show what ships — a straight polyline here would flatter the
// one leg the bow was added for. Same formula, same constant, restated rather
// than imported because this file reads the generated map as TEXT and has no
// TypeScript to pull in. If BOW moves there, move it here.
const BOW = 0.14
const line = pts.reduce((d, b, i) => {
  if (i === 0) return `M${b.x.toFixed(1)} ${b.y.toFixed(1)}`
  const a = pts[i - 1]
  const cx = (a.x + b.x) / 2 + (b.y - a.y) * BOW
  const cy = (a.y + b.y) / 2 - (b.x - a.x) * BOW
  return `${d}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
}, '')

// Keep in step with .map-land / .map-sketch / .map-hatch in index.css —
// widths included. They are `vector-effect: non-scaling-stroke` there and here:
// stroke-width in viewBox units means a 2.6-wide coastline lands at 0.4 CSS px
// on Home, which is why the map used to render as a pale smudge whatever the
// path said.
const STYLE = `
.map-land { fill:#f7f7f5; stroke:rgba(18,18,18,0.55); stroke-width:1.6px }
.map-sketch { fill:none; stroke:rgba(18,18,18,0.3); stroke-width:1.2px }
.map-hatch { fill:none; stroke:rgba(18,18,18,0.26); stroke-width:1.1px }
.map-land, .map-sketch, .map-hatch {
  vector-effect: non-scaling-stroke;
  stroke-linejoin: round;
  stroke-linecap: round;
}`

// The two Zealand stops now sit inside a name's width of the east edge, so
// they lean left — and once both do, they need the vertical split too or they
// print one on top of the other. Same numbers as PLACEMENT in MapScreen.tsx;
// a sheet that let them collide would show a mess the app does not have.
const LEAN = { Roskilde: -18, København: 56 }

/** One drawing of Denmark at the given CSS width, labelled. */
const panel = (label, width, { labels = true } = {}) => {
  const k = width / W
  return `<figure style="margin:0">
<figcaption style="font:12px system-ui;color:#6e6e6e;padding:0 0 6px">${label}</figcaption>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${(H * k).toFixed(0)}"
     viewBox="0 0 ${W} ${H}" style="display:block;background:#fff">
<path class="map-land" d="${path}"/>
<path class="map-hatch" d="${hatch}"/>
<path class="map-sketch" d="${sketch}"/>
<path d="${line}" fill="none" stroke="#121212" stroke-width="5"
      stroke-dasharray="12 10" stroke-linecap="round"/>
${pts
  .map(
    (p, i) =>
      `<circle cx="${p.x}" cy="${p.y}" r="${i === 0 ? 22 : 16}" fill="${i === 0 ? '#4e8449' : '#fff'}" stroke="#121212" stroke-width="5"/>` +
      (labels
        ? LEAN[p.n] === undefined
          ? `<text x="${p.x + 26}" y="${p.y + 9}" font-family="Georgia" font-size="26">${p.n}</text>`
          : `<text x="${p.x - 26}" y="${p.y + LEAN[p.n]}" text-anchor="end" font-family="Georgia" font-size="26">${p.n}</text>`
        : ''),
  )
  .join('')}
</svg></figure>`
}

// The sizes Denmark is ACTUALLY drawn at. Both maps are sized by height
// (.home-map 24vh at or under 720px tall and 30vh above it, .denmark-map
// max-height 40vh) and the viewBox is 0.84:1 since the Bornholm crop, so the
// drawing's width follows from its height and not from the element it sits in.
// Home's button now hugs the drawing, so there the two agree; the map screen
// still letterboxes.
// Measuring the element instead of the drawing is how the first version of
// this sheet flattered the map by a factor of two.
const drawnWidth = (vh, viewportHeight, elementWidth) =>
  Math.round(Math.min(elementWidth / W, ((vh / 100) * viewportHeight) / H) * W)

const html = `<style>${STYLE}</style>
<body style="margin:0;background:#fff;padding:16px;display:flex;gap:20px;align-items:flex-start">
${panel(`Home · 360×640 · ${drawnWidth(24, 640, 328)}px`, drawnWidth(24, 640, 328), { labels: false })}
${panel(`Home · 390×844 · ${drawnWidth(30, 844, 358)}px`, drawnWidth(30, 844, 358), { labels: false })}
${panel(`Map screen · 390×844 · ${drawnWidth(40, 844, 358)}px`, drawnWidth(40, 844, 358))}
${panel('detail · 700px', 700)}
</body>`

const file = `${SHOT_DIR}/map.html`
writeFileSync(file, html)
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({
  viewport: { width: 1480, height: Math.round((H * 700) / W) + 60 },
  deviceScaleFactor: 2,
})
await page.goto(`file://${file}`)
await page.screenshot({ path: `${SHOT_DIR}/map-check.png`, fullPage: true })
await browser.close()
console.log(
  `rendered ${SHOT_DIR}/map-check.png ` +
    `(${(path.length / 1024).toFixed(1)} KB land + ${(sketch.length / 1024).toFixed(1)} KB sketch)`,
)
