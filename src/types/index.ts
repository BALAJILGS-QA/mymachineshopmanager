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
  // Production Module lifecycle (migration 0069) — extends, does not replace.
  | 'Quality Control'
  | 'QC Approved'
  | 'Rework'
  | 'QC Rejected'
  | 'Ready for Dispatch'
  | 'Delivered'
  | 'Cancelled'

export type JobPriority = 'Low' | 'Normal' | 'High' | 'Urgent'

// 'Settled' = closed via payment + valid/known deductions (and/or an explicitly
// recorded unknown difference) even though cash received < gross invoice value.
// Distinct from 'Paid' (fully collected in money).
export type InvoiceStatus = 'Draft' | 'Unpaid' | 'Partially Paid' | 'Paid' | 'Settled' | 'Cancelled'

export type PaymentMethod =
  'Cash' | 'Bank Transfer' | 'NEFT' | 'RTGS' | 'IMPS' | 'UPI' | 'Cheque' | 'Other'

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
  partNumber?: string // raw-material master business key (with company + name)
  hsn?: string // HSN code
  binNo?: string // storage bin / location
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
  materialRequiredQty?: number // raw-material requirement for this order (reserve-then-consume)
  orderedQty: number
  plannedQty?: number // planned production quantity (defaults to orderedQty)
  completedQty: number // = produced quantity
  rejectedQty?: number // QC-rejected quantity (aggregate across inspections)
  acceptedQty?: number // QC-accepted quantity (aggregate; FG-eligible)
  reworkQty?: number // outstanding rework quantity
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
  tenantId?: ID // stamped server-side; used for tenant-scoped storage paths
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

// ---- Material reservation (migration 0074) ----
export type MaterialReservationKind = 'Reserve' | 'Release' | 'Consume'

export interface MaterialReservation {
  id: ID
  jobId: ID
  materialId: ID
  ownerScope?: string | null // null = own/shop stock; company_id = that customer's stock
  kind: MaterialReservationKind
  quantity: number
  unit?: string
  issueId?: ID // the physical material_issue created when kind = 'Consume'
  note?: string
  actorEmail?: string
  createdAt?: ISODateTime
}

// Per-order material status returned by the job_material_status RPC.
export interface JobMaterialStatus {
  materialId: ID
  ownerScope?: string | null
  unit?: string
  required: number
  reserved: number
  consumed: number
  free: number
  balance: number
}

// ---- Production masters (migration 0075) ----
export type MachineStatus = 'Active' | 'Maintenance' | 'Inactive'
export type JobOperationStatus = 'Planned' | 'In Progress' | 'Completed' | 'Skipped'

export interface WorkCenter extends AuditFields {
  id: ID
  code?: string
  name: string
  description?: string
  capacityHoursPerDay?: number // available production hours/day (null = uncapped)
  active: boolean
  tenantId?: ID
}

export interface Machine extends AuditFields {
  id: ID
  code?: string
  name: string
  machineType?: string
  workCenterId?: ID
  status: MachineStatus
  hourlyRate?: number
  notes?: string
  active: boolean
  tenantId?: ID
}

export interface Operation extends AuditFields {
  id: ID
  code?: string
  name: string
  description?: string
  defaultWorkCenterId?: ID
  active: boolean
  tenantId?: ID
}

export interface Routing extends AuditFields {
  id: ID
  code?: string
  name: string
  materialId?: ID
  description?: string
  active: boolean
  tenantId?: ID
}

export interface RoutingStep extends AuditFields {
  id: ID
  routingId: ID
  seq: number
  operationId?: ID
  workCenterId?: ID
  machineId?: ID
  setupMin?: number
  cycleMin?: number
  notes?: string
  tenantId?: ID
}

// Operation sequence attached to a single production order (snapshots the
// master names at attach time so the order's plan is stable).
export interface JobOperation extends AuditFields {
  id: ID
  jobId: ID
  seq: number
  operationId?: ID
  operationName?: string
  workCenterId?: ID
  workCenterName?: string
  machineId?: ID
  machineName?: string
  setupMin?: number
  cycleMin?: number
  status: JobOperationStatus
  notes?: string
  sourceRoutingId?: ID
  // Execution (Phase 5)
  startedAt?: string
  completedAt?: string
  operator?: string
  operatorEmployeeId?: ID // HRM employee assigned as operator (0080)
  qtyCompleted?: number
  actualMinutes?: number
  tenantId?: ID
}

