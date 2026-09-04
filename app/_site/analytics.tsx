import Script from 'next/script'
import { seoConfig } from '@/lib/seo'

// Google Analytics 4 loader. Renders NOTHING unless NEXT_PUBLIC_GA_ID is set, so
// there is zero third-party JS (and no cookies) in development or when analytics
// is not configured. Uses next/script `afterInteractive` so it never blocks the
// critical render path / Core Web Vitals.
export function Analytics() {
  const id = seoConfig.gaId
  if (!id) return null
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`}
      </Script>
    </>
  )
}
