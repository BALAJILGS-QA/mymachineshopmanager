'use client'

import { useParams } from 'next/navigation'
import { ToolDetail } from '@/features/toolroom/pages/ToolDetail'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <ToolDetail toolId={params?.id ?? ''} />
}
