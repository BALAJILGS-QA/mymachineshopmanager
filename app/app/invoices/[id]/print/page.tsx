'use client'

// Portal route /app/invoices/[id]/print (was src/routes/app/invoices/$id.print.tsx).
// Client Component — jsPDF/print code must never run on the server. The `id`
// param is injected here so the shared page stays router-agnostic.

import { useParams } from 'next/navigation'
import { InvoicePrintPage } from '@/features/invoices/InvoicePrintPage'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <InvoicePrintPage id={params?.id} />
}
