// The bundled CORS proxy, on the runtime it is written for.
//
// proxy/worker.js is the documented fix for the likeliest failure this app
// has: ollama.com refusing a request that came from a browser. It shipped
// never having been executed. This drive runs it on workerd (via miniflare)
// with the app talking to it from a real browser, so the whole path the deploy
// guide describes is exercised end to end — including the part that matters
// most, which is that the proxy solves a problem that is actually there.
//
// The upstream is the fake Ollama with its CORS headers switched off: fine
// from curl, unusable from a browser. Pointed straight at it the app must fail
// and say CORS; pointed at the worker the same app must work.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { startFakeOllama } from './fake-ollama.mjs'
import { startWorker } from './worker-runtime.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4189
// 4190 is skipped on purpose: it is on the fetch spec's blocked-port list
// (ManageSieve), so both Chromium and Node refuse to connect to it.
const FAKE_PORT = 4191
const WORKER_PORT = 4192
const LOCKED_PORT = 4193
const WRONG_ORIGIN_PORT = 4194
const KEY = 'player-secret-key'
const WORKER_SECRET = 'secret-that-lives-on-the-worker'

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

const preview = await startPreview(PORT)
// preview.base carries the app's base path; an Origin never does.
const PAGE_ORIGIN = new URL(preview.base).origin
const fake = await startFakeOllama(FAKE_PORT, { auto: true, cors: false })
const worker = await startWorker(WORKER_PORT, { upstream: fake.baseUrl })

