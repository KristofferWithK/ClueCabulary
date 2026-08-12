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

      const next = script.shift() ?? (auto ? autoReply(parsed) : { json: null })
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

/**
 * Answer any prompt plausibly by reading the board back out of it. Lets the
 * fake stand in for a model with no script at all, which is how live-drive's
 * own machinery gets exercised without a key.
 */
function autoReply(request) {
  const text = (request?.messages ?? []).map((m) => m.content ?? '').join('\n')
  // Board lines are "<id> | <danish> (...) [...] | <status>[ | my key: ROLE]".
  const rows = [...text.matchAll(/^(\S+) \| .+? \| ([A-Za-z ]+?)(?: \| my key: (\w+))?$/gm)]
  const hidden = rows.filter((m) => /hidden|unrevealed/i.test(m[2]))
  if (/You are the GUESSER/.test(text)) {
    const pick = (hidden[0] ?? rows[0])?.[1]
    return pick ? guessReply([pick], 0.8) : { json: null }
  }
  const greens = rows.filter((m) => (m[3] ?? '').toUpperCase() === 'GREEN').map((m) => m[1])
  return greens.length ? clueReply(greens.slice(0, 2), 'autoklue') : { json: null }
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

export const debriefReply = () => ({
  json: { summary: 'Fake debrief.', takeaways: ['One thing.'] },
})
