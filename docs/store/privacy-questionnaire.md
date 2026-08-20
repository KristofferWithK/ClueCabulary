# ASC privacy questionnaire — DRAFT answers with the reasoning attached

App Store Connect ▸ App Privacy asks what the app "collects". Apple's
definition: data transmitted off the device in a way that allows access
longer than servicing the request. These answers are drafted from the code as
it ships (proxy/worker.js, src/ai/, G1's install-id header) — but they are
**legal statements the owner signs**, so read the reasoning, disagree where
you do, and only then fill the form.

## The honest inventory of what leaves the device

1. **AI requests** — board words, round history, typed clues and look-up
   terms, sent to the Cloudflare Worker and forwarded to the model provider.
   The worker stores none of it (it holds only KV rate-limit counters).
   Whether the *model provider* retains prompts is governed by their terms,
   which is why the conservative declaration below still lists it.
2. **The install ID** — a random per-install identifier sent as a header for
   daily rate limiting. Counted in Cloudflare KV; counts expire daily. Not
   derived from the device, not linked to any account (there are none).
3. Nothing else. No analytics, no ads, no crash reporting SDK, no accounts.

## Declaration to enter

**Data types collected:**

- **Identifiers ▸ User ID** — the random install ID.
  - Linked to the user's identity: **No** (there is no identity to link).
  - Used for tracking: **No**.
  - Purpose: **App Functionality** (rate limiting).

- **User Content ▸ Other User Content** — words and clues sent to produce
  Casey's replies.
  - Linked to identity: **No**. Tracking: **No**.
  - Purpose: **App Functionality**.
  - This is the row a stricter reading could omit (the worker services the
    request and keeps nothing), but the model provider sits behind it and
    "we declared it and it is harmless" beats "a reviewer asked why the app
    talks to a server it declared nothing about".

**Everything else: Not collected.**

The result badge on the store will read "Data Not Linked to You", which is
both accurate and the second-best badge there is. Claiming the best one
("Data Not Collected") would require dropping the install-id rate limiting
or arguing Apple's definition harder than a free app needs to.

## If asked in review

- "Why does the app contact kristoffer-kai.workers.dev?" — the AI companion;
  see the privacy policy's second section, which says exactly this.
- Sign-in requirement: none, so the "account deletion" requirement does not
  apply.
- Export compliance: standard HTTPS only → the usual "exempt" answer
  (`ITSAppUsesNonExemptEncryption` = NO if asked in the build).
