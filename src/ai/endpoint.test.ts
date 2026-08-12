import { describe, expect, it } from 'vitest'
import { AiError, DEFAULT_BASE_URL, resolveEndpoint } from './client'

/**
 * The Base URL is free text the player types, and every request built from it
 * carries their API key in an Authorization header. These tests exist to keep
 * that key off any host they did not mean to name.
 */
describe('resolveEndpoint', () => {
  it('accepts the default and any https host', () => {
    expect(resolveEndpoint(DEFAULT_BASE_URL).href).toBe('https://ollama.com/v1/chat/completions')
    expect(resolveEndpoint('https://proxy.example.com/v1').href).toBe(
      'https://proxy.example.com/v1/chat/completions',
    )
  })

  it('tolerates trailing slashes and surrounding space', () => {
    for (const messy of ['https://ollama.com/v1/', 'https://ollama.com/v1///', '  https://ollama.com/v1  ']) {
      expect(resolveEndpoint(messy).href).toBe('https://ollama.com/v1/chat/completions')
    }
  })

  it('refuses a host with no scheme, which would post the key to our own origin', () => {
    // fetch() would treat this as a relative path and send the Authorization
    // header to whatever is serving the app.
    expect(() => resolveEndpoint('proxy.example.com/v1')).toThrow(AiError)
    expect(() => resolveEndpoint('/v1')).toThrow(AiError)
    expect(() => resolveEndpoint('v1')).toThrow(AiError)
    expect(() => resolveEndpoint('')).toThrow(AiError)
  })

  it('refuses a protocol-relative URL', () => {
    expect(() => resolveEndpoint('//evil.example.com/v1')).toThrow(AiError)
  })

  it('refuses plain http to a remote host', () => {
    expect(() => resolveEndpoint('http://proxy.example.com/v1')).toThrow(AiError)
  })

  it('allows plain http only for a local Ollama', () => {
    expect(resolveEndpoint('http://localhost:11434/v1').href).toBe(
      'http://localhost:11434/v1/chat/completions',
    )
    expect(resolveEndpoint('http://127.0.0.1:11434/v1').href).toBe(
      'http://127.0.0.1:11434/v1/chat/completions',
    )
  })

  it('refuses schemes that are not http at all', () => {
    for (const bad of ['ftp://h/v1', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/plain,x']) {
      expect(() => resolveEndpoint(bad)).toThrow(AiError)
    }
  })

  it('explains itself, because the player has to fix it', () => {
    try {
      resolveEndpoint('proxy.example.com/v1')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AiError)
      expect((e as AiError).message).toMatch(/https:\/\//)
      expect((e as AiError).message).toMatch(/Settings/)
    }
  })
})
