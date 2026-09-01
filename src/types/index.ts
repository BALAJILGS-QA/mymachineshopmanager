// Domain model for the CNC Machine Shop Management System.
// Mirrors PRD section 7 (Data Model). These types are the single source of
// truth shared by the repository, services and UI.

export type ID = string
export type ISODate = string // YYYY-MM-DD
export type ISODateTime = string // full ISO timestamp

export type JobStatus =
  'Draft' | 'Pending' | 'In Progress' | 'On Hold' | 'Completed' | 'Delivered' | 'Cancelled'

export type JobPriority = 'Low' | 'Normal' | 'High' | 'Urgent'

export type InvoiceStatus = 'Draft' | 'Unpaid' | 'Partially Paid' | 'Paid' | 'Cancelled'

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
  companyId?: ID // set = this customer's material; null = shared / own
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
  rejectedQty?: number // QC-rejected quantity recorded at completion
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
  // Optional stock link: when materialId is set, creating the invoice deducts
  // this quantity from stock (reference INVOICE). ownerType picks the scope
  // ('Company' = customer's stock, 'Shop' = own). Lines imported from a delivery
  // challan leave these unset — the challan already deducted, so no double count.
  materialId?: ID
  ownerType?: MaterialOwnerType
  unit?: string
}

export type DcStatus = 'Open' | 'Invoiced' | 'Cancelled'

export interface DcLine {
  id: ID
  jobId?: ID
  materialId?: ID // the inventory material this line dispatches
  ownerType?: MaterialOwnerType // 'Company' = customer's stock, 'Shop' = own stock
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
  shippingAddress?: string // ship-to; when empty, same as billing
  reference?: string
  dcReference?: string // delivery-challan number(s) this invoice was raised against
  lines: InvoiceLine[]
  discount: number // absolute amount
  taxPercent: number // combined GST % (CGST + SGST) — kept for computations
  cgstPercent?: number // e.g. 9
  sgstPercent?: number // e.g. 9
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

// A purchase of the shop's OWN raw material (cost + GST), linked to the stock
// receipt it created and the expense it recorded.
export interface OwnMaterialPurchase extends AuditFields {
  id: ID
  supplier?: string
  materialId: ID
  purchaseDate: ISODate
  quantity: number
  unit: string
  totalCost: number
  totalGst: number
  totalAmount: number
  notes?: string
  receiptId?: ID
  expenseId?: ID
}

// One row of the unified inventory ledger view (receipts + issues + adjustments).
export interface InventoryLedgerRow {
  id: ID
  materialId: ID
  companyId?: ID // null = own/shop stock
  ownership: 'Shop' | 'Company'
  txnType: 'Receipt' | 'Issue' | 'Adjustment'
  qtyIn: number
  qtyOut: number
  unit: string
  date: ISODate
  docNo: string
  referenceType?: string
  referenceId?: ID
  note?: string
  createdAt: ISODateTime
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

// ---- Supply chain / subcontracting -----------------------------------------

// A supplier / subcontractor. Also used as the supplier for own-material buys.
export interface Vendor extends AuditFields {
  id: ID
  code: string
  name: string
  gstin?: string
  phone?: string
  email?: string
  address?: string
  active: boolean
  notes?: string
}

export type SubcontractStatus = 'Open' | 'Sent' | 'Partially Received' | 'Received'

// A quantity of a material (customer- or shop-owned) sent to a vendor for job
// work. Quantities track the round trip; "at vendor" = sentQty - receivedQty -
// rejectedQty (derived).
export interface SubcontractOrder extends AuditFields {
  id: ID
  scNo: string
  date: ISODate
  vendorId: ID
  materialId: ID
  ownerType: MaterialOwnerType
  companyId?: ID // when ownerType === 'Company'
  jobId?: ID
  process?: string
  unit: string
  sentQty: number
  receivedQty: number
  rejectedQty: number
  status: SubcontractStatus
  notes?: string
}

export type SubcontractDocDirection = 'OUT' | 'IN'
export type SubcontractDocKind = 'DC' | 'INVOICE'

// The paperwork for a subcontract: our outward delivery challan (OUT) and the
// vendor's return challan / job-work invoice (IN).
export interface SubcontractDoc extends AuditFields {
  id: ID
  docNo: string
  scId: ID
  direction: SubcontractDocDirection
  docKind: SubcontractDocKind
  vendorRef?: string
  date: ISODate
  quantity: number
  rejected: number
  unit: string
  amount?: number // job-work charge on a vendor invoice
  expenseId?: ID
  notes?: string
}

export interface Settings {
  currency: string
  currencySymbol: string
  timezone: string
  defaultTaxPercent: number
  defaultCgstPercent: number
  defaultSgstPercent: number
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
    // Signatory type — drives the "For <shop>" footer on printed documents.
    // true → "Proprietor"; false → "Partner / Authorised Signatory".
    isProprietor: boolean
    // Uploaded branding (data URLs). logoUrl → sidebar/header mark; faviconUrl →
    // browser tab icon. When empty, the app's default Sree Balaji mark is used.
    logoUrl?: string
    faviconUrl?: string
    // SEO — applied globally to the app's page title, description and keywords.
    seoDescription: string
    seoKeywords: string
  }
}

// ----- Users & registration approval ----------------------------------------

export type UserRole = 'SuperAdmin' | 'User'
export type UserStatus = 'pending' | 'approved' | 'rejected'

// A registered account. Regular users sign up and start as 'pending' — they
// cannot enter the app until a SuperAdmin approves them. passwordHash is used
// only in local (localStorage) mode; in Supabase mode passwords live in
// Supabase Auth and this record only carries profile + approval state.
export interface AppUser {
  id: ID
  email: string // login identifier (email everywhere; also used as username in local mode)
  fullName: string
  companyName: string
  phone: string
  address: string
  gstin: string
  role: UserRole
  status: UserStatus
  passwordHash?: string
  createdAt: ISODate
  decidedAt?: ISODate
  decidedBy?: string
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
