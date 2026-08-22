// K2's measurement, kept so the numbers in index.css can be re-taken rather
// than re-reasoned. Opt-in (not in the default drive list): it prints, it
// asserts nothing. e2e/composer-probe.mjs is its K1 half, and asks the same
// question of the composer's seven states alone.
//
// What it prints, at 360x640:
//   - how tall EVERY dock a round can be in wants to be (height:auto) in the
//     fullest state its phase can reach, against the one --dock-h they are all
//     declared at;
//   - the board's rectangle and its card row in every phase, before and after,
//     which is what the reserve is spent on;
//   - what a sixth row would measure in the board that is left (N1's question:
//     a card cannot go under its 44px min-height floor).
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = Number(process.env.DRIVE_PORT_OFFSET ?? 0) + 4197
const preview = await startPreview(PORT)
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } })
const page = await ctx.newPage()

/** The dock on screen, asked how tall it would like to be. */
const dockAuto = () =>
  page.evaluate(() => {
    const dock = document.querySelector('.game-screen .dock')
    if (!dock) return null
    const prev = dock.style.height
    dock.style.height = 'auto'
    const auto = Math.round(dock.getBoundingClientRect().height * 100) / 100
    const rows = [...dock.children].map(
      (el) =>
        `${el.className.split(' ')[0] || el.tagName.toLowerCase()} ${
          Math.round(el.getBoundingClientRect().height * 100) / 100
        }`,
    )
    dock.style.height = prev
    const r = dock.getBoundingClientRect()
    const bottom = r.bottom
    const spill = Math.max(
      0,
      ...[...dock.querySelectorAll('*')]
        .filter((el) => {
          for (let p = el.parentElement; p && p !== dock; p = p.parentElement) {
            const cs = getComputedStyle(p)
            if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') return false
          }
          return true
        })
        .map((el) => Math.round((el.getBoundingClientRect().bottom - bottom) * 10) / 10),
    )
    return {
      auto,
      fixed: Math.round(r.height * 100) / 100,
      y: Math.round(r.y * 100) / 100,
      cls: dock.className,
      rows,
      spill,
    }
  })

/** The board, and the sixth row N1 is asking after. */
const boardShape = () =>
  page.evaluate(() => {
    const g = document.querySelector('.board-grid')
    if (!g) return null
    const b = g.getBoundingClientRect()
    const c = document.querySelector('.word-card')?.getBoundingClientRect()
    const rows = getComputedStyle(g).gridTemplateRows.split(' ').length
    const gap = parseFloat(getComputedStyle(g).rowGap) || 8
    const r = (n) => Math.round(((b.height - (n - 1) * gap) / n) * 100) / 100
    return {
      top: Math.round(b.top * 100) / 100,
      h: Math.round(b.height * 100) / 100,
      rows,
      row: r(rows),
      card: c ? Math.round(c.height * 100) / 100 : null,
      sixth: r(6),
      doc: document.scrollingElement.scrollHeight,
      win: window.innerHeight,
    }
  })

const say = async (label) => {
  const m = await dockAuto()
  const b = await boardShape()
  if (!m) return console.log(`${label.padEnd(38)} — no dock`)
  console.log(
    `${label.padEnd(38)} auto ${String(m.auto).padStart(7)}  fixed ${String(m.fixed).padStart(6)}` +
      `  y ${String(m.y).padStart(6)}  spill ${m.spill}`,
  )
  console.log(`${''.padEnd(38)} ${m.rows.join(' | ')}`)
  if (b)
    console.log(
      `${''.padEnd(38)} board top ${b.top} h ${b.h} · ${b.rows} rows of ${b.row} · card ${b.card}` +
        ` · a 6th row would be ${b.sixth} · document ${b.doc}/${b.win}`,
    )
}

const Q = '?mock=1&howto=0&seed=7&city=0&first=player'

