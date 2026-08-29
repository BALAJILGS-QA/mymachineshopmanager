import { createFileRoute } from '@tanstack/react-router'
import { ChallanPrintPage } from '@/features/deliveries/ChallanPrintPage'

export const Route = createFileRoute('/app/deliveries/$id/print')({
  component: ChallanPrintPage,
})
