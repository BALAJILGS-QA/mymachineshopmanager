'use client'

// Client-side provider tree for the Next.js App Router.
//
// Mirrors the Vite app's `__root.tsx` order: QueryClient → Auth → Toast →
// Confirm → AppLink/Nav. Defaults MUST match the Vite side (`src/router.tsx`).
// All providers are SSR-safe when Supabase is configured (NEXT_PUBLIC_SUPABASE_*
// set): Auth's state initialiser only reads localStorage in LOCAL mode, and
// Toast/Confirm touch the DOM only inside effects.

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/features/auth/auth'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { AppLinkProvider } from '@/components/nav/app-link'
import { NextAppLink, NextNavBridge } from './_shell/next-app-link'

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
        <ToastProvider>
          <ConfirmProvider>
            <AppLinkProvider value={NextAppLink}>
              <NextNavBridge>{children}</NextNavBridge>
            </AppLinkProvider>
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
