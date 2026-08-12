import { chromium } from 'playwright'

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const URL = 'http://127.0.0.1:5199/ClueCabulary/'
const OUT = '/tmp/claude-0/-home-user-ClueCabulary/7ac27a59-d477-5596-9dd7-fb61b6c3ebd4/scratchpad'

const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.addInitScript(() => {
  const s = document.createElement('style')
  s.textContent = `:root { font-family: 'Liberation Sans', Arial, sans-serif !important; }`
  document.documentElement.appendChild(s)
  localStorage.setItem('cluecab-howto-v1', 'seen')
  localStorage.setItem(
    'cluecab-settings-v1',
    JSON.stringify({ state: { apiKey: 'x', model: 'm', useMock: true, gridSize: 'standard', showTranslations: false }, version: 1 }),
  )
  // Skagen = city index 6, the northernmost stop on the map.
  localStorage.setItem(
    'cluecab-journey-v2',
    JSON.stringify({ state: { cityIndex: 6, stamps: {}, banked: {}, trialsSpent: {}, arrivedAt: {}, activeExam: null }, version: 2 }),
  )
})
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)

const out = {}

// --- 1. home map "you are here" label at the northernmost city ---
out.homeMapLabel = await page.evaluate(() => {
  const t = document.querySelector('.home-map-here')
  const bb = t.getBBox()
  const svgRect = document.querySelector('.home-map').getBoundingClientRect()
  const tRect = t.getBoundingClientRect()
  return {
    text: t.textContent,
    svgUserBBox: { x: +bb.x.toFixed(1), y: +bb.y.toFixed(1), w: +bb.width.toFixed(1), h: +bb.height.toFixed(1) },
    viewBox: document.querySelector('.home-map').getAttribute('viewBox'),
    cssPx: { labelTop: +(tRect.top - svgRect.top).toFixed(1), labelBottom: +(tRect.bottom - svgRect.top).toFixed(1), svgH: +svgRect.height.toFixed(1) },
  }
})
await page.screenshot({ path: `${OUT}/home-skagen.png`, fullPage: false })

// --- 2. Collection screen: dex slot alignment + locked text ---
await page.evaluate(() => {
  // reach city 6 so several cities are unlocked; open the collection
  ;[...document.querySelectorAll('.home-screen button')].find((b) => b.textContent.includes('Samlingen')).click()
})
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/collection.png`, fullPage: true })
out.collection = await page.evaluate(() => {
  const slots = [...document.querySelectorAll('.word-dex > li')]
  const rows = {}
  for (const li of slots) {
    const r = li.getBoundingClientRect()
    const key = Math.round(r.top)
    const inner = li.querySelector('.dex-slot') || li
    rows[key] = rows[key] || []
    rows[key].push({ text: inner.textContent.trim().slice(0, 18), liH: Math.round(r.height), innerH: Math.round(inner.getBoundingClientRect().height), wrapped: inner.getBoundingClientRect().height > 42 })
  }
  const mismatched = Object.entries(rows)
    .map(([top, items]) => ({ top: +top, liH: items[0].liH, heights: items.map((i) => i.innerH), items }))
    .filter((r) => new Set(r.heights).size > 1)
  const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth
  const locked = document.querySelector('.collection-locked')
  return {
    totalSlots: slots.length,
    mismatchedRows: mismatched.slice(0, 4),
    overflowX,
    lockedText: locked ? locked.textContent : null,
    lockedColor: locked ? getComputedStyle(locked).color : null,
    dexUnknownColor: getComputedStyle(document.querySelector('.dex-unknown') || document.body).color,
    docH: document.documentElement.scrollHeight,
  }
})

await browser.close()
console.log(JSON.stringify(out, null, 2))
