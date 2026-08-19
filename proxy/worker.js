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
 * to a request from anyone who learns its URL. The daily caps below are the
 * second layer, for the case where the lock is not enough.
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

/**
 * ---------------------------------------------------------------------------
 * The daily caps: what stops one runaway client spending the whole budget.
 * ---------------------------------------------------------------------------
 *
 * The origin lock above is the first layer and it is not enough on its own. It
 * is a real check, but Origin is a header, and a header is whatever the caller
 * types — a browser refuses to lie about it, curl has no opinion at all. Anyone
 * who reads the deployed JS bundle learns this worker's address, and one line
 * of curl with `-H "Origin: <the app's origin>"` is then indistinguishable from
 * the app. So there has to be something that bounds the spend even when the
 * caller is pretending perfectly.
 *
 * THE COUNT. Two counters per UTC day, in KV: one for the install that asked,
 * one for everybody together. A request that would take either over its cap is
 * answered 429 and never reaches the upstream, so it costs nothing. Only
 * requests the worker attaches its OWN key to are counted — a player who brings
 * their own key spends their own money and is not metered.
 *
 * THE INSTALL ID IS FORGEABLE, AND THAT IS THE POINT OF THE SECOND COUNTER.
 * The id is a random string the app generates once and keeps in localStorage;
 * it arrives in a header, so a caller can send any id they like, and a new one
 * per request defeats the per-install cap entirely. That cap is honest about
 * what it is for: an accidental retry loop, a stuck client, one person hammering
 * the endpoint out of curiosity — the failure modes that actually happen. It is
 * not a defence against someone who wants to get through.
 *
 * The global counter is the cheap second signal that IS bounded whatever the
 * caller does, because there is nothing in the request that selects it. The
 * worst case for the bill is GLOBAL_DAILY_CAP calls a day, full stop. What it
 * costs is that abuse and real play share one number: a determined attacker
 * cannot spend more than the ceiling, but they can spend it, and while it is
 * spent nobody plays. That is the right way round — an outage is recoverable by
 * raising a variable in the dashboard, an unbounded bill is not — but it is a
 * real cost and not a free win.
 *
 * COUNTING IS APPROXIMATE, deliberately, and it is loosest exactly when it is
 * being attacked. KV is built for many reads and few writes, and a counter is
 * the opposite of that, so three things all point the same way:
 *
 *   - There is no atomic increment. This reads then writes, and two requests in
 *     flight together can both read the same number and both write one more.
 *   - A read can be stale. KV serves reads from a local cache and propagates
 *     writes between locations in the background, so the number this sees is
 *     not necessarily the number that has been written.
 *   - Writing one key over and over is the case KV asks you not to make, and
 *     the global counter is one key written on every metered request. Under a
 *     fast burst those writes are throttled or fail, and a failure here fails
 *     open like every other — served, uncounted.
 *
 * So the ceiling holds to an order of magnitude at ordinary rates and can be
 * overshot by a determined burst. Sharding the global key would soften the
 * third point at the cost of a read per shard on every request; Durable Objects
 * would fix all three exactly, and cost money and a paid plan, which is the
 * thing this whole feature exists to avoid. Nothing here has been measured
 * against production KV — miniflare implements the API, not the propagation —
 * so treat the ceiling as a fuse rather than an invoice, and watch the
 * Cloudflare dashboard on a launch day rather than trusting this to the digit.
 */

/**
 * How many requests one install may make in a UTC day. Override with the
 * DAILY_CAP variable; 0 means no per-install cap.
 *
 * THE ARITHMETIC, from src/engine/config.ts. Turn tokens are a shared pool and
 * each token is exactly one clue-giving, which is exactly one AI call: Cluey's
 * clue is one `getClue`, and the player's clue is one `getGuesses`. So the
 * clue/guess calls in a round are at most the token count —
 *
 *   beginner  4x3   5 tokens
 *   middle    5x3   6 tokens
 *   standard  5x4   7 tokens   (was 8 until the A3 re-tune)
 *   wrap-up   5x4  10 tokens   (the longest board in the game)
 *
 * — and sudden death adds none, because there is no clue-giver in it: the
 * player just taps. Two things multiply that. A reply that fails validation is
 * asked again up to MAX_CORRECTIONS = 3 times (src/ai/companion.ts), so one
 * logical call is at most 4 HTTP requests; and the translate box is one call
 * per word looked up, bounded in practice by the 20 words on the biggest board.
 *
 *   worst imaginable round   10 x 4 + 20  =  60 requests
 *   ordinary round           7 to 12 requests
 *
 * An enthusiastic day is maybe ten rounds — each is five to ten minutes, so
 * that is already an hour or two of play. Ten worst-case rounds is 600. Fifteen
 * is 900. 1000 is the round number above that, which means a player who somehow
 * hits this cap has played fifteen full rounds in a day with every single reply
 * needing three corrections. Nobody does that by playing.
 *
 * Generous on purpose. Locking out the one person who loves this game is a much
 * worse outcome than serving a few hundred calls that were not strictly needed,
 * and the global ceiling below is what actually bounds the bill.
 */
const DEFAULT_DAILY_CAP = 1000

/**
 * How many requests EVERYONE may make in a UTC day, together. Override with
 * GLOBAL_DAILY_CAP; 0 means no ceiling.
 *
 * 25,000 is 25 installs at the full per-install cap, or — at the ordinary ten
 * calls a round, three rounds a sitting — around 800 people playing on the same
 * day. That is far more than this app is going to see in its first week, and it
 * is a hard bound on the worst day possible: whatever anyone does with a
 * forged install id, the upstream is asked at most this many times.
 *
 * Raise it from the Cloudflare dashboard (Settings → Variables) the moment real
 * players are anywhere near it. That is a thirty-second change with no deploy.
 */
