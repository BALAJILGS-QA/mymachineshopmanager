// Repository / service layer. Owns ALL business rules (PRD 11 & 13):
// uniqueness, non-negative stock, outstanding calculation, referential
// integrity, audit logging and document numbering. The UI never mutates the
// store directly — it goes through these functions.

import type {
  Company,
  DeliveryChallan,
  Expense,
  Invoice,
  JobOrder,
  JobStatus,
  Material,
  MaterialIssue,
  MaterialReceipt,
  Payment,
  Product,
  ProductionEvent,
  Settings,
  StockAdjustment,
} from '@/types'
import { nowISO, todayISO } from '@/lib/format'
import { formatDocNo, uid } from '@/lib/id'
import type { Database, Sequences } from './db'
import { getDb, mutate } from './db'
import {
  computeInvoice,
  deriveInvoiceStatus,
  materialStock,
} from './computations'

export class BusinessRuleError extends Error {}

function audit(
  db: Database,
  entity: string,
  entityId: string,
  action: 'create' | 'update' | 'delete' | 'status',
  summary: string,
) {
  db.auditLog.unshift({
    id: uid('aud_'),
    at: nowISO(),
    entity,
    entityId,
    action,
    summary,
  })
  if (db.auditLog.length > 1000) db.auditLog.length = 1000
}

function nextNo(
  db: Database,
  seqKey: keyof Sequences,
  pattern: string,
): string {
  const next = db.sequences[seqKey] + 1
  db.sequences[seqKey] = next
  return formatDocNo(pattern, next)
}

// ------------------------------------------------------------------ Settings
export const settingsRepo = {
  get: (): Settings => getDb().settings,
  update: (patch: Partial<Settings>): Settings =>
    mutate((db) => {
      db.settings = { ...db.settings, ...patch }
      audit(db, 'Settings', 'settings', 'update', 'Settings updated')
      return db.settings
    }),
}

// ----------------------------------------------------------------- Companies
export const companyRepo = {
  list: (): Company[] => getDb().companies,
  get: (id: string) => getDb().companies.find((c) => c.id === id),
  create: (
    input: Omit<Company, 'id' | 'code' | 'createdAt' | 'updatedAt'> & {
      code?: string
    },
  ): Company =>
    mutate((db) => {
      const name = input.name.trim()
      if (!name) throw new BusinessRuleError('Company name is required')
      let code = input.code?.trim()
      if (code && db.companies.some((c) => c.code === code)) {
        throw new BusinessRuleError(`Customer code "${code}" already exists`)
      }
      if (!code) {
        db.sequences.companyCode += 1
        code = `C${String(db.sequences.companyCode).padStart(3, '0')}`
      }
      const ts = nowISO()
      const company: Company = {
        ...input,
        name,
        code,
        id: uid('cmp_'),
        createdAt: ts,
        updatedAt: ts,
      }
      db.companies.push(company)
      audit(db, 'Company', company.id, 'create', `Created company ${name}`)
      return company
    }),
  update: (id: string, patch: Partial<Company>): Company =>
    mutate((db) => {
      const company = db.companies.find((c) => c.id === id)
      if (!company) throw new BusinessRuleError('Company not found')
      if (patch.code && patch.code !== company.code) {
        if (db.companies.some((c) => c.code === patch.code && c.id !== id)) {
          throw new BusinessRuleError(`Customer code "${patch.code}" already exists`)
        }
      }
      Object.assign(company, patch, { updatedAt: nowISO() })
      audit(db, 'Company', id, 'update', `Updated company ${company.name}`)
      return company
    }),
  remove: (id: string): void =>
    mutate((db) => {
      const hasTxns =
        db.jobs.some((j) => j.companyId === id) ||
        db.invoices.some((i) => i.companyId === id) ||
        db.payments.some((p) => p.companyId === id) ||
        db.receipts.some((r) => r.companyId === id) ||
        db.expenses.some((e) => e.companyId === id)
      if (hasTxns) {
        throw new BusinessRuleError(
          'Company has transactions and cannot be deleted. Mark it inactive instead.',
        )
      }
      db.companies = db.companies.filter((c) => c.id !== id)
      audit(db, 'Company', id, 'delete', 'Deleted company')
    }),
}

