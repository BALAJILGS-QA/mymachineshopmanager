import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { verifyRecaptchaToken, isRecaptchaConfigured } from './recaptcha'

// Server-side siteverify behaviour. We mock global.fetch so no network is hit and
// assert the module "fails closed" on every failure mode.
const ORIGINAL_SECRET = process.env.RECAPTCHA_SECRET_KEY

function mockFetch(impl: (...args: unknown[]) => Promise<Response> | Response) {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

describe('verifyRecaptchaToken', () => {
  beforeEach(() => {
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret'
  })
  afterEach(() => {
    process.env.RECAPTCHA_SECRET_KEY = ORIGINAL_SECRET
    vi.restoreAllMocks()
  })

  it('reports configured when a secret is present', () => {
    expect(isRecaptchaConfigured()).toBe(true)
  })

  it('fails closed with no secret (never calls the network)', async () => {
    delete process.env.RECAPTCHA_SECRET_KEY
    const spy = vi.fn()
    globalThis.fetch = spy as unknown as typeof fetch
    const r = await verifyRecaptchaToken('tok')
    expect(r.success).toBe(false)
    expect(r.errorCodes).toContain('missing-secret')
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a missing token before calling the network', async () => {
    const spy = vi.fn()
    globalThis.fetch = spy as unknown as typeof fetch
    const r = await verifyRecaptchaToken('')
    expect(r.success).toBe(false)
    expect(r.errorCodes).toContain('missing-input-response')
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns success for a valid token', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    const r = await verifyRecaptchaToken('good-token', '1.2.3.4')
    expect(r.success).toBe(true)
    expect(r.errorCodes).toEqual([])
  })

  it('surfaces Google error codes on failure (incl. replay)', async () => {
    mockFetch(() => jsonResponse({ success: false, 'error-codes': ['timeout-or-duplicate'] }))
    const r = await verifyRecaptchaToken('replayed-token')
    expect(r.success).toBe(false)
    expect(r.errorCodes).toContain('timeout-or-duplicate')
  })

  it('fails closed on a non-200 response', async () => {
    mockFetch(() => jsonResponse({}, false, 500))
    const r = await verifyRecaptchaToken('tok')
    expect(r.success).toBe(false)
    expect(r.errorCodes).toContain('http-500')
  })

  it('fails closed on a network error', async () => {
    mockFetch(() => {
      throw new Error('boom')
    })
    const r = await verifyRecaptchaToken('tok')
    expect(r.success).toBe(false)
    expect(r.errorCodes).toContain('network-error')
  })

  it('sends secret + response (+ remoteip) as form-encoded body', async () => {
    let captured: { url?: string; body?: string } = {}
    mockFetch((...args: unknown[]) => {
      const [url, init] = args as [string, RequestInit]
      captured = { url, body: (init.body as URLSearchParams).toString() }
      return jsonResponse({ success: true })
    })
    await verifyRecaptchaToken('abc', '9.9.9.9')
    expect(captured.url).toContain('siteverify')
    expect(captured.body).toContain('secret=test-secret')
    expect(captured.body).toContain('response=abc')
    expect(captured.body).toContain('remoteip=9.9.9.9')
  })
})
