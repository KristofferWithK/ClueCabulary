// The story frame: the grandmother's letter opens the game, hands over to the
// rules, and stays re-readable; and each city's champion sets the exam, reacts
// to it, and sees you off.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { startPreview } from './preview-server.mjs'

/** The dictionary, so an exam can be passed by knowing the words. */
const GLOSS = new Map(
  JSON.parse(readFileSync(new URL('../src/data/words.da.json', import.meta.url))).map((w) => [
    w.da,
    w.en[0],
  ]),
)

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const PORT = 4185
const preview = await startPreview(PORT)

const BASE = preview.base
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  // Lets one context pretend to be a deployed origin: every drive so far has
  // run on 127.0.0.1, which the app treats as local, so anything gated on
  // "is this a real deployment" was never exercised.
  args: [`--host-resolver-rules=MAP deployed.test 127.0.0.1`],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))


/**
 * Sit the exam and pass it, answering from the dictionary.
 *
 * This used to harvest the answer key instead: fail the paper, scrape the
 * glosses the results screen prints beside every miss, retry, repeat until the
 * map covered a whole paper. That worked because the retry re-served the paper
 * just marked, so one failure bought the answers to the very next attempt —
 * the defect that let a player bank twenty words they had just failed. With the
 * retry drawing a genuinely fresh paper the strategy cannot work at all, and it
 * should not: a drive that demonstrates a champion's congratulations ought to
 * earn them.
 */
async function passTheExam(page) {
  await page.waitForSelector('.gate-list')
  const words = await page.locator('.gate-list .gate-da').allTextContents()
  for (let i = 0; i < words.length; i++) {
    const gloss = GLOSS.get(words[i].trim())
    if (!gloss) throw new Error(`no gloss for exam word "${words[i]}"`)
    await page.locator('.gate-item input').nth(i).fill(gloss)
  }
  await page.click('.gate-list ~ .btn-primary, .gate-screen > .btn-primary')
  await page.waitForSelector('.gate-results')
  if (!(await page.locator('.stamp-award').count())) {
    const missed = await page.locator('.gate-results .rejected .gate-da').allTextContents()
    throw new Error(`a paper answered from the dictionary did not pass: ${missed.join(', ')}`)
  }
  return { attempts: 1 }
}

