# The proxy is required. Here is why, and how to deploy it in five minutes.

**A browser cannot call `https://ollama.com` at all.** Not with a key, not with
the right model name, not with any setting in the app. The cloud API answers
the browser's CORS preflight with a **redirect**, and the fetch spec forbids
redirects on preflight, so Chrome and Safari refuse before your real request is
ever sent:

```
Access to fetch at 'https://ollama.com/...' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
Redirect is not allowed for a preflight request.
```

That is a property of ollama.com, not of ClueCabulary. `curl` works fine —
`curl` is not a browser and does not do preflights. This is the same wall
[Open WebUI hit](https://github.com/open-webui/open-webui/issues/16412).

This worker is the fix. It answers the preflight **itself** — it never forwards
an OPTIONS request, so there is no redirect to trip over — and adds the headers
the browser needs to the real response.

## Deploy

From this directory:

```bash
npx wrangler login
npx wrangler deploy
```

That prints a URL like `https://cluecabulary-proxy.<you>.workers.dev`.

**Put the key in the worker, not in the app:**

```bash
npx wrangler secret put OLLAMA_API_KEY     # paste the key
```

It is stored encrypted at Cloudflare. It is never in this repository, never in
the app bundle, and never on your phone. Then lock the worker to the origin you
play from, so nobody else can spend your subscription through it:

```bash
npx wrangler deploy --var ALLOWED_ORIGIN:https://<your-username>.github.io
```

Finally, in the app: **Settings → Base URL** → your worker URL **plus `/v1`**,
e.g. `https://cluecabulary-proxy.<you>.workers.dev/v1`. Leave **API key**
empty. Tap **List models this server accepts** — if names come back, you are
done, and you can pick one rather than guessing.

Prefer to keep the key on the phone instead? Skip the `secret put` step and
paste it into Settings. A key the app sends is used in preference to the
worker's own, so both work; the secret is simply the safer default.

## No Cloudflare dashboard? Paste it by hand

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
