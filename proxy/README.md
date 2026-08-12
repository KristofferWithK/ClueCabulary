# The proxy, and how to deploy it from a phone

**Try the app's Settings → Test connection first.** If Klaus answers, you do
not need any of this.

If it reports a CORS problem, this is why. A browser is reported to be unable
to call `https://ollama.com` at all: the cloud API answers the browser's CORS
preflight with a **redirect**, and the fetch spec forbids redirects on
preflight, so Chrome and Safari refuse before your real request is sent —

```
Access to fetch at 'https://ollama.com/...' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
Redirect is not allowed for a preflight request.
```

That is a property of ollama.com, not of ClueCabulary, and no key or model name
changes it. `curl` works fine — `curl` is not a browser and sends no preflight.
Other projects have hit the same wall
([Open WebUI](https://github.com/open-webui/open-webui/issues/16412)). Your own
Test connection is what settles it for your phone.

This worker is the fix. It answers the preflight **itself** — it never forwards
an OPTIONS request, so there is no redirect to trip over — and adds the headers
the browser needs to the real response.

## Deploy from a phone, with no terminal

`wrangler` is a command-line tool and there is no mobile equivalent — but
everything it needs is a secret you can type into a web form, so this
repository can deploy the worker for you.

1. [Create a free Cloudflare account](https://dash.cloudflare.com) — no domain
   needed.
2. [Create an API token](https://dash.cloudflare.com/profile/api-tokens) using
   the **Edit Cloudflare Workers** template. Your Account ID is on the
   Workers & Pages overview page.
3. In this repository: **Settings → Secrets and variables → Actions → New
   repository secret**, three times — `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `OLLAMA_API_KEY`.
4. **Actions → Deploy the AI proxy → Run workflow.**
5. The run summary prints the exact address. Paste it into the app's
   **Settings → Base URL** and leave the **API key** field empty — the worker
   holds the key now, so it is off your phone entirely.
6. Tap **List models this server accepts**, pick one, play.

The key is uploaded as a Worker secret, stored encrypted at Cloudflare. It is
never in this repository, never in the app bundle, never on the phone.
`ALLOWED_ORIGIN` in [`wrangler.toml`](./wrangler.toml) locks the worker to the
origin you play from, so nobody else can spend your subscription through it —
change it if you serve the app from elsewhere.

## Or, at a computer

```bash
cd proxy
npx wrangler login
npx wrangler deploy
npx wrangler secret put OLLAMA_API_KEY
```

Same result; same Base URL to paste.

Prefer to keep the key on the phone instead? Skip the secret and paste it into
Settings. A key the app sends is used in preference to the worker's own, so
both work; the secret is simply the safer default.

## Or, by hand in the Cloudflare dashboard

1. Create a free account at https://dash.cloudflare.com (no domain needed).
2. **Workers & Pages → Create → Worker**, name it, deploy the hello-world.
3. **Edit code**, replace everything with [`worker.js`](./worker.js), **Deploy**.
4. **Settings → Variables → Add variable**, name `OLLAMA_API_KEY`, tick
   **Encrypt**, paste the key, save. Add `ALLOWED_ORIGIN` the same way (not
   encrypted) if you want the origin lock.

## What it does, and what it refuses to do

It forwards the path and query to `ollama.com` and sends exactly two headers:
an `Authorization` and `Content-Type: application/json`. Nothing else on the
incoming request — cookies included — is passed on. `GET` is allowed so the app
can read `/v1/models`; everything except `GET`, `POST` and `OPTIONS` is refused.
The upstream status and body come back untouched, with the CORS headers
replaced rather than appended, so the app's own error messages still say what
went wrong.

If ollama.com cannot be reached the worker answers `502` itself. An uncaught
throw would become Cloudflare's error page, which carries no CORS headers — so
your browser would call it a CORS failure and the app would tell you to deploy
the proxy you are already using.

## Is any of this tested?

Yes. `proxy/worker.test.mjs` covers the contract above, including the key
injection and the origin lock, and `node e2e/proxy-drive.mjs` runs **this file,
unmodified** on the Cloudflare runtime (via miniflare) with the app talking to
it from a real browser and an upstream that deliberately sends no CORS headers.

Before deploying anything, you can check what your setup actually does:

```bash
OLLAMA_API_KEY=... node e2e/ollama-probe.mjs
```

It reads the CORS preflight rather than inferring from "the request worked",
and prints one of three verdicts.