try {
  // A brand-new player is met by the letter, before anything else.
  await page.goto(`${BASE}?mock=1`)
  await page.waitForSelector('.letter', { timeout: 10000 })
  if (await page.locator('.howto').count()) throw new Error('rules jumped ahead of the letter')
  const from = await page.locator('.letter-from').textContent()
  const paras = await page.locator('.letter-para').count()
  console.log(`letter from ${from.trim()}, ${paras} paragraphs`)
  if (paras < 3) throw new Error('the letter lost its body')
  await page.screenshot({ path: `${SHOT_DIR}/s1-letter.png` })
  // The button must sit below the text, not on top of it.
  const goBox = await page.locator('.letter-go').boundingBox()
  const lastPara = await page.locator('.letter-scroll').boundingBox()
  if (goBox.y < lastPara.y + lastPara.height - 1) {
    throw new Error('the set-off button overlaps the letter')
  }

  // Closing it hands over to the rules — invitation first, instructions second.
  await page.locator('.letter-go').click()
  await page.waitForSelector('.howto', { timeout: 5000 })
  console.log('letter hands over to How to Play')
  await page.locator('.howto .btn-primary').click()
  await page.waitForSelector('.city-card')

  // It does not come back uninvited, but Home keeps a way in.
  await page.reload()
  await page.waitForSelector('.city-card')
  if (await page.locator('.letter').count()) throw new Error('the letter reopened on its own')
  await page.locator('.howto-link').first().click()
  await page.waitForSelector('.letter')
  console.log('re-readable from home')
  await page.locator('.letter-go').click()
  await page.waitForSelector('.city-card')
  if (await page.locator('.howto').count()) throw new Error('a re-read dragged the rules back')
  console.log('a re-read does not drag the rules back')

  // The champion of the current city is named on Home.
  const onHome = await page.locator('.city-champion').textContent()
  console.log('home says:', onHome.replace(/\s+/g, ' ').trim())

  // Every stop has a champion, and no two are the same person.
  const seen = new Map()
  for (let city = 0; city < 10; city++) {
    await page.goto(`${BASE}?mock=1&howto=0&city=${city}`)
    await page.waitForSelector('.city-card')
    const line = (await page.locator('.city-champion').textContent()).replace(/\s+/g, ' ').trim()
    const name = line.split('—')[0].replace(/^\W+/, '').trim()
    if (seen.has(name)) throw new Error(`${seen.get(name)} and city ${city} are both ${name}`)
    seen.set(name, city)
  }
  console.log(`ten champions, ten people: ${[...seen.keys()].join(', ')}`)

  // They run the exam: an intro in their voice, then a reaction to the result.
  //
  // Start from a clean passport. The champion walk above sits an exam in every
  // city, and trialsSpent survives a reload — ?learned=30 grants three attempts
  // but does not give back the ones already spent here. That was invisible
  // while a retry re-served the paper just marked, because passTheExam then
  // always passed on its second attempt; once the retry became a genuinely
  // fresh paper it needs a few, and city 0 arrived here with nothing left.
  await page.goto(`${BASE}?howto=0`)
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}?mock=1&howto=0&city=0&learned=30`)
  await page.waitForSelector('.city-card')
  await page.locator('.btn-gate').click()
  await page.waitForSelector('.gate-list')
  const intro = await page.locator('.champion-says .champion-line-en').textContent()
  console.log('sets the paper:', intro.trim())
  // The exam screen states the rules directly above this line. A champion who
  // recites them again is the writing sounding like UI in a costume.
  if (/^\s*twenty words\b/i.test(intro) || /no dictionary/i.test(intro)) {
    throw new Error(`the champion recites the rules the screen already states: ${intro.trim()}`)
  }
  await page.screenshot({ path: `${SHOT_DIR}/s2-exam.png` })

  for (let i = 0; i < 20; i++) await page.locator('.gate-item input').nth(i).fill('zzz')
  await page.click('.gate-screen > .btn-primary')
  await page.waitForSelector('.gate-results')
  const onFail = await page.locator('.champion-says .champion-line').textContent()
  console.log('on a miss:', onFail.trim())

  await page.click('.gate-actions .btn-primary')
  await passTheExam(page)
  const onPass = await page.locator('.champion-says .champion-line').textContent()
  console.log('on a stamp:', onPass.trim())
  if (onPass.trim() === onFail.trim()) throw new Error('the same line for a pass and a miss')
  await page.screenshot({ path: `${SHOT_DIR}/s3-stamped.png` })

  // And they see you off when the passport page is full.
  await page.goto(`${BASE}?mock=1&howto=0&city=0&learned=100&stamps=4`)
  await page.waitForSelector('.city-card')
  await page.locator('.btn-gate').click()
  await page.waitForSelector('.gate-list')
  await passTheExam(page)
  await page.waitForSelector('.champion-says-farewell', { timeout: 10000 })
  const farewell = await page.locator('.champion-says-farewell .champion-line').textContent()
  console.log('sees you off:', farewell.trim())

  // The next city's champion is waiting on arrival.
  await page.locator('.gate-actions .btn-primary').click()
  await page.waitForSelector('.arrival-screen')
  const greets = await page.locator('.champion-card .champion-name').textContent()
  console.log('met on arrival:', greets.trim())
  await page.screenshot({ path: `${SHOT_DIR}/s4-arrival.png`, fullPage: true })

  // The end of the road. Koebenhavn has no next city, and the last champion's
  // farewell is the one line in the game that fires exactly once.
  await page.goto(`${BASE}?mock=1&howto=0&city=9&learned=100&stamps=4`)
  await page.waitForSelector('.city-card')
  await page.locator('.btn-gate').click()
  await page.waitForSelector('.gate-list')
  const ended = await passTheExam(page)
  console.log(`the last paper took ${ended.attempts} attempts`)
  await page.waitForSelector('.champion-says-farewell', { timeout: 10000 })
  const ending = await page.locator('.champion-says-farewell .champion-line-en').textContent()
  console.log('the journey ends on:', ending.trim())
  const callout = await page.locator('.travel-callout').textContent()
  if (!/thousand words/i.test(callout)) throw new Error(`wrong ending callout: ${callout}`)
  await page.screenshot({ path: `${SHOT_DIR}/s5-ending.png`, fullPage: true })
  await page.locator('.gate-actions .btn-primary').click()
  await page.waitForSelector('.city-card')
  if (!(await page.locator('.journey-done').count())) throw new Error('no completion state on home')
  console.log('and lands home complete')

  // On a deployed origin the dev switches are off. The first-run intro must
  // not be off with them — it used to sit inside the same guard, so the letter
  // and the rules never opened on the live site while this drive stayed green.
  const deployed = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const dp = await deployed.newPage()
  dp.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))
  await dp.goto(`http://deployed.test:${PORT}/ClueCabulary/?city=4&learned=50`)
  await dp.waitForSelector('.letter', { timeout: 10000 })
  console.log('the letter opens on a deployed origin too')
  await dp.locator('.letter-go').click()
  await dp.waitForSelector('.howto', { timeout: 5000 })
  await dp.locator('.howto .btn-primary').click()
  await dp.waitForSelector('.city-card')
  const city = await dp.locator('.city-eyebrow').textContent()
  if (!/Stop 1 of/.test(city)) {
    throw new Error(`?city=4 was honoured on a deployed origin: ${city.trim()}`)
  }
  const collected = await dp.locator('.collect-count').textContent()
  if (!/^0 /.test(collected.trim())) {
    throw new Error(`?learned=50 was honoured on a deployed origin: ${collected.trim()}`)
  }
  console.log('and the collection-rewriting switches are not')
  await deployed.close()

  console.log('STORY DRIVE OK')
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/s9-failure.png` }).catch(() => {})
  console.log('STORY DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
