import { useEffect, type ReactNode } from 'react'
import {
  Outlet,
  Navigate,
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { AuthProvider } from '@/features/auth/auth'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { validateEnv } from '@/lib/env'
import appCss from '@/index.css?url'

validateEnv()

export interface RouterContext {
  queryClient: QueryClient
}

// SEO defaults ported from the old index.html <head>. Public routes override
// title/description/canonical via their own `head()`.
export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0, maximum-scale=5.0' },
      { name: 'theme-color', content: '#8db600' },
      { title: 'Machine Shop Management — Job Orders, Invoices & Delivery Challans' },
      {
        name: 'description',
        content:
          'Machine Shop Management — track job orders, materials, delivery challans, invoices, payments and expenses for your machine shop, company-wise, from order to dispatch.',
      },
      { name: 'robots', content: 'index,follow' },
      { property: 'og:site_name', content: 'Machine Shop Management' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'Machine Shop Management' },
      {
        property: 'og:description',
        content:
          'Track job orders, materials, delivery challans, invoices, payments and expenses — company-wise, from order to dispatch.',
      },
      { property: 'og:url', content: 'https://sreebalajiindustries.netlify.app/' },
      { property: 'og:image', content: 'https://sreebalajiindustries.netlify.app/og-image.svg' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'canonical', href: 'https://sreebalajiindustries.netlify.app/' },
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Saira:wght@500;600;700;800&display=swap',
      },
    ],
  }),
  component: RootComponent,
  // Preserve the old catch-all: any unknown URL redirects to the landing page.
  notFoundComponent: () => <Navigate to="/" replace />,
})

function RootComponent() {
  // Local (offline) fallback mode reads a localStorage-backed store via the auth
  // repo. Initialise it lazily on the client only so nothing touches the browser
  // API during SSR (Supabase mode never reads it).
  useEffect(() => {
    void import('@/data/store').then(({ ensureDb }) => ensureDb())
  }, [])

  const { queryClient } = Route.useRouteContext()
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <Outlet />
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
