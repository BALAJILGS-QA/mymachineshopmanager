import { useSyncExternalStore } from 'react'

// SSR-safe media-query hook. Server render and first client paint return `false`
// (no `window`), then `useSyncExternalStore` re-syncs from `matchMedia` on mount —
// so components branching on it never mismatch during hydration.

/** Tailwind's `md` breakpoint (768px). Below this we treat the viewport as mobile.
 * Kept as a named constant so JS-side branching agrees with the CSS `md:` prefix. */
export const MOBILE_MAX_WIDTH = 767

function subscribe(query: string) {
  return (onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const mql = window.matchMedia(query)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () =>
      typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
    () => false,
  )
}

/** True when the viewport is narrower than Tailwind's `md` breakpoint. Use only
 * where behaviour (not just layout) must branch in JS — prefer CSS `md:` classes
 * for pure layout changes. */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_MAX_WIDTH}px)`)
}