if (!worker) {
  console.log('PROXY DRIVE SKIPPED — miniflare is not installed (npm i)')
  await fake.stop()
  preview.stop()
  process.exit(0)
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

const settingsFor = (baseUrl, apiKey = KEY) => ({
  state: {
    apiKey,
    baseUrl,
    model: 'fake-model',
    gridSize: 'beginner',
    clueLanguage: 'en',
    studyPhase: 'never',
    useMock: false,
    klausVerifiedAt: null,
  },
  version: 1,
})

/** Point the app at a base URL and land it on Home with nothing verified. */
async function useBaseUrl(baseUrl, apiKey = KEY) {
  await page.goto(`${preview.base}?howto=0`)
  await page.evaluate(
    ({ value }) => localStorage.setItem('cluecab-settings-v1', JSON.stringify(value)),
    { value: settingsFor(baseUrl, apiKey) },
  )
  await page.goto(`${preview.base}?howto=0`)
  await page.waitForSelector('.city-card')
}

/** Walk the path the deploy guide describes: Settings → Test connection. */
async function testConnection() {
  await page.locator('.setup-nudge').first().click()
  await page.waitForSelector('.settings-screen')
  await page.getByRole('button', { name: 'Test connection' }).click()
  await page.waitForSelector('.test-ok, .test-fail', { timeout: 20000 })
  const ok = (await page.locator('.test-ok').count()) > 0
  const message = ok ? '' : (await page.locator('.test-fail').first().textContent()).trim()
  return { ok, message }
}

try {
  // ---- the problem the proxy exists for is real ------------------------------
  await useBaseUrl(fake.baseUrl)
  const direct = await testConnection()
  check('a server without CORS headers fails in the browser', !direct.ok, direct.message)
  check(
    'and the app names CORS and the setting to check',
    /CORS/i.test(direct.message) && /Base URL/i.test(direct.message),
    direct.message,
  )

  // Aimed at ollama.com the advice must be different and specific: no setting
  // fixes that host, because it answers the preflight with a redirect.
  await useBaseUrl('https://ollama.com/v1')
  const cloud = await testConnection()
  check(
    'aimed at ollama.com it explains the preflight redirect and names the proxy',
    !cloud.ok && /preflight/i.test(cloud.message) && /proxy/i.test(cloud.message),
    cloud.message,
  )

  // ---- and the worker fixes it -----------------------------------------------
  fake.reset()
  await useBaseUrl(`${worker.base}/v1`)
  const viaProxy = await testConnection()
  check('the same request through the worker succeeds', viaProxy.ok, viaProxy.message)
  check(
    'the worker asked ollama.com for the right path',
    worker.upstreamCalls.at(-1)?.url === 'https://ollama.com/v1/chat/completions',
    worker.upstreamCalls.at(-1)?.url ?? 'no upstream call',
  )
  check(
    'the key reached upstream intact through the proxy',
    fake.received.at(-1)?.auth === `Bearer ${KEY}`,
    fake.received.at(-1)?.auth ? 'Bearer <key>' : 'no Authorization',
  )
  const verified = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-settings-v1') ?? '{}').state?.klausVerifiedAt,
  )
  check('a pass through the proxy clears the nudge', typeof verified === 'number', String(verified))

  // ---- upstream failures survive the extra hop -------------------------------
  // A proxy that swallowed the status would turn every failure into the same
  // unhelpful one, and the error taxonomy would be dead on the real setup.
  for (const [status, pattern, label] of [
    [401, /API key/i, 'auth'],
    [404, /Model or endpoint/i, 'not-found'],
    [429, /Rate limited/i, 'rate-limit'],
  ]) {
    fake.reset()
    fake.queue({ status })
    await useBaseUrl(`${worker.base}/v1`)
    const res = await testConnection()
    check(`HTTP ${status} still reads as ${label} through the proxy`, !res.ok && pattern.test(res.message), res.message)
  }

  // ---- a whole round, played through the proxy -------------------------------
  fake.reset()
  await useBaseUrl(`${worker.base}/v1`)
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.goto(`${preview.base}?howto=0&seed=5`)
  await page.waitForSelector('.city-card')
  await page.locator('.grid-card').first().click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
  await page.fill('.clue-input input', 'huskeliste')
  await page.click('.clue-input .btn-primary')
  await page.waitForSelector('.ai-guess-line, .guess-bar', { timeout: 25000 })
  await sleep(2000)
  check('a round plays through the proxy', (await page.locator('.error-banner').count()) === 0)
  check('and Klaus really answered over the wire', fake.received.length >= 1, `${fake.received.length} upstream calls`)

  // ---- the worker's own contract, without a browser in the way ----------------
  const pre = await fetch(`${worker.base}/v1/chat/completions`, {
    method: 'OPTIONS',
    headers: {
      Origin: PAGE_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  })
  check(
    'the preflight is answered with the headers the client sends',
    pre.status === 204 &&
      pre.headers.get('access-control-allow-origin') === '*' &&
      /authorization/i.test(pre.headers.get('access-control-allow-headers') ?? '') &&
      /content-type/i.test(pre.headers.get('access-control-allow-headers') ?? ''),
    `${pre.status} ${pre.headers.get('access-control-allow-headers')}`,
  )
  const bad = await fetch(`${worker.base}/v1/chat/completions`, { method: 'DELETE' })
  check(
    'an unsupported method is refused but still readable by the browser',
    bad.status === 405 && bad.headers.get('access-control-allow-origin') === '*',
    `${bad.status}, allow-origin ${bad.headers.get('access-control-allow-origin')}`,
  )
  // GET is allowed on purpose: /v1/models is how Settings offers real model
  // names instead of leaving you to guess between gpt-oss:120b and -cloud.
  fake.reset()
  fake.queue({ body: JSON.stringify({ data: [{ id: 'gpt-oss:120b' }] }) })
  const models = await fetch(`${worker.base}/v1/models`, { headers: { Authorization: `Bearer ${KEY}` } })
  check(
    'the model list comes through',
    models.status === 200 && worker.upstreamCalls.at(-1)?.url === 'https://ollama.com/v1/models',
    `${models.status} ${worker.upstreamCalls.at(-1)?.url}`,
  )

  // ---- the setup the guide actually recommends: no key on the phone --------
  // The worker holds the key as a Cloudflare secret, so Settings is empty and
  // nothing that reaches the browser contains it.
  await worker.stop()
  const keyed = await startWorker(WORKER_PORT, { upstream: fake.baseUrl, apiKey: WORKER_SECRET })
  fake.reset()
  await useBaseUrl(`${keyed.base}/v1`, '')
  const keyless = await testConnection()
  check('a worker holding the key works with no key in the app', keyless.ok, keyless.message)
  check(
    'and the worker supplied its own secret upstream',
    fake.received.at(-1)?.auth === `Bearer ${WORKER_SECRET}`,
    fake.received.at(-1)?.auth ? 'Bearer <worker secret>' : 'no Authorization',
  )
  const leaked = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-settings-v1') ?? '{}').state?.apiKey,
  )
  check('with nothing key-shaped left on the device', leaked === '', JSON.stringify(leaked))
  await keyed.stop()

  // An unreachable upstream is checked in proxy/worker.test.mjs, not here.
  // Miniflare cannot reproduce it: a throw inside its outbound stub comes back
  // to the worker as a 500 *response*, so the worker's own catch never runs.
  // Worse, miniflare's error page sends CORS headers and Cloudflare's does not,
  // so passing here would have proved nothing about the deployed proxy.

  // ---- the README's optional hardening, actually checked ----------------------
  // Locking ALLOWED_ORIGIN is advice the guide gives without ever having tried
  // it. It has to still let the player in, and it has to actually shut others
  // out — otherwise it is decoration. (The open worker was already disposed
  // above; disposing it twice takes the whole drive down.)
  const locked = await startWorker(LOCKED_PORT, { upstream: fake.baseUrl, allowedOrigin: PAGE_ORIGIN })
  fake.reset()
  await useBaseUrl(`${locked.base}/v1`)
  const lockedRes = await testConnection()
  check('locking ALLOWED_ORIGIN to your own origin still works', lockedRes.ok, lockedRes.message)
  await locked.stop()

  const wrong = await startWorker(WRONG_ORIGIN_PORT, {
    upstream: fake.baseUrl,
    allowedOrigin: 'https://someone-else.example',
  })
  fake.reset()
  await useBaseUrl(`${wrong.base}/v1`)
  const wrongRes = await testConnection()
  check(
    'and it shuts out every other origin',
    !wrongRes.ok && /CORS/i.test(wrongRes.message),
    wrongRes.message,
  )
  check(
    'a blocked origin never reaches upstream, from a browser',
    fake.received.length === 0,
    `${fake.received.length} upstream calls`,
  )

  // The two checks above only prove Chromium enforces CORS on itself, which it
  // does whatever the worker says. They passed for a year against a worker that
  // read ALLOWED_ORIGIN in exactly one place — the response header — and never
  // looked at the incoming Origin at all. The attacker this is meant to stop
  // does not run a browser, so ask without one.
  fake.reset()
  const rawForeign = await fetch(`${wrong.base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
  })
  check(
    'and refuses a foreign origin outside a browser too',
    rawForeign.status === 403,
    `HTTP ${rawForeign.status}`,
  )
  check(
    'spending nothing upstream when it does',
    fake.received.length === 0,
    `${fake.received.length} upstream calls`,
  )

  // curl sends no Origin at all, which is the whole point of using curl.
  fake.reset()
  const rawNoOrigin = await fetch(`${wrong.base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
  })
  check(
    'and refuses a request with no Origin at all',
    rawNoOrigin.status === 403,
    `HTTP ${rawNoOrigin.status}`,
  )
  check(
    'spending nothing upstream for that one either',
    fake.received.length === 0,
    `${fake.received.length} upstream calls`,
  )

  // The allowed origin must still get through on the same worker, or the lock
  // is just an outage.
  fake.reset()
  const rawAllowed = await fetch(`${wrong.base}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://someone-else.example',
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
  })
  check(
    'while the origin it is locked to still gets through',
    rawAllowed.status === 200 && fake.received.length === 1,
    `HTTP ${rawAllowed.status}, ${fake.received.length} upstream calls`,
  )
  await wrong.stop()

  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nPROXY DRIVE OK')
  if (fail.length) process.exitCode = 1
} catch (e) {
  console.log('PROXY DRIVE FAILED:', e.stack ?? e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  await fake.stop()
  preview.stop()
  process.exit(process.exitCode ?? 0)
}