// ----------------------------------------------------------------- Materials
export const materialRepo = {
  list: (): Material[] => getDb().materials,
  get: (id: string) => getDb().materials.find((m) => m.id === id),
  create: (
    input: Omit<Material, 'id' | 'code' | 'createdAt' | 'updatedAt'> & {
      code?: string
    },
  ): Material =>
    mutate((db) => {
      if (!input.name.trim()) throw new BusinessRuleError('Material name is required')
      if (!input.unit) throw new BusinessRuleError('Unit is required')
      let code = input.code?.trim()
      if (code && db.materials.some((m) => m.code === code)) {
        throw new BusinessRuleError(`Material code "${code}" already exists`)
      }
      if (!code) {
        db.sequences.materialCode += 1
        code = `M${String(db.sequences.materialCode).padStart(3, '0')}`
      }
      const ts = nowISO()
      const material: Material = {
        ...input,
        name: input.name.trim(),
        code,
        id: uid('mat_'),
        createdAt: ts,
        updatedAt: ts,
      }
      db.materials.push(material)
      audit(db, 'Material', material.id, 'create', `Created material ${material.name}`)
      return material
    }),
  update: (id: string, patch: Partial<Material>): Material =>
    mutate((db) => {
      const material = db.materials.find((m) => m.id === id)
      if (!material) throw new BusinessRuleError('Material not found')
      if (patch.code && patch.code !== material.code) {
        if (db.materials.some((m) => m.code === patch.code && m.id !== id)) {
          throw new BusinessRuleError(`Material code "${patch.code}" already exists`)
        }
      }
      Object.assign(material, patch, { updatedAt: nowISO() })
      audit(db, 'Material', id, 'update', `Updated material ${material.name}`)
      return material
    }),
  remove: (id: string): void =>
    mutate((db) => {
      const used =
        db.receipts.some((r) => r.materialId === id) ||
        db.issues.some((i) => i.materialId === id) ||
        db.adjustments.some((a) => a.materialId === id) ||
        db.jobs.some((j) => j.materialId === id)
      if (used) {
        throw new BusinessRuleError(
          'Material is referenced by transactions. Mark it inactive instead.',
        )
      }
      db.materials = db.materials.filter((m) => m.id !== id)
      audit(db, 'Material', id, 'delete', 'Deleted material')
    }),
}

// -------------------------------------------------- Products (rate list)
export const productRepo = {
  list: (): Product[] => getDb().products,
  get: (id: string) => getDb().products.find((p) => p.id === id),
  create: (
    input: Omit<Product, 'id' | 'code' | 'createdAt' | 'updatedAt'> & { code?: string },
  ): Product =>
    mutate((db) => {
      if (!input.name.trim()) throw new BusinessRuleError('Product name is required')
      if (input.rate < 0) throw new BusinessRuleError('Rate cannot be negative')
      let code = input.code?.trim()
      if (code && db.products.some((p) => p.code === code)) {
        throw new BusinessRuleError(`Product code "${code}" already exists`)
      }
      if (!code) {
        db.sequences.productCode += 1
        code = `P${String(db.sequences.productCode).padStart(3, '0')}`
      }
      const ts = nowISO()
      const product: Product = {
        ...input,
        name: input.name.trim(),
        code,
        id: uid('prd_'),
        createdAt: ts,
        updatedAt: ts,
      }
      db.products.push(product)
      audit(db, 'Product', product.id, 'create', `Added product ${product.name}`)
      return product
    }),
  update: (id: string, patch: Partial<Product>): Product =>
    mutate((db) => {
      const product = db.products.find((p) => p.id === id)
      if (!product) throw new BusinessRuleError('Product not found')
      if (patch.rate !== undefined && patch.rate < 0) {
        throw new BusinessRuleError('Rate cannot be negative')
      }
      Object.assign(product, patch, { updatedAt: nowISO() })
      audit(db, 'Product', id, 'update', `Updated product ${product.name}`)
      return product
    }),
  remove: (id: string): void =>
    mutate((db) => {
      db.products = db.products.filter((p) => p.id !== id)
      audit(db, 'Product', id, 'delete', 'Deleted product')
    }),
}

