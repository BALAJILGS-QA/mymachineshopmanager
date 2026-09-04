import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { buildMetadata } from '@/lib/seo'
import { FEATURES, solutionBySlug } from '@/features/site/solutionsData'
import { SolutionPage } from '../../_site/solution-page'

// Statically pre-render one page per feature module at build time.
export function generateStaticParams() {
  return FEATURES.map((f) => ({ slug: f.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const s = solutionBySlug(slug)
  if (!s || s.kind !== 'feature') {
    return buildMetadata({
      path: `/features/${slug}`,
      title: 'Not found',
      description: '',
      index: false,
    })
  }
  return buildMetadata({
    path: `/features/${s.slug}`,
    title: s.title,
    description: s.metaDescription,
    keywords: s.keywords,
  })
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const s = solutionBySlug(slug)
  if (!s || s.kind !== 'feature') notFound()
  return <SolutionPage solution={s} />
}
