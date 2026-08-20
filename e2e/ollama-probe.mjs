// Can a browser talk to your AI server, and does your key work?
//
// Ten seconds, plain node, no build and no browser:
//
//   OLLAMA_API_KEY=... node e2e/ollama-probe.mjs
//
// It answers the one question no automated test in this repo can, because the
// session that wrote them cannot reach ollama.com: whether the app works from
// a phone at all, or whether proxy/README.md is required first.
//
// Optional: OLLAMA_BASE_URL (default https://ollama.com/v1), OLLAMA_MODEL,
// ORIGIN (default the deployed GitHub Pages origin).
//
// The key is read from the environment and never printed. Everything this
// prints is safe to paste back.

const KEY = process.env.OLLAMA_API_KEY
const BASE = (process.env.OLLAMA_BASE_URL ?? 'https://ollama.com/v1').trim().replace(/\/+$/, '')
const MODEL = process.env.OLLAMA_MODEL ?? 'gpt-oss:120b'
const ORIGIN = process.env.ORIGIN ?? 'https://kristofferwithk.github.io'
const ENDPOINT = `${BASE}/chat/completions`

if (!KEY) {
  console.log('PROBE SKIPPED (no OLLAMA_API_KEY)')
  console.log('\n  OLLAMA_API_KEY=... node e2e/ollama-probe.mjs')
  process.exit(0)
}

const say = (label, value) => console.log(`  ${label.padEnd(34)} ${value}`)
const problems = []

console.log(`Probing ${ENDPOINT}`)
console.log(`as if from a browser at ${ORIGIN}\n`)

// ---- 1. the preflight -------------------------------------------------------
// The app sends Authorization and Content-Type: application/json, so a browser
// always sends OPTIONS first and refuses to proceed unless it is answered with
// the right headers. Node does not enforce any of this — which is exactly why
// the headers have to be read rather than inferred from "the POST worked".
console.log('1. CORS preflight (OPTIONS)')
let preflightOk = false
try {
  const res = await fetch(ENDPOINT, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  })
  const allowOrigin = res.headers.get('access-control-allow-origin')
  const allowHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase()
  say('status', res.status)
  say('access-control-allow-origin', allowOrigin ?? '(absent)')
  say('access-control-allow-headers', allowHeaders || '(absent)')

  const originOk = allowOrigin === '*' || allowOrigin === ORIGIN
  const headersOk = allowHeaders.includes('authorization') && allowHeaders.includes('content-type')
  preflightOk = res.status < 400 && originOk && headersOk
  if (!originOk) problems.push('the preflight does not allow your origin')
  if (!headersOk) problems.push('the preflight does not allow the Authorization header')
  if (res.status >= 400) problems.push(`the preflight itself failed (HTTP ${res.status})`)
} catch (e) {
  say('failed', e.message)
  problems.push(`could not reach ${ENDPOINT}: ${e.message}`)
}

// ---- 2. the real call -------------------------------------------------------
console.log('\n2. A real chat completion')
let chatOk = false
try {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: 'Reply with exactly this JSON object: {"ok": true}' }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  })
  say('status', res.status)
  say('access-control-allow-origin', res.headers.get('access-control-allow-origin') ?? '(absent)')
  if (res.status === 401 || res.status === 403) {
    problems.push('the key was rejected — check it, or that it is a Ollama Cloud key')
  } else if (res.status === 404) {
    problems.push(`no such model or endpoint: check OLLAMA_MODEL (${MODEL}) and the base URL`)
  } else if (res.status === 429) {
    problems.push('rate limited — the key works, try again shortly')
  } else if (!res.ok) {
    problems.push(`server error HTTP ${res.status}`)
  } else {
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content ?? ''
    say('reply', JSON.stringify(content).slice(0, 120))
    chatOk = !!content
    if (!content) problems.push('the server answered 200 with no message content')
    if (!res.headers.get('access-control-allow-origin')) {
      problems.push('the answer carries no Access-Control-Allow-Origin, so a browser would discard it')
    }
  }
} catch (e) {
  say('failed', e.message)
  problems.push(`the request could not be sent: ${e.message}`)
}

// ---- verdict ----------------------------------------------------------------
console.log('\nVerdict')
if (chatOk && preflightOk) {
  console.log('  The key works AND a browser is allowed to use it directly.')
  console.log('  Put the key in Settings on your phone; no proxy needed.')
} else if (chatOk && !preflightOk) {
  console.log('  The key works, but a BROWSER cannot use this server directly:')
  console.log('  the CORS preflight does not permit it. This is the case the')
  console.log('  bundled proxy exists for — see proxy/README.md, then set the')
  console.log('  worker URL plus /v1 as the Base URL in Settings.')
  console.log('  Re-run against the worker to confirm:')
  console.log('    OLLAMA_BASE_URL=https://<you>.workers.dev/v1 OLLAMA_API_KEY=... node e2e/ollama-probe.mjs')
} else {
  console.log('  The server did not answer a usable completion.')
}
if (problems.length) {
  console.log('\n  ' + problems.map((p) => `- ${p}`).join('\n  '))
}
console.log('\nNext: node e2e/live-drive.mjs plays a real round and prints the clue Casey gives,')
console.log('which is the other thing no test here can settle. Same env vars.')
process.exitCode = chatOk ? 0 : 1
