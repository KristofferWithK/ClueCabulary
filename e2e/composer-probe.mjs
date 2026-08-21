// K1's measurement, kept so the number in index.css can be re-taken rather
// than re-reasoned. Opt-in (not in the default drive list): it prints, it
// asserts nothing.
//
// What it prints, at 360x640: how tall the composer WANTS to be (height:auto)
// in every state a turn can put it in, and how tall each of its three rows is;
// then the same question asked of the other docks, which is what --dock-slot-h
// has to keep covering until K2 brings them down to --dock-h.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4196
const preview = await startPreview(PORT)
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } })
const page = await ctx.newPage()

const auto = () =>
  page.evaluate(() => {
    const dock = document.querySelector('.game-screen .dock.clue-input')
    if (!dock) return null
    const prev = dock.style.height
    dock.style.height = 'auto'
    const r = Math.round(dock.getBoundingClientRect().height * 100) / 100
    const rows = [...dock.children].map(
      (el) =>
        `${el.className.split(' ')[0]} ${Math.round(el.getBoundingClientRect().height * 100) / 100}`,
    )
    dock.style.height = prev
    const fixed = Math.round(dock.getBoundingClientRect().height * 100) / 100
    return { auto: r, fixed, rows }
  })

try {
  await page.goto(`${preview.base}?mock=1&howto=0&seed=7&city=0&grid=standard&first=player`)
  await page.waitForSelector('.city-card')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.goto(`${preview.base}?mock=1&howto=0&seed=7&city=0&grid=standard&first=player`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
  await sleep(400)

  const clue = page.locator('.clue-input #clue-word')
  const dict = page.locator('.clue-input .translate-input')

  const say = async (label) => {
    const m = await auto()
    console.log(`${label.padEnd(46)} auto ${String(m.auto).padStart(7)}  fixed ${m.fixed}`)
    console.log(`${''.padEnd(46)} ${m.rows.join(' | ')}`)
  }

  await say('empty, first clue ever (the O4 hint)')
  await clue.fill('kat')
  await sleep(150)
  await say('typing a legal clue')
  await clue.fill('nice')
  await sleep(150)
  await say('an English-looking clue')
  const board = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-game-v1')).state.game.words[0].da,
  )
  await clue.fill(board)
  await sleep(150)
  await say(`an illegal clue (${board})`)
  await clue.fill('kat')
  await dict.fill('nice')
  await sleep(900)
  await say('a lookup with seven glosses behind it')
  const line = await page.locator('.clue-input .composer-line').innerText()
  const ell = await page.evaluate(() => {
    const a = document.querySelector('.clue-input .dict-hit')
    const v = document.querySelector('.clue-input .composer-line > :first-child')
    return {
      answer: a ? [a.scrollWidth, a.clientWidth] : null,
      verdict: v ? [v.scrollWidth, v.clientWidth] : null,
    }
  })
  console.log(`   line text: ${JSON.stringify(line)}`)
  console.log(`   ellipsis (scrollW, clientW): ${JSON.stringify(ell)}`)
  await clue.fill('nice')
  await dict.fill('nice')
  await sleep(900)
  await say('the longest verdict AND the longest answer')
  const both = await page.locator('.clue-input .composer-line').innerText()
  console.log(`   line text: ${JSON.stringify(both)}`)
  const bothEll = await page.evaluate(() => {
    const a = document.querySelector('.clue-input .dict-hit')
    const v = document.querySelector('.clue-input .clue-error')
    return {
      answer: a ? [a.scrollWidth, a.clientWidth] : null,
      verdict: v ? [v.scrollWidth, v.clientWidth] : null,
    }
  })
  console.log(`   ellipsis (scrollW, clientW): ${JSON.stringify(bothEll)}`)
  await dict.fill('helicopter')
  await sleep(200)
  await say('Asking Casey…')
  console.log(`   line text: ${JSON.stringify(await page.locator('.clue-input .composer-line').innerText())}`)
  await sleep(1500)
  await say('Casey has answered')
  console.log(`   line text: ${JSON.stringify(await page.locator('.clue-input .composer-line').innerText())}`)

  console.log(
    `\ndocument ${await page.evaluate(() => document.scrollingElement.scrollHeight)} vs ${await page.evaluate(() => window.innerHeight)}`,
  )
  console.log(
    `board grid ${JSON.stringify(await page.evaluate(() => {
      const b = document.querySelector('.board-grid').getBoundingClientRect()
      const c = document.querySelector('.word-card').getBoundingClientRect()
      return { top: Math.round(b.top * 100) / 100, h: Math.round(b.height * 100) / 100, card: Math.round(c.height * 100) / 100 }
    }))}`,
  )

  // The other docks, so --dock-slot-h can be justified rather than inherited.
  await dict.fill('')
  await clue.fill('kluex')
  await page.locator('.clue-input .btn-primary').click()
  for (let i = 0; i < 24; i++) {
    await sleep(500)
    const other = await page.evaluate(() => {
      const dock = document.querySelector('.game-screen .dock:not(.clue-input)')
      if (!dock) return null
      const cap = (document.querySelector('.phase-caption')?.textContent ?? '').trim()
      const prev = dock.style.height
      dock.style.height = 'auto'
      const h = Math.round(dock.getBoundingClientRect().height * 100) / 100
      dock.style.height = prev
      return { cap, h, cls: dock.className }
    })
    if (other) console.log(`   other dock: ${other.cap.padEnd(34)} auto ${other.h}  (${other.cls})`)
    const gb = page.locator('.guess-bar .translate-input')
    if (await gb.isVisible().catch(() => false)) {
      await gb.fill('nice')
      await sleep(800)
      const m = await page.evaluate(() => {
        const dock = document.querySelector('.game-screen .dock.guess-bar')
        const prev = dock.style.height
        dock.style.height = 'auto'
        const h = Math.round(dock.getBoundingClientRect().height * 100) / 100
        dock.style.height = prev
        const fixed = Math.round(dock.getBoundingClientRect().height * 100) / 100
        const bottom = dock.getBoundingClientRect().bottom
        const spill = Math.max(
          0,
          ...[...dock.querySelectorAll('*')]
            .filter((el) => {
              for (let p = el.parentElement; p && p !== dock; p = p.parentElement) {
                if (getComputedStyle(p).overflowY !== 'visible') return false
              }
              return true
            })
            .map((el) => Math.round((el.getBoundingClientRect().bottom - bottom) * 10) / 10),
        )
        return { h, fixed, spill, sh: document.scrollingElement.scrollHeight, ih: window.innerHeight }
      })
      console.log(`   guess bar + a lookup answer: ${JSON.stringify(m)}`)
      await gb.fill('')
    }
    const c2 = page.locator('.clue-input #clue-word')
    if (await c2.isVisible().catch(() => false)) {
      await c2.fill(`kluey${i}`)
      await sleep(150)
      const send = page.locator('.clue-input .btn-primary')
      if (await send.isEnabled().catch(() => false)) await send.click()
      continue
    }
    const g = page.locator('.word-card.card-guessable').first()
    if (await g.isVisible().catch(() => false)) {
      await g.click()
      await sleep(200)
      const confirm = page.locator('.guess-confirm .btn-primary')
      if (await confirm.isVisible().catch(() => false)) await confirm.click()
    }
    if ((await page.locator('.round-summary').count()) > 0) break
  }
} catch (e) {
  console.log('PROBE FAILED:', e.stack ?? e.message)
} finally {
  await browser.close()
  preview.stop()
  process.exit(0)
}
