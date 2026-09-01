import { createFileRoute } from '@tanstack/react-router'
import { InvoicePrintPage } from '@/features/invoices/InvoicePrintPage'

// Route wrapper injects the `id` param — the page itself is router-agnostic.
export const Route = createFileRoute('/app/invoices/$id/print')({
  component: RouteComponent,
})

function RouteComponent() {
  const { id } = Route.useParams()
  return <InvoicePrintPage id={id} />
}
