'use client'

// Client-side provider tree for the Next.js App Router.
//
// Phase 2 (foundation): only TanStack Query is wired here. The QueryClient
// defaults MIRROR the existing Vite app (`src/router.tsx`) so query behaviour is
// identical once routes are migrated — do not change these without matching the
// Vite side. AuthProvider / ToastProvider / ConfirmProvider are added when the
// authenticated portal moves over (route-migration phase), not before, so the
// foundation build stays free of browser-only (localStorage/Supabase) code.

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser session (created lazily in state so it is not
  // shared across requests on the server).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
