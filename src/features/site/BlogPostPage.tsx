import { Link, useParams, Navigate } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { SiteLayout } from './SiteLayout'
import { useReveal } from './useReveal'
import { useSeo, SITE } from '@/lib/seo'
import { getPost, POSTS, type Block } from './blogData'
import { fmtDate } from '@/lib/format'

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

export function BlogPostPage() {
  const { slug } = useParams()
  const post = slug ? getPost(slug) : undefined
  useReveal([slug])

  useSeo({
    path: `/blog/${slug ?? ''}`,
    title: post?.title ?? 'Article',
    description: post?.excerpt ?? '',
    type: 'article',
    noindex: !post,
    jsonLd: post
      ? {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.excerpt,
          datePublished: post.date,
          dateModified: post.date,
          author: { '@type': 'Organization', name: post.author },
          publisher: { '@type': 'Organization', name: 'Sree Balaji Industries' },
          mainEntityOfPage: `${SITE.BASE_URL}/blog/${post.slug}`,
          keywords: post.tags.join(', '),
        }
      : undefined,
  })

  if (!post) return <Navigate to="/blog" replace />

  const more = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2)

  return (
    <SiteLayout>
      <article className="mx-auto max-w-3xl px-5 py-14 md:py-20">
        <Link to="/blog" className="mono inline-flex items-center gap-1.5 text-sm text-[var(--ink-dim)] hover:text-[var(--amber-soft)]">
          <ArrowLeft size={15} /> All articles
        </Link>

        <div className="mt-6 flex flex-wrap gap-2">
          {post.tags.map((t) => (
            <span key={t} className="mono rounded-full border border-[var(--line)] px-3 py-1 text-[11px] uppercase tracking-wider text-[var(--ink-dim)]">
              {t}
            </span>
          ))}
        </div>

        <h1 className="display rise d1 mt-4 text-3xl font-bold leading-tight sm:text-4xl">{post.title}</h1>
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
            Send your drawing and we'll quote it, usually within a day.
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
                to={`/blog/${p.slug}`}
                className="group rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 transition hover:border-[var(--amber)]/50"
              >
                <span className="mono text-[10px] uppercase tracking-widest" style={{ color: p.accent }}>
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
    </SiteLayout>
  )
}
