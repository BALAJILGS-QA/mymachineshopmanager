// Pure site metadata constants — NO React/browser dependencies — so they can be
// imported from both client code and Next.js Server Components. `src/lib/seo.ts`
// (which uses `useEffect` and is client-only) re-exports `SITE` from here for
// backward compatibility with existing Vite imports.
//
// Values now come from the centralized, env-driven `@/lib/seo` config so canonical
// URLs and OG tags follow NEXT_PUBLIC_SITE_URL on preview/production deployments.
// The fallback is the existing production domain, so behaviour is unchanged when
// no env var is set (and existing tests keep passing).
import { seoConfig } from './seo/config'

export const SITE_NAME = seoConfig.siteName
export const BASE_URL = seoConfig.siteUrl
export const DEFAULT_IMAGE = `${BASE_URL}/og-image.svg`

export const SITE = { SITE_NAME, BASE_URL, DEFAULT_IMAGE }