// ---------------------------------------------------------------- Job Orders
type JobInput = Omit<
  JobOrder,
  'id' | 'jobNo' | 'completedQty' | 'createdAt' | 'updatedAt'
> & { completedQty?: number }

function validateJob(db: Database, input: Partial<JobOrder>) {
  if (input.orderedQty !== undefined && input.orderedQty <= 0) {
    throw new BusinessRuleError('Ordered quantity must be greater than zero')
  }
  if (input.completedQty !== undefined && input.completedQty < 0) {
    throw new BusinessRuleError('Completed quantity cannot be negative')
  }
  const ordered = input.orderedQty
  const completed = input.completedQty
  if (
    !db.settings.allowOverproduction &&
    ordered !== undefined &&
    completed !== undefined &&
    completed > ordered
  ) {
    throw new BusinessRuleError(
      'Completed quantity cannot exceed ordered quantity',
    )
  }
}

export const jobRepo = {
  list: (): JobOrder[] => getDb().jobs,
  get: (id: string) => getDb().jobs.find((j) => j.id === id),
  create: (input: JobInput): JobOrder =>
    mutate((db) => {
      if (!input.partName.trim()) throw new BusinessRuleError('Part name is required')
      if (!db.companies.some((c) => c.id === input.companyId)) {
        throw new BusinessRuleError('Select a valid company')
      }
      validateJob(db, input)
      const ts = nowISO()
      const job: JobOrder = {
        ...input,
        partName: input.partName.trim(),
        completedQty: input.completedQty ?? 0,
        id: uid('job_'),
        jobNo: nextNo(db, 'job', db.settings.numbering.job),
        createdAt: ts,
        updatedAt: ts,
      }
      db.jobs.push(job)
      audit(db, 'JobOrder', job.id, 'create', `Created job ${job.jobNo}`)
      return job
    }),
  update: (id: string, patch: Partial<JobOrder>): JobOrder =>
    mutate((db) => {
      const job = db.jobs.find((j) => j.id === id)
      if (!job) throw new BusinessRuleError('Job order not found')
      validateJob(db, { ...job, ...patch })
      Object.assign(job, patch, { updatedAt: nowISO() })
      audit(db, 'JobOrder', id, 'update', `Updated job ${job.jobNo}`)
      return job
    }),
  remove: (id: string): void =>
    mutate((db) => {
      const job = db.jobs.find((j) => j.id === id)
      if (!job) return
      const used =
        db.issues.some((i) => i.jobId === id) ||
        db.invoices.some((inv) => inv.lines.some((l) => l.jobId === id))
      if (used) {
        throw new BusinessRuleError(
          'Job has material issues or invoice lines. Cancel it instead of deleting.',
        )
      }
      db.jobs = db.jobs.filter((j) => j.id !== id)
      db.productionEvents = db.productionEvents.filter((e) => e.jobId !== id)
      audit(db, 'JobOrder', id, 'delete', `Deleted job ${job.jobNo}`)
    }),

  // Production transition — records a ProductionEvent and updates the job.
  transition: (
    id: string,
    to: JobStatus,
    opts: { completedQty?: number; note?: string; operator?: string } = {},
  ): JobOrder =>
    mutate((db) => {
      const job = db.jobs.find((j) => j.id === id)
      if (!job) throw new BusinessRuleError('Job order not found')
      const from = job.status
      const now = nowISO()

      if (opts.completedQty !== undefined) {
        if (opts.completedQty < 0) {
          throw new BusinessRuleError('Completed quantity cannot be negative')
        }
        if (!db.settings.allowOverproduction && opts.completedQty > job.orderedQty) {
          throw new BusinessRuleError(
            'Completed quantity cannot exceed ordered quantity',
          )
        }
        job.completedQty = opts.completedQty
      }

      if (to === 'In Progress' && !job.startedAt) {
        job.startedAt = now
        if (opts.operator) job.operator = opts.operator
      }
      if (to === 'Completed') {
        job.completedAt = now
        if (job.completedQty === 0) job.completedQty = job.orderedQty
      }
      if (to === 'Delivered') {
        job.deliveredAt = now
        if (!job.completedAt) job.completedAt = now
      }

      job.status = to
      job.updatedAt = now

      const event: ProductionEvent = {
        id: uid('pev_'),
        jobId: id,
        type:
          to === 'In Progress'
            ? 'Start'
            : to === 'On Hold'
            ? 'Hold'
            : to === 'Completed'
            ? 'Complete'
            : to === 'Delivered'
            ? 'Deliver'
            : 'Status',
        fromStatus: from,
        toStatus: to,
        completedQty: opts.completedQty,
        note: opts.note,
        operator: opts.operator,
        at: now,
      }
      db.productionEvents.unshift(event)
      audit(db, 'JobOrder', id, 'status', `${job.jobNo}: ${from} → ${to}`)
      return job
    }),

  events: (jobId: string): ProductionEvent[] =>
    getDb()
      .productionEvents.filter((e) => e.jobId === jobId)
      .sort((a, b) => (a.at < b.at ? 1 : -1)),
}

