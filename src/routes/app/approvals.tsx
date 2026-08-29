import { createFileRoute } from '@tanstack/react-router'
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage'

export const Route = createFileRoute('/app/approvals')({
  component: ApprovalsPage,
})
