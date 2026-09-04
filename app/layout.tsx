import type { Metadata, Viewport } from 'next'
import { Providers } from './providers'
import { Analytics } from './_site/analytics'
import { seoConfig } from '@/lib/seo'
import './globals.css'

// Root layout for the Next.js App Router. This is a Server Component.
//
// The SEO defaults below are the global branding fallback; per-route pages
// override title/description/canonical via their own `metadata` export (or the
// centralized buildMetadata helper). The title `template` appends the brand to
// any page title that does not already include it.
export const metadata: Metadata = {
  metadataBase: new URL(seoConfig.siteUrl),
  // Global default title. Marketing pages fully override this with their own
  // brand-inclusive titles (no `template`, so existing titles never double-brand);
  // authenticated portal pages set "MSM | <page>" client-side via applyAppSeo.
  title: 'MSM | Sree Balaji Industries',
  applicationName: seoConfig.siteName,
  description:
    'MSM (Machine Shop Management) — track job orders, materials, delivery challans, invoices, payments and expenses for your machine shop, company-wise, from order to dispatch.',
  robots: 'index,follow',
  // Search-engine verification (env-driven; omitted entirely when unset).
  verification: {
    ...(seoConfig.verification.google ? { google: seoConfig.verification.google } : {}),
    ...(seoConfig.verification.yandex ? { yandex: seoConfig.verification.yandex } : {}),
    ...(seoConfig.verification.bing
      ? { other: { 'msvalidate.01': seoConfig.verification.bing } }
      : {}),
  },
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
        <Analytics />
      </body>
    </html>
  )
}