// -------------------------------------------------------------- Material txns
export const stockRepo = {
  balance: (materialId: string, companyId?: string) =>
    materialStock(getDb(), materialId, companyId),

  receipt: (
    input: Omit<MaterialReceipt, 'id' | 'receiptNo' | 'createdAt' | 'updatedAt'>,
  ): MaterialReceipt =>
    mutate((db) => {
      if (!db.materials.some((m) => m.id === input.materialId)) {
        throw new BusinessRuleError('Select a valid material')
      }
      if (input.quantity <= 0) throw new BusinessRuleError('Quantity must be greater than zero')
      if (input.ownerType === 'Company' && !input.companyId) {
        throw new BusinessRuleError('Select the owning company')
      }
      const ts = nowISO()
      const receipt: MaterialReceipt = {
        ...input,
        companyId: input.ownerType === 'Shop' ? undefined : input.companyId,
        id: uid('rcp_'),
        receiptNo: nextNo(db, 'receipt', db.settings.numbering.receipt),
        createdAt: ts,
        updatedAt: ts,
      }
      db.receipts.unshift(receipt)
      audit(db, 'MaterialReceipt', receipt.id, 'create', `Received ${receipt.receiptNo}`)
      return receipt
    }),

  issue: (
    input: Omit<MaterialIssue, 'id' | 'issueNo' | 'createdAt' | 'updatedAt'>,
    override = false,
  ): MaterialIssue =>
    mutate((db) => {
      const job = db.jobs.find((j) => j.id === input.jobId)
      if (!job) throw new BusinessRuleError('Select a valid job order')
      if (!db.materials.some((m) => m.id === input.materialId)) {
        throw new BusinessRuleError('Select a valid material')
      }
      if (input.quantity <= 0) throw new BusinessRuleError('Quantity must be greater than zero')

      const companyId = input.companyId ?? job.companyId
      // Availability is checked against the overall material pool (company &
      // shop owned). Ownership is retained on the issue for company-wise
      // reporting, but shop-owned stock is usable for any job.
      const available = materialStock(db, input.materialId).balance
      if (!db.settings.allowNegativeStock && !override && input.quantity > available) {
        throw new BusinessRuleError(
          `Only ${available} in stock for this material. Enable override to issue anyway.`,
        )
      }
      const ts = nowISO()
      const issue: MaterialIssue = {
        ...input,
        companyId,
        id: uid('iss_'),
        issueNo: nextNo(db, 'issue', db.settings.numbering.issue),
        createdAt: ts,
        updatedAt: ts,
      }
      db.issues.unshift(issue)
      audit(db, 'MaterialIssue', issue.id, 'create', `Issued ${issue.issueNo} to ${job.jobNo}`)
      return issue
    }),

  adjust: (
    input: Omit<StockAdjustment, 'id' | 'adjNo' | 'createdAt' | 'updatedAt'>,
  ): StockAdjustment =>
    mutate((db) => {
      if (!db.materials.some((m) => m.id === input.materialId)) {
        throw new BusinessRuleError('Select a valid material')
      }
      if (input.quantity === 0) throw new BusinessRuleError('Adjustment quantity cannot be zero')
      if (!input.reason.trim()) throw new BusinessRuleError('A reason is required for adjustments')
      const projected =
        materialStock(db, input.materialId, input.companyId).balance + input.quantity
      if (!db.settings.allowNegativeStock && projected < 0) {
        throw new BusinessRuleError('Adjustment would make stock negative')
      }
      const ts = nowISO()
      const adj: StockAdjustment = {
        ...input,
        reason: input.reason.trim(),
        id: uid('adj_'),
        adjNo: nextNo(db, 'adjustment', db.settings.numbering.adjustment),
        createdAt: ts,
        updatedAt: ts,
      }
      db.adjustments.unshift(adj)
      audit(db, 'StockAdjustment', adj.id, 'create', `Adjusted ${adj.adjNo}`)
      return adj
    }),

  removeReceipt: (id: string) =>
    mutate((db) => {
      db.receipts = db.receipts.filter((r) => r.id !== id)
      audit(db, 'MaterialReceipt', id, 'delete', 'Deleted receipt')
    }),
  removeIssue: (id: string) =>
    mutate((db) => {
      db.issues = db.issues.filter((i) => i.id !== id)
      audit(db, 'MaterialIssue', id, 'delete', 'Deleted issue')
    }),
}

