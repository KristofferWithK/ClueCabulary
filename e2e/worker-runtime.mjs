import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const WORKER_PATH = join(HERE, '..', 'proxy', 'worker.js')

/** The exact line proxy/README.md tells you to edit for the origin lock. */
const ORIGIN_LINE = "const ALLOWED_ORIGIN = '*'"

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
 * `allowedOrigin`, when set, applies the README's optional hardening step to a
 * copy of the file, so the advice can be checked rather than assumed.
 */
export async function startWorker(port, { upstream, allowedOrigin } = {}) {
  let Miniflare
  try {
    ;({ Miniflare } = await import('miniflare'))
  } catch {
    return null
  }

  let scriptPath = WORKER_PATH
  if (allowedOrigin) {
    const src = await readFile(WORKER_PATH, 'utf8')
    if (!src.includes(ORIGIN_LINE)) {
      throw new Error(`proxy/worker.js no longer contains "${ORIGIN_LINE}" — the README's hardening step is stale`)
    }
    const dir = await mkdtemp(join(tmpdir(), 'cluecab-worker-'))
    scriptPath = join(dir, 'worker.js')
    await writeFile(
      scriptPath,
      src.replace(ORIGIN_LINE, `const ALLOWED_ORIGIN = ${JSON.stringify(allowedOrigin)}`),
    )
  }

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
