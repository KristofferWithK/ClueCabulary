import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const WORKER_PATH = join(HERE, '..', 'proxy', 'worker.js')

/**
 * Run proxy/worker.js on the Cloudflare runtime it is written for.
 *
 * The proxy is the documented fix for the most likely failure this app has —
 * ollama.com refusing browser requests — and until this existed it had never
 * been executed at all. Miniflare runs the real workerd binary, so the file
 * under test is the same text the deploy guide tells you to paste into the
 * Cloudflare dashboard, unmodified and un-shimmed. That matters: workerd
 * accepts `body: request.body` on an outbound fetch, and Node's fetch does
 * not, so a hand-rolled Node stand-in would have had to alter the code it was
 * meant to be testing.
 *
 * `upstream` replaces ollama.com. The worker's own fetch to ollama.com is
 * intercepted by miniflare's outboundService — the worker still asks for
 * https://ollama.com/..., and we record what it asked for before forwarding.
 *
 * `apiKey` and `allowedOrigin` are delivered as Cloudflare bindings, so the
 * recommended setup — the key living on the worker rather than on the phone —
 * is exercised the way it is actually deployed.
 *
 * `kv: true` adds the QUOTA namespace the daily cap counts in. Miniflare
 * implements KV on workerd with the real binding API, so the cap is exercised
 * against the same `get`/`put` the deployed worker calls — including
 * `expirationTtl`, which it accepts. Leaving it false is the fail-open case:
 * the worker sees no binding at all, exactly as it would if the namespace were
 * never created, and must serve every request anyway.
 *
 * `vars` are any other Worker variables (DAILY_CAP, GLOBAL_DAILY_CAP). They
 * arrive as strings, which is what Cloudflare delivers for a [vars] entry.
 */
export async function startWorker(port, { upstream, allowedOrigin, apiKey, kv, vars } = {}) {
  let Miniflare
  try {
    ;({ Miniflare } = await import('miniflare'))
  } catch {
    return null
  }

  const scriptPath = WORKER_PATH

  /** @type {Array<{url: string, method: string, auth: string}>} */
  const upstreamCalls = []

  const mf = new Miniflare({
    port,
    workers: [
      {
        name: 'cluecabulary-proxy',
        modules: true,
        scriptPath,
        modulesRoot: dirname(scriptPath),
        compatibilityDate: '2026-01-01',
        // Secrets and vars reach the worker as `env`, exactly as Cloudflare
        // delivers them — which is how the key-in-the-worker setup is tested.
        bindings: {
          ...(apiKey ? { OLLAMA_API_KEY: apiKey } : {}),
          ...(allowedOrigin ? { ALLOWED_ORIGIN: allowedOrigin } : {}),
          ...Object.fromEntries(Object.entries(vars ?? {}).map(([k, v]) => [k, String(v)])),
        },
        // The counters the daily cap keeps. Omitted entirely when kv is falsy,
        // which is how the fail-open path gets tested for real.
        ...(kv ? { kvNamespaces: { QUOTA: 'cluecabulary-proxy-QUOTA' } } : {}),
        outboundService: async (request) => {
          upstreamCalls.push({
            url: request.url,
            method: request.method,
            auth: request.headers.get('authorization') ?? '',
          })
          const target = new URL(request.url)
          const to = new URL(upstream)
          to.pathname = target.pathname
          to.search = target.search
          // The worker streamed its body; buffer it here only because this
          // hop runs on Node, which refuses a stream without duplex: 'half'.
          const headers = new Headers(request.headers)
          for (const drop of ['host', 'connection', 'content-length']) headers.delete(drop)
          try {
            return await fetch(to, {
              method: request.method,
              headers,
              body:
                request.method === 'GET' || request.method === 'HEAD'
                  ? undefined
                  : await request.arrayBuffer(),
            })
          } catch (e) {
            // Without this the harness's own failure comes back as a plain 500
            // and reads exactly like an upstream error, which is a trap.
            console.log('WORKER HARNESS: forwarding to the fake failed —', to.toString(), e.message, e.cause?.message ?? '', e.cause?.code ?? '')
            throw e
          }
        },
      },
    ],
  })

  await mf.ready
  return {
    base: `http://127.0.0.1:${port}`,
    /** What the worker asked ollama.com for, before we redirected it. */
    upstreamCalls,
    stop: () => mf.dispose(),
  }
}