// ----------------------------------------------------- Delivery Challans
export const dcRepo = {
  list: (): DeliveryChallan[] => getDb().deliveryChallans,
  get: (id: string) => getDb().deliveryChallans.find((d) => d.id === id),

  create: (
    input: Omit<DeliveryChallan, 'id' | 'dcNo' | 'createdAt' | 'updatedAt'>,
  ): DeliveryChallan =>
    mutate((db) => {
      if (!db.companies.some((c) => c.id === input.companyId)) {
        throw new BusinessRuleError('Select a valid company')
      }
      if (!input.lines.length) throw new BusinessRuleError('Add at least one item')
      for (const l of input.lines) {
        if (l.quantity <= 0) throw new BusinessRuleError('Item quantity must be greater than zero')
      }
      const ts = nowISO()
      const dc: DeliveryChallan = {
        ...input,
        id: uid('dc_'),
        dcNo: nextNo(db, 'dc', db.settings.numbering.dc),
        createdAt: ts,
        updatedAt: ts,
      }
      db.deliveryChallans.unshift(dc)
      audit(db, 'DeliveryChallan', dc.id, 'create', `Created challan ${dc.dcNo}`)
      return dc
    }),

  update: (id: string, patch: Partial<DeliveryChallan>): DeliveryChallan =>
    mutate((db) => {
      const dc = db.deliveryChallans.find((d) => d.id === id)
      if (!dc) throw new BusinessRuleError('Delivery challan not found')
      if (dc.status === 'Invoiced' && patch.lines) {
        throw new BusinessRuleError('Cannot edit items on an invoiced challan')
      }
      Object.assign(dc, patch, { updatedAt: nowISO() })
      audit(db, 'DeliveryChallan', id, 'update', `Updated challan ${dc.dcNo}`)
      return dc
    }),

  setStatus: (id: string, status: DeliveryChallan['status'], invoiceId?: string): DeliveryChallan =>
    mutate((db) => {
      const dc = db.deliveryChallans.find((d) => d.id === id)
      if (!dc) throw new BusinessRuleError('Delivery challan not found')
      dc.status = status
      if (invoiceId !== undefined) dc.invoiceId = invoiceId
      dc.updatedAt = nowISO()
      audit(db, 'DeliveryChallan', id, 'status', `${dc.dcNo} → ${status}`)
      return dc
    }),

  remove: (id: string): void =>
    mutate((db) => {
      const dc = db.deliveryChallans.find((d) => d.id === id)
      if (dc?.status === 'Invoiced') {
        throw new BusinessRuleError('Challan is invoiced. Cancel it instead of deleting.')
      }
      db.deliveryChallans = db.deliveryChallans.filter((d) => d.id !== id)
      audit(db, 'DeliveryChallan', id, 'delete', 'Deleted challan')
    }),
}

