import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import path from 'node:path'

// TanStack Start (SSR) config. Public marketing/blog routes are server-rendered
// for SEO; the authenticated /app portal is client-only (`ssr: false` on its
// route) so localStorage / Supabase-session / chart / PDF code never runs on the
// server. The `@` alias mirrors tsconfig `paths` and the previous Vite config.
export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    // Default build is full SSR (public pages server-rendered) for a Node host.
    // `SPA=1 npm run build` emits a static SPA shell (dist/client/_shell.html)
    // for static hosts like Vercel where the SSR handler can't be served as-is.
    tanstackStart(process.env.SPA ? { spa: { enabled: true } } : {}),
    // React's plugin must come AFTER Start's plugin.
    viteReact(),
  ],
})
