// Next.js port of the `/blog/$slug` route (was src/routes/blog/$slug.tsx +
// src/features/site/BlogPostPage.tsx). Server Component: SSG'd per post via
// generateStaticParams, per-post SEO via generateMetadata (replacing client-side
// useSeo), unknown slug → redirect('/blog') to preserve the Vite <Navigate>.
// Markup/classes preserved 1:1; navigation swapped to next/link.

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { SiteChrome } from '../../_site/site-chrome'
import { JsonLd } from '../../_site/json-ld'
import { SITE } from '@/lib/site-meta'
import { getPost, POSTS, type Block } from '@/features/site/blogData'
import { fmtDate } from '@/lib/format'

// Pre-render every known post at build time (matches SSG intent of the site).
export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) {
    return { title: `Article · ${SITE.SITE_NAME}`, robots: 'noindex,nofollow' }
  }
  const title = `${post.title} · ${SITE.SITE_NAME}`
  const url = `${SITE.BASE_URL}/blog/${post.slug}`
  return {
    metadataBase: new URL(SITE.BASE_URL),
    title,
    description: post.excerpt,
    keywords: `${post.tags.join(', ')}, CNC, machine shop, Machine Shop Management`,
    alternates: { canonical: url },
    robots: 'index,follow',
    openGraph: {
      siteName: SITE.SITE_NAME,
      title,
      description: post.excerpt,
      type: 'article',
      url,
      images: [SITE.DEFAULT_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: post.excerpt,
      images: [SITE.DEFAULT_IMAGE],
    },
  }
}

function renderBlock(b: Block, i: number) {
  switch (b.t) {
    case 'h2':
      return (
        <h2 key={i} className="display mt-10 text-2xl font-bold text-[var(--ink)]">
          {b.text}
        </h2>
      )
    case 'p':
      return (
        <p key={i} className="mt-4 leading-8 text-[var(--ink-dim)]">
          {b.text}
        </p>
      )
    case 'ul':
      return (
        <ul key={i} className="mt-4 space-y-2">
          {b.items.map((it, j) => (
            <li key={j} className="flex gap-3 text-[var(--ink-dim)]">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--amber)]" />
              <span className="leading-7">{it}</span>
            </li>
          ))}
        </ul>
      )
    case 'quote':
      return (
        <blockquote
          key={i}
          className="display mt-8 border-l-2 border-[var(--amber)] pl-5 text-lg italic text-[var(--ink)]"
        >
          {b.text}
        </blockquote>
      )
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPost(slug)

  // Preserve the Vite behaviour: unknown slug redirects to the blog index.
  if (!post) redirect('/blog')

  const more = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Organization', name: post.author },
    publisher: { '@type': 'Organization', name: 'Machine Shop Management' },
    mainEntityOfPage: `${SITE.BASE_URL}/blog/${post.slug}`,
    keywords: post.tags.join(', '),
  }

  return (
    <SiteChrome revealKey={slug}>
      <JsonLd data={jsonLd} />
      <article className="mx-auto max-w-3xl px-5 py-14 md:py-20">
        <Link
          href="/blog"
          className="mono inline-flex items-center gap-1.5 text-sm text-[var(--ink-dim)] hover:text-[var(--amber-soft)]"
        >
          <ArrowLeft size={15} /> All articles
        </Link>

        <div className="mt-6 flex flex-wrap gap-2">
          {post.tags.map((t) => (
            <span
              key={t}
              className="mono rounded-full border border-[var(--line)] px-3 py-1 text-[11px] uppercase tracking-wider text-[var(--ink-dim)]"
            >
              {t}
            </span>
          ))}
        </div>

        <h1 className="display rise d1 mt-4 text-3xl font-bold leading-tight sm:text-4xl">
          {post.title}
        </h1>
        <p className="mono mt-4 text-xs text-[var(--ink-faint)]">
          {post.author} · {fmtDate(post.date)} · {post.readMins} min read
        </p>

        <div
          className="mt-8 h-1.5 w-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${post.accent}, transparent)` }}
        />

        <div className="mt-8 text-[15px]">{post.body.map(renderBlock)}</div>

        <div className="mt-14 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center">
          <h3 className="display text-xl font-bold">Need this part machined?</h3>
          <p className="mt-2 text-sm text-[var(--ink-dim)]">
            Send your drawing and we&apos;ll quote it, usually within a day.
          </p>
          <a href="/#contact" className="site-btn site-btn-primary mt-4">
            Request a Quote <ArrowUpRight size={16} />
          </a>
        </div>
      </article>

      <section className="border-t border-[var(--line)] bg-[var(--bg-2)]">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <p className="kicker">Keep reading</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {more.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="group rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:border-[var(--amber)]/50"
              >
                <span
                  className="mono text-[10px] uppercase tracking-widest"
                  style={{ color: p.accent }}
                >
                  {p.tags[0]}
                </span>
                <h3 className="display mt-2 font-semibold leading-snug transition group-hover:text-[var(--amber-soft)]">
                  {p.title}
                </h3>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </SiteChrome>
  )
}
