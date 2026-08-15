/**
 * ClueCabulary's AI proxy — a Cloudflare Worker between the app and ollama.com.
 *
 * This is not optional and never was. A browser cannot call ollama.com: the
 * cloud API answers a CORS preflight with a redirect, and the fetch spec
 * forbids redirects on preflight, so Chrome and Safari refuse before the real
 * request is ever sent —
 *
 *   Access to fetch at 'https://ollama.com/...' has been blocked by CORS
 *   policy: Response to preflight request doesn't pass access control check:
 *   Redirect is not allowed for a preflight request.
 *
 * No API key, model name or app setting changes that. This worker answers the
 * preflight itself — never forwarding it, so there is no redirect to trip over
 * — and adds the headers the browser needs to the real response.
 *
 * Set OLLAMA_API_KEY as a Worker SECRET and the key never touches the app, the
 * repository, or the phone: the worker adds it per request and nothing that
 * reaches the browser contains it. A key sent by the app is used instead when
 * present, so both setups work.
 *
 * Whenever the key lives here, set ALLOWED_ORIGIN too. It is enforced on the
 * way in — see originAllowed — and without it this worker will attach your key
 * to a request from anyone who learns its URL.
 *
 * See proxy/README.md. Deploy: `npx wrangler deploy` from this directory, then
 * `npx wrangler secret put OLLAMA_API_KEY`.
 */

/**
 * Where requests are forwarded. Set UPSTREAM as a Worker variable to front a
 * different OpenAI-compatible service without editing this file — e.g.
 * https://generativelanguage.googleapis.com for Gemini, whose compatibility
 * layer wants the same Bearer token this worker already sends. The app's Base
 * URL keeps the path (/v1, or /v1beta/openai), so only the host moves.
 */
const DEFAULT_UPSTREAM = 'https://ollama.com'

/**
 * The origins allowed to spend this worker's key. Set ALLOWED_ORIGIN as a
 * Worker var — one origin, or several separated by commas — e.g.
 * https://kristofferwithk.github.io. Unset means anyone, which is only safe
 * while the worker holds no key of its own.
 */
const allowList = (env) =>
  (env?.ALLOWED_ORIGIN || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)

/**
 * Model aliases: names the app can send that mean "whatever Cluey thinks with
 * today". Set MODEL_ALIASES as a Worker var — see proxy/wrangler.toml.
 *
 *   {"cluey": {"model": "gpt-oss:120b"}}
 *
 * The point is that the app stops naming a model. Without this, changing which
 * model answers is a code change, a release, and a wait while every installed
 * PWA notices — and a model id retired upstream (ollama.com has retired
 * several) breaks every install at once with no way to fix it from here. It is
 * also what makes a blind comparison possible: three aliases can point at three
 * models without the app, or the person playing, being able to tell which.
 *
 * Per alias: `model` is required. `upstream` and `path` move it to another
 * service (Ollama serves /v1, Gemini /v1beta/openai), and `key` names the
 * secret to send instead of OLLAMA_API_KEY.
 *
 * A name that is not an alias is forwarded untouched, so a real model id
 * always still works.
 */
function aliasTable(env) {
  if (!env?.MODEL_ALIASES) return {}
  try {
    const parsed = JSON.parse(env.MODEL_ALIASES)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // A typo here must not take the proxy down with it: without aliases every
    // real model id still resolves, which is the behaviour before this existed.
    return {}
  }
}

/**
 * Is this request allowed to use the worker's key?
 *
 * This has to be a real check on the way IN, and for a long time it was not:
 * ALLOWED_ORIGIN was only ever written into the Access-Control-Allow-Origin
 * response header, and that header is a rule the BROWSER applies to itself
 * when deciding whether a page may READ a reply. It stops nothing from being
 * sent. curl has no origin to lie about, a server-side script never asks
 * permission, and a third-party page can fire a no-cors POST it is not allowed
 * to read but which reaches the upstream all the same — with `Bearer
 * $OLLAMA_API_KEY` attached and billed to whoever deployed this. The
 * Content-Type rewrite below made that worse, laundering the text/plain body a
 * no-cors POST is limited to into the JSON the API accepts.
 *
 * A missing Origin is refused too, once a list is configured: the app is a
 * page on another host, so its requests always carry one, and the callers that
 * do not are exactly the ones this is for.
 */
