// Domain model for the CNC Machine Shop Management System.
// Mirrors PRD section 7 (Data Model). These types are the single source of
// truth shared by the repository, services and UI.

export type ID = string
export type ISODate = string // YYYY-MM-DD
export type ISODateTime = string // full ISO timestamp

export type JobStatus =
  | 'Draft'
  | 'Pending'
  | 'In Progress'
  | 'On Hold'
  | 'Completed'
  | 'Delivered'
  | 'Cancelled'

export type JobPriority = 'Low' | 'Normal' | 'High' | 'Urgent'

export type InvoiceStatus =
  | 'Draft'
  | 'Unpaid'
  | 'Partially Paid'
  | 'Paid'
  | 'Cancelled'

export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque' | 'Other'

export type MaterialOwnerType = 'Company' | 'Shop'

export type StockTxnType = 'Receipt' | 'Issue' | 'Adjustment'

export interface AuditFields {
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Company extends AuditFields {
  id: ID
  code: string
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  billingAddress?: string
  gstin?: string
  active: boolean
  notes?: string
}

export interface Material extends AuditFields {
  id: ID
  code: string
  name: string
  type?: string // grade / type
  unit: string
  description?: string
  defaultRate?: number
  reorderLevel?: number
  active: boolean
}

// Rate list / price master for machined parts (e.g. "Open Well Bracket" ₹16.00).
export interface Product extends AuditFields {
  id: ID
  code: string
  name: string
  rate: number
  unit?: string
  hsn?: string
  active: boolean
}

export interface JobOrder extends AuditFields {
  id: ID
  jobNo: string
  companyId: ID
  customerPo?: string
  partName: string
  partNumber?: string
  materialId?: ID
  orderedQty: number
  completedQty: number
  orderDate: ISODate
  dueDate?: ISODate
  priority: JobPriority
  status: JobStatus
  rate?: number
  notes?: string
  startedAt?: ISODateTime
  completedAt?: ISODateTime
  deliveredAt?: ISODateTime
  operator?: string
}

export interface ProductionEvent {
  id: ID
  jobId: ID
  type: 'Status' | 'Progress' | 'Hold' | 'Start' | 'Complete' | 'Deliver'
  fromStatus?: JobStatus
  toStatus?: JobStatus
  completedQty?: number
  note?: string
  operator?: string
  at: ISODateTime
}

export interface MaterialReceipt extends AuditFields {
  id: ID
  receiptNo: string
  date: ISODate
  materialId: ID
  ownerType: MaterialOwnerType
  companyId?: ID // owning company when ownerType === 'Company'
  jobId?: ID // optional explicit job assignment
  supplier?: string
  quantity: number
  unit: string
  rate?: number
  batchNo?: string
  reference?: string
  notes?: string
}

export interface MaterialIssue extends AuditFields {
  id: ID
  issueNo: string
  date: ISODate
  materialId: ID
  jobId: ID
  companyId?: ID
  quantity: number
  unit: string
  note?: string
}

export interface StockAdjustment extends AuditFields {
  id: ID
  adjNo: string
  date: ISODate
  materialId: ID
  companyId?: ID
  quantity: number // signed: positive = increase, negative = decrease
  unit: string
  reason: string
}

export interface InvoiceLine {
  id: ID
  jobId?: ID
  description: string
  quantity: number
  rate: number
  // amount is derived: quantity * rate
}

export type DcStatus = 'Open' | 'Invoiced' | 'Cancelled'

export interface DcLine {
  id: ID
  jobId?: ID
  description: string
  quantity: number
  unit: string
}

export interface DeliveryChallan extends AuditFields {
  id: ID
  dcNo: string
  date: ISODate
  companyId: ID
  jobId?: ID
  reference?: string // customer PO / reference
  vehicleNo?: string
  lines: DcLine[]
  notes?: string
  status: DcStatus
  invoiceId?: ID // set when an invoice is raised against this DC
}

export interface Invoice extends AuditFields {
  id: ID
  invoiceNo: string
  date: ISODate
  companyId: ID
  billingAddress?: string
  reference?: string
  lines: InvoiceLine[]
  discount: number // absolute amount
  taxPercent: number // e.g. 18 for GST 18%
  status: InvoiceStatus
  notes?: string
  // subtotal, taxAmount, total, paid, outstanding are all derived
}

export interface Payment extends AuditFields {
  id: ID
  paymentNo: string
  date: ISODate
  companyId: ID
  invoiceId?: ID // optional for advance / unallocated
  amount: number
  method: PaymentMethod
  reference?: string
  notes?: string
  isAdvance: boolean
}

export interface Expense extends AuditFields {
  id: ID
  expenseNo: string
  date: ISODate
  category: string
  amount: number
  method: PaymentMethod
  vendor?: string
  reference?: string
  companyId?: ID
  jobId?: ID
  notes?: string
}

export interface AuditLog {
  id: ID
  at: ISODateTime
  entity: string
  entityId: ID
  action: 'create' | 'update' | 'delete' | 'status'
  summary: string
  actor?: string
}

export interface Settings {
  currency: string
  currencySymbol: string
  timezone: string
  defaultTaxPercent: number
  allowOverproduction: boolean
  allowNegativeStock: boolean
  units: string[]
  materialTypes: string[]
  expenseCategories: string[]
  numbering: {
    job: string
    invoice: string
    receipt: string
    issue: string
    adjustment: string
    payment: string
    expense: string
    dc: string
  }
  company: {
    name: string
    address: string
    phone: string
    email: string
    gstin: string
  }
}

// ----- Derived / view models -------------------------------------------------

export interface InvoiceComputed {
  subtotal: number
  taxAmount: number
  total: number
  paid: number
  outstanding: number
}

export interface MaterialStock {
  materialId: ID
  companyId?: ID
  received: number
  issued: number
  adjusted: number
  balance: number
}
