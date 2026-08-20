import { createServer } from 'node:http'

/**
 * A stand-in for Ollama, speaking the OpenAI chat-completions shape.
 *
 * The eleven other drives all run with the mock companion, which returns
 * already-shaped objects and never calls chatJson — so the real client path
 * (fetch, JSON parsing, fence stripping, brace salvage, schema validation, the
 * corrective retry, the error taxonomy) had never executed in a browser. This
 * server exists so it can, without a key and without reaching the internet.
 *
 * Scripted per request: each call shifts the next entry off the queue, so one
 * drive can walk a round through clean and hostile replies in order. Every
 * request body is recorded, which is what lets a drive assert the AI firewall
 * against the bytes that actually left the browser.
 */
export async function startFakeOllama(port, { auto = false, cors: sendCors = true } = {}) {
  /** @type {Array<{status?: number, body?: string, json?: unknown}>} */
  const script = []
  /** @type {Array<{messages: unknown[], raw: string}>} */
  const received = []

  const server = createServer((req, res) => {
    // `cors: false` stands in for the thing the proxy exists to solve: a server
    // that answers fine from curl and is unusable from a browser.
    const cors = sendCors
      ? {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, content-type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        }
      : {}
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      res.end()
      return
    }

    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = null
      }
      received.push({ messages: parsed?.messages ?? [], raw, auth: req.headers.authorization ?? '' })

      // A story request that nothing scripted is answered rather than nulled,
      // in scripted mode too: its valid reply must echo the request's own two
      // list lines, so it cannot be queued ahead of time the way a clue can.
      // A drive that wants to test the story's failure path still can — queue
      // the bad replies and they are served first.
      const next = script.shift() ?? (auto ? autoReply(parsed) : storyOrNull(parsed))
      if (next.status && next.status >= 400) {
        res.writeHead(next.status, { ...cors, 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'fake failure' } }))
        return
      }
      // `body` is the raw assistant content — the point is to hand the client
      // the messy shapes a real model produces.
      const content = next.body !== undefined ? next.body : JSON.stringify(next.json)
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { content } }] }))
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    /** Queue replies, in the order the client will ask for them. */
    queue: (...replies) => script.push(...replies),
    received,
    reset: () => {
      script.length = 0
      received.length = 0
    },
    stop: () => new Promise((r) => server.close(r)),
  }
}

const promptText = (request) => (request?.messages ?? []).map((m) => m.content ?? '').join('\n')

const storyOrNull = (request) => {
  const text = promptText(request)
  return /SMALL WORDS TO INCLUDE/.test(text) ? storyReply(text) : { json: null }
}

/**
 * Answer any prompt plausibly by reading the board back out of it. Lets the
 * fake stand in for a model with no script at all, which is how live-drive's
 * own machinery gets exercised without a key.
 */
function autoReply(request) {
  const text = promptText(request)
  // Board lines are "<id> | <danish> (...) [...] | <status>[ | my key: ROLE]",
  // and since A2 they can carry one more field after the role — "** YOU MAY
  // TARGET THIS **", or the sentence saying a green is already found.
  //
  // That trailing field silently broke this. The pattern anchored $ straight
  // after the role, so every targetable green stopped matching, greens came
  // back empty, and the auto-reply returned null on every clue prompt — which
  // the app answers by spending all four correction attempts and giving up.
  // Nothing failed, because no drive currently plays far enough on the
  // auto-reply to notice; it was found by reading, not by a red test. Hence
  // the tolerant tail: this reads a prompt written elsewhere, so it should bend
  // when that prompt gains a field rather than quietly matching nothing.
  const rows = [
    ...text.matchAll(/^(\S+) \| .+? \| ([A-Za-z ]+?)(?: \| my key: (\w+))?(?: \|.*)?$/gm),
  ]
  const hidden = rows.filter((m) => /hidden|unrevealed/i.test(m[2]))
  if (/SMALL WORDS TO INCLUDE/.test(text)) return storyReply(text)
  if (/You are the GUESSER/.test(text)) {
    const pick = (hidden[0] ?? rows[0])?.[1]
    return pick ? guessReply([pick], 0.8) : { json: null }
  }
  const greens = rows.filter((m) => (m[3] ?? '').toUpperCase() === 'GREEN').map((m) => m[1])
  return greens.length ? clueReply(greens.slice(0, 2), 'autoklue') : { json: null }
}

/**
 * A valid story reply, built by reading the request back out of its own two
 * list lines — the labels are a contract stated in buildStoryPrompt. The
 * "story" is nonsense, but it contains every asked-for word verbatim, so it
 * passes the same verification the real model's reply must (companion.ts) and
 * the drive proves the checked path rather than a hole through it.
 */
export const storyReply = (promptText) => {
  const words = [...(promptText.match(/^WORDS TO WEAVE IN: (.*)$/m)?.[1] ?? '').matchAll(/([^,(]+) \(/g)]
    .map((m) => m[1].trim())
  const targets = (promptText.match(/^SMALL WORDS TO INCLUDE: (.*)$/m)?.[1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    json: {
      sentences: [
        { da: `Fake: ${words.join(' og ')}.`, en: 'Fake: the words.' },
        { da: `Og ${targets.join(' ')} fake.`, en: 'Fake: the small words.' },
      ],
    },
  }
}

/** A well-formed clue reply for the given board word ids. */
export const clueReply = (targets, clue = 'mokclue') => ({
  json: {
    clue,
    number: Math.min(targets.length, 4),
    targetWordIds: targets,
    rationale: 'fake rationale',
  },
})

/** A well-formed guess reply. */
export const guessReply = (ids, confidence = 0.9) => ({
  json: { guesses: ids.map((wordId) => ({ wordId, confidence, reasoning: 'fake' })) },
})

// There was a debriefReply here, for the request a finished round used to make.
// The round now ends without asking the model anything, and ai-drive asserts
// that against the requests this server actually receives.
