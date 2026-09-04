import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { buildMetadata } from '@/lib/seo'
import { INDUSTRIES, solutionBySlug } from '@/features/site/solutionsData'
import { SolutionPage } from '../../_site/solution-page'

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const s = solutionBySlug(slug)
  if (!s || s.kind !== 'industry') {
    return buildMetadata({
      path: `/industries/${slug}`,
      title: 'Not found',
      description: '',
      index: false,
    })
  }
  return buildMetadata({
    path: `/industries/${s.slug}`,
    title: s.title,
    description: s.metaDescription,
    keywords: s.keywords,
  })
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const s = solutionBySlug(slug)
  if (!s || s.kind !== 'industry') notFound()
  return <SolutionPage solution={s} />
}
