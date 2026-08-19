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
    const res = await worker.fetch(new Request(ENDPOINT, { method: 'OPTIONS' }), {})
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/authorization/i)
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/content-type/i)
    expect(res.headers.get('Access-Control-Allow-Methods')).toMatch(/POST/)
  })

  it('refuses a method it cannot serve, readably', async () => {
    // Without the CORS headers here the browser hides the 405 and reports a
    // CORS failure, which is the one diagnosis that sends you in a circle.
    const res = await worker.fetch(new Request(ENDPOINT, { method: 'DELETE' }), {})
    expect(res.status).toBe(405)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('allows GET, because /v1/models is how the app stops guessing model names', async () => {
    const fetchSpy = vi.fn(async () => new Response('{"data":[{"id":"gpt-oss:120b"}]}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const res = await worker.fetch(
      new Request('https://p.workers.dev/v1/models', { headers: { Authorization: 'Bearer k' } }),
      {},
    )
    expect(res.status).toBe(200)
    expect(fetchSpy.mock.calls[0][0]).toBe('https://ollama.com/v1/models')
    expect(fetchSpy.mock.calls[0][1].method).toBe('GET')
  })

  describe('holding the key itself', () => {
    it('uses its own secret when the app sends none', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      await worker.fetch(
        new Request(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
        { OLLAMA_API_KEY: 'worker-secret' },
      )
      expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer worker-secret')
    })

    it('is not shadowed by a blank Authorization header', async () => {
      // Older builds sent "Bearer " when the key field was empty.
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      await worker.fetch(
        new Request(ENDPOINT, { method: 'POST', headers: { Authorization: 'Bearer ' }, body: '{}' }),
        { OLLAMA_API_KEY: 'worker-secret' },
      )
      expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer worker-secret')
    })

    it('still prefers a key the app does send', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      await worker.fetch(post(), { OLLAMA_API_KEY: 'worker-secret' })
      expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer player-key')
    })

    it('refuses with 401 and CORS intact when there is no key anywhere', async () => {
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      const res = await worker.fetch(
        new Request(ENDPOINT, { method: 'POST', body: '{}' }),
        {},
      )
      expect(res.status).toBe(401)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('fronts a different service when UPSTREAM is set', async () => {
      // One worker, either provider: Gemini's OpenAI-compatible layer wants
      // the same Bearer token, so only the host moves.
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      await worker.fetch(
        new Request('https://p.workers.dev/v1beta/openai/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer player-key' },
          body: '{}',
        }),
        { UPSTREAM: 'https://generativelanguage.googleapis.com/' },
      )
      expect(fetchSpy.mock.calls[0][0]).toBe(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      )
    })

    it('and still defaults to ollama.com with no UPSTREAM', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      await worker.fetch(post(), {})
      expect(fetchSpy.mock.calls[0][0]).toBe('https://ollama.com/v1/chat/completions')
    })

    it('locks to one origin when ALLOWED_ORIGIN is set', async () => {
      const res = await worker.fetch(
        new Request(ENDPOINT, { method: 'OPTIONS', headers: { Origin: 'https://someone.github.io' } }),
        { ALLOWED_ORIGIN: 'https://someone.github.io' },
      )
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://someone.github.io')
      expect(res.headers.get('Vary')).toMatch(/origin/i)
    })
  })

  /**
   * ALLOWED_ORIGIN used to exist only as a response header, which is a rule the
   * browser applies to itself before letting a page READ a reply — it stops
   * nothing being sent. These test the request being refused, and above all
   * that the key was never spent, because that is the part that costs money.
   */
  describe('the origin lock, on the way in', () => {
    const keyed = { ALLOWED_ORIGIN: 'https://mine.github.io', OLLAMA_API_KEY: 'secret' }
    const from = (origin) =>
      new Request(ENDPOINT, {
        method: 'POST',
        headers: origin ? { Origin: origin } : {},
        body: '{}',
      })

    it('refuses another origin, without reaching upstream', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const res = await worker.fetch(from('https://evil.example'), keyed)
      expect(res.status).toBe(403)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('refuses a request with no Origin, which is what curl sends', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const res = await worker.fetch(from(null), keyed)
      expect(res.status).toBe(403)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('refuses the preflight too, so nothing is encouraged', async () => {
      const res = await worker.fetch(
        new Request(ENDPOINT, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }),
        keyed,
      )
      expect(res.status).toBe(403)
    })

    it('lets the configured origin through, key attached', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const res = await worker.fetch(from('https://mine.github.io'), keyed)
      expect(res.status).toBe(200)
      expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer secret')
    })

    it('accepts a comma-separated list and echoes whichever one asked', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const env = {
        ALLOWED_ORIGIN: 'https://mine.github.io, http://localhost:5173',
        OLLAMA_API_KEY: 'secret',
      }
      const res = await worker.fetch(from('http://localhost:5173'), env)
      expect(res.status).toBe(200)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
    })

    it('is open to everyone when ALLOWED_ORIGIN is unset, as before', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const res = await worker.fetch(from(null), { OLLAMA_API_KEY: 'secret' })
      expect(res.status).toBe(200)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  it('forwards the path, the query and the key to ollama.com', async () => {
    const fetchSpy = upstreamOk()
    vi.stubGlobal('fetch', fetchSpy)
    await worker.fetch(new Request(`${ENDPOINT}?beta=1`, { method: 'POST', headers: { Authorization: 'Bearer player-key' }, body: '{}' }), {})
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://ollama.com/v1/chat/completions?beta=1')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer player-key')
  })

  it('sends the body through untouched', async () => {
    const fetchSpy = upstreamOk()
    vi.stubGlobal('fetch', fetchSpy)
    const body = JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hej' }] })
    await worker.fetch(post({ body }), {})
    expect(await new Response(fetchSpy.mock.calls[0][1].body).text()).toBe(body)
  })

  it('carries nothing but the key and the content type', async () => {
    const fetchSpy = upstreamOk()
    vi.stubGlobal('fetch', fetchSpy)
    await worker.fetch(post({ headers: { Cookie: 'session=secret', 'X-Forwarded-For': '10.0.0.1' } }), {})
    expect(Object.keys(fetchSpy.mock.calls[0][1].headers).sort()).toEqual(['Authorization', 'Content-Type'])
  })

  it('passes the upstream status and body back with CORS added', async () => {
    vi.stubGlobal('fetch', upstreamOk('{"error":{"message":"nope"}}', { status: 429 }))
    const res = await worker.fetch(post(), {})
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
    const res = await worker.fetch(post(), {})
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  /**
   * The app stops naming a model, so that changing which one answers is a
   * proxy deploy rather than an app release every phone has to notice — and so
   * that three models can be compared without the person playing being able to
   * tell which is which.
   */
  describe('model aliases', () => {
    const ALIASES = {
      MODEL_ALIASES: JSON.stringify({
        cluey: { model: 'gpt-oss:120b' },
        'cluey-b': {
          model: 'gemini-3.6-flash',
          upstream: 'https://generativelanguage.googleapis.com',
          path: '/v1beta/openai',
          key: 'GEMINI_API_KEY',
        },
      }),
      OLLAMA_API_KEY: 'ollama-secret',
      GEMINI_API_KEY: 'gemini-secret',
    }
    const sent = (spy) => JSON.parse(spy.mock.calls[0][1].body)

    it('swaps the alias for the real model name', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      await worker.fetch(post({ body: JSON.stringify({ model: 'cluey', messages: [] }) }), ALIASES)
      expect(sent(fetchSpy).model).toBe('gpt-oss:120b')
    })

    it('keeps the rest of the body exactly as it arrived', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const messages = [{ role: 'user', content: 'hej' }]
      await worker.fetch(
        post({ body: JSON.stringify({ model: 'cluey', messages, temperature: 0.6 }) }),
        ALIASES,
      )
      expect(sent(fetchSpy)).toEqual({ model: 'gpt-oss:120b', messages, temperature: 0.6 })
    })

    it('moves host and path together, because services disagree about the prefix', async () => {
      // Ollama serves /v1, Gemini /v1beta/openai. Moving one without the other
      // is a 404 that reads like a broken endpoint.
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      await worker.fetch(post({ body: JSON.stringify({ model: 'cluey-b' }) }), ALIASES)
      expect(fetchSpy.mock.calls[0][0]).toBe(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      )
    })

    it('sends the key that alias names, not the default one', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      await worker.fetch(
        new Request(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'cluey-b' }),
        }),
        ALIASES,
      )
      expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer gemini-secret')
    })

    it('forwards a real model id untouched, so nothing stops working', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      await worker.fetch(post({ body: JSON.stringify({ model: 'qwen3.5:397b' }) }), ALIASES)
      expect(sent(fetchSpy).model).toBe('qwen3.5:397b')
      expect(fetchSpy.mock.calls[0][0]).toBe('https://ollama.com/v1/chat/completions')
    })

    it('survives a MODEL_ALIASES that will not parse', async () => {
      // A typo in a Worker var must not take the proxy down: with no aliases,
      // every real model id still resolves, exactly as before this existed.
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const res = await worker.fetch(post({ body: JSON.stringify({ model: 'cluey' }) }), {
        MODEL_ALIASES: '{not json',
        OLLAMA_API_KEY: 'k',
      })
      expect(res.status).toBe(200)
      // With no usable aliases the body is never read, so it is still the
      // stream it arrived as — which is the passthrough this must not lose.
      const forwarded = await new Response(fetchSpy.mock.calls[0][1].body).text()
      expect(JSON.parse(forwarded).model).toBe('cluey')
    })

    it('lists the aliases first, so Settings can offer one', async () => {
      // Settings offers whatever /models lists; an alias missing from it is a
      // name you can type but never see.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{"data":[{"id":"gpt-oss:120b"}]}', { status: 200 })),
      )
      const res = await worker.fetch(
        new Request('https://p.workers.dev/v1/models', { headers: { Authorization: 'Bearer k' } }),
        ALIASES,
      )
      const listed = await res.json()
      expect(listed.data.map((m) => m.id)).toEqual(['cluey', 'cluey-b', 'gpt-oss:120b'])
    })

    it('leaves the model list alone when no aliases are configured', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{"data":[{"id":"gpt-oss:120b"}]}', { status: 200 })),
      )
      const res = await worker.fetch(
        new Request('https://p.workers.dev/v1/models', { headers: { Authorization: 'Bearer k' } }),
        {},
      )
      expect(await res.text()).toBe('{"data":[{"id":"gpt-oss:120b"}]}')
    })

    it('a key from the app still wins over the alias key', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      await worker.fetch(post({ body: JSON.stringify({ model: 'cluey-b' }) }), ALIASES)
      expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer player-key')
    })

    it('says which secret is missing when the alias names one that is not set', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const res = await worker.fetch(
        new Request(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'cluey-b' }),
        }),
        { MODEL_ALIASES: ALIASES.MODEL_ALIASES, OLLAMA_API_KEY: 'ollama-secret' },
      )
      expect(res.status).toBe(401)
      expect(await res.text()).toMatch(/GEMINI_API_KEY/)
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  it('answers an unreachable upstream itself, with CORS intact', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const res = await worker.fetch(post(), {})
    expect(res.status).toBe(502)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await res.text()).toMatch(/upstream/i)
  })

  /**
   * The daily cap's branches. e2e/proxy-drive.mjs runs these on workerd against
   * miniflare's real KV, which is the stronger test and the one that proves the
   * feature; what is easier here is the shapes KV can be in and cannot easily
   * be put into — a binding that throws, a variable with a typo in it, and the
   * exact upstream call count when a request is refused.
   */
  describe('the daily cap', () => {
    /** A KV stand-in with the two methods the worker uses, and a visible store. */
    const fakeKv = (seed = {}) => {
      const store = new Map(Object.entries(seed))
      return {
        store,
        get: async (k) => store.get(k) ?? null,
        put: async (k, v) => void store.set(k, v),
      }
    }
    const KEYED = { OLLAMA_API_KEY: 'worker-secret' }
    const noKeyPost = () =>
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Install-Id': 'phone-1' },
        body: '{}',
      })
    const today = new Date().toISOString().slice(0, 10)

    it('counts a served request, per install and in total', async () => {
      const QUOTA = fakeKv()
      vi.stubGlobal('fetch', upstreamOk())
      await worker.fetch(noKeyPost(), { ...KEYED, QUOTA })
      expect(QUOTA.store.get(`q:${today}:i:phone-1`)).toBe('1')
      expect(QUOTA.store.get(`q:${today}:@all`)).toBe('1')
    })

    it('refuses at the cap without spending anything upstream', async () => {
      const QUOTA = fakeKv({ [`q:${today}:i:phone-1`]: '2' })
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const res = await worker.fetch(noKeyPost(), { ...KEYED, QUOTA, DAILY_CAP: '2' })
      expect(res.status).toBe(429)
      expect(fetchSpy).not.toHaveBeenCalled()
      // A refused request must not push the number further past the cap, or a
      // client that keeps retrying keeps renewing the counter's TTL.
      expect(QUOTA.store.get(`q:${today}:i:phone-1`)).toBe('2')
      expect((await res.json()).error.code).toBe('cluecabulary_daily_cap')
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('does not meter a request that brought its own key', async () => {
      // The player is paying, so this is not the worker's budget to ration —
      // and it is the bring-your-own-key path the README documents.
      const QUOTA = fakeKv({ [`q:${today}:i:phone-1`]: '99' })
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const res = await worker.fetch(
        new Request(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Install-Id': 'phone-1',
            Authorization: 'Bearer player-key',
          },
          body: '{}',
        }),
        { ...KEYED, QUOTA, DAILY_CAP: '2' },
      )
      expect(res.status).toBe(200)
      expect(fetchSpy).toHaveBeenCalled()
      expect(QUOTA.store.get(`q:${today}:i:phone-1`)).toBe('99')
    })

    it('serves the request when KV throws, rather than refusing everyone', async () => {
      // The one behaviour in this feature that must never regress. A namespace
      // that was deleted, a binding misconfigured, KV having a bad day — none
      // of it may take the app down. An unmetered proxy costs money the owner
      // can see and stop; a proxy that 429s the only player is a dead app.
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const res = await worker.fetch(noKeyPost(), {
        ...KEYED,
        DAILY_CAP: '1',
        QUOTA: {
          get: async () => {
            throw new Error('KV is down')
          },
          put: async () => {},
        },
      })
      expect(res.status).toBe(200)
      expect(fetchSpy).toHaveBeenCalled()
    })

    it('serves the request when there is no binding at all', async () => {
      const fetchSpy = upstreamOk()
      vi.stubGlobal('fetch', fetchSpy)
      const res = await worker.fetch(noKeyPost(), { ...KEYED, DAILY_CAP: '1' })
      expect(res.status).toBe(200)
      expect(fetchSpy).toHaveBeenCalled()
    })

    it('falls back to the default cap when the variable is nonsense', async () => {
      // A typo in the dashboard must not silently remove the cap. "lots" is
      // not a number, so the built-in 1000 applies — 999 goes through.
      const QUOTA = fakeKv({ [`q:${today}:i:phone-1`]: '999' })
      vi.stubGlobal('fetch', upstreamOk())
      expect((await worker.fetch(noKeyPost(), { ...KEYED, QUOTA, DAILY_CAP: 'lots' })).status).toBe(200)
      // …and the thousandth does not.
      expect((await worker.fetch(noKeyPost(), { ...KEYED, QUOTA, DAILY_CAP: 'lots' })).status).toBe(429)
    })

    it('lets a deliberate 0 turn a cap off', async () => {
      const QUOTA = fakeKv({ [`q:${today}:i:phone-1`]: '5000' })
      vi.stubGlobal('fetch', upstreamOk())
      const res = await worker.fetch(noKeyPost(), { ...KEYED, QUOTA, DAILY_CAP: '0', GLOBAL_DAILY_CAP: '0' })
      expect(res.status).toBe(200)
    })

    it('buckets a request with no install id, and sanitises a hostile one', async () => {
      const QUOTA = fakeKv()
      vi.stubGlobal('fetch', upstreamOk())
      await worker.fetch(
        new Request(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
        { ...KEYED, QUOTA },
      )
      expect(QUOTA.store.get(`q:${today}:i:no-install-id`)).toBe('1')

      // A client picks its own id, so it must not be able to pick a KV key —
      // not the global counter's, and not an unbounded one.
      await worker.fetch(
        new Request(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Install-Id': `@all${'x'.repeat(400)}` },
          body: '{}',
        }),
        { ...KEYED, QUOTA },
      )
      const keys = [...QUOTA.store.keys()]
      expect(keys.filter((k) => k.startsWith(`q:${today}:i:`))).toHaveLength(2)
      expect(keys.every((k) => k.length < 100)).toBe(true)
      // The global counter saw both, and neither request wrote to it directly.
      expect(QUOTA.store.get(`q:${today}:@all`)).toBe('2')
    })

    it('never meters the preflight, which every real request makes first', async () => {
      const QUOTA = fakeKv()
      const res = await worker.fetch(new Request(ENDPOINT, { method: 'OPTIONS' }), { ...KEYED, QUOTA })
      expect(res.status).toBe(204)
      expect(QUOTA.store.size).toBe(0)
    })
  })
})
