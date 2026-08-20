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
const CAPPED_PORT = 4195
const NO_KV_PORT = 4196
const CEILING_PORT = 4197
const KEY = 'player-secret-key'
const WORKER_SECRET = 'secret-that-lives-on-the-worker'
/** The install id this drive pretends the phone minted, so the quota it spends
 *  by hand is the same bucket the browser's own requests land in. */
const PHONE_ID = 'drive-phone-install'

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
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
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
  // Stamped with the CURRENT settings version on purpose. This fixture is a
  // client for testing the worker, not an old save: written as version 1 it
  // gets run through every migration on the way in, and the v7 one clears the
  // API key — which is right for a real device and fatal for a drive whose
  // subject is what the worker does with a key it is sent.
  version: 7,
})

/** Point the app at a base URL and land it on Home with nothing verified. */
async function useBaseUrl(baseUrl, apiKey = KEY) {
  await page.goto(`${preview.base}?howto=0`)
  await page.evaluate(
    ({ value, installId }) => {
      localStorage.setItem('cluecab-settings-v1', JSON.stringify(value))
      // Pinned rather than left to the app's own crypto.randomUUID, so this
      // drive can spend a known bucket's quota from outside the browser and
      // then watch the app walk into the cap it just filled. The app reads
      // whatever is stored here — that it does so is the reason the cap can
      // count one phone at all across reloads.
      localStorage.setItem('cluecab-install-id', installId)
    },
    { value: settingsFor(baseUrl, apiKey), installId: PHONE_ID },
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
    [401, /refused the request/i, 'auth'],
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
  await page.goto(`${preview.base}?howto=0&seed=5&grid=beginner`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
  await page.fill('.clue-input input', 'huskeliste')
  await page.click('.clue-input .btn-primary')
  await page.waitForSelector('.ai-guess-line, .guess-bar', { timeout: 25000 })
  await sleep(2000)
  check('a round plays through the proxy', (await page.locator('.error-banner').count()) === 0)
  check('and Cluey really answered over the wire', fake.received.length >= 1, `${fake.received.length} upstream calls`)

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
  // X-Install-Id makes the request non-simple, so a preflight that does not
  // list it is a hard refusal before the real request is sent — the quota
  // would be unreachable from a browser and only ever count scripts.
  check(
    'and the preflight allows the install-id header the quota needs',
    /x-install-id/i.test(pre.headers.get('access-control-allow-headers') ?? ''),
    pre.headers.get('access-control-allow-headers') ?? 'none',
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

  // ---- the daily cap, on a real KV binding -----------------------------------
  // The origin lock above stops a browser and stops curl-with-no-Origin, and
  // that is where it ends: Origin is a header, and one `-H` makes a script
  // indistinguishable from the app. The cap is what bounds the spend after
  // that. Miniflare gives the worker the same KV binding Cloudflare does, so
  // the counting below is the deployed code path and not a stand-in.
  const spend = (base, { id, auth, n = 1 } = {}) =>
    Promise.all(
      Array.from({ length: n }, () =>
        fetch(`${base}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(id ? { 'X-Install-Id': id } : {}),
            ...(auth ? { Authorization: auth } : {}),
          },
          body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
        }),
      ),
    )

  // Two requests, then the wall. Small on purpose — the shipped numbers are
  // 1000 and 25000, and a drive that had to make a thousand calls to see the
  // cap would be testing patience rather than the cap.
  const capped = await startWorker(CAPPED_PORT, {
    upstream: fake.baseUrl,
    apiKey: WORKER_SECRET,
    kv: true,
    vars: { DAILY_CAP: 2, GLOBAL_DAILY_CAP: 0 },
  })
  fake.reset()
  // Sequential, not Promise.all: KV has no atomic increment, so two requests
  // racing can both read the same count. That looseness is documented and
  // accepted in the worker; it is not what this drive is measuring.
  const under = []
  for (let i = 0; i < 2; i++) under.push((await spend(capped.base, { id: PHONE_ID }))[0])
  check(
    'the first requests under the cap go through',
    under.every((r) => r.status === 200),
    under.map((r) => r.status).join(', '),
  )
  const over = (await spend(capped.base, { id: PHONE_ID }))[0]
  const overBody = await over.text()
  check('the one over the cap is refused with 429', over.status === 429, `HTTP ${over.status}`)
  check(
    'and it never reached the upstream, so it cost nothing',
    fake.received.length === 2,
    `${fake.received.length} upstream calls for 3 requests`,
  )
  check(
    'the refusal is machine-readable and says when it lifts',
    overBody.includes('cluecabulary_daily_cap') && /midnight UTC/.test(overBody),
    overBody.slice(0, 120),
  )
  check(
    'with Retry-After pointing at the next UTC day',
    Number(over.headers.get('retry-after')) > 0 &&
      Number(over.headers.get('retry-after')) <= 86400,
    `Retry-After ${over.headers.get('retry-after')}`,
  )

  // A different install is a different bucket. Otherwise the first enthusiast
  // of the day locks out everyone else, which is the failure this must not have.
  const neighbour = (await spend(capped.base, { id: 'someone-else' }))[0]
  check('a different install still gets its own allowance', neighbour.status === 200, `HTTP ${neighbour.status}`)

  // A player's own key is their own money. Metering it would be an arbitrary
  // limit on somebody else's budget, and it is the escape hatch the README
  // documents, so it must survive a spent cap.
  const byok = (await spend(capped.base, { id: PHONE_ID, auth: `Bearer ${KEY}` }))[0]
  check('a request carrying its own key is not metered', byok.status === 200, `HTTP ${byok.status}`)

  // ---- and the player sees something they can act on -------------------------
  // The bucket above was spent with PHONE_ID, which is exactly the id the app
  // has in localStorage — so the browser now walks into a cap that is already
  // full, mid-round, with a board dealt.
  fake.reset()
  await useBaseUrl(`${capped.base}/v1`, '')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.goto(`${preview.base}?howto=0&seed=5&grid=beginner`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const studyAgain = page.locator('.study-dock .btn-primary')
  if (await studyAgain.isVisible().catch(() => false)) await studyAgain.click()
  await page.fill('.clue-input input', 'huskeliste')
  await page.click('.clue-input .btn-primary')
  await page.waitForSelector('.error-banner', { timeout: 25000 })
  const banner = (await page.locator('.error-banner p').first().textContent()).trim()
  check(
    'the cap reaches the player as Cluey resting, not as a status code',
    /today/i.test(banner) && /midnight UTC/.test(banner) && !/429/.test(banner),
    banner,
  )
  check(
    'and it names the way out rather than telling them to wait',
    /Play on without Cluey/.test(banner) && !/wait a moment/i.test(banner),
    banner,
  )
  check(
    'the browser really was refused before the upstream, spending nothing',
    fake.received.length === 0,
    `${fake.received.length} upstream calls`,
  )
  // The banner names that button because the button is there. Clicking it has
  // to actually finish the round offline, or the message is a dead end.
  await page.getByRole('button', { name: 'Play on without Cluey' }).click()
  await page.waitForSelector('.practice-note', { timeout: 5000 })
  check(
    'and the button it names carries on with the practice companion',
    (await page.locator('.error-banner').count()) === 0,
    'error banner cleared',
  )
  await capped.stop()

  // ---- fail open: no binding must never mean no service ----------------------
  // The likeliest way this feature breaks in the field is a namespace that was
  // never created, or an id pasted wrong. A proxy that answers 429 to everyone
  // because of that is a far worse outcome than one that does not count, so the
  // worker checks for the binding and carries on without it. Same caps, same
  // requests, no KV.
  const noKv = await startWorker(NO_KV_PORT, {
    upstream: fake.baseUrl,
    apiKey: WORKER_SECRET,
    kv: false,
    vars: { DAILY_CAP: 2, GLOBAL_DAILY_CAP: 2 },
  })
  fake.reset()
  const unmetered = []
  for (let i = 0; i < 5; i++) unmetered.push((await spend(noKv.base, { id: PHONE_ID }))[0])
  check(
    'with no KV binding the worker serves everyone rather than refusing everyone',
    unmetered.every((r) => r.status === 200),
    unmetered.map((r) => r.status).join(', '),
  )
  check(
    'and every one of them was really forwarded',
    fake.received.length === 5,
    `${fake.received.length} upstream calls`,
  )
  await noKv.stop()

  // ---- the ceiling, which is the only number an attacker cannot dodge --------
  // The install id arrives in a header, so a script can send a new one every
  // request and the per-install cap never fires. That is not a bug to be fixed
  // with a cleverer id — it is why there is a second counter with nothing in
  // the request selecting it. This is the honest version of the claim: the
  // forger gets through the first cap and is stopped by the second.
  const ceiling = await startWorker(CEILING_PORT, {
    upstream: fake.baseUrl,
    apiKey: WORKER_SECRET,
    kv: true,
    vars: { DAILY_CAP: 1000, GLOBAL_DAILY_CAP: 3 },
  })
  fake.reset()
  const forged = []
  for (let i = 0; i < 5; i++) forged.push((await spend(ceiling.base, { id: `forged-${i}` }))[0])
  check(
    'a fresh install id every time walks past the per-install cap',
    forged.slice(0, 3).every((r) => r.status === 200),
    forged.map((r) => r.status).join(', '),
  )
  check(
    'and is stopped dead by the global ceiling',
    forged.slice(3).every((r) => r.status === 429),
    forged.map((r) => r.status).join(', '),
  )
  check(
    'so the worst case for the bill is the ceiling and not the internet',
    fake.received.length === 3,
    `${fake.received.length} upstream calls for 5 forged requests`,
  )
  const ceilingBody = await forged[4].text()
  check(
    'and it says which limit it was, so the owner knows what to raise',
    /"scope":"global"/.test(ceilingBody),
    ceilingBody.slice(0, 120),
  )
  await ceiling.stop()

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