const DEFAULT_GLOBAL_DAILY_CAP = 25_000

/**
 * The header the app puts its install id in. It must also be listed in
 * Access-Control-Allow-Headers below, or the browser refuses the request at
 * the preflight and the app cannot talk to this worker at all.
 */
const INSTALL_HEADER = 'X-Install-Id'

/** Two days: long enough that a day's counter outlives the day, short enough
 *  that nothing accumulates. KV expires these itself, so there is no cleanup. */
const COUNTER_TTL_SECONDS = 172_800

/** A marker the app can recognise, to tell this 429 from an upstream one.
 *  They mean opposite things: this one lasts until midnight, an upstream rate
 *  limit usually lasts seconds, and telling a player to come back tomorrow
 *  when they could retry now would cost them the session. */
const DAILY_CAP_CODE = 'cluecabulary_daily_cap'

/** Read a cap from a Worker variable. A typo must not silently remove the cap
 *  NOR lock everyone out, so anything unreadable falls back to the default;
 *  only a deliberate 0 disables. */
function capFrom(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

/**
 * The KV key for whoever is asking.
 *
 * Sanitised rather than trusted: the id only has to be stable and unique per
 * phone, so everything outside [A-Za-z0-9_-] is dropped and the length capped.
 * That keeps a client from choosing an unbounded KV key, or one shaped like the
 * global counter's. A request with no id shares one bucket — an old build or a
 * script, and one shared cap is the right answer for both.
 */
function installBucket(request) {
  const clean = (request.headers.get(INSTALL_HEADER) ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64)
  return clean ? `i:${clean}` : 'i:no-install-id'
}

const utcDay = () => new Date().toISOString().slice(0, 10)

/**
 * Count this request, and say whether it may proceed.
 *
 * FAILS OPEN, on purpose, in every direction: no KV binding, a binding that
 * throws, a namespace that was never created. A proxy that refuses everyone
 * because a namespace id was pasted wrong is a worse outcome than an unmetered
 * one — the first breaks the app for the only player, the second costs money
 * the owner can see and stop. Every fail-open path logs, so `wrangler tail`
 * says which one happened.
 */
async function checkQuota(request, env) {
  const kv = env?.QUOTA
  if (!kv || typeof kv.get !== 'function' || typeof kv.put !== 'function') {
    console.log('quota: no QUOTA KV binding — serving unmetered')
    return { ok: true }
  }
  const perInstall = capFrom(env?.DAILY_CAP, DEFAULT_DAILY_CAP)
  const ceiling = capFrom(env?.GLOBAL_DAILY_CAP, DEFAULT_GLOBAL_DAILY_CAP)
  if (perInstall === 0 && ceiling === 0) return { ok: true }

  const day = utcDay()
  const mine = `q:${day}:${installBucket(request)}`
  const all = `q:${day}:@all`
  try {
    const [rawMine, rawAll] = await Promise.all([kv.get(mine), kv.get(all)])
    const used = Number(rawMine) || 0
    const usedAll = Number(rawAll) || 0
    if (perInstall > 0 && used >= perInstall) return { ok: false, scope: 'install', cap: perInstall }
    if (ceiling > 0 && usedAll >= ceiling) return { ok: false, scope: 'global', cap: ceiling }
    // Only a request that is going through gets counted, so a refused one does
    // not push the number further past the cap or keep renewing its TTL.
    await Promise.all([
      kv.put(mine, String(used + 1), { expirationTtl: COUNTER_TTL_SECONDS }),
      kv.put(all, String(usedAll + 1), { expirationTtl: COUNTER_TTL_SECONDS }),
    ])
    return { ok: true }
  } catch (e) {
    console.log('quota: KV failed, serving anyway —', e?.message ?? e)
    return { ok: true }
  }
}

/** Seconds until the counters roll, for Retry-After. */
function secondsToUtcMidnight(now = new Date()) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000))
}

/**
 * The 429 body. Shaped like an OpenAI error because that is what an
 * OpenAI-compatible endpoint should return, so a client that already reads
 * `error.message` gets a sentence rather than nothing; `code` is the marker the
 * app matches on.
 */
function capReached(scope, cap, cors) {
  const message =
    scope === 'global'
      ? `This proxy has served ${cap} requests today, which is its ceiling across every install. It resets at midnight UTC.`
      : `This install has made ${cap} requests today, which is its daily cap. It resets at midnight UTC.`
  return new Response(
    JSON.stringify({ error: { message, type: 'daily_cap_reached', code: DAILY_CAP_CODE, scope } }),
    {
      status: 429,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Retry-After': String(secondsToUtcMidnight()),
      },
    },
  )
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
    // X-Install-Id belongs here or the quota never works from a browser: a
    // custom header makes the request non-simple, and a preflight that does not
    // list it is a hard refusal before the real request is ever sent.
    'Access-Control-Allow-Headers': `Authorization, Content-Type, ${INSTALL_HEADER}`,
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

    // Metered only when the worker is the one paying. A request carrying the
    // player's own key spends the player's own budget, so counting it would
    // just be an arbitrary limit on somebody else's money — and it is also the
    // bring-your-own-key path in proxy/README.md, which must keep working
    // whatever the caps say. Nothing has been sent upstream yet, so a refusal
    // here costs nothing at all.
    if (!usable) {
      const quota = await checkQuota(request, env)
      if (!quota.ok) return capReached(quota.scope, quota.cap, cors)
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