function originAllowed(request, env) {
  const allowed = allowList(env)
  if (allowed.length === 0) return true
  const origin = (request.headers.get('Origin') ?? '').trim().replace(/\/+$/, '')
  return origin !== '' && allowed.includes(origin)
}

function corsHeaders(request, env) {
  const allowed = allowList(env)
  const origin = (request?.headers.get('Origin') ?? '').trim().replace(/\/+$/, '')
  return {
    // A single value, never the list: this header takes one origin, and a
    // comma-joined string matches nothing. Echo whichever entry asked, so a
    // list of several works; fall back to the first so a refusal is still
    // legible in devtools rather than silently header-less.
    'Access-Control-Allow-Origin':
      allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env)
    // Before anything else, and above all before the key is attached below.
    if (!originAllowed(request, env)) {
      return new Response('This proxy does not serve that origin.', { status: 403, headers: cors })
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    // GET is allowed for /v1/models, which is how the app offers a list of
    // model names rather than making you guess one.
    if (request.method !== 'POST' && request.method !== 'GET') {
      return new Response('Only GET and POST are supported', { status: 405, headers: cors })
    }

    const url = new URL(request.url)
    const table = aliasTable(env)
    const named = Object.keys(table)

    // Resolving an alias means reading the body to see which model was asked
    // for, and a read body can no longer be streamed. So this happens only when
    // aliases are configured AND the name matches one: every other request
    // still forwards request.body untouched, which is what the app's large
    // prompts want and what the passthrough test pins.
    let alias = null
    let body = request.method === 'POST' ? request.body : undefined
    if (request.method === 'POST' && named.length) {
      const text = await request.text()
      try {
        const parsed = JSON.parse(text)
        const found = parsed?.model ? table[parsed.model] : null
        if (found?.model) {
          alias = found
          body = JSON.stringify({ ...parsed, model: found.model })
        } else {
          body = text
        }
      } catch {
        // Not JSON, or no model in it. Forward exactly what arrived.
        body = text
      }
    }

    // The app's key wins when it sends one; otherwise the worker's own secret —
    // the alias picks WHICH secret, so an alias pointing at another service
    // brings its own credentials.
    // A bare "Bearer " counts as no key: older builds of the app sent that
    // when the field was blank, and it must not shadow the secret here.
    const secretName = alias?.key || 'OLLAMA_API_KEY'
    const fromApp = (request.headers.get('Authorization') ?? '').trim()
    const usable = fromApp && fromApp.toLowerCase() !== 'bearer' ? fromApp : ''
    const auth = usable || (env?.[secretName] ? `Bearer ${env[secretName]}` : '')
    if (!auth) {
      return new Response(
        `No API key: send one from the app, or set ${secretName} as a secret on this worker.`,
        { status: 401, headers: cors },
      )
    }

    const base = (alias?.upstream || env?.UPSTREAM || DEFAULT_UPSTREAM).replace(/\/+$/, '')
    // The app's Base URL supplies /v1; an alias on a service that serves a
    // different prefix swaps it, so host and path always move together.
    const path = alias?.path ? url.pathname.replace(/^\/v1/, alias.path.replace(/\/+$/, '')) : url.pathname
    let upstream
    try {
      upstream = await fetch(`${base}${path}${url.search}`, {
        method: request.method,
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body,
      })
    } catch {
      // An uncaught throw here becomes Cloudflare's error page, which carries
      // no CORS headers — so the browser reports a CORS failure and the app
      // tells you to deploy the proxy you are already using. Answer ourselves.
      return new Response('Could not reach the upstream AI server.', { status: 502, headers: cors })
    }

    const headers = new Headers(upstream.headers)
    for (const [k, v] of Object.entries(cors)) headers.set(k, v)

    // Settings offers whatever /models lists, so an alias that is not in that
    // list is a name you can type but never see. Put them at the front, where
    // the one to pick is the first thing offered.
    if (request.method === 'GET' && named.length && url.pathname.endsWith('/models') && upstream.ok) {
      // Read once, then decide: upstream.body cannot be replayed after a failed
      // .json(), so parsing first and falling through would send an empty list.
      const text = await upstream.text()
      let listed = null
      try {
        listed = JSON.parse(text)
      } catch {
        // An unreadable list is still a list: send exactly what arrived.
      }
      const body = listed
        ? JSON.stringify({
            ...listed,
            data: [...named.map((id) => ({ id, object: 'model' })), ...(listed.data ?? [])],
          })
        : text
      return new Response(body, { status: upstream.status, headers })
    }
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