try {
  // ---- a normal round, every phase --------------------------------------
  await page.goto(preview.base + Q)
  await page.waitForSelector('.city-card')
  await page.evaluate(() => localStorage.clear())
  // The study phase ships OFF (settingsStore's default is 'never'), and its
  // dock is one of the docks K2 sizes — so it is asked for by name rather than
  // left unmeasured. `version: 9` is settingsStore's; persist merges the rest.
  await page.evaluate(() =>
    localStorage.setItem(
      'cluecab-settings-v1',
      JSON.stringify({ state: { studyPhase: 'always' }, version: 9 }),
    ),
  )
  await page.goto(preview.base + Q)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')

  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) {
    await say('study the board')
    await study.click()
  }
  await sleep(400)

  await say('composer, empty (the O4 line)')
  await page.locator('.clue-input #clue-word').fill('nice')
  await page.locator('.clue-input .translate-input').fill('nice')
  await sleep(1000)
  await say('composer, longest verdict + answer')
  await page.locator('.clue-input .translate-input').fill('')
  await page.locator('.clue-input #clue-word').fill('')

  let sawGuess = false
  let sawSudden = false
  for (let i = 0; i < 30 && (await page.locator('.round-summary').count()) === 0; i++) {
    const clue = page.locator('.clue-input #clue-word')
    if (await clue.isVisible().catch(() => false)) {
      await clue.fill(`kluex${i}`)
      await sleep(200)
      const send = page.locator('.clue-input .btn-primary')
      if (await send.isEnabled().catch(() => false)) {
        await send.click()
        await sleep(300)
        if (await page.locator('.ai-panel').isVisible().catch(() => false)) {
          await say(`Casey's turn (${i})`)
        }
        await sleep(900)
        continue
      }
    }

    const sd = page.locator('.sudden-death-bar')
    if (!sawSudden && (await sd.isVisible().catch(() => false))) {
      await say('last chance, nothing selected')
      await page.locator('.word-card.card-guessable').first().click()
      await sleep(250)
      await say('last chance, a card selected')
      sawSudden = true
    }

    const guessable = page.locator('.word-card.card-guessable').first()
    if (await guessable.isVisible().catch(() => false)) {
      const dict = page.locator('.guess-bar .translate-input')
      if (!sawGuess && (await dict.isVisible().catch(() => false))) {
        await say('guess bar, bare')
        await dict.fill('nice')
        await sleep(1000)
        await say('guess bar + the longest answer')
        const ell = await page.evaluate(() => {
          const w = (el) => (el ? [el.scrollWidth, el.clientWidth] : null)
          const line = document.querySelector('.guess-bar .dict-line')
          return {
            text: line?.innerText,
            line: w(line),
            answer: w(document.querySelector('.guess-bar .dict-answer')),
            hit: w(document.querySelector('.guess-bar .dict-hit')),
            field: w(document.querySelector('.guess-bar .translate-input')),
          }
        })
        console.log(`   the answer (scrollW, clientW): ${JSON.stringify(ell)}`)
        await guessable.click()
        await sleep(250)
        await say('guess bar, selected + that answer')
        await page.locator('.guess-bar .btn:not(.btn-primary)').first().click()
        await sleep(200)
        await dict.fill('')
        sawGuess = true
        continue
      }
      await guessable.click()
      await sleep(200)
      const stop = page.locator('.guess-bar .btn-ghost')
      if (await stop.isVisible().catch(() => false)) await say('guess bar, the stop button')
      const confirm = page.locator('.guess-confirm .btn-primary')
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click()
        await sleep(650)
        continue
      }
    }
    await sleep(500)
  }

  // ---- a wrap-up round, the packing phase --------------------------------
  const W = '?mock=1&howto=0&city=0&collected=40&seed=9&wraps=1'
  await page.goto(preview.base + W)
  await page.waitForSelector('.city-card')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.goto(preview.base + W)
  await page.waitForSelector('.city-card')
  await page.locator('.cluey-button').click()
  await page.waitForSelector('.suitcase-screen')
  await page.locator('.case-actions .btn-primary').click()
  await page.waitForSelector('.packing-dock')
  await say('packing, nothing selected')
  await page.locator('.card-face-en').first().click()
  await sleep(300)
  await say('packing, a card selected')
  await page.locator('.packing-input').fill('zzzzz')
  await page.locator('.packing-dock .btn-primary').click()
  await sleep(300)
  await say('packing, a miss')
} catch (e) {
  console.log('PROBE FAILED:', e.stack ?? e.message)
} finally {
  await browser.close()
  preview.stop()
  process.exit(0)
}
