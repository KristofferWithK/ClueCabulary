// Renders the generated Denmark map with the journey route to a PNG, so the
// coastline and city placement can be eyeballed after `node scripts/make-map.mjs`.
//   SHOT_DIR=/tmp node e2e/map-preview.mjs
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const src = readFileSync(new URL('../src/journey/denmark.ts', import.meta.url), 'utf8')
const path = src.match(/DENMARK_PATH =\s*\n?\s*'([^']*)'/)[1]
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
  ['Viborg', 56.453, 9.402],
  ['Aalborg', 57.048, 9.921],
  ['Skagen', 57.724, 10.581],
  ['Odense', 55.403, 10.402],
  ['Roskilde', 55.642, 12.087],
  ['København', 55.676, 12.568],
]
const pts = CITIES.map(([n, lat, lon]) => ({ n, ...project(lon, lat) }))
const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

const html = `<body style="margin:0;background:#fff">
<svg xmlns="http://www.w3.org/2000/svg" width="${W / 2}" height="${H / 2}" viewBox="0 0 ${W} ${H}">
<path d="${path}" fill="#e8e6e0" stroke="#c9c3b2" stroke-width="2"/>
<polyline points="${line}" fill="none" stroke="#121212" stroke-width="4" stroke-dasharray="10 8"/>
${pts
  .map(
    (p, i) =>
      `<circle cx="${p.x}" cy="${p.y}" r="12" fill="${i === 0 ? '#4e8449' : '#fff'}" stroke="#121212" stroke-width="4"/>` +
      `<text x="${p.x + 20}" y="${p.y + 6}" font-family="Georgia" font-size="26">${p.n}</text>`,
  )
  .join('')}
</svg></body>`

const file = `${SHOT_DIR}/map.html`
writeFileSync(file, html)
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: W / 2, height: H / 2 } })
await page.goto(`file://${file}`)
await page.screenshot({ path: `${SHOT_DIR}/map-check.png` })
await browser.close()
console.log(`rendered ${SHOT_DIR}/map-check.png (${(path.length / 1024).toFixed(1)} KB path)`)