// ---- Labor / resource time tracking (migration 0080) ----
export type LaborActivity = 'Run' | 'Setup' | 'Idle' | 'Downtime' | 'QC' | 'Rework'

export interface LaborTimeLog {
  id: ID
  jobId?: ID
  jobOperationId?: ID
  employeeId: ID
  machineId?: ID
  activity: LaborActivity
  qcInspectionId?: ID
  startedAt: ISODateTime
  endedAt?: ISODateTime
  minutes?: number
  downtimeReason?: string
  note?: string
  loggedBy?: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  tenantId?: ID
}

// ---- Production Module (migrations 0070/0072) ----

export type QcDecision = 'Approved' | 'Rejected' | 'Rework'
export type QcResult = 'Pass' | 'Fail' | 'Partial'

export interface QcInspection {
  id: ID
  inspectionNo?: string
  jobId: ID
  inspector?: string
  inspectorEmployeeId?: ID // HRM employee who inspected (0080)
  inspectedAt: ISODateTime
  producedQty: number
  acceptedQty: number
  rejectedQty: number
  reworkQty: number
  result?: QcResult
  decision?: QcDecision
  remarks?: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface QcDimension {
  id: ID
  inspectionId: ID
  seq: number
  name: string
  nominal?: number
  unit?: string
  tolPlus?: number
  tolMinus?: number
  specification?: string
  createdAt: ISODateTime
}

export interface QcMeasurement {
  id: ID
  dimensionId: ID
  sampleNo: number
  measuredValue?: number
  isPass?: boolean | null
  createdAt: ISODateTime
}

// A dimension plus its 1..10 sample measurements (view-model for the grid).
export interface QcDimensionInput {
  seq: number
  name: string
  nominal?: number
  unit?: string
  tolPlus?: number
  tolMinus?: number
  specification?: string
  samples: { sampleNo: number; value?: number }[]
}

export type FgTxnType = 'Receipt' | 'Dispatch' | 'Adjustment'

export interface FinishedGoodsEntry {
  id: ID
  entryNo?: string
  jobId: ID
  qcInspectionId?: ID
  txnType: FgTxnType
  qtyIn: number
  qtyOut: number
  companyId?: ID
  binNo?: string
  referenceType?: string
  referenceId?: ID
  note?: string
  createdBy?: string
  createdAt: ISODateTime
}

export interface FinishedGoodsBalance {
  jobId: ID
  received: number
  dispatched: number
  balance: number
  lastMovement?: ISODateTime
}

export type MachineProgramStatus = 'Draft' | 'Review' | 'Approved' | 'Superseded'

export interface MachineProgram {
  id: ID
  programNo?: string
  jobId: ID
  process?: string
  controller?: string
  controllerOther?: string
  machine?: string
  operation?: string
  status: MachineProgramStatus
  activeRevisionId?: ID
  notes?: string
  createdBy?: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface MachineProgramRevision {
  id: ID
  programId: ID
  revNo: number
  storagePath?: string
  fileName?: string
  fileSize?: number
  mime?: string
  changeReason?: string
  status: MachineProgramStatus
  createdBy?: string
  createdAt: ISODateTime
  approvedBy?: string
  approvedAt?: ISODateTime
}

export interface JobOrderDocument {
  id: ID
  jobId: ID
  companyId?: ID
  kind: 'drawing' | 'document'
  fileName: string
  storagePath: string
  mime: string
  fileSize?: number
  version: number
  isActive: boolean
  supersededBy?: ID
  uploadedBy?: string
  uploadedAt: ISODateTime
  createdAt: ISODateTime
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
  // The specific received stock (material_receipts row) this issue draws from.
  // Set for source-allocated dispatches; unset for legacy/aggregate movements.
  sourceReceiptId?: ID
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
  // When set, the adjustment applies to a specific received stock (e.g. a
  // dispatch reversal restoring that source's available quantity).
  sourceReceiptId?: ID
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
  // The specific received stock (material_receipts row) this line dispatches
  // from. Mandatory for customer stock so the deduction is fully traceable.
  sourceReceiptId?: ID
  unit?: string
}

export type DcStatus = 'Open' | 'Invoiced' | 'Cancelled'

export interface DcLine {
  id: ID
  jobId?: ID
  materialId?: ID // the inventory material this line dispatches
  ownerType?: MaterialOwnerType // 'Company' = customer's stock, 'Shop' = own stock
  // The specific received stock (material_receipts row) this line consumes.
  // Mandatory for customer stock; each source is dispatched independently.
  sourceReceiptId?: ID
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

// A payment can be split across several invoices; each slice of the bank money
// applied to one invoice is an allocation. Σ(allocations for a payment) ≤ the
// payment amount; any remainder is on-account / advance.
export interface PaymentAllocation {
  id: ID
  paymentId: ID
  invoiceId: ID
  amount: number
  createdAt?: ISODateTime
  createdBy?: string
}

// Deduction categories. 'Unidentified' is the unknown-difference bucket recorded
// when the customer paid less than the gross without giving a breakup; it can be
// reclassified into known types later (audited).
export type DeductionType =
  | 'TDS'
  | 'Transportation'
  | 'Freight'
  | 'Commission'
  | 'Retention'
  | 'Discount'
  | 'Other'
  | 'Unidentified'

export type DeductionCalcType = 'percent' | 'fixed'

// An amount the customer withheld from a specific invoice (TDS/freight/etc.), or
// an as-yet-unexplained shortfall ('Unidentified'). Bridges bank-received to the
// gross invoice value: settled = allocation + deductions.
export interface PaymentDeduction {
  id: ID
  paymentId: ID
  invoiceId?: ID
  deductionType: DeductionType
  calcType: DeductionCalcType
  rate?: number // percentage when calcType === 'percent'
  amount: number
  reference?: string
  remarks?: string
  createdAt?: ISODateTime
  createdBy?: string
  updatedAt?: ISODateTime
  updatedBy?: string
}

export interface Expense extends AuditFields {
  id: ID
  expenseNo: string
  date: ISODate
  category: string
  amount: number
  method: PaymentMethod
  vendor?: string
  // Receiver name — who the money was paid to (e.g. self for a cash withdrawal).
  // Distinct from vendor/supplier (who a purchase was made from).
  payee?: string
  payeeEmployeeId?: ID // optional link to the HRM employee registry (0083)
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

// One row of the per-source stock view (material_receipt_stock): a single
// received stock with its dispatch split. Available = received − totalDispatched
// (+ adjustments). This is the source of truth for per-source available stock.
export interface MaterialReceiptStock {
  receiptId: ID
  receiptNo: string
  date: ISODate
  materialId: ID
  companyId?: ID // null = own/shop stock
  ownerType: MaterialOwnerType
  ownership: 'Shop' | 'Company'
  sourceDocNo?: string // the received challan/invoice number (receipt.reference)
  supplier?: string
  unit: string
  received: number
  dcQty: number
  invoiceQty: number
  otherOut: number
  totalDispatched: number
  adjusted: number
  available: number
  status: 'Available' | 'Fully Dispatched'
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

// SuperAdmin — the platform owner (email-based, see auth.tsx); above all users.
// Admin — an approved shop user with access to every module. User — an approved
// shop user restricted to the modules the super admin granted (see `permissions`).
export type UserRole = 'SuperAdmin' | 'Admin' | 'User'
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
  // Top-level module keys this user may access (see src/features/access/modules.ts).
  // Only meaningful for role 'User'. Undefined = never configured by the super
  // admin → treated as full access (legacy accounts are not locked out); an empty
  // array means "no modules beyond the always-on Dashboard".
  permissions?: string[]
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
  paid: number // money applied to the invoice (allocations + legacy direct links)
  outstanding: number // total − settled
  knownDeductions: number // TDS/freight/etc. recorded against this invoice
  unknownDeduction: number // unexplained shortfall recorded against this invoice
  settled: number // paid + knownDeductions + unknownDeduction
}

export interface MaterialStock {
  materialId: ID
  companyId?: ID
  received: number
  issued: number
  adjusted: number
  balance: number
}
