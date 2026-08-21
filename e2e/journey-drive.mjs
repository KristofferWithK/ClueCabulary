// Drives the journey: home → a packed suitcase opens the road → travel to the
// next city unlocks its 100 words.
//
// TEMPORARILY REDUCED: the suitcase is packed by dev switch (?wrapped=100)
// rather than by playing a wrap-up round, because the wrap-up mode lands in
// the next change. The full loop — collect → wrap in play → travel — returns
// with it.
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4177
const preview = await startPreview(PORT)

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const BASE = preview.base

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  // So one browser can also load this same build from a name that is NOT
  // localhost. `devSwitchesAllowed()` is a hostname test, and the dev travel
  // switch at the bottom of this drive has to be checked absent as well as
  // present — an unenforced guard looks exactly like an enforced one from
  // 127.0.0.1, which is where every drive runs. vite.config.ts's
  // `preview.allowedHosts` is the other half of this.
  args: ['--host-resolver-rules=MAP deployed.test 127.0.0.1'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

// The ride ships OFF (H9 is one city of nine), so this drive has to ask for it
// by name or the travel section below would be testing the straight-through
// path while claiming to test the ride. An init script rather than a setItem
// after load: the flag is read as the ride mounts, and this runs before any
// page script on every navigation, including the reloads further down.
// The off-by-default half is pinned in travelStory.test.ts, where it is a
// two-line assertion instead of a second hundred-word journey.
await page.addInitScript(() => localStorage.setItem('cluecab-ride', '1'))

const journeyState = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-journey-v2') ?? '{}').state)

try {
  // A fresh journey starts in the far south with nothing collected.
  await page.goto(`${BASE}?mock=1&howto=0`)
  await page.waitForSelector('.city-card')
  // Home says where you are on the map itself — the eyebrow that used to
  // repeat it lost its place in the row to the train. This reads the label the
  // player actually looks at.
  const start = await page.locator('.home-map-here').textContent()
  if (!start?.includes('Sønderborg')) throw new Error(`expected to start in Sønderborg, got ${start}`)
  // The train is the door now (T1), so "is travel offered?" is asked of the
  // train rather than of a button beside it: a filling train is a readout and
  // must not be pressable. And Home has no separate travel button at all — the
  // check below is what would catch one growing back.
  if (await page.locator('.train-board').count())
    throw new Error('the train was a control with nothing wrapped')
  if (await page.locator('.home-screen .btn-travel').count())
    throw new Error('Home grew a separate travel button again')
  await page.screenshot({ path: `${SHOT_DIR}/j1-home-start.png` })

  // One word short of a packed suitcase: the road stays shut.
  await page.goto(`${BASE}?mock=1&howto=0&city=0&wrapped=99`)
  await page.waitForSelector('.city-card')
  const almost = await page.locator('.collect-count').textContent()
  console.log('progress at 99:', almost?.replace(/\s+/g, ' ').trim())
  if (!almost?.includes('99')) throw new Error('wrapped count did not reach 99')
  if (await page.locator('.train-board').count())
    throw new Error('travel offered at 99 of 100 wrapped')
  await page.screenshot({ path: `${SHOT_DIR}/j2-almost.png` })

  // The hundredth word wraps → the train on Home becomes the door north.
  await page.goto(`${BASE}?mock=1&howto=0&city=0&wrapped=100`)
  await page.waitForSelector('.train-board')
  if (await page.locator('.home-screen .btn-travel').count())
    throw new Error('Home offered a separate travel button beside the train')
  // A real button with a real name — the readout it was a moment ago was an
  // aria-hidden drawing, and half of this card is that it stops being one.
  const boardName = await page.locator('.train-board').getAttribute('aria-label')
  console.log('the train boards as:', boardName)
  if (!boardName?.includes('Ribe')) throw new Error(`the train's name does not say where: ${boardName}`)
  await page.screenshot({ path: `${SHOT_DIR}/j3-travel-open.png` })

  // Tapping the train boards it: straight into the ride (H9), which reads the
  // LEAVING city's hundred words back as a story before the arrival. Home used
  // to send you to the map to press a second button of the same name; the map
  // is passed through now and must not be what the tap lands on.
  await page.click('.train-board')
  await page.waitForSelector('.ride-screen')
  if (await page.locator('.denmark-map').count())
    throw new Error('boarding the train stopped at the map instead of riding')
  const rideLines = await page.locator('.ride-sentence').count()
  console.log('ride sentences:', rideLines)
  if (rideLines < 10) throw new Error(`the ride showed ${rideLines} sentences`)
  // The story is the LEAVING city's, so Sønderborg's words — not Ribe's.
  const rideEyebrow = await page.locator('.ride-eyebrow').textContent()
  if (!rideEyebrow?.includes('Sønderborg')) {
    throw new Error(`the ride should be leaving Sønderborg, got "${rideEyebrow}"`)
  }
  // The clips the app will actually ask for must exist in this BUILD, not just
  // in the repo — dist is what ships, and a missing public/ copy is invisible
  // to a unit test.
  //
  // All THREE of them, because the ride says each sentence four times: the
  // Danish, the English translation, the Danish slowly, the Danish again
  // (journey/rideCycle.ts). One missing directory is a silent gap in the
  // middle of every sentence rather than a ride that obviously fails.
  //
  // On the content type, not the status: `vite preview` answers an unknown
  // path with index.html and a 200, so a status check passes with the clips
  // deleted — the trap smoke-drive documents at length and this check used to
  // sit in.
  const clips = await page.evaluate(async () => {
    const want = ['story/0-000.mp3', 'story/en/0-000.mp3', 'story/slow/0-000.mp3']
    const out = []
    for (const path of want) {
      const url = new URL(`audio/da/${path}`, document.baseURI).href
      const res = await fetch(url, { method: 'HEAD' })
      out.push({ path, status: res.status, type: res.headers.get('content-type') ?? '' })
    }
    return out
  })
  for (const c of clips) console.log(`story clip ${c.path}: ${c.status} ${c.type}`)
  // Strict about the bakes this tree HAS, and honest about the ones it does
  // not: the three sets are made by separate passes of one CI run, so a tree
  // can sit between them for a few minutes — as this one did when the ride
  // grew its cycle. Silence about a missing set would read as proof it was
  // there, so the ones on disk are asserted and the rest are named out loud.
  const onDisk = (...parts) => {
    try {
      return readdirSync(resolve(ROOT, 'dist', 'audio', 'da', ...parts)).filter((f) =>
        f.endsWith('.mp3'),
      ).length
    } catch {
      return 0
    }
  }
  const have = { 'story/0-000.mp3': onDisk('story'), 'story/en/0-000.mp3': onDisk('story', 'en'), 'story/slow/0-000.mp3': onDisk('story', 'slow') }
  const missing = clips.filter((c) => have[c.path] > 0 && (c.status !== 200 || !c.type.startsWith('audio/')))
  if (missing.length) {
    throw new Error(
      `the ride's cycle has no clip for: ${missing.map((c) => c.path).join(', ')} — a 200 of ` +
        `text/html here is the preview server's index.html, not audio. Those clips are in the ` +
        `repo but not in the build.`,
    )
  }
  const unbaked = clips.filter((c) => have[c.path] === 0)
  if (unbaked.length) {
    console.log(
      `NOTE: no bake yet for ${unbaked.map((c) => c.path.replace('/0-000.mp3', '')).join(', ')} ` +
        `— the ride falls back to the device voice for those passes. Run bake-audio.yml.`,
    )
  }

  // And the cycle asks for them in that order. Asserted on the requests the
  // page makes rather than on anything audible: headless Chromium has no audio
  // device, so what can be measured is which file the ride reached for.
  const asked = []
  page.on('request', (r) => {
    const m = r.url().match(/audio\/da\/(story[^?]*)\.mp3/)
    if (m) asked.push(m[1])
  })
  // Long enough for the first pass to finish and the second to start.
  // Headless Chromium really does play these — probed: play() resolves and
  // the element advances in real time — so the chain is observable, but only
  // at the speed of the audio. Sønderborg's first sentence is 4.5s of Danish,
  // hence the wait; asserting the whole four-pass cycle here would mean
  // twenty seconds of drive for what rideCycle.test.ts pins in a millisecond.
  await page.click('.ride-play')
  await sleep(6500)
  if (!asked.length) throw new Error('pressing Listen asked for no story audio at all')
  if (asked[0] !== 'story/0-000') {
    throw new Error(`the ride opened with ${asked[0]} rather than the Danish sentence`)
  }
  console.log('ride asked for:', asked.join(' → '))
  // That it MOVES ON, and moves on to the translation. The second pass is the
  // one worth asserting in a browser: it proves the sentence is not simply
  // played once as it used to be, and it proves the step reaches story/en/
  // rather than replaying the Danish. The rest of the order is rideCycle's own
  // test. Skipped while a pass is unbaked — then the clip 404s, play() gets
  // the preview server's index.html, and the chain stops at the fallback by
  // design, so this would be measuring the missing bake.
  if (!unbaked.length) {
    const wantOrder = ['story/0-000', 'story/en/0-000']
    const got = asked.slice(0, 2)
    if (got.join('|') !== wantOrder.join('|')) {
      throw new Error(`the cycle went ${got.join(' → ')}, wanted ${wantOrder.join(' → ')}`)
    }
  }
  await page.screenshot({ path: `${SHOT_DIR}/j4-ride.png` })

  // Skippable, always — the card's own requirement.
  await page.click('.ride-skip')
  await page.waitForSelector('.arrival-city')
  const arrived = await page.locator('.arrival-city').textContent()
  console.log('arrived in:', arrived)
  if (arrived?.trim() !== 'Ribe') throw new Error(`expected to arrive in Ribe, got ${arrived}`)
  await page.screenshot({ path: `${SHOT_DIR}/j4-arrival.png` })

  const state = await journeyState()
  if (state.cityIndex !== 1) throw new Error(`journey did not advance: ${JSON.stringify(state)}`)
  if (!state.arrivedAt?.['1']) throw new Error('arrival was not logged')
  if (Object.keys(state.wrapped ?? {}).length !== 100)
    throw new Error('the packed suitcase did not travel with the player')

  // The map shows the new position.
  await page.click('.arrival-screen .btn:not(.btn-primary)')
  await page.waitForSelector('.denmark-map')
  await page.screenshot({ path: `${SHOT_DIR}/j5-map.png` })

  // And the map's train is a door too, on the stop you are standing at. Ribe
  // is not wrapped, so here it must still be a readout — the same "not
  // pressable while it fills" rule Home is held to above.
  if (await page.locator('.map-train.train-board').count())
    throw new Error("the map's train was a control at an unwrapped city")

  /**
   * The dev travel switch: five taps on the build stamp, then a stop up the
   * route without playing it.
   *
   * Both halves are checked, because the guard is the feature. It is gated on
   * `devSwitchesAllowed()` — a hostname test — and every drive in this repo
   * runs on 127.0.0.1, where that is always true. So the second half loads the
   * SAME server through `deployed.test` (mapped at launch, above), which is
   * what a deployed origin looks like to the app: the five taps still reveal
   * the keyboard readout, and the travel switch is simply not there.
   */
  const revealDevSwitches = async () => {
    await page.waitForSelector('.settings-screen')
    const stamp = page.locator('.build-footer span').first()
    for (let i = 0; i < 5; i++) await stamp.click()
    // The readout's note proves the GESTURE landed, so an absent travel switch
    // below cannot be five taps that went nowhere.
    await page.waitForSelector('.build-note')
  }

  await page.goto(`${BASE}?mock=1&howto=0`)
  await page.click('.icon-btn[aria-label="Settings"]')
  await revealDevSwitches()
  if (!(await page.locator('.dev-travel').count()))
    throw new Error('the dev travel switch is missing where dev switches are allowed')
  const before = (await journeyState()).cityIndex
  await page.click('.dev-travel')
  const after = (await journeyState()).cityIndex
  console.log(`dev travel: stop ${before} → ${after}`)
  if (after !== before + 1) throw new Error(`dev travel did not move the journey: ${before} → ${after}`)
  // It moves the position and nothing else — the suitcase it was carrying is
  // still packed with the hundred words the ride was made of.
  if (Object.keys((await journeyState()).wrapped ?? {}).length !== 100)
    throw new Error('dev travel touched the suitcase')
  await page.screenshot({ path: `${SHOT_DIR}/j6-dev-travel.png` })

  const deployed = `http://deployed.test:${preview.port}/ClueCabulary/`
  await page.goto(`${deployed}?howto=0`)
  await page.click('.icon-btn[aria-label="Settings"]')
  await revealDevSwitches()
  if (await page.locator('.dev-travel').count())
    throw new Error('the dev travel switch is reachable on a deployed origin')

  console.log('JOURNEY DRIVE OK')
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/j9-failure.png` }).catch(() => {})
  console.log('JOURNEY DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
