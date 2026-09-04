import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'
import { SiteChrome } from './site-chrome'
import { JsonLd } from './json-ld'
import { Breadcrumbs } from './breadcrumbs'
import {
  graph,
  webPageSchema,
  serviceSchema,
  breadcrumbSchema,
  faqSchema,
  organizationSchema,
} from '@/lib/seo'
import { solutionBySlug, type Solution } from '@/features/site/solutionsData'

// Shared template that renders a Feature or Industry landing page consistently:
// breadcrumbs, H1 + lede, H2 sections, benefits, FAQ (as <details>), contextual
// internal links, and ONE <JsonLd> (@graph: WebPage + Service + Breadcrumb + FAQ
// + Organization) so the page keeps a single script#route-jsonld.
export function SolutionPage({ solution }: { solution: Solution }) {
  const base = solution.kind === 'feature' ? 'features' : 'industries'
  const baseLabel = solution.kind === 'feature' ? 'Features' : 'Industries'
  const path = `/${base}/${solution.slug}`
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: baseLabel, path: `/${base}` },
    { name: solution.name, path },
  ]

  const related = solution.related
    .map((slug) => solutionBySlug(slug))
    .filter((s): s is Solution => Boolean(s))

  const jsonLd = graph(
    webPageSchema({ path, name: solution.h1, description: solution.metaDescription }),
    serviceSchema({ name: solution.name, description: solution.metaDescription, path }),
    breadcrumbSchema(crumbs),
    faqSchema(solution.faqs),
    organizationSchema(),
  )

  return (
    <SiteChrome>
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={crumbs} />

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-5 pb-4 pt-10 text-center">
        <p className="kicker">{baseLabel}</p>
        <h1 className="display mt-3 text-4xl font-bold leading-[1.08] text-[var(--ink)] sm:text-5xl">
          {solution.h1}
        </h1>
        <p className="mt-5 text-base leading-relaxed text-[var(--ink-dim)]">{solution.intro}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href="/signup" className="site-btn site-btn-primary">
            Try for free <ArrowUpRight size={16} />
          </a>
          <a href="/contact" className="site-btn site-btn-ghost">
            Talk to us
          </a>
        </div>
      </section>

      {/* Content sections */}
      <section className="mx-auto max-w-3xl px-5 py-12">
        <div className="space-y-12">
          {solution.sections.map((s) => (
            <div key={s.h2}>
              <h2 className="display text-2xl font-bold text-[var(--ink)] sm:text-3xl">{s.h2}</h2>
              <p className="mt-3 text-base leading-relaxed text-[var(--ink-dim)]">{s.body}</p>
              {s.bullets && (
                <ul className="mt-4 space-y-2">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-[var(--ink-dim)]">
                      <Check size={18} className="mt-0.5 shrink-0 text-[var(--amber)]" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* Benefits */}
        <div className="mt-14 rounded-2xl border border-[var(--line)] bg-white/70 p-7">
          <h2 className="display text-xl font-bold text-[var(--ink)]">Key benefits</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {solution.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[var(--ink-dim)]">
                <Check size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      {solution.faqs.length > 0 && (
        <section className="border-t border-[var(--line)]">
          <div className="mx-auto max-w-3xl px-5 py-16">
            <h2 className="display text-2xl font-bold text-[var(--ink)] sm:text-3xl">
              Frequently asked questions
            </h2>
            <div className="mt-8 space-y-3">
              {solution.faqs.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-2xl border border-[var(--line)] bg-white/70 p-5 shadow-sm [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-semibold text-[var(--ink)]">
                    {f.q}
                    <ArrowUpRight
                      size={18}
                      className="shrink-0 text-[var(--amber)] transition group-open:rotate-90"
                    />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--ink-dim)]">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Related internal links */}
      {related.length > 0 && (
        <section className="border-t border-[var(--line)] bg-[var(--bg)]">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="display text-xl font-bold text-[var(--ink)]">
              Explore related solutions
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/${r.kind === 'feature' ? 'features' : 'industries'}/${r.slug}`}
                  className="group rounded-2xl border border-[var(--line)] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <p className="kicker text-[11px]">
                    {r.kind === 'feature' ? 'Feature' : 'Industry'}
                  </p>
                  <p className="display mt-1 flex items-center gap-1 text-base font-bold text-[var(--ink)]">
                    {r.name}
                    <ArrowUpRight
                      size={15}
                      className="text-[var(--amber)] opacity-0 transition group-hover:opacity-100"
                    />
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-sm text-[var(--ink-dim)]">
                    {r.metaDescription}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </SiteChrome>
  )
}

// Shared index (listing) template for /features and /industries.
export function SolutionIndex({
  kind,
  title,
  intro,
  solutions,
}: {
  kind: 'feature' | 'industry'
  title: string
  intro: string
  solutions: Solution[]
}) {
  const base = kind === 'feature' ? 'features' : 'industries'
  const baseLabel = kind === 'feature' ? 'Features' : 'Industries'
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: baseLabel, path: `/${base}` },
  ]
  const jsonLd = graph(
    webPageSchema({ path: `/${base}`, name: title, description: intro }),
    breadcrumbSchema(crumbs),
    organizationSchema(),
  )
  return (
    <SiteChrome>
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={crumbs} />
      <section className="mx-auto max-w-3xl px-5 pb-4 pt-10 text-center">
        <p className="kicker">{baseLabel}</p>
        <h1 className="display mt-3 text-4xl font-bold text-[var(--ink)] sm:text-5xl">{title}</h1>
        <p className="mt-5 text-base leading-relaxed text-[var(--ink-dim)]">{intro}</p>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {solutions.map((s) => (
            <Link
              key={s.slug}
              href={`/${base}/${s.slug}`}
              className="group rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <h2 className="display flex items-center gap-1 text-lg font-bold text-[var(--ink)]">
                {s.name}
                <ArrowUpRight
                  size={16}
                  className="text-[var(--amber)] opacity-0 transition group-hover:opacity-100"
                />
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-dim)]">
                {s.metaDescription}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </SiteChrome>
  )
}
