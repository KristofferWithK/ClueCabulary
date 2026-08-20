/**
 * A local stand-in for the three TTS services, so `make-audio.mjs` can be run
 * end to end without a key and without a bill.
 *
 * It is not a mock of the script's own code — the script talks to it over real
 * HTTP with the real adapter, so what gets exercised is the thing that will run
 * in the morning: the URL, the headers, the JSON body, the base64 decode, the
 * retry on a 429, the resume from the manifest. Only the voice is missing.
 *
 *   node scripts/audio-stub-server.mjs --port 4310
 *   TTS_API_KEY=stub node scripts/make-audio.mjs --endpoint http://127.0.0.1:4310
 *
 * `--fail-every N` makes every Nth request answer 429 with a Retry-After, which
 * is how the backoff path gets walked. `--reject <slug>` makes one word fail
 * permanently, which is how "keep going, report at the end, resume next run"
 * gets walked.
 */
import { createServer } from 'node:http'
import { silentMp3 } from './silent-mp3.mjs'

const argv = process.argv.slice(2)
const flag = (n, d) => {
  const at = argv.indexOf(`--${n}`)
  return at >= 0 && argv[at + 1] ? argv[at + 1] : d
}

const port = Number(flag('port', 4310))
const failEvery = Number(flag('fail-every', 0))
const reject = flag('reject', null)

let seen = 0
const log = []

const readBody = (req) =>
  new Promise((done) => {
    let b = ''
    req.on('data', (d) => (b += d))
    req.on('end', () => done(b))
  })

const server = createServer(async (req, res) => {
  const body = await readBody(req)
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  seen++

  // Health/report endpoint, so a test can ask what the script actually sent
  // rather than trusting that it sent anything.
  if (url.pathname === '/__log') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(log, null, 2))
    return
  }

  let provider = 'unknown'
  let text = ''
  let voice = ''
  let authed = false

  if (url.pathname === '/v1/text:synthesize') {
    provider = 'google'
    authed = !!req.headers['x-goog-api-key']
    const json = JSON.parse(body || '{}')
    text = json.input?.text ?? ''
    voice = json.voice?.name ?? ''
  } else if (url.pathname === '/cognitiveservices/v1') {
    provider = 'azure'
    authed = !!req.headers['ocp-apim-subscription-key']
    text = (body.match(/>([^<>]*)<\/prosody>/) ?? body.match(/>([^<>]*)<\/voice>/) ?? [, ''])[1]
    voice = (body.match(/name='([^']+)'/) ?? [, ''])[1]
  } else if (url.pathname.startsWith('/v1/text-to-speech/')) {
    provider = 'elevenlabs'
    authed = !!req.headers['xi-api-key']
    const json = JSON.parse(body || '{}')
    text = json.text ?? ''
    voice = decodeURIComponent(url.pathname.split('/').pop())
  } else {
    res.writeHead(404).end('no such endpoint')
    return
  }

  log.push({ provider, text, voice, authed })

  if (!authed) {
    res.writeHead(401, { 'Content-Type': 'text/plain' }).end('missing credential header')
    return
  }
  if (reject && text === reject) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`the stub refuses "${text}"`)
    return
  }
  if (failEvery && seen % failEvery === 0) {
    res.writeHead(429, { 'Content-Type': 'text/plain', 'Retry-After': '1' }).end('slow down')
    return
  }

  const mp3 = silentMp3(220 + text.length * 40)
  if (provider === 'google') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ audioContent: mp3.toString('base64') }))
  } else {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': mp3.length })
    res.end(mp3)
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`TTS stub on http://127.0.0.1:${port}`)
  console.log(`  google      POST /v1/text:synthesize`)
  console.log(`  azure       POST /cognitiveservices/v1`)
  console.log(`  elevenlabs  POST /v1/text-to-speech/<voice>`)
  if (failEvery) console.log(`  every ${failEvery}th request answers 429`)
  if (reject) console.log(`  "${reject}" always fails`)
})
