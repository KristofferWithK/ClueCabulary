import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiError, DEFAULT_BASE_URL, chatJson, resolveEndpoint } from './client'

/**
 * The Base URL is free text the player types, and every request built from it
 * carries their API key in an Authorization header. These tests exist to keep
 * that key off any host they did not mean to name.
 */
describe('resolveEndpoint', () => {
  it('accepts the default and any https host', () => {
    expect(resolveEndpoint(DEFAULT_BASE_URL).href).toBe('https://ollama.com/v1/chat/completions')
    expect(resolveEndpoint('https://proxy.example.com/v1').href).toBe(
      'https://proxy.example.com/v1/chat/completions',
    )
  })

  it('tolerates trailing slashes and surrounding space', () => {
    for (const messy of ['https://ollama.com/v1/', 'https://ollama.com/v1///', '  https://ollama.com/v1  ']) {
      expect(resolveEndpoint(messy).href).toBe('https://ollama.com/v1/chat/completions')
    }
  })

  it('refuses a host with no scheme, which would post the key to our own origin', () => {
    // fetch() would treat this as a relative path and send the Authorization
    // header to whatever is serving the app.
    expect(() => resolveEndpoint('proxy.example.com/v1')).toThrow(AiError)
    expect(() => resolveEndpoint('/v1')).toThrow(AiError)
    expect(() => resolveEndpoint('v1')).toThrow(AiError)
    expect(() => resolveEndpoint('')).toThrow(AiError)
  })

  it('refuses a protocol-relative URL', () => {
    expect(() => resolveEndpoint('//evil.example.com/v1')).toThrow(AiError)
  })

  it('refuses plain http to a remote host', () => {
    expect(() => resolveEndpoint('http://proxy.example.com/v1')).toThrow(AiError)
  })

  it('allows plain http only for a local Ollama', () => {
    expect(resolveEndpoint('http://localhost:11434/v1').href).toBe(
      'http://localhost:11434/v1/chat/completions',
    )
    expect(resolveEndpoint('http://127.0.0.1:11434/v1').href).toBe(
      'http://127.0.0.1:11434/v1/chat/completions',
    )
  })

  it('refuses schemes that are not http at all', () => {
    for (const bad of ['ftp://h/v1', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/plain,x']) {
      expect(() => resolveEndpoint(bad)).toThrow(AiError)
    }
  })

  it('explains itself, because the player has to fix it', () => {
    try {
      resolveEndpoint('proxy.example.com/v1')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AiError)
      expect((e as AiError).message).toMatch(/https:\/\//)
      expect((e as AiError).message).toMatch(/Settings/)
    }
  })
})

/**
 * This build bundles no key (src/ai/bundled-key.ts is empty), so an empty
 * Settings field still means "no key". The other branch — a build that does
 * carry one — is in bundled-key.test.ts, which mocks the module, because
 * vi.mock is file-scoped and both branches deserve a real test.
 */
describe('chatJson with no API key', () => {
  afterEach(() => vi.unstubAllGlobals())

  const say = async (settings: { baseUrl: string; apiKey: string; model: string }) => {
    try {
      await chatJson(settings, [{ role: 'user', content: 'hej' }])
      return null
    } catch (e) {
      return e as AiError
    }
  }

  it('says so at once for ollama.com, without sending anything', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const err = await say({ baseUrl: DEFAULT_BASE_URL, apiKey: '   ', model: 'm' })
    expect(err).toBeInstanceOf(AiError)
    expect(err!.kind).toBe('auth')
    expect(err!.message).toMatch(/API key/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('and names the setup that does not need one', async () => {
    const err = await say({ baseUrl: DEFAULT_BASE_URL, apiKey: '', model: 'm' })
    expect(err!.message).toMatch(/proxy/i)
  })

  it('but a proxy may hold the key itself, so no key is not an error there', async () => {
    // The recommended setup keeps the key as a Worker secret, so the app has
    // none. Demanding one here would break exactly the setup the guide gives.
    const fetchSpy = vi.fn(async (_url: unknown, _init: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] })),
    )
    vi.stubGlobal('fetch', fetchSpy)
    await expect(
      chatJson({ baseUrl: 'https://proxy.example.workers.dev/v1', apiKey: '', model: 'm' }, []),
    ).resolves.toEqual({ ok: true })
    const init = fetchSpy.mock.calls[0]![1] as RequestInit
    expect(Object.keys(init.headers as Record<string, string>)).not.toContain('Authorization')
  })

  it('but a local Ollama needs no key, so it is not asked for one', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] })),
    )
    vi.stubGlobal('fetch', fetchSpy)
    await expect(
      chatJson({ baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'm' }, []),
    ).resolves.toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledOnce()
  })
})
