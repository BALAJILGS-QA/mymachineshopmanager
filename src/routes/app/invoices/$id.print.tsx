import { createFileRoute } from '@tanstack/react-router'
import { InvoicePrintPage } from '@/features/invoices/InvoicePrintPage'

export const Route = createFileRoute('/app/invoices/$id/print')({
  component: InvoicePrintPage,
})
