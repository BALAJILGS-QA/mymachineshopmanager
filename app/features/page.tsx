import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo'
import { FEATURES } from '@/features/site/solutionsData'
import { SolutionIndex } from '../_site/solution-page'

const INTRO =
  'MSM brings every part of a machine shop into one connected system — production, inventory, purchasing, sales, accounting, job work, the tool room, workforce and reports. Explore each module below.'

export const metadata: Metadata = buildMetadata({
  path: '/features',
  title: 'Manufacturing ERP Modules & Features | Machine Shop Management',
  description:
    'Explore MSM modules: production, inventory, purchasing, GST invoicing, accounting, job work, tool room, HR and reports — one connected system for machine shops.',
  keywords: [
    'manufacturing ERP features',
    'machine shop software modules',
    'production inventory invoicing software',
  ],
})

export default function FeaturesIndex() {
  return (
    <SolutionIndex
      kind="feature"
      title="One system, every part of your shop"
      intro={INTRO}
      solutions={FEATURES}
    />
  )
}
