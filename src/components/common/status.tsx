import type { InvoiceStatus, JobPriority, JobStatus } from '@/types'
import { Badge } from '@/components/ui/primitives'

const JOB_TONE: Record<JobStatus, string> = {
  Draft: 'gray',
  Pending: 'amber',
  'In Progress': 'blue',
  'On Hold': 'violet',
  Completed: 'green',
  Delivered: 'green',
  Cancelled: 'red',
}

const PRIORITY_TONE: Record<JobPriority, string> = {
  Low: 'slate',
  Normal: 'blue',
  High: 'amber',
  Urgent: 'red',
}

const INVOICE_TONE: Record<InvoiceStatus, string> = {
  Draft: 'gray',
  Unpaid: 'amber',
  'Partially Paid': 'blue',
  Paid: 'green',
  Cancelled: 'red',
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={JOB_TONE[status]}>{status}</Badge>
}

export function PriorityBadge({ priority }: { priority: JobPriority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge tone={INVOICE_TONE[status]}>{status}</Badge>
}
