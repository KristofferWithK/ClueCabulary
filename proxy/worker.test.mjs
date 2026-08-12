import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './worker.js'

/**
 * The proxy's contract, without a runtime in the way.
 *
 * e2e/proxy-drive.mjs runs this same file on workerd with a browser in front of
 * it, which is the stronger test — but two things are easier to pin here. One
 * is what the worker refuses to forward: the request it builds carries the API
 * key and nothing else, and a cookie riding along on the incoming request must
 * not reach ollama.com. The other is the unreachable-upstream branch, which
 * miniflare cannot reproduce: a throw inside its outbound stub comes back as a
 * 500 *response*, so the worker's own catch never runs, and on Cloudflare the
 * uncaught version would be an error page with no CORS headers at all — a
 * failure the browser would report as CORS.
 */
const ENDPOINT = 'https://cluecabulary-proxy.example.workers.dev/v1/chat/completions'

const post = (init = {}) =>
  new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer player-key', ...init.headers },
    body: init.body ?? JSON.stringify({ model: 'gpt-oss:120b' }),
  })

const upstreamOk = (body = '{"choices":[]}', init = {}) =>
  vi.fn(async () => new Response(body, { status: 200, ...init }))

afterEach(() => vi.unstubAllGlobals())

describe('the CORS proxy worker', () => {
  it('answers the preflight the client actually sends', async () => {
    const res = await worker.fetch(new Request(ENDPOINT, { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/authorization/i)
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/content-type/i)
    expect(res.headers.get('Access-Control-Allow-Methods')).toMatch(/POST/)
  })

  it('refuses anything but POST, readably', async () => {
    // Without the CORS headers here the browser hides the 405 and reports a
    // CORS failure, which is the one diagnosis that sends you in a circle.
    const res = await worker.fetch(new Request(ENDPOINT))
    expect(res.status).toBe(405)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('forwards the path, the query and the key to ollama.com', async () => {
    const fetchSpy = upstreamOk()
    vi.stubGlobal('fetch', fetchSpy)
    await worker.fetch(new Request(`${ENDPOINT}?beta=1`, { method: 'POST', headers: { Authorization: 'Bearer player-key' }, body: '{}' }))
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://ollama.com/v1/chat/completions?beta=1')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer player-key')
  })

  it('sends the body through untouched', async () => {
    const fetchSpy = upstreamOk()
    vi.stubGlobal('fetch', fetchSpy)
    const body = JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hej' }] })
    await worker.fetch(post({ body }))
    expect(await new Response(fetchSpy.mock.calls[0][1].body).text()).toBe(body)
  })

  it('carries nothing but the key and the content type', async () => {
    const fetchSpy = upstreamOk()
    vi.stubGlobal('fetch', fetchSpy)
    await worker.fetch(post({ headers: { Cookie: 'session=secret', 'X-Forwarded-For': '10.0.0.1' } }))
    expect(Object.keys(fetchSpy.mock.calls[0][1].headers).sort()).toEqual(['Authorization', 'Content-Type'])
  })

  it('passes the upstream status and body back with CORS added', async () => {
    vi.stubGlobal('fetch', upstreamOk('{"error":{"message":"nope"}}', { status: 429 }))
    const res = await worker.fetch(post())
    expect(res.status).toBe(429)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await res.text()).toBe('{"error":{"message":"nope"}}')
  })

  it('overrides an upstream CORS header rather than appending to it', async () => {
    // Two values in Access-Control-Allow-Origin is the same as none.
    vi.stubGlobal(
      'fetch',
      upstreamOk('{}', { headers: { 'Access-Control-Allow-Origin': 'https://ollama.com' } }),
    )
    const res = await worker.fetch(post())
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('answers an unreachable upstream itself, with CORS intact', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const res = await worker.fetch(post())
    expect(res.status).toBe(502)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await res.text()).toMatch(/upstream/i)
  })
})