// ----------------------------------------------------------------- Invoices
export const invoiceRepo = {
  list: (): Invoice[] => getDb().invoices,
  get: (id: string) => getDb().invoices.find((i) => i.id === id),
  computed: (inv: Invoice) => computeInvoice(inv, getDb().payments),

  create: (
    input: Omit<Invoice, 'id' | 'invoiceNo' | 'createdAt' | 'updatedAt'>,
  ): Invoice =>
    mutate((db) => {
      if (!db.companies.some((c) => c.id === input.companyId)) {
        throw new BusinessRuleError('Select a valid company')
      }
      if (!input.lines.length) throw new BusinessRuleError('Add at least one line item')
      for (const l of input.lines) {
        if (l.quantity <= 0 || l.rate < 0) {
          throw new BusinessRuleError('Line quantity must be > 0 and rate must be >= 0')
        }
      }
      const ts = nowISO()
      const invoice: Invoice = {
        ...input,
        id: uid('inv_'),
        invoiceNo: nextNo(db, 'invoice', db.settings.numbering.invoice),
        createdAt: ts,
        updatedAt: ts,
      }
      db.invoices.unshift(invoice)
      audit(db, 'Invoice', invoice.id, 'create', `Created invoice ${invoice.invoiceNo}`)
      return invoice
    }),

  update: (id: string, patch: Partial<Invoice>): Invoice =>
    mutate((db) => {
      const inv = db.invoices.find((i) => i.id === id)
      if (!inv) throw new BusinessRuleError('Invoice not found')
      if (inv.status === 'Paid' && patch.lines) {
        throw new BusinessRuleError('Cannot edit line items on a fully paid invoice')
      }
      Object.assign(inv, patch, { updatedAt: nowISO() })
      audit(db, 'Invoice', id, 'update', `Updated invoice ${inv.invoiceNo}`)
      return inv
    }),

  setStatus: (id: string, status: Invoice['status']): Invoice =>
    mutate((db) => {
      const inv = db.invoices.find((i) => i.id === id)
      if (!inv) throw new BusinessRuleError('Invoice not found')
      if (status === 'Cancelled') {
        const paid = computeInvoice(inv, db.payments).paid
        if (paid > 0) {
          throw new BusinessRuleError(
            'Invoice has payments recorded. Remove payments before cancelling.',
          )
        }
      }
      inv.status = status
      inv.updatedAt = nowISO()
      audit(db, 'Invoice', id, 'status', `Invoice ${inv.invoiceNo} → ${status}`)
      return inv
    }),

  // Recalculate stored status from payments (keeps list badges accurate).
  refreshStatus: (id: string): void =>
    mutate((db) => {
      const inv = db.invoices.find((i) => i.id === id)
      if (!inv) return
      inv.status = deriveInvoiceStatus(inv, db.payments)
    }),
}

