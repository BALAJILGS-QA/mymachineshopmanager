// Canonical domain value lists. The union TYPES live in `@/types`; these are the
// runtime arrays used to render dropdowns/filters. `satisfies` ties each array to
// its union so adding a value to the type without adding it here (or vice-versa)
// is a compile error — one source of truth for both, no drift.

import type {
  DcStatus,
  InvoiceStatus,
  JobPriority,
  JobStatus,
  PaymentMethod,
  UserStatus,
} from '@/types'

export const JOB_PRIORITIES = [
  'Low',
  'Normal',
  'High',
  'Urgent',
] as const satisfies readonly JobPriority[]

export const JOB_STATUSES = [
  'Draft',
  'Pending',
  'In Progress',
  'On Hold',
  'Completed',
  'Delivered',
  'Cancelled',
] as const satisfies readonly JobStatus[]

export const PAYMENT_METHODS = [
  'Cash',
  'Bank Transfer',
  'UPI',
  'Cheque',
  'Other',
] as const satisfies readonly PaymentMethod[]

export const INVOICE_STATUSES = [
  'Draft',
  'Unpaid',
  'Partially Paid',
  'Paid',
  'Cancelled',
] as const satisfies readonly InvoiceStatus[]

export const DC_STATUSES = ['Open', 'Invoiced', 'Cancelled'] as const satisfies readonly DcStatus[]

// Built-in expense category for the owner withdrawing shop cash for personal use
// ("drawings" / self cash transaction). Always offered in Purchase Management so
// it is available even on installs whose saved settings predate it.
export const CASH_WITHDRAWAL_CATEGORY = 'Cash Withdrawal (Self)'

// Shared status→badge-tone maps (used by list + print views).
export const DC_STATUS_TONE: Record<DcStatus, string> = {
  Open: 'amber',
  Invoiced: 'green',
  Cancelled: 'red',
}

export const USER_STATUS_TONE: Record<UserStatus, string> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
}

// Table pagination.
export const PAGE_SIZES = [25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25
