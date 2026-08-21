// Where Home's vertical budget actually goes, and how much of the map's card
// is empty. Not a drive — nothing here asserts. It prints the numbers that
// `.home-map`'s max-height is chosen against, because the map is capped by
// HEIGHT while its card is sized by WIDTH, so the drawing is far smaller than
// the box it sits in and eyeballing the box flatters it (the same trap
// map-preview.mjs documents).
//
//   npm run build && node e2e/home-space-probe.mjs
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const preview = await startPreview(4201)
const BASE = preview.base
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})

const measure = (page) =>
  page.evaluate(() => {
    const screen = document.querySelector('.home-screen')
    const map = document.querySelector('.home-map')
    const band = document.querySelector('.cluey-band')
    const casey = document.querySelector('.cluey-svg')
    const box = map.getBoundingClientRect()
    // The DRAWING, not the element: preserveAspectRatio letterboxes a 1.23:1
    // viewBox inside a much wider box.
    const vb = map.viewBox.baseVal
    const k = Math.min(box.width / vb.width, box.height / vb.height)
    const rows = [...screen.children].map((el) => ({
      cls: el.className.toString().split(' ')[0],
      h: +el.getBoundingClientRect().height.toFixed(1),
    }))
    return {
      rows,
      map: {
        box: `${box.width.toFixed(0)}x${box.height.toFixed(0)}`,
        drawn: `${(vb.width * k).toFixed(0)}x${(vb.height * k).toFixed(0)}`,
        emptyEachSide: +((box.width - vb.width * k) / 2).toFixed(1),
        vh: +((box.height / window.innerHeight) * 100).toFixed(1),
      },
      band: +band.getBoundingClientRect().height.toFixed(1),
      caseyW: +casey.getBoundingClientRect().width.toFixed(1),
      scroll: +document.scrollingElement.scrollHeight.toFixed(0),
      inner: window.innerHeight,
    }
  })

try {
  for (const vp of [
    { name: '360x640', width: 360, height: 640 },
    { name: '375x667', width: 375, height: 667 },
    // Just over the 720px media threshold, where the taller default applies to
    // a phone barely taller than the ones it does not: the worst case for the
    // default value, and the reason it is measured rather than assumed.
    { name: '360x721', width: 360, height: 721 },
    { name: '390x844', width: 390, height: 844 },
    { name: '412x915', width: 412, height: 915 },
  ]) {
    for (const [label, q] of [
      ['plain ', '?mock=1&howto=0&city=0'],
      ['travel', '?mock=1&howto=0&city=0&wrapped=100'],
    ]) {
      // A fresh context per run: `?wrapped=100` writes to the persisted
      // journey store, so a reused page carries the travel button into the
      // run that is supposed to be without it.
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await ctx.newPage()
      await page.goto(`${BASE}${q}`)
      await page.waitForSelector('.home-map')
      const m = await measure(page)
      console.log(
        `\n${vp.name} ${label}  map box ${m.map.box} → drawn ${m.map.drawn} ` +
          `(${m.map.vh}vh, ${m.map.emptyEachSide}px empty each side)`,
      )
      console.log(
        `  rows: ${m.rows.map((r) => `${r.cls} ${r.h}`).join(' | ')}`,
      )
      console.log(
        `  cluey-band ${m.band}  cluey-svg ${m.caseyW}  ` +
          `scroll ${m.scroll}/${m.inner}${m.scroll > m.inner + 1 ? '  ** SCROLLS **' : ''}`,
      )
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  preview.stop()
}
