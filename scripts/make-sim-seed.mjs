// Regenerate ios/sim-seed.json: the starting position the simulator check
// hands to the app.
//
// A simulator will install and photograph an app but not play one, so
// ios-sim.yml seeds a round into localStorage instead. That file used to be
// produced by hand, and it rotted the way a hand-written save always rots:
// gameStore reached version 6 while the seed still said 3, migrateGame drops
// a round saved before v4 on purpose, and the check spent every run since
// photographing the Home screen with nothing to lift. It stayed green
// throughout — it photographs whatever is on screen and has no opinion about
// what that is.
//
// So the save is now produced by playing the built app, through the same
// preview server and dev switches the drives use, and whatever the stores
// write is what gets committed. Re-run it whenever a store version bumps:
//
//     npm run build && node scripts/make-sim-seed.mjs
//
// It prints the versions it captured. ios-sim.yml checks them against the
// stores at run time and fails the seeding step on a mismatch, so the next
// bump is a red run rather than four quiet screenshots of the wrong thing.
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { startPreview } from '../e2e/preview-server.mjs'

const PORT = Number(process.env.DRIVE_PORT_OFFSET ?? 0) + 4199
const OUT = new URL('../ios/sim-seed.json', import.meta.url)

// The same switches layout-drive uses to reach a clue box: the mock companion
// (no network on a runner), a fixed board, and the player opening the round so
// the first thing on screen is the composer rather than Casey's turn.
const START = '?mock=1&howto=0&seed=7&grid=standard&first=player'

const preview = await startPreview(PORT)
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

try {
  await page.goto(`${preview.base}${START}`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  // Past the study dock, if this board opens with one, and into the phase the
  // check is about: a clue box with a keyboard's worth of interest in it.
  const study = page.locator('.study-dock .btn-primary')
  if (await study.count()) await study.click()
  await page.waitForSelector('.clue-input input')

  const seed = await page.evaluate(() => {
    const out = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      // The rules flag and the keyboard flags are the workflow's to set, per
      // run; everything else the round needs is whatever the stores wrote.
      if (!k || !k.startsWith('cluecab-')) continue
      if (k.startsWith('cluecab-kb') || k.startsWith('cluecab-howto')) continue
      out[k] = localStorage.getItem(k)
    }
    return out
  })

  const versions = {}
  for (const [k, v] of Object.entries(seed)) {
    try {
      const parsed = JSON.parse(v)
      if (parsed && typeof parsed.version === 'number') versions[k] = parsed.version
    } catch {
      /* not every key is a persisted store */
    }
  }
  if (typeof versions['cluecab-game-v1'] !== 'number') {
    throw new Error('no versioned round was captured — the save would be dropped again')
  }

  writeFileSync(OUT, `${JSON.stringify(seed, null, 2)}\n`)
  console.log(`wrote ${Object.keys(seed).length} keys to ios/sim-seed.json`)
  for (const [k, v] of Object.entries(versions)) console.log(`  ${k} version ${v}`)
} finally {
  await browser.close()
  preview.stop()
}
