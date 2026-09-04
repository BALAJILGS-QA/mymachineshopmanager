import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo'
import { INDUSTRIES } from '@/features/site/solutionsData'
import { SolutionIndex } from '../_site/solution-page'

const INTRO =
  'MSM is built for precision manufacturing businesses — machine shops, CNC job shops, fabrication, engineering job work and auto-component makers. See how it fits your kind of shop.'

export const metadata: Metadata = buildMetadata({
  path: '/industries',
  title: 'Industries We Serve | Machine Shop Management',
  description:
    'MSM for machine shops, CNC machining, precision fabrication, engineering job work and auto-component manufacturers — traceability and GST invoicing built in.',
  keywords: ['manufacturing software industries', 'machine shop software', 'CNC job shop software'],
})

export default function IndustriesIndex() {
  return (
    <SolutionIndex
      kind="industry"
      title="Built for the way your shop works"
      intro={INTRO}
      solutions={INDUSTRIES}
    />
  )
}
