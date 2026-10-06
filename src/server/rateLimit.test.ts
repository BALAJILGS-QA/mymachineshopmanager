import { describe, it, expect, beforeEach } from 'vitest'
import { rateLimit, resetRateLimits } from './rateLimit'

// Deterministic clock via the `now` parameter so the fixed window is testable
// without timers.
describe('rateLimit', () => {
  beforeEach(() => resetRateLimits())

  it('allows up to the limit within a window', () => {
    const t0 = 1_000_000
    for (let i = 1; i <= 3; i++) {
      expect(rateLimit('k', 3, 60_000, t0).ok).toBe(true)
    }
  })

  it('blocks the (limit+1)th hit and reports retryAfter', () => {
    const t0 = 1_000_000
    for (let i = 1; i <= 3; i++) rateLimit('k', 3, 60_000, t0)
    const blocked = rateLimit('k', 3, 60_000, t0 + 5_000)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)
  })

  it('resets after the window elapses', () => {
    const t0 = 1_000_000
    for (let i = 1; i <= 3; i++) rateLimit('k', 3, 60_000, t0)
    expect(rateLimit('k', 3, 60_000, t0 + 60_001).ok).toBe(true)
  })

  it('tracks keys independently', () => {
    const t0 = 1_000_000
    for (let i = 1; i <= 3; i++) rateLimit('a', 3, 60_000, t0)
    expect(rateLimit('a', 3, 60_000, t0).ok).toBe(false)
    expect(rateLimit('b', 3, 60_000, t0).ok).toBe(true)
  })
})
