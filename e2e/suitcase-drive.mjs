// ONE suitcase, lying open and drawn in pencil, read top to bottom in the
// order a word travels: the loose words on the table above it, the lid
// holding collected ones, the tray packed with wrapped ones. Plus a city
// filter that narrows the view without moving the player, and the wrap-up
// button that carries words from the lid down into the tray.
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
  check('the tray counts what is packed', bandLabels.some((l) => /Wrapped — 10 of 100/.test(l)), bandLabels[0])
  check('the lid counts what is collected', bandLabels.some((l) => /Collected — 20/.test(l)))
  // 65 unmet + 5 met: everything not yet in the case, counted whole.
  check('and the table above counts what is still out there', bandLabels.some((l) => /Still out there — 70/.test(l)))

  // Top to bottom the bands read in the order a word travels, which is the
  // whole reason the loose strip is above the case rather than under it.
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('.case-loose, .case-panel-lid, .case-panel-tray')].map(
      (el) => el.className.split(' ').at(-1),
    ),
  )
  check(
    'the bands read loose, collected, wrapped down the screen',
    order.join() === 'case-loose,case-panel-lid,case-panel-tray',
    order.join(),
  )

  // A compartment pages 12 at a time.
  const lidTiles = await page.locator('.case-panel-lid .case-tile').count()
  check('a compartment shows a full page of slots', lidTiles === 12, `${lidTiles}`)
  const before = await page.locator('.case-panel-lid .case-tile').allTextContents()
  await page.locator('.case-panel-lid button[aria-label$="next page"]').click()
  const after = await page.locator('.case-panel-lid .case-tile').allTextContents()
  check('the › leafs to different words', before.join() !== after.join())

  // A word tile opens the dictionary; a ? slot is not a button at all.
  await page.locator('.case-tile.case-collected').first().click()
  await page.waitForSelector('.sheet', { timeout: 4000 })
  check('a collected tile opens the dictionary', true)
  await page.click('.sheet .btn')

  // The table above the case leads with the words already MET — those are the
  // ones worth opening — so the ? slots are behind them. Leaf to one: it has
  // to be there, and it has to not be a button, since there is nothing to
  // look up. Two rows of four, so a full page is eight slots.
  const looseSlots = await page.locator('.case-loose .case-slot').count()
  check('the table shows two rows of four', looseSlots === 8, `${looseSlots}`)
  check('the table leads with the words already met', (await page.locator('.case-loose .case-discovered').count()) > 0)
  await page.locator('.case-loose button[aria-label$="next page"]').click()
  await page.waitForTimeout(150)
  check('and the unmet ones are behind them', (await page.locator('.case-unknown').count()) > 0)
  const unknownButtons = await page.locator('button.case-unknown').count()
  check('undiscovered slots are not buttons', unknownButtons === 0, `${unknownButtons}`)

  // The label and the pager have to be the same claim. The ? used to be
  // capped at one page-worth, so «Still out there — 70» sat over three pages
  // of thirteen tiles and read as a list that had broken. Every undiscovered
  // word is in the strip now, which is exactly what makes this arithmetic
  // hold — drop any of them again and the count below stops matching.
  //
  // Sønderborg, 35 of its 100 words touched: 5 met and 65 never seen is 70
  // still out there, eight to a page, so nine pages with the last one short.
  const looseLabel = await page.locator('.case-loose .case-band-label').textContent()
  const loosePages = await page.locator('.case-loose .case-page-count').textContent()
  const looseTotal = Number(/(\d+)/.exec(looseLabel ?? '')?.[1])
  const pageCount = Number(/\/(\d+)/.exec(loosePages ?? '')?.[1])
  check('the table counts every word still out of the case', looseTotal === 70, `${looseLabel}`)
  check(
    'and pages through all of them, so the label matches the pager',
    pageCount === Math.ceil(looseTotal / 8),
    `${loosePages} for ${looseTotal}`,
  )

  // The last page is the proof: leaf to it and the ? are still there rather
  // than having run out eight slots after the met words.
  // Leafed from wherever the check above left it, so the › is asked for by
  // its own disabled state rather than by a count that assumes page one.
  const nextPage = page.locator('.case-loose button[aria-label$="next page"]')
  while (await nextPage.isEnabled()) {
    await nextPage.click()
    await page.waitForTimeout(30)
  }
  const lastPage = await page.locator('.case-loose .case-unknown').count()
  check('the last page of the table is still undiscovered words', lastPage > 0, `${lastPage}`)

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
  // The case opens on the stop you are standing in, not on All. All is a tap
  // away and shows the whole case; it is not where the screen starts, because
  // the strip above the case pages through every word not yet in it and All
  // at the last stop is a hundred-odd pages of that.
  check(
    'with the stop you are standing in chosen, not All',
    (await page.locator('.chip-on').first().textContent()) === 'Sønderborg',
  )
  check('and that chip is the one wearing the you-are-here dot', (await page.locator('.chip-on.chip-home').count()) === 1)

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
  // Nine stops in, the case still opens on the ninth rather than on All, so
  // the tray counts against that stop's hundred.
  const homeLabels = await page.locator('.case-band-label').allTextContents()
  check('nine stops in it still opens on the stop, not on All', homeLabels.some((l) => /Wrapped — 20 of 100/.test(l)), homeLabels.join(' / '))
  // The lid's goal follows the filter: All is every city reached. All is the
  // first chip, asked for by position rather than by text — `hasText` is a
  // substring match and a route is free to grow a city with "all" in it.
  await page.locator('.case-filter .chip').first().click()
  await page.waitForTimeout(150)
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

  // ---- ONE gate, and the honest count beside it (W1). -------------------
  // A wrap-up needs ONE thing: a round earned by winning three. The second
  // gate — a whole board's worth of collected words — is gone, and with it the
  // refusal it produced. What stands under the button now is advice in both
  // states: what to do if there is no token, and what a token spent right here
  // would actually pack if there is. A dark button with nothing under it is
  // still the failure this section exists to catch.

  // 1. No token, and nothing collected either: the floor is the only refusal
  //    left, and it asks for one word rather than eighteen.
  await openCase('?mock=1&howto=0&city=0&collected=0')
  check(
    'with nothing collected the button waits',
    !(await page.locator('.case-actions .btn-primary').isEnabled()),
  )
  // Nothing wrapped yet, so the tray is empty and has to say so. That line was
  // invisible once: the drawn panel is an absolutely-positioned sibling that
  // comes first in the DOM, and a positioned element paints over every static
  // one after it, so the message rendered at 284x96 underneath the case.
  //
  // Not elementFromPoint — the panel is pointer-events:none, so hit-testing
  // skips it whether or not it paints on top, and the check would pass on the
  // broken build. Paint order here is decided by `position`, so assert that.
  check('an empty compartment says so', /Nothing packed in the tray/.test(
    (await page.locator('.case-panel-tray .case-empty').textContent()) ?? '',
  ))
  const buried = await page.evaluate(() =>
    [...document.querySelectorAll('.case-band > *:not(.case-art):not(.case-hatch)')]
      .filter((el) => getComputedStyle(el).position === 'static')
      .map((el) => el.className || el.tagName),
  )
  check('and nothing in the case paints under the drawing', buried.length === 0, buried.join(', '))

  const floorHint = await page.locator('.case-hint').textContent()
  check('and the hint asks for one word, not a boardful', /Collect a word/.test(floorHint ?? ''), floorHint ?? '')
  check('naming the city the board would be dealt from', /Sønderborg/.test(floorHint ?? ''), floorHint ?? '')
  check(
    'and never for a word count — that gate is gone',
    !/Collect \d+ more/.test(floorHint ?? ''),
    floorHint ?? '',
  )
  await page.screenshot({ path: `${SHOT_DIR}/s4-floor.png` })

  // 2. Ten collected, no token: the old rule refused this outright («Collect 8
  //    more»). Now the only thing missing is the win, and the hint says how
  //    many — three, since W1 priced a token at three wins.
  await openCase('?mock=1&howto=0&city=0&collected=10')
  check(
    'ten collected words are not enough on their own — the round is still earned',
    !(await page.locator('.case-actions .btn-primary').isEnabled()),
  )
  const winHint = await page.locator('.case-hint').textContent()
  check(
    'and the hint asks for the wins, not for more words',
    /Win 3 rounds/.test(winHint ?? '') && !/Collect \d+ more/.test(winHint ?? ''),
    winHint ?? '',
  )
  check('no count on a button with nothing banked', !/\d/.test(
    (await page.locator('.case-actions .btn-primary').textContent()) ?? '',
  ))
  // One line of hint, one line of button: the tallest this screen gets is the
  // state below, where the hint carries three numbers. No screen may scroll
  // the document, so measure it there rather than here.
  await page.screenshot({ path: `${SHOT_DIR}/s5-win-gate.png` })

  // 3. Having won before but spent the bank, the wording counts down from
  //    wherever the counter stands rather than restarting at three.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-srs-v1'))
    raw.state.wrapUpsBanked = 0
    raw.state.winsTowardWrapUp = 2
    raw.state.games = { played: 4, won: 2, redeemed: 0, lost: 2 }
    localStorage.setItem('cluecab-srs-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.waitForSelector('.city-card')
  await page.click('.cluey-button')
  await page.waitForSelector('.suitcase-screen')
  const againHint = await page.locator('.case-hint').textContent()
  check(
    'two wins in, the hint asks for the one that is left',
    /Win 1 more round/.test(againHint ?? ''),
    againHint ?? '',
  )

  // 4. A token, and a pool too thin to fill a board. This is the state W1
  //    exists for: the button is LIVE, and the hint is arithmetic rather than
  //    a refusal — what this board would pack, against what a wrap-up can.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-srs-v1'))
    raw.state.wrapUpsBanked = 1
    raw.state.winsTowardWrapUp = 0
    raw.state.games = { played: 3, won: 3, redeemed: 0, lost: 0 }
    localStorage.setItem('cluecab-srs-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.waitForSelector('.city-card')
  await page.click('.cluey-button')
  await page.waitForSelector('.suitcase-screen')
  check(
    'a token opens the button on ten collected words, where the old rule refused',
    await page.locator('.case-actions .btn-primary').isEnabled(),
  )
  const advice = await page.locator('.case-hint').textContent()
  check(
    'and the hint states what this board would pack, and what a wrap-up can',
    /10 collected in Sønderborg/.test(advice ?? '') &&
      /pack at most 10/.test(advice ?? '') &&
      /up to 13/.test(advice ?? ''),
    advice ?? '',
  )
  // The hint is the screen's longest line and since W1 it stands in the LIVE
  // state too, so this is the tallest this screen gets: two sentences under an
  // enabled button. Two things are measured here rather than reasoned about.
  // The document must not scroll — the standing rule for every screen. And the
  // case must still be the screen: the always-present hint costs it 38px
  // (measured, 330 -> 292 of 640 at ?collected=30), so the 45% floor asserted
  // at the top of this file is now met with 1% to spare rather than 6, and the
  // thin-pool state below is the one that would break it first.
  const box = await page.evaluate(() => ({
    sh: document.scrollingElement.scrollHeight,
    ih: window.innerHeight,
    caseH: Math.round(document.querySelector('.case-open').getBoundingClientRect().height),
  }))
  check('and the advice still does not scroll the page', box.sh <= box.ih + 1, `${box.sh} vs ${box.ih}`)
  check(
    'and the case is still the screen under the longest hint',
    box.caseH >= box.ih * 0.4,
    `${box.caseH} of ${box.ih} (${Math.round((100 * box.caseH) / box.ih)}%)`,
  )
  await page.screenshot({ path: `${SHOT_DIR}/s6-honest-count.png` })

  // 5. A full pool: the sentence stops promising more than the board holds.
  await openCase('?mock=1&howto=0&city=0&collected=40&wraps=1')
  const fullAdvice = await page.locator('.case-hint').textContent()
  check(
    'with plenty collected the board packs the full thirteen, not forty',
    /40 collected/.test(fullAdvice ?? '') && /packs the full 13/.test(fullAdvice ?? ''),
    fullAdvice ?? '',
  )
  check(
    'and it stops saying the same number twice',
    !/at most/.test(fullAdvice ?? ''),
    fullAdvice ?? '',
  )
  check('and the button is live', await page.locator('.case-actions .btn-primary').isEnabled())

  // 6. A hint that names the city keeps naming it under a filter, because the
  //    board it is talking about does not move when the view does.
  //
  // Driven from the SECOND stop, so the filter can be moved to a city that is
  // not home. It used to move it at the first stop, where the only chips are
  // All and the stop you are in — and now that the case opens on that stop
  // rather than on All, clicking it there is clicking the chip already lit,
  // which asserts nothing.
  await openCase('?mock=1&howto=0&city=1&collected=10&wraps=1')
  check(
    'the case opens on the second stop once you have reached it',
    (await page.locator('.chip-on').first().textContent()) === 'Ribe',
  )
  await page.locator('.case-filter .chip', { hasText: 'Sønderborg' }).click()
  await page.waitForTimeout(150)
  check(
    'the hint is about home even when the filter is another city',
    /10 collected in Ribe/.test((await page.locator('.case-hint').textContent()) ?? ''),
  )

  // ---- The table pages through the unmet, at the size the default keeps it. -
  // Every word not yet in the case is in the strip, eight to a page. It used
  // to list one page of «?» and stop, which bought a label reading 860 over
  // eight tiles and no pager at all — a list that looked broken rather than
  // trimmed. So the counts below are asserted against the pager, not a cap.
  //
  // Which puts the whole weight on the default view being ONE stop: the last
  // city is 60 words and 8 pages, and the same screen on All is 860 and 108.
  // Both are checked, in that order, because the second is the thing the
  // default exists to keep off the screen you open.
  await openCase('?mock=1&howto=0&city=8&collected=40')
  const readStrip = async () => {
    const label = await page.locator('.case-loose .case-band-label').textContent()
    const pager = await page.locator('.case-loose .case-page-count').textContent()
    return { total: Number(/(\d+)/.exec(label ?? '')?.[1]), pages: Number(/\/(\d+)/.exec(pager ?? '')?.[1]), label }
  }
  const atCity = await readStrip()
  check('opened on the stop, the strip is that stop alone', atCity.total === 60, atCity.label ?? '')
  check(
    'and pages through all of it, so the label matches the pager',
    atCity.pages === Math.ceil(atCity.total / 8),
    `${atCity.pages} pages for ${atCity.total}`,
  )

  await page.locator('.case-filter .chip').first().click()
  await page.waitForTimeout(200)
  const atAll = await readStrip()
  check('All still counts every word still out there', atAll.total > 800, atAll.label ?? '')
  check(
    'and reaches every one of them too, at a hundred-odd pages',
    atAll.pages === Math.ceil(atAll.total / 8) && atAll.pages > 100,
    `${atAll.pages} pages for ${atAll.total}`,
  )

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
