'use client'

// Portal route /app/deliveries/[id]/print (was src/routes/app/deliveries/$id.print.tsx).
// Client Component — jsPDF/print code must never run on the server. The `id`
// param is injected here so the shared page stays router-agnostic.

import { useParams } from 'next/navigation'
import { ChallanPrintPage } from '@/features/deliveries/ChallanPrintPage'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <ChallanPrintPage id={params?.id} />
}
