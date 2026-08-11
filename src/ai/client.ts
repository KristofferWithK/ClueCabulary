import type { ChatMessage } from './prompts'

export interface AiSettings {
  /** OpenAI-compatible base, e.g. https://ollama.com/v1 or a personal proxy. */
  baseUrl: string
  apiKey: string
  model: string
}

export type AiErrorKind =
  | 'cors'
  | 'network'
  | 'auth'
  | 'not-found'
  | 'rate-limit'
  | 'server'
  | 'invalid-response'

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'AiError'
  }
}

export const DEFAULT_BASE_URL = 'https://ollama.com/v1'
export const DEFAULT_MODEL = 'gpt-oss:120b'

export type ChatFn = (
  settings: AiSettings,
  messages: ChatMessage[],
  opts?: { temperature?: number },
) => Promise<unknown>

/**
 * One chat-completion call that must return JSON. Distinguishes CORS/auth/
 * model errors so Settings can give actionable advice; retries once on 5xx.
 */
export const chatJson: ChatFn = async (settings, messages, opts) => {
  const doFetch = async (): Promise<Response> => {
    try {
      return await fetch(`${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages,
          temperature: opts?.temperature ?? 0.5,
          response_format: { type: 'json_object' },
        }),
      })
    } catch {
      // fetch rejects without an HTTP status: offline or blocked by CORS.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new AiError('network', 'You appear to be offline.')
      }
      throw new AiError(
        'cors',
        'The AI server refused the browser request (likely CORS). If this is ollama.com, deploy the bundled proxy (see proxy/README.md) and set it as the Base URL in Settings.',
      )
    }
  }

  let res = await doFetch()
  if (res.status >= 500) res = await doFetch()

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AiError('auth', 'The API key was rejected. Check it in Settings.')
    }
    if (res.status === 404) {
      throw new AiError('not-found', 'Model or endpoint not found. Check the model name and Base URL in Settings.')
    }
    if (res.status === 429) {
      throw new AiError('rate-limit', 'Rate limited by the AI server. Wait a moment and retry.')
    }
    throw new AiError('server', `AI server error (HTTP ${res.status}).`)
  }

  let content: string
  try {
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    content = data.choices?.[0]?.message?.content ?? ''
  } catch {
    throw new AiError('invalid-response', 'The AI server returned a non-JSON body.')
  }
  if (!content) throw new AiError('invalid-response', 'The AI reply was empty.')

  const stripped = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  try {
    return JSON.parse(stripped) as unknown
  } catch {
    throw new AiError('invalid-response', 'The AI reply was not valid JSON.')
  }
}

/** Cheap connectivity probe for the Settings screen. */
export async function testConnection(settings: AiSettings): Promise<void> {
  await chatJson(settings, [
    { role: 'user', content: 'Reply with exactly this JSON object: {"ok": true}' },
  ])
}
