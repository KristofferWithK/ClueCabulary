// Verifies the installed-PWA promise: after one online visit, the app must
// load with the network gone (service worker serves the precached shell,
// including the full dictionary — only AI calls need connectivity).
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4175
const preview = await startPreview(PORT)
import { setTimeout as sleep } from 'node:timers/promises'


const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

try {
  // First visit online: let the service worker install and precache.
  await page.goto(preview.base + '?mock=1&howto=0&collected=5')
  await page.waitForSelector('h1:has-text("900Words")')
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return reg?.active?.state === 'activated'
    },
    undefined,
    { timeout: 20000 },
  )
  // Give workbox a beat to finish precaching after activation.
  await sleep(1500)
  console.log('service worker activated; going offline')

  await context.setOffline(true)
  await page.reload()
  await page.waitForSelector('h1:has-text("900Words")', { timeout: 15000 })

  // The dictionary must work offline too (bundled data).
  await page.click('.cluey-button')
  await page.waitForSelector('.suitcase-screen')
  await page.locator('.case-tile.case-collected').first().click()
  await page.waitForSelector('.sheet')
  const word = await page.locator('.sheet h2').textContent()
  console.log('offline dictionary lookup:', word?.trim())

  console.log('OFFLINE DRIVE OK')
} catch (e) {
  console.log('OFFLINE DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
