import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiError, chatJson, type AiSettings } from './client'

const settings: AiSettings = { baseUrl: 'https://ai.example/v1', apiKey: 'key', model: 'm' }
const messages = [{ role: 'user' as const, content: 'hi' }]

const jsonResponse = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })

afterEach(() => vi.unstubAllGlobals())

async function catchError(promise: Promise<unknown>): Promise<AiError> {
  try {
    await promise
  } catch (e) {
    if (e instanceof AiError) return e
    throw e
  }
  throw new Error('expected an AiError')
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'ok'
  } catch (e) {
    if (e instanceof AiError) return e.kind
    throw e
  }
}

describe('chatJson error taxonomy', () => {
  it('blames CORS only for the host where CORS is the known problem', async () => {
    // ollama.com answers the CORS preflight with a redirect, which browsers
    // will not follow — measured on a real phone — so for that host the advice
    // is "you need the proxy".
    //
    // Everywhere else it is NOT the diagnosis. That message used to blame CORS
    // for every fetch rejection, and a player on one bar of signal, whose
    // request simply died, was told to check a Base URL that was working. A
    // dropped connection is the common case; a policy problem is not.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const ollama = await catchError(chatJson({ ...settings, baseUrl: 'https://ollama.com/v1' }, messages))
    expect(ollama.kind).toBe('cors')
    expect(ollama.message).toMatch(/preflight/i)
    expect(ollama.message).toMatch(/proxy/i)

    // A rejected fetch is a TypeError either way — the browser will not say
    // which — so both causes are named, with the likelier one first.
    const other = await catchError(chatJson(settings, messages))
    expect(other.message).toMatch(/connection dropped/i)
    expect(other.message.indexOf('connection dropped')).toBeLessThan(other.message.indexOf('CORS'))
  })

  it('says a stalled request timed out rather than leaving it hanging', async () => {
    // No timeout at all meant a request on a weak connection hung until the
    // network gave up on its own, with "Cluey is thinking…" on screen and
    // nothing to retry.
    const timeout = new DOMException('The operation was aborted', 'TimeoutError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))
    const e = await catchError(chatJson(settings, messages))
    expect(e.kind).toBe('network')
    expect(e.message).toMatch(/took longer/i)
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not-found'],
    [429, 'rate-limit'],
  ])('maps HTTP %d to %s', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
    expect(await kindOf(chatJson(settings, messages))).toBe(kind)
  })

  it('retries once on 5xx and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse('{"a":1}'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await chatJson(settings, messages)).toEqual({ a: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after the 5xx retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    expect(await kindOf(chatJson(settings, messages))).toBe('server')
  })

  it('parses fenced JSON content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('```json\n{"b":2}\n```')))
    expect(await chatJson(settings, messages)).toEqual({ b: 2 })
  })

  it('salvages JSON wrapped in prose', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse('Sure! Here is my clue:\n```json\n{"c":3}\n```\nGood luck!'),
        ),
    )
    expect(await chatJson(settings, messages)).toEqual({ c: 3 })
  })

  it('flags non-JSON replies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('sorry, I cannot')))
    expect(await kindOf(chatJson(settings, messages))).toBe('invalid-response')
  })

  it('sends auth header, model and json response_format', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await chatJson(settings, messages)
    const [url, init] = fetchMock.mock.calls[0]!
    // A URL object now, not a string: the base is parsed and checked before
    // any header carrying the API key is built. fetch takes either.
    expect(String(url)).toBe('https://ai.example/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer key')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('m')
    expect(body.response_format).toEqual({ type: 'json_object' })
  })
})
