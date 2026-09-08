// Vitest global setup. jest-dom matchers register harmlessly in the node env
// too; the RTL auto-cleanup only has an effect for jsdom component tests.
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// jsdom lacks a couple of browser APIs that Radix (Dialog/react-remove-scroll)
// touches at render time. Polyfill them for component tests; guarded so the
// node-env unit tests are unaffected.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  }
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    } as unknown as typeof ResizeObserver
  }
}
