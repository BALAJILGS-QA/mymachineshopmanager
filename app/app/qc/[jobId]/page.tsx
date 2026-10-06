'use client'

import { useParams } from 'next/navigation'
import { QcInspectionPage } from '@/features/qc/QcInspectionPage'

export default function Page() {
  const params = useParams<{ jobId: string }>()
  return <QcInspectionPage jobId={params?.jobId ?? ''} />
}
