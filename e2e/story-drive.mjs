// The story frame: the grandmother's letter opens the game, hands over to the
// rules, and stays re-readable; and each city's champion sets the exam, reacts
// to it, and sees you off.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const PORT = 4178
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: '/home/user/ClueCabulary',
  stdio: 'ignore',
})
await sleep(2500)

const BASE = `http://127.0.0.1:${PORT}/ClueCabulary/`
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))


/**
 * Sit the exam until it passes, learning the answers as it goes. A retry draws
 * a fresh paper by design, so the answers revealed by one attempt only partly
 * cover the next — the map accumulates until an attempt can be filled whole.
 */
async function passTheExam(page, known = new Map()) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    await page.waitForSelector('.gate-list')
    const words = await page.locator('.gate-list .gate-da').allTextContents()
    for (let i = 0; i < words.length; i++) {
      await page.locator('.gate-item input').nth(i).fill(known.get(words[i].trim()) ?? 'zzz')
    }
    await page.click('.gate-list ~ .btn-primary, .gate-screen > .btn-primary')
    await page.waitForSelector('.gate-results')
    if (await page.locator('.stamp-award').count()) return { known, attempts: attempt }

    // Learn every word this attempt gave away, by word rather than by position.
    const rows = await page.locator('.gate-results li').all()
    for (const row of rows) {
      const da = (await row.locator('.gate-da').textContent()).trim()
      const em = row.locator('.result-answer em')
      if (await em.count()) {
        known.set(da, (await em.textContent()).replace(/^\s*=\s*/, '').split(',')[0].trim())
      }
    }
    await page.click('.gate-actions .btn-primary')
  }
  throw new Error('six attempts and the exam never passed')
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
  const learned = (await passTheExam(page)).known
  const onPass = await page.locator('.champion-says .champion-line').textContent()
  console.log('on a stamp:', onPass.trim())
  if (onPass.trim() === onFail.trim()) throw new Error('the same line for a pass and a miss')
  await page.screenshot({ path: `${SHOT_DIR}/s3-stamped.png` })

  // And they see you off when the passport page is full.
  await page.goto(`${BASE}?mock=1&howto=0&city=0&learned=100&stamps=4`)
  await page.waitForSelector('.city-card')
  await page.locator('.btn-gate').click()
  await page.waitForSelector('.gate-list')
  await passTheExam(page, new Map(learned))
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

  console.log('STORY DRIVE OK')
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/s9-failure.png` }).catch(() => {})
  console.log('STORY DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.kill()
}
