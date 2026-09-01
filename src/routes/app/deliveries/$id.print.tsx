import { createFileRoute } from '@tanstack/react-router'
import { ChallanPrintPage } from '@/features/deliveries/ChallanPrintPage'

// Route wrapper injects the `id` param — the page itself is router-agnostic.
export const Route = createFileRoute('/app/deliveries/$id/print')({
  component: RouteComponent,
})

function RouteComponent() {
  const { id } = Route.useParams()
  return <ChallanPrintPage id={id} />
}
