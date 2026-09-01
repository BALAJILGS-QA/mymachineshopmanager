// Pure site metadata constants — NO React/browser dependencies — so they can be
// imported from both client code and Next.js Server Components. `src/lib/seo.ts`
// (which uses `useEffect` and is client-only) re-exports `SITE` from here for
// backward compatibility with existing Vite imports.
export const SITE_NAME = 'Machine Shop Management'
export const BASE_URL = 'https://sreebalajiindustries.netlify.app'
export const DEFAULT_IMAGE = `${BASE_URL}/og-image.svg`

export const SITE = { SITE_NAME, BASE_URL, DEFAULT_IMAGE }
