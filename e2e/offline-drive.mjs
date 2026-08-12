// Verifies the installed-PWA promise: after one online visit, the app must
// load with the network gone (service worker serves the precached shell,
// including the full dictionary — only AI calls need connectivity).
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const preview = spawn('npx', ['vite', 'preview', '--port', '4175', '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
})
await sleep(1500)

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

try {
  // First visit online: let the service worker install and precache.
  await page.goto('http://localhost:4175/ClueCabulary/?mock=1&howto=0')
  await page.waitForSelector('h1:has-text("ClueCabulary")')
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
  await page.waitForSelector('h1:has-text("ClueCabulary")', { timeout: 15000 })

  // The dictionary must work offline too (bundled data).
  await page.click('.wotd')
  await page.waitForSelector('.sheet')
  const word = await page.locator('.sheet h2').textContent()
  console.log('offline dictionary lookup:', word?.trim())

  console.log('OFFLINE DRIVE OK')
} catch (e) {
  console.log('OFFLINE DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.kill()
}
