'use client'

// Client-side provider tree for the Next.js App Router.
//
// Mirrors the Vite app's `__root.tsx` order: QueryClient → Auth → Toast. Defaults
// MUST match the Vite side (see `src/router.tsx`). AuthProvider + ToastProvider
// are SSR-safe when Supabase is configured (NEXT_PUBLIC_SUPABASE_* set): Auth's
// state initialiser only reads localStorage in LOCAL mode, and Toast renders no
// portal. ConfirmProvider is added when portal pages that use it are migrated.

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/features/auth/auth'
import { ToastProvider } from '@/components/ui/Toast'

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

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