// ------------------------------------------------------------------ Payments
export const paymentRepo = {
  list: (): Payment[] => getDb().payments,
  get: (id: string) => getDb().payments.find((p) => p.id === id),

  create: (
    input: Omit<Payment, 'id' | 'paymentNo' | 'createdAt' | 'updatedAt'>,
  ): Payment =>
    mutate((db) => {
      if (input.amount <= 0) throw new BusinessRuleError('Payment amount must be greater than zero')
      if (!db.companies.some((c) => c.id === input.companyId)) {
        throw new BusinessRuleError('Select a valid company')
      }
      if (input.invoiceId && !input.isAdvance) {
        const inv = db.invoices.find((i) => i.id === input.invoiceId)
        if (!inv) throw new BusinessRuleError('Invoice not found')
        if (inv.status === 'Cancelled') {
          throw new BusinessRuleError('Cannot record payment against a cancelled invoice')
        }
        const { outstanding } = computeInvoice(inv, db.payments)
        if (input.amount > outstanding + 0.001) {
          throw new BusinessRuleError(
            `Amount exceeds outstanding (${outstanding}). Mark as advance to allow.`,
          )
        }
      }
      const ts = nowISO()
      const payment: Payment = {
        ...input,
        id: uid('pay_'),
        paymentNo: nextNo(db, 'payment', db.settings.numbering.payment),
        createdAt: ts,
        updatedAt: ts,
      }
      db.payments.unshift(payment)
      audit(db, 'Payment', payment.id, 'create', `Recorded ${payment.paymentNo}`)

      if (payment.invoiceId) {
        const inv = db.invoices.find((i) => i.id === payment.invoiceId)
        if (inv) inv.status = deriveInvoiceStatus(inv, db.payments)
      }
      return payment
    }),

  remove: (id: string): void =>
    mutate((db) => {
      const payment = db.payments.find((p) => p.id === id)
      if (!payment) return
      db.payments = db.payments.filter((p) => p.id !== id)
      if (payment.invoiceId) {
        const inv = db.invoices.find((i) => i.id === payment.invoiceId)
        if (inv) inv.status = deriveInvoiceStatus(inv, db.payments)
      }
      audit(db, 'Payment', id, 'delete', `Deleted payment ${payment.paymentNo}`)
    }),
}

// ------------------------------------------------------------------ Expenses
export const expenseRepo = {
  list: (): Expense[] => getDb().expenses,
  get: (id: string) => getDb().expenses.find((e) => e.id === id),
  create: (
    input: Omit<Expense, 'id' | 'expenseNo' | 'createdAt' | 'updatedAt'>,
  ): Expense =>
    mutate((db) => {
      if (input.amount <= 0) throw new BusinessRuleError('Amount must be greater than zero')
      if (!input.category) throw new BusinessRuleError('Select a category')
      const ts = nowISO()
      const expense: Expense = {
        ...input,
        id: uid('exp_'),
        expenseNo: nextNo(db, 'expense', db.settings.numbering.expense),
        createdAt: ts,
        updatedAt: ts,
      }
      db.expenses.unshift(expense)
      audit(db, 'Expense', expense.id, 'create', `Recorded ${expense.expenseNo}`)
      return expense
    }),
  update: (id: string, patch: Partial<Expense>): Expense =>
    mutate((db) => {
      const expense = db.expenses.find((e) => e.id === id)
      if (!expense) throw new BusinessRuleError('Expense not found')
      if (patch.amount !== undefined && patch.amount <= 0) {
        throw new BusinessRuleError('Amount must be greater than zero')
      }
      Object.assign(expense, patch, { updatedAt: nowISO() })
      audit(db, 'Expense', id, 'update', `Updated expense ${expense.expenseNo}`)
      return expense
    }),
  remove: (id: string): void =>
    mutate((db) => {
      db.expenses = db.expenses.filter((e) => e.id !== id)
      audit(db, 'Expense', id, 'delete', 'Deleted expense')
    }),
}

export const auditRepo = {
  list: () => getDb().auditLog,
}

// Preview the next document number without consuming the sequence.
export function previewNextNo(seqKey: keyof Sequences, pattern: string): string {
  const db = getDb()
  return formatDocNo(pattern, db.sequences[seqKey] + 1)
}

export { todayISO }
