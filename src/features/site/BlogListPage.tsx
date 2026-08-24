import { Link } from 'react-router-dom'
import { Cog } from 'lucide-react'
import { SiteLayout } from './SiteLayout'
import { useReveal } from './useReveal'
import { useSeo, SITE } from '@/lib/seo'
import { POSTS } from './blogData'
import { fmtDate } from '@/lib/format'

export function BlogListPage() {
  useReveal()
  useSeo({
    path: '/blog',
    title: 'CNC Machining Insights & Guides',
    description:
      'Practical guides on CNC machining, turning, milling, materials, tolerances and reducing machining costs — from the Sree Balaji Industries workshop.',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Sree Balaji Industries Blog',
      url: `${SITE.BASE_URL}/blog`,
      blogPost: POSTS.map((p) => ({
        '@type': 'BlogPosting',
        headline: p.title,
        datePublished: p.date,
        url: `${SITE.BASE_URL}/blog/${p.slug}`,
      })),
    },
  })

  const [lead, ...rest] = POSTS

  return (
    <SiteLayout>
      <section className="blueprint relative border-b border-[var(--line)]">
        <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-72" />
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <p className="kicker rise d1">Insights</p>
          <h1 className="display rise d2 mt-3 text-4xl font-bold sm:text-5xl">The Workshop Journal</h1>
          <p className="rise d3 mt-4 max-w-2xl text-[var(--ink-dim)]">
            Field-tested guidance on precision machining — how to design, specify and order parts
            that fit the first time.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-14">
        {/* Lead article */}
        <Link
          to={`/blog/${lead.slug}`}
          className="reveal group grid overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] transition hover:border-[var(--amber)]/50 md:grid-cols-2"
        >
          <div
            className="relative min-h-52 overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${lead.accent}25, transparent 70%), #0e141c` }}
          >
            <div className="blueprint absolute inset-0 opacity-60" />
            <Cog size={160} className="spin-slow absolute -right-10 -bottom-10 opacity-10" style={{ color: lead.accent }} />
            <span className="mono absolute left-5 top-5 text-[11px] uppercase tracking-widest" style={{ color: lead.accent }}>
              Featured · {lead.tags[0]}
            </span>
          </div>
          <div className="flex flex-col justify-center p-7 md:p-10">
            <h2 className="display text-2xl font-bold leading-tight transition group-hover:text-[var(--amber-soft)] sm:text-3xl">
              {lead.title}
            </h2>
            <p className="mt-3 text-[var(--ink-dim)]">{lead.excerpt}</p>
            <p className="mono mt-5 text-xs text-[var(--ink-faint)]">
              {fmtDate(lead.date)} · {lead.readMins} min read
            </p>
          </div>
        </Link>

        {/* Grid */}
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p, i) => (
            <Link
              key={p.slug}
              to={`/blog/${p.slug}`}
              className="reveal group flex flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] transition hover:border-[var(--amber)]/50"
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              <div
                className="relative h-32 overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${p.accent}22, transparent 70%), #0e141c` }}
              >
                <div className="blueprint absolute inset-0 opacity-60" />
                <span className="mono absolute left-4 top-4 text-[10px] uppercase tracking-widest" style={{ color: p.accent }}>
                  {p.tags[0]}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="display text-base font-semibold leading-snug transition group-hover:text-[var(--amber-soft)]">
                  {p.title}
                </h3>
                <p className="mt-2 line-clamp-2 flex-1 text-sm text-[var(--ink-dim)]">{p.excerpt}</p>
                <p className="mono mt-4 text-[11px] text-[var(--ink-faint)]">
                  {fmtDate(p.date)} · {p.readMins} min read
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </SiteLayout>
  )
}
