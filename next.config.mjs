/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Migration bridge: hosting (Vercel) already defines VITE_SUPABASE_* for the
  // old Vite build. Map them to NEXT_PUBLIC_* at BUILD time so the Next client
  // bundle gets Supabase config without touching hosting env settings. Locally,
  // .env defines NEXT_PUBLIC_* directly and wins. Remove after cleanup when the
  // hosting env is renamed to NEXT_PUBLIC_*.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '',
  },
  // Security headers — ported from vercel.json (which now delegates to Next) so
  // they apply on ANY host (Vercel, Netlify, bare `next start`).
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
  // Note: Next 16 removed the built-in `next lint` integration, so there is no
  // `eslint` config key. ESLint runs separately via `npm run lint` (flat config).
}

export default nextConfig
