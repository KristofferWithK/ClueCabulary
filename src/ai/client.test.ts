import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiError, chatJson, type AiSettings } from './client'

const settings: AiSettings = { baseUrl: 'https://ai.example/v1', apiKey: 'key', model: 'm' }
const messages = [{ role: 'user' as const, content: 'hi' }]

const jsonResponse = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })

afterEach(() => vi.unstubAllGlobals())

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
  it('maps fetch rejection (no HTTP status) to cors with proxy advice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    try {
      await chatJson(settings, messages)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(AiError)
      expect((e as AiError).kind).toBe('cors')
      expect((e as AiError).message).toContain('proxy')
    }
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

  it('flags non-JSON replies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('sorry, I cannot')))
    expect(await kindOf(chatJson(settings, messages))).toBe('invalid-response')
  })

  it('sends auth header, model and json response_format', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await chatJson(settings, messages)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://ai.example/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer key')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('m')
    expect(body.response_format).toEqual({ type: 'json_object' })
  })
})
