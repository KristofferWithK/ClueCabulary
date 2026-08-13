import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * A build that DOES ship a key. This one does not — bundled-key.ts is empty —
 * so the module is mocked, which vi.mock can only do for a whole file. The
 * behaviour is worth pinning anyway: paste a key between those quotes and this
 * is exactly what has to happen, without anyone re-deriving it.
 */
const BUNDLED = 'bundled-into-the-build'

vi.mock('./bundled-key', () => ({
  BUNDLED_API_KEY: BUNDLED,
  hasBundledKey: true,
  effectiveKey: (typed: string) => (typed.trim() ? typed.trim() : BUNDLED),
}))

const { DEFAULT_BASE_URL, chatJson } = await import('./client')

const okFetch = () =>
  vi.fn(async (_url: unknown, _init: RequestInit) =>
    new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] })),
  )
const headersOf = (spy: ReturnType<typeof okFetch>) =>
  (spy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>

describe('chatJson when the build carries a key', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses it when the Settings field is empty', async () => {
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(
      chatJson({ baseUrl: DEFAULT_BASE_URL, apiKey: '   ', model: 'm' }, []),
    ).resolves.toEqual({ ok: true })
    expect(headersOf(fetchSpy).Authorization).toBe(`Bearer ${BUNDLED}`)
  })

  it('and a typed key still wins, so another provider needs no code change', async () => {
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    await chatJson({ baseUrl: DEFAULT_BASE_URL, apiKey: 'typed-by-hand', model: 'm' }, [])
    expect(headersOf(fetchSpy).Authorization).toBe('Bearer typed-by-hand')
  })

  it('never sends two Authorization headers', async () => {
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    await chatJson({ baseUrl: DEFAULT_BASE_URL, apiKey: 'typed-by-hand', model: 'm' }, [])
    const auth = Object.keys(headersOf(fetchSpy)).filter((k) => k.toLowerCase() === 'authorization')
    expect(auth).toHaveLength(1)
  })
})
