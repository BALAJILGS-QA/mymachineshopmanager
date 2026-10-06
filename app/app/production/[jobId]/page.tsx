'use client'

import { useParams } from 'next/navigation'
import { ProductionExecutionPage } from '@/features/production/ProductionExecutionPage'

export default function Page() {
  const params = useParams<{ jobId: string }>()
  return <ProductionExecutionPage jobId={params?.jobId ?? ''} />
}
