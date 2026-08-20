// ONE suitcase, lying open and drawn in pencil: the lid packed with wrapped
// words, the tray holding collected ones, the loose words on the table below
// it, a city filter that narrows the view without moving the player, and the
// wrap-up button that carries words from the tray to the lid.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4179
const preview = await startPreview(PORT)

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const BASE = preview.base

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 360, height: 640 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

const bankedTokens = () =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-srs-v1') ?? '{}').state?.wrapUpsBanked ?? 0,
  )

/** Straight to the open case, from a clean device. */
const openCase = async (query) => {
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto(`${BASE}${query}`)
  await page.waitForSelector('.city-card')
  await page.click('.cluey-button')
  await page.waitForSelector('.suitcase-screen')
}

try {
  // 10 wrapped, 20 more collected, 5 discovered — every band populated. And
  // two banked wrap-up rounds: the button has two conditions now, and this
  // section is about the case rather than the gate.
  await openCase('?mock=1&howto=0&city=0&wrapped=10&collected=30&almost=35&wraps=2')
  await page.screenshot({ path: `${SHOT_DIR}/s1-suitcase.png` })

  // ---- The case is DRAWN, and it is the screen. --------------------------
  // The old case was a rounded div with a CSS handle. Every part below is
  // hand-rolled SVG, and the corner shading is literally Casey's class, so
  // the two cannot drift into different hands without this failing.
  check('the case is drawn as two compartments', (await page.locator('.case-open .case-art').count()) === 2)
  check('with a handle on top', (await page.locator('.case-handle').count()) === 1)
  check('a hinge between the halves', (await page.locator('.case-hinge-art').count()) === 1)
  check('and clasps on the outer edge', (await page.locator('.case-clasp').count()) >= 2)
  const hatch = await page.locator('.case-hatch .cluey-hatch').count()
  check("shaded in Casey's own hatching", hatch === 2, `${hatch}`)

  // Twice the room it used to have, and the biggest thing on the phone. The
  // old case measured ~230px of a 640 screen; this asserts it never falls
  // back to something a header and three bands could crowd out.
  const share = await page.evaluate(() => {
    const r = document.querySelector('.case-open').getBoundingClientRect()
    return { h: Math.round(r.height), ih: window.innerHeight }
  })
  check(
    'and it fills the screen',
    share.h >= share.ih * 0.45,
    `${share.h} of ${share.ih} (${Math.round((100 * share.h) / share.ih)}%)`,
  )

  // ---- The three bands, each saying what it holds. -----------------------
  const bandLabels = await page.locator('.case-band-label').allTextContents()
  check('the lid counts what is packed', bandLabels.some((l) => /Wrapped — 10 of 100/.test(l)), bandLabels[0])
  check('the tray counts what is collected', bandLabels.some((l) => /Collected — 20/.test(l)))
  // 65 unmet + 5 met: everything not yet in the case, counted whole.
  check('and the table below counts what is still out there', bandLabels.some((l) => /Still out there — 70/.test(l)))

  // A compartment pages 12 at a time.
  const trayTiles = await page.locator('.case-panel-tray .case-tile').count()
  check('a compartment shows a full page of slots', trayTiles === 12, `${trayTiles}`)
  const before = await page.locator('.case-panel-tray .case-tile').allTextContents()
  await page.locator('.case-panel-tray button[aria-label$="next page"]').click()
  const after = await page.locator('.case-panel-tray .case-tile').allTextContents()
  check('the › leafs to different words', before.join() !== after.join())

  // A word tile opens the dictionary; a ? slot is not a button at all.
  await page.locator('.case-tile.case-collected').first().click()
  await page.waitForSelector('.sheet', { timeout: 4000 })
  check('a collected tile opens the dictionary', true)
  await page.click('.sheet .btn')

  // The table below leads with the words already MET — those are the ones
  // worth opening — so the ? slots are behind them. Leaf to one: it has to be
  // there, and it has to not be a button, since there is nothing to look up.
  check('the table leads with the words already met', (await page.locator('.case-loose .case-discovered').count()) > 0)
  await page.locator('.case-loose button[aria-label$="next page"]').click()
  await page.waitForTimeout(150)
  check('and the unmet ones are behind them', (await page.locator('.case-unknown').count()) > 0)
  const unknownButtons = await page.locator('button.case-unknown').count()
  check('undiscovered slots are not buttons', unknownButtons === 0, `${unknownButtons}`)

  // 30 in the pool and two rounds banked: the button is live, wears its count,
  // and launches the packing phase — spending exactly one of the two.
  const cta = page.locator('.case-actions .btn-primary')
  check('the wrap-up button is live at 30 collected with a round banked', await cta.isEnabled())
  const ctaText = await cta.textContent()
  check('and wears the bank as a count', /2/.test(ctaText ?? ''), ctaText ?? '')
  await cta.click()
  await page.waitForSelector('.packing-dock')
  check('and it opens a wrap-up round', true)
  check('starting it spends exactly one', (await bankedTokens()) === 1, `${await bankedTokens()}`)
  await page.screenshot({ path: `${SHOT_DIR}/s2-wrapup-from-case.png` })

  // ---- One suitcase: a city is a filter, not a wall. ---------------------
  // The header used to page between cities, which made nine containers out of
  // one. There is no pager now, and no way to walk into a city you have never
  // reached — the road ahead is the map's job.
  await openCase('?mock=1&howto=0&city=0&collected=30&wraps=1')
  check(
    'the header no longer pages between cities',
    (await page.locator('button[aria-label="Next city"]').count()) === 0,
  )
  const firstChips = await page.locator('.case-filter .chip').allTextContents()
  check(
    'and one stop in, the filter offers All and that stop only',
    firstChips.join('|') === 'All|Sønderborg',
    firstChips.join('|'),
  )
  check('with All chosen, so the case opens whole', await page.locator('.chip-on').first().evaluate((e) => e.textContent === 'All'))

  // Nine cities reached: every one is a chip, the one being stood in is
  // marked, and the row scrolls sideways rather than the document.
  await openCase('?mock=1&howto=0&city=8&collected=40&wrapped=20&wraps=3')
  const allChips = await page.locator('.case-filter .chip').allTextContents()
  check('nine stops in, All plus nine cities', allChips.length === 10, allChips.join('|'))
  const homeChip = page.locator('.chip-home')
  check('exactly one of them is where the player is standing', (await homeChip.count()) === 1)
  check('and it is the last city reached', (await homeChip.textContent()) === 'København')
  const row = await page.evaluate(() => {
    const el = document.querySelector('.case-filter')
    return { sw: el.scrollWidth, cw: el.clientWidth, doc: document.scrollingElement.scrollWidth, iw: window.innerWidth }
  })
  check('the chip row scrolls inside itself, not the page', row.sw > row.cw && row.doc <= row.iw + 1, JSON.stringify(row))
  // The lid's goal follows the filter: All is every city reached.
  const allLabels = await page.locator('.case-band-label').allTextContents()
  check('and All counts against every city reached', allLabels.some((l) => /Wrapped — 20 of 900/.test(l)), allLabels[0])
  await page.screenshot({ path: `${SHOT_DIR}/s3-nine-cities.png` })

  // Filtering narrows the view and moves nobody. The gate below is arithmetic
  // about the city the player is IN, so it must not so much as flicker when
  // the chips change — a filter that changed what the button meant would be
  // the wall this card took out, back again wearing a chip.
  await openCase('?mock=1&howto=0&city=1&collected=40&wraps=1')
  const liveBefore = await page.locator('.case-actions .btn-primary').isEnabled()
  await page.locator('.case-filter .chip', { hasText: 'Sønderborg' }).click()
  await page.waitForTimeout(150)
  const emptyTray = await page.locator('.case-band-label').allTextContents()
  check(
    'filtering to a finished city empties the view',
    emptyTray.some((l) => /Collected — 0/.test(l)),
    emptyTray.join(' / '),
  )
  check(
    'but the wrap-up button still answers to the city you are in',
    liveBefore && (await page.locator('.case-actions .btn-primary').isEnabled()),
  )
  check('and the case never went anywhere', (await page.locator('.case-open .case-art').count()) === 2)

  // ---- The two gates, and saying which one is missing. -------------------
  // A wrap-up needs a dealable board (twenty collected words, arithmetic) AND
  // an earned round (a win, policy). Whichever is missing has to say so: a
  // dark button with nothing under it is the failure this section exists to
  // catch, because wrap-ups are the only way words get packed for good.

  // 1. Neither: below a boardful, and nothing won yet.
  await openCase('?mock=1&howto=0&city=0&collected=10')
  check(
    'below a boardful it waits',
    !(await page.locator('.case-actions .btn-primary').isEnabled()),
  )
  // Nothing wrapped yet, so the lid is empty and has to say so. That line was
  // invisible once: the drawn panel is an absolutely-positioned sibling that
  // comes first in the DOM, and a positioned element paints over every static
  // one after it, so the message rendered at 284x96 underneath the case.
  //
  // Not elementFromPoint — the panel is pointer-events:none, so hit-testing
  // skips it whether or not it paints on top, and the check would pass on the
  // broken build. Paint order here is decided by `position`, so assert that.
  check('an empty compartment says so', /Nothing packed under the lid/.test(
    (await page.locator('.case-panel-lid .case-empty').textContent()) ?? '',
  ))
  const buried = await page.evaluate(() =>
    [...document.querySelectorAll('.case-band > *:not(.case-art):not(.case-hatch)')]
      .filter((el) => getComputedStyle(el).position === 'static')
      .map((el) => el.className || el.tagName),
  )
  check('and nothing in the case paints under the drawing', buried.length === 0, buried.join(', '))

  const hint = await page.locator('.case-hint').textContent()
  check('and says how many more to collect', /Collect 10 more/.test(hint ?? ''), hint ?? '')
  check('naming the city the board would be dealt from', /Sønderborg/.test(hint ?? ''), hint ?? '')
  check('and names the win as well, since both are missing', /[Ww]in a round/.test(hint ?? ''), hint ?? '')
  // Both sentences at once is the tallest this screen gets, and it is the one
  // state layout-drive does not reach: it measures the suitcase at
  // ?collected=30, where the words gate is already open and the hint is one
  // line. No screen may scroll the document, so measure it here.
  const box = await page.evaluate(() => ({
    sh: document.scrollingElement.scrollHeight,
    ih: window.innerHeight,
  }))
  check('and two lines of hint still do not scroll the page', box.sh <= box.ih + 1, `${box.sh} vs ${box.ih}`)
  await page.screenshot({ path: `${SHOT_DIR}/s4-both-gates-shut.png` })

  // 2. A hint that names the city keeps naming it under a filter, because the
  // board it is talking about does not move when the view does.
  await page.locator('.case-filter .chip', { hasText: 'Sønderborg' }).click()
  await page.waitForTimeout(150)
  check(
    'the hint is about home even when the filter is not All',
    /Collect 10 more in Sønderborg/.test((await page.locator('.case-hint').textContent()) ?? ''),
  )

  // 3. Words enough, no win: the button waits on the win and says only that.
  await openCase('?mock=1&howto=0&city=0&collected=40')
  check(
    'a boardful of words is not enough on its own',
    !(await page.locator('.case-actions .btn-primary').isEnabled()),
  )
  const winHint = await page.locator('.case-hint').textContent()
  check(
    'and the hint asks for the first win, not for more words',
    /first wrap-up/.test(winHint ?? '') && !/Collect \d+ more/.test(winHint ?? ''),
    winHint ?? '',
  )
  check('no count on a button with nothing banked', !/\d/.test(
    (await page.locator('.case-actions .btn-primary').textContent()) ?? '',
  ))
  await page.screenshot({ path: `${SHOT_DIR}/s5-win-gate.png` })

  // 4. A win banks one, and both gates are open. The round is won by hand
  // through the store — driving the mock companion to an actual win is
  // wrapup-drive's job, and what is under test here is the gate, not the game.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-srs-v1'))
    raw.state.wrapUpsBanked = 1
    raw.state.games = { played: 1, won: 1, redeemed: 0, lost: 0 }
    localStorage.setItem('cluecab-srs-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.waitForSelector('.city-card')
  await page.click('.cluey-button')
  await page.waitForSelector('.suitcase-screen')
  check('one banked win opens the button', await page.locator('.case-actions .btn-primary').isEnabled())
  check('and the hint is gone', (await page.locator('.case-hint').count()) === 0)

  // ---- The table below the case does not page through the unmet. ---------
  // Eight hundred undiscovered words paged four at a time is two hundred
  // pages of «?», so only one page-worth is ever listed — while the label
  // still counts every one of them.
  await openCase('?mock=1&howto=0&city=8&collected=40')
  const looseLabel = await page.locator('.case-loose .case-band-label').textContent()
  check('the label counts every word still out there', /Still out there — 8\d\d/.test(looseLabel ?? ''), looseLabel ?? '')
  const loosePages = await page.locator('.case-loose .case-page-count').count()
  check('but it is not eight hundred words of paging', loosePages === 0, `${loosePages} pagers`)

  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nSUITCASE DRIVE OK')
  if (fail.length) process.exitCode = 1
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/s9-failure.png` }).catch(() => {})
  console.log('SUITCASE DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
