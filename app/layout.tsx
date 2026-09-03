import type { Metadata, Viewport } from 'next'
import { Providers } from './providers'
import './globals.css'

// Root layout for the Next.js App Router. This is a Server Component.
//
// The SEO defaults below mirror the meta currently emitted by the Vite app's
// TanStack root route (`src/routes/__root.tsx`). Per-route pages override title
// and description via their own `metadata` export during route migration.
export const metadata: Metadata = {
  // Global default title; marketing pages override with their own metadata, and
  // authenticated portal pages set a dynamic "MSM | <page>" title client-side
  // via applyAppSeo. Single source of truth for global branding.
  title: 'MSM | Sree Balaji Industries',
  description:
    'MSM (Machine Shop Management) — track job orders, materials, delivery challans, invoices, payments and expenses for your machine shop, company-wise, from order to dispatch.',
  robots: 'index,follow',
  // One global favicon (premium hexagon + MSM). SVG for modern browsers, PNG
  // fallbacks for older ones, plus the Apple touch icon. Configured ONCE here.
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: ['/favicon.svg'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    siteName: 'MSM — Machine Shop Management',
    type: 'website',
    title: 'MSM | Sree Balaji Industries',
    description:
      'Track job orders, materials, delivery challans, invoices, payments and expenses — company-wise, from order to dispatch.',
  },
}

export const viewport: Viewport = {
  themeColor: '#ea580c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
