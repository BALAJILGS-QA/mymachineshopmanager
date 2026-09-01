import type { Metadata, Viewport } from 'next'
import { Providers } from './providers'
import './globals.css'

// Root layout for the Next.js App Router. This is a Server Component.
//
// The SEO defaults below mirror the meta currently emitted by the Vite app's
// TanStack root route (`src/routes/__root.tsx`). Per-route pages override title
// and description via their own `metadata` export during route migration.
export const metadata: Metadata = {
  title: 'Machine Shop Management — Job Orders, Invoices & Delivery Challans',
  description:
    'Machine Shop Management — track job orders, materials, delivery challans, invoices, payments and expenses for your machine shop, company-wise, from order to dispatch.',
  robots: 'index,follow',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    siteName: 'Machine Shop Management',
    type: 'website',
    title: 'Machine Shop Management',
    description:
      'Track job orders, materials, delivery challans, invoices, payments and expenses — company-wise, from order to dispatch.',
  },
}

export const viewport: Viewport = {
  themeColor: '#8db600',
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
