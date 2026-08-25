import { Boxes, Gauge, ShieldCheck } from 'lucide-react'
import { SiteLayout } from './SiteLayout'
import { AuthForm } from '@/features/auth/AuthForm'
import { useSeo, SITE } from '@/lib/seo'
import { BRAND } from '@/lib/brand'

export function LandingPage() {
  useSeo({
    path: '/',
    title: `${BRAND.product} — Job Orders, Invoices & Delivery Challans`,
    description: BRAND.description,
    keywords: BRAND.keywords,
    type: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: BRAND.product,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: BRAND.description,
      url: SITE.BASE_URL,
      image: SITE.DEFAULT_IMAGE,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    },
  })

  return (
    <SiteLayout showFooter={false}>
      <section className="blueprint relative overflow-hidden">
        <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
        <div className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Marketing */}
          <div>
            <p className="kicker rise d1">{BRAND.product}</p>
            <h1 className="display rise d2 mt-4 text-4xl font-bold leading-[1.03] text-[var(--ink)] sm:text-5xl md:text-6xl">
              Run your shop floor with <span className="grad">total traceability.</span>
            </h1>
            <p className="rise d3 mt-5 max-w-xl text-base leading-relaxed text-[var(--ink-dim)]">
              Machine Shop Management tracks job orders, raw material, delivery challans, invoices,
              payments and expenses — company-wise, from order to dispatch, in one place.
            </p>
            <div className="rise d4 mt-8 flex flex-wrap gap-x-8 gap-y-3">
              {[
                { icon: Gauge, t: 'Tight tolerances' },
                { icon: ShieldCheck, t: 'Documented QC' },
                { icon: Boxes, t: 'Batch traceability' },
              ].map((f) => (
                <span key={f.t} className="flex items-center gap-2 text-sm font-medium text-[var(--ink-dim)]">
                  <f.icon size={16} className="text-[var(--amber)]" /> {f.t}
                </span>
              ))}
            </div>
          </div>

          {/* Auth (merged login/sign-up) */}
          <div className="rise d3 mx-auto w-full max-w-md">
            <AuthForm />
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}
