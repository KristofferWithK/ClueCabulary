# The proxy — the thing that lets the app work with no key

This worker is not optional any more, and it is not a workaround. It is where
Cluey's API key lives, which is what makes a fresh install play immediately:
open the app, press play, no key to fetch and paste. The app ships pointing at
it, and there is no API key field in Settings to fill in instead.

It started as a CORS fix and that part is still true. Ollama Cloud refuses
browser requests outright — measured on a real device. Its API answers the
browser's CORS preflight with a **redirect**, and the fetch spec forbids
redirects on preflight, so Chrome and Safari refuse before the real request is
sent:

```
Access to fetch at 'https://ollama.com/...' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
Redirect is not allowed for a preflight request.
```

That is a property of ollama.com, not of ClueCabulary, and no key or model name
changes it. `curl` works fine — `curl` is not a browser and sends no preflight.
Other projects hit the same wall
([Open WebUI](https://github.com/open-webui/open-webui/issues/16412)).

This worker answers the preflight **itself** — it never forwards an OPTIONS
request, so there is no redirect to trip over — and adds the headers the
browser needs to the real response. It also holds the key, resolves the model
alias, refuses foreign origins, caps how much anyone can spend in a day, and —
once you configure it — sends the small number of calls that need a big model
to one, while everything else is answered by a cheap one.

## Deploy from a phone, with no terminal

`wrangler` is a command-line tool and there is no mobile equivalent — but
everything it needs is a secret you can type into a web form, so this
repository can deploy the worker for you.

1. [Create a free Cloudflare account](https://dash.cloudflare.com) — no domain
   needed.
2. [Create an API token](https://dash.cloudflare.com/profile/api-tokens) using
   the **Edit Cloudflare Workers** template. Your Account ID is on the
   Workers & Pages overview page. That template includes **Workers KV Storage:
   Edit**, which the daily cap needs — if you are reusing an older token that
   does not have it, mint a new one.
3. In this repository: **Settings → Secrets and variables → Actions → New
   repository secret**, three times — `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `OLLAMA_API_KEY`.
4. **Actions → Deploy the AI proxy → Run workflow.**
5. Read the run summary. It prints the worker's address, and it says whether
   the daily cap is on. If it says **No daily cap**, the KV step could not run
   — fix the token and run it again before anyone else has the address.

The workflow creates the KV namespace for the cap the first time and reuses it
after, so there is nothing to paste. The key is uploaded as a Worker secret,
stored encrypted at Cloudflare: never in this repository, never in the app
bundle, never on the phone.

The app already points at the worker deployed from this repository. You only
need the address from step 5 if you are running your own — paste it plus `/v1`
into **Settings → Base URL**.

## Or, at a computer

```bash
cd proxy
npx wrangler login
npx wrangler kv namespace create QUOTA   # once; prints an id
# paste that id into the [[kv_namespaces]] block in wrangler.toml
npx wrangler deploy
npx wrangler secret put OLLAMA_API_KEY
```

Skip the namespace and the worker still deploys and still works — it logs
`no QUOTA KV binding` and serves every request unmetered. See the caps below
for why that is the deliberate behaviour and why you do not want to leave it
that way.

## Or, by hand in the Cloudflare dashboard

1. Create a free account at https://dash.cloudflare.com (no domain needed).
2. **Workers & Pages → Create → Worker**, name it, deploy the hello-world.
3. **Edit code**, replace everything with [`worker.js`](./worker.js), **Deploy**.
4. In the worker's **Settings**, under variables: add `OLLAMA_API_KEY` as a
   **secret** (encrypted), and `ALLOWED_ORIGIN` as plain text — the exact
   values are below. Cloudflare renames this panel every so often; look for
   the one that distinguishes a secret from a plain variable.
5. Create a KV namespace called `cluecabulary-proxy-QUOTA` (under storage),
   then bind it to the worker with the variable name `QUOTA`. Skip this and
   you get an unmetered proxy — see the caps below.

## The two origins that must be allowed

`ALLOWED_ORIGIN` is a comma-separated list, and **both** of these belong in it
or one of the two apps cannot reach the proxy at all:

| Caller | Origin |
| --- | --- |
| The PWA on GitHub Pages | `https://kristofferwithk.github.io` |
| The iOS app (Capacitor WKWebView) | `capacitor://localhost` |

Both are already in [`wrangler.toml`](./wrangler.toml).

An Origin is scheme + host + port and **never a path**, so it is
`https://kristofferwithk.github.io` and not `.../ClueCabulary`. The native one
surprises people: the iOS shell serves the same bundle from inside the app, so
its requests do not come from the Pages origin at all, and getting it wrong
means the iOS app quietly cannot reach Cluey while the website is fine.

That value is read off Capacitor rather than guessed. `capacitor.config.ts`
sets neither `server.iosScheme` nor `server.hostname`, and Capacitor 8's
defaults for those are `capacitor` and `localhost` — the first is documented as
`@default capacitor` in `@capacitor/cli`'s `declarations.d.ts`, the second is
`InstanceDescriptorDefaults.hostname` in `@capacitor/ios`. A shell migrated
from `cordova-plugin-ionic-webview` sends `ionic://localhost` instead, so add
that if the shell ever changes.

To see what your phone really sends rather than trusting this table, run
`npx wrangler tail cluecabulary-proxy` and use the app. A rejected origin shows
up as a 403.

Leaving `ALLOWED_ORIGIN` unset allows everyone, which is only safe while the
worker holds no key of its own.

## The daily caps

The origin lock is the first layer and it is not enough by itself. Origin is
just a header: a browser will not lie about it, but `curl -H "Origin: ..."`
will, and the worker's address is readable in the app's JavaScript. So the
worker also counts.

Two counters per UTC day, kept in KV:

| Variable | Default | What it limits |
| --- | --- | --- |
| `DAILY_CAP` | 1000 | Requests from one install |
| `GLOBAL_DAILY_CAP` | 25000 | Requests from everyone, together |

Set either as a Worker variable to override; `0` turns that one off. Only
requests where the **worker** supplies the key are counted — bring your own and
you are spending your own money, so nothing is metered.

Where 1000 comes from is written out in [`worker.js`](./worker.js), from the
board configs: each turn token is exactly one AI call, the longest board in the
game has ten, a rejected reply is retried at most three times, and the
translate box adds at most one call per word on the board. A player who reaches
1000 has played fifteen full rounds in one day with every single reply needing
three corrections. It is meant to be unreachable by playing.

**The install id is forgeable, and the worker says so.** It is a random string
the app keeps in localStorage and sends in a header, so a script can send a
fresh one every request and never hit the per-install cap. That cap is honestly
for the things that actually happen: a retry loop that got stuck, one person
poking the endpoint. `GLOBAL_DAILY_CAP` is the number nothing in the request can
select, and it is what bounds the bill no matter who is asking. The cost is that
abuse and real play share it — an attacker cannot spend more than the ceiling,
but they can spend it, and while it is spent nobody plays. Raising it is a
thirty-second edit in the dashboard with no deploy, which an unbounded bill is
not.

Over the cap, the worker answers **429** with a JSON body, a `Retry-After` and a
`cluecabulary_daily_cap` code. The app recognises that code and tells the player
Cluey is resting until midnight UTC, offering the practice companion — which is
a different message from an upstream rate limit, where retrying in a moment is
the right advice.

**The count is a fuse, not an invoice.** KV is built for many reads and few
writes, and a counter is the opposite of that: there is no atomic increment,
reads can be stale, and one key written on every request is the access pattern
KV asks you not to use. All three loosen the count in the same direction, and
loosest under a fast burst — which is when it matters. Counting exactly means
Durable Objects, which means a paid plan, which is the thing this whole feature
exists to avoid. So the caps hold to an order of magnitude, and on a launch day
the Cloudflare dashboard is worth more than trusting this to the digit.

**It fails open, on purpose.** No KV binding, a binding that throws, a namespace
someone deleted: the worker logs it and serves the request anyway. A proxy that
refuses everyone because an id was pasted wrong is a worse outcome than one that
does not count — the first breaks the app for the only player, the second costs
money you can see and stop. The consequence is that a missing binding is a
silent loss of the cap rather than an error, which is why the deploy summary
says which one you got, and why `npx wrangler tail` is worth a look after a
deploy.

## Making it cheaper: the cascade

**Nothing here is switched on.** The proxy behaves today exactly as it did
before this existed, and it will go on doing that until you follow the list
below. If you only read one line: a small fast model answers almost everything,
and the calls it gets wrong — which the app already retries — are re-asked of
the big one, so the retry that used to be expensive is the *only* thing that is.

Do this:

1. Pick a cheap model your provider serves and a flagship. Anything from about
   5:1 in price is worth doing; the arithmetic below is worked at 20:1.
2. Open [`wrangler.toml`](./wrangler.toml) (or the Cloudflare dashboard →
   Settings → Variables) and replace `MODEL_ALIASES` with **two** entries, the
   first naming the second:

   ```
   MODEL_ALIASES = '{"cluey":{"model":"THE-CHEAP-ONE","escalate":"cluey-hard"},
     "cluey-hard":{"model":"THE-BIG-ONE"}}'
   ```

   The name `cluey-hard` is yours to choose; it just has to match on both lines.
   The app keeps asking for `cluey` and never learns either name.
3. Deploy — Actions → *Deploy the AI proxy* → Run workflow, or `npx wrangler
   deploy`. Nothing in the app changes and there is no release to make.
4. **Play a round.** The first attempt of every call is now the cheap model, so
   this is the attempt you actually experience. If Casey's clues got worse, the
   cheap model is too cheap; try the next size up. This is the step to do before
   any of the rest, because a saving that makes the game worse is not a saving.
5. Play five or six rounds, then run `npx wrangler tail cluecabulary-proxy`.
   Count the lines beginning `cascade:` and the requests arriving with
   `?tier=escalate` — those, over the total, are how often the cheap model was
   refused. Under about a third and the saving is most of the table below. Over
   a half and a bigger cheap model will cost you less than this one does.
6. Leave `CHEAP_TIMEOUT_MS` alone unless the cheap model actually hangs on you.
   It is the one setting here that can cost more than it saves — set below what
   the model genuinely takes, it turns every request into two.

To turn the whole thing off, delete `"escalate"` from the alias. That is the
entire switch: one word.

### What it saves

Per AI call, with `p` the price on the cheap model, `P` on the flagship, and `r`
how often the cheap one's answer is refused:

| | cost of one call |
| --- | --- |
| today, one tier | `P × 1.11` |
| with the cascade | `p + r × P × 1.11` |

At 20:1 (the blueprint's $0.0001 and $0.002):

| how often the cheap model is refused | cost a call | against $0.00222 today |
| --- | --- | --- |
| 5% | $0.00021 | 90% less |
| 20% | $0.00054 | 76% less |
| 35% | $0.00088 | 60% less |
| 50% | $0.00121 | 45% less |
| **96%** | $0.00222 | **break-even** |

The rule behind that table, which barely depends on anything else: **the cascade
saves money unless the cheap model is refused more often than `1 − p/P`.** At
20:1 that is 96%, at 10:1 it is 91%, at 2:1 it is 55%. It comes out that
lopsided because escalation replaces a retry the app was already making rather
than adding a call — see the long comment in [`worker.js`](./worker.js) for why
the decision is made in the app and not here.

Against the 25,000-request ceiling above, the worst day this proxy can have goes
from about $50 to about $11.

`r` is the one number in all of this that has never been measured — it needs a
real cheap model answering real boards. Step 5 measures it. Everything else here
is measured or is your own price list: the biggest prompt a round sends is 8,208
bytes (about 2,050 input tokens), checked by `e2e/proxy-drive.mjs`, and an
ordinary round is 7 to 12 calls.

### Three things it costs

- **A little more of the daily cap.** The cap counts requests, and a cheap model
  refused more often makes more of them — about 10% more per round at `r` = 0.2.
  The cap is 1000 and a long day is under 150, so this is worth knowing rather
  than worrying about.
- **Two upstream calls for one counted request**, when the *worker* escalates
  because the cheap tier returned a 5xx. The bill is unchanged: a 5xx is not a
  generation. This is also why a 404 is deliberately **not** a trigger — a
  retired model id has to stay visible instead of quietly putting every request
  on the flagship.
- **One extra CORS preflight**, the first time a phone escalates, because the
  escalated request carries a query parameter and preflights are cached per URL.
  One round trip, once a day, on the slow path.

## Fronting Gemini instead

One worker serves either service. Gemini's OpenAI-compatible layer wants the
same Bearer token this worker already sends, and the app's Base URL supplies
the path, so only the host moves — set `UPSTREAM` as a Worker variable:

```
UPSTREAM = https://generativelanguage.googleapis.com
```

in [`wrangler.toml`](./wrangler.toml), or in the dashboard under Settings →
Variables. Unset, it forwards to ollama.com. Per-model is better: a
`MODEL_ALIASES` entry can carry its own `upstream`, `path` and `key`, so one
worker can front three services at once and the app never learns which model
answered.

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

Yes. `proxy/worker.test.mjs` covers the contract above — key injection, the
origin lock, and the cap's branches including the ones KV is hard to put into
(a binding that throws, a variable with a typo in it). `node e2e/proxy-drive.mjs`
runs **this file, unmodified** on the Cloudflare runtime (via miniflare) with
the app talking to it from a real browser and an upstream that deliberately
sends no CORS headers. The cap is exercised there against miniflare's real KV
binding: the counter trips, the refused request never reaches the upstream, the
player sees Cluey resting and finishes the round on the practice companion, a
forged id walks past the per-install cap and is stopped by the ceiling, and a
worker with no binding serves everyone.

The cascade is exercised there too, both halves and both ways of failing: a
cheap tier that 503s escalates and the app never sees it, a 404 does not
escalate, a request already on the flagship does not escalate again, and when
both tiers are down the failure arrives as something the app can name — with
the practice companion still one tap away. The app's own half runs in the
browser: a real round where the first reply is refused, the retry lands on the
flagship, and the call after that starts over cheap. A worker with no cascade
configured is checked to ignore the whole thing.

What none of it can test is whether a cheap model is any *good* at this. There
were no real models in the session that built it, so the failure rate the
saving turns on is unmeasured and step 5 of the list above is how you find it.

Before deploying anything, you can check what your setup actually does:

```bash
OLLAMA_API_KEY=... node e2e/ollama-probe.mjs
```

It reads the CORS preflight rather than inferring from "the request worked",
and prints one of three verdicts.
