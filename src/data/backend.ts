// Supabase backend adapter. Keeps the synchronous in-memory store (and the
// entire UI + business-rule layer) untouched: it HYDRATES the store from
// Supabase on boot, and WRITES THROUGH every change by diffing the full state
// on each save. Because the repository is the only mutation path, no feature
// page needs to know Supabase exists.

import { supabase, isSupabaseEnabled } from './supabase'
import type { Database } from './db'
import { DB_VERSION } from './db'
import { DEFAULT_SETTINGS } from './seed'
import type { Invoice, InvoiceLine } from '@/types'

// ---- Column maps: TS field -> DB column, plus which fields are numeric ------
interface Mapping {
  table: string
  collection: keyof Database
  fields: Record<string, string>
  numeric: string[]
}

const M: Mapping[] = [
  {
    table: 'companies',
    collection: 'companies',
    numeric: [],
    fields: {
      id: 'id', code: 'code', name: 'name', contactPerson: 'contact_person',
      phone: 'phone', email: 'email', billingAddress: 'billing_address',
      gstin: 'gstin', active: 'active', notes: 'notes',
      createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  {
    table: 'materials',
    collection: 'materials',
    numeric: ['defaultRate', 'reorderLevel'],
    fields: {
      id: 'id', code: 'code', name: 'name', type: 'type', unit: 'unit',
      description: 'description', defaultRate: 'default_rate',
      reorderLevel: 'reorder_level', active: 'active',
      createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  {
    table: 'products',
    collection: 'products',
    numeric: ['rate'],
    fields: {
      id: 'id', code: 'code', name: 'name', rate: 'rate', unit: 'unit',
      hsn: 'hsn', active: 'active', createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  {
    table: 'job_orders',
    collection: 'jobs',
    numeric: ['orderedQty', 'completedQty', 'rejectedQty', 'rate'],
    fields: {
      id: 'id', jobNo: 'job_no', companyId: 'company_id', customerPo: 'customer_po',
      partName: 'part_name', partNumber: 'part_number', materialId: 'material_id',
      orderedQty: 'ordered_qty', completedQty: 'completed_qty', rejectedQty: 'rejected_qty',
      rate: 'rate',
      orderDate: 'order_date', dueDate: 'due_date', priority: 'priority',
      status: 'status', notes: 'notes', startedAt: 'started_at',
      completedAt: 'completed_at', deliveredAt: 'delivered_at', operator: 'operator',
      createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  {
    table: 'production_events',
    collection: 'productionEvents',
    numeric: ['completedQty'],
    fields: {
      id: 'id', jobId: 'job_id', type: 'type', fromStatus: 'from_status',
      toStatus: 'to_status', completedQty: 'completed_qty', note: 'note',
      operator: 'operator', at: 'at',
    },
  },
  {
    table: 'material_receipts',
    collection: 'receipts',
    numeric: ['quantity', 'rate'],
    fields: {
      id: 'id', receiptNo: 'receipt_no', date: 'date', materialId: 'material_id',
      ownerType: 'owner_type', companyId: 'company_id', jobId: 'job_id',
      supplier: 'supplier', quantity: 'quantity', unit: 'unit', rate: 'rate',
      batchNo: 'batch_no', reference: 'reference', notes: 'notes',
      createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  {
    table: 'material_issues',
    collection: 'issues',
    numeric: ['quantity'],
    fields: {
      id: 'id', issueNo: 'issue_no', date: 'date', materialId: 'material_id',
      jobId: 'job_id', companyId: 'company_id', quantity: 'quantity', unit: 'unit',
      note: 'note', createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  {
    table: 'stock_adjustments',
    collection: 'adjustments',
    numeric: ['quantity'],
    fields: {
      id: 'id', adjNo: 'adj_no', date: 'date', materialId: 'material_id',
      companyId: 'company_id', quantity: 'quantity', unit: 'unit', reason: 'reason',
      createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  {
    table: 'delivery_challans',
    collection: 'deliveryChallans',
    numeric: [],
    fields: {
      id: 'id', dcNo: 'dc_no', date: 'date', companyId: 'company_id', jobId: 'job_id',
      reference: 'reference', vehicleNo: 'vehicle_no', lines: 'lines', notes: 'notes',
      status: 'status', invoiceId: 'invoice_id', createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  {
    table: 'invoices',
    collection: 'invoices',
    numeric: ['discount', 'taxPercent', 'cgstPercent', 'sgstPercent'],
    fields: {
      id: 'id', invoiceNo: 'invoice_no', date: 'date', companyId: 'company_id',
      billingAddress: 'billing_address', shippingAddress: 'shipping_address',
      reference: 'reference', dcReference: 'dc_reference', discount: 'discount',
      taxPercent: 'tax_percent', cgstPercent: 'cgst_percent', sgstPercent: 'sgst_percent',
      status: 'status', notes: 'notes',
      createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  {
    table: 'payments',
    collection: 'payments',
    numeric: ['amount'],
    fields: {
      id: 'id', paymentNo: 'payment_no', date: 'date', companyId: 'company_id',
      invoiceId: 'invoice_id', amount: 'amount', method: 'method',
      reference: 'reference', isAdvance: 'is_advance', notes: 'notes',
      createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  {
    table: 'expenses',
    collection: 'expenses',
    numeric: ['amount'],
    fields: {
      id: 'id', expenseNo: 'expense_no', date: 'date', category: 'category',
      amount: 'amount', method: 'method', vendor: 'vendor', reference: 'reference',
      companyId: 'company_id', jobId: 'job_id', notes: 'notes',
      createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  {
    table: 'audit_log',
    collection: 'auditLog',
    numeric: [],
    fields: {
      id: 'id', at: 'at', entity: 'entity', entityId: 'entity_id',
      action: 'action', summary: 'summary', actor: 'actor',
    },
  },
]

type Row = Record<string, unknown>

function toRow(entity: Record<string, unknown>, m: Mapping): Row {
  const row: Row = {}
  for (const [tsField, col] of Object.entries(m.fields)) {
    const v = entity[tsField]
    row[col] = v === undefined ? null : v
  }
  return row
}

function fromRow(row: Row, m: Mapping): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [tsField, col] of Object.entries(m.fields)) {
    let v = row[col]
    if (v === null) v = undefined
    else if (m.numeric.includes(tsField) && v !== undefined) v = Number(v)
    obj[tsField] = v
  }
  return obj
}

function lineToRow(line: InvoiceLine, invoiceId: string, index: number): Row {
  return {
    id: line.id, invoice_id: invoiceId, job_id: line.jobId ?? null,
    description: line.description, quantity: line.quantity, rate: line.rate, line_no: index,
  }
}

// ---------------------------------------------------------------- Hydration
export async function loadAll(): Promise<Database | null> {
  if (!supabase) return null

  const db: Database = {
    version: DB_VERSION,
    settings: DEFAULT_SETTINGS,
    sequences: {
      job: 0, invoice: 0, receipt: 0, issue: 0, adjustment: 0, payment: 0,
      expense: 0, dc: 0, companyCode: 0, materialCode: 0, productCode: 0,
    },
    companies: [], materials: [], products: [], jobs: [], productionEvents: [], receipts: [],
    issues: [], adjustments: [], deliveryChallans: [], invoices: [], payments: [], expenses: [], auditLog: [],
    users: [],
  }

  for (const m of M) {
    const { data, error } = await supabase.from(m.table).select('*')
    if (error) throw error
    ;(db[m.collection] as unknown[]) = (data ?? []).map((r) => fromRow(r as Row, m))
  }

  // Invoice lines → attach to their invoices.
  const { data: lineRows, error: lineErr } = await supabase
    .from('invoice_lines')
    .select('*')
    .order('line_no', { ascending: true })
  if (lineErr) throw lineErr
  const linesByInvoice = new Map<string, InvoiceLine[]>()
  for (const r of (lineRows ?? []) as Row[]) {
    const line: InvoiceLine = {
      id: r.id as string,
      jobId: (r.job_id as string) ?? undefined,
      description: r.description as string,
      quantity: Number(r.quantity),
      rate: Number(r.rate),
    }
    const arr = linesByInvoice.get(r.invoice_id as string) ?? []
    arr.push(line)
    linesByInvoice.set(r.invoice_id as string, arr)
  }
  db.invoices.forEach((inv) => {
    inv.lines = linesByInvoice.get(inv.id) ?? []
  })

  // App state (settings + sequences).
  const { data: state, error: stateErr } = await supabase
    .from('app_state')
    .select('*')
    .eq('id', 'singleton')
    .maybeSingle()
  if (stateErr) throw stateErr
  if (state?.data) {
    const parsed = state.data as {
      settings?: Database['settings']
      sequences?: Database['sequences']
      users?: Database['users']
    }
    if (parsed.settings) {
      // Deep-merge so newly-added nested keys (e.g. numbering.dc) keep their
      // defaults when the stored settings predate them.
      db.settings = {
        ...DEFAULT_SETTINGS,
        ...parsed.settings,
        numbering: { ...DEFAULT_SETTINGS.numbering, ...(parsed.settings.numbering ?? {}) },
        company: { ...DEFAULT_SETTINGS.company, ...(parsed.settings.company ?? {}) },
      }
    }
    if (parsed.sequences) db.sequences = { ...db.sequences, ...parsed.sequences }
    if (Array.isArray(parsed.users)) db.users = parsed.users
  } else {
    // Fresh DB seeded via SQL: align code sequences with existing rows.
    db.sequences.companyCode = db.companies.length
    db.sequences.materialCode = db.materials.length
  }

  return db
}

// Mirror an approval decision into the server-side approval registry so the RLS
// gate (see docs/supabase-approval-policy.sql) grants/revokes data access. The
// RPC is a no-op unless the caller is a super admin (enforced in the DB).
export async function setRemoteApproval(email: string, approved: boolean): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('set_user_approval', { p_email: email, p_approved: approved })
  // Missing function (policy not yet applied) shouldn't break the local update.
  if (error && !/function .* does not exist|not find the function/i.test(error.message)) {
    throw error
  }
}

// --------------------------------------------------------- Write-through sync
let lastSynced: Database | null = null
let queue: Promise<void> = Promise.resolve()
let onError: ((e: unknown) => void) | null = null

export function setSyncErrorHandler(fn: (e: unknown) => void) {
  onError = fn
}

export function primeSyncBaseline(db: Database) {
  lastSynced = clone(db)
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

// Diff two arrays of entities by id; return rows to upsert and ids to delete.
function diffCollection(prev: Record<string, unknown>[], next: Record<string, unknown>[], m: Mapping) {
  const prevById = new Map(prev.map((e) => [e.id as string, e]))
  const nextById = new Map(next.map((e) => [e.id as string, e]))
  const upserts: Row[] = []
  for (const e of next) {
    const before = prevById.get(e.id as string)
    if (!before || JSON.stringify(before) !== JSON.stringify(e)) upserts.push(toRow(e, m))
  }
  const deletes: string[] = []
  for (const id of prevById.keys()) if (!nextById.has(id)) deletes.push(id)
  return { upserts, deletes }
}

async function upsertRows(table: string, rows: Row[]) {
  if (!supabase || !rows.length) return
  const { error } = await supabase.from(table).upsert(rows)
  if (error) throw error
}

async function deleteRows(table: string, ids: string[]) {
  if (!supabase || !ids.length) return
  const { error } = await supabase.from(table).delete().in('id', ids)
  if (error) throw error
}

function invoiceLineDiff(prev: Database, next: Database) {
  const flat = (invoices: Invoice[]) => {
    const rows: Row[] = []
    invoices.forEach((inv) => inv.lines.forEach((l, i) => rows.push(lineToRow(l, inv.id, i))))
    return rows
  }
  const prevRows = flat(prev.invoices)
  const nextRows = flat(next.invoices)
  const prevById = new Map(prevRows.map((r) => [r.id as string, r]))
  const nextById = new Map(nextRows.map((r) => [r.id as string, r]))
  const upserts = nextRows.filter(
    (r) => JSON.stringify(prevById.get(r.id as string)) !== JSON.stringify(r),
  )
  const deletes = [...prevById.keys()].filter((id) => !nextById.has(id))
  return { upserts, deletes }
}

async function applyAppState(prev: Database, next: Database) {
  if (!supabase) return
  if (
    JSON.stringify(prev.settings) === JSON.stringify(next.settings) &&
    JSON.stringify(prev.sequences) === JSON.stringify(next.sequences) &&
    JSON.stringify(prev.users) === JSON.stringify(next.users)
  ) {
    return
  }
  const { error } = await supabase
    .from('app_state')
    .upsert({
      id: 'singleton',
      data: { settings: next.settings, sequences: next.sequences, users: next.users },
    })
  if (error) throw error
}

// Called by db.saveDb after each persisted change. Serialised so writes land in
// order; local state has already been updated regardless of network result.
// Upserts run parent-first (M order), deletes child-first (reverse) so foreign
// keys are always satisfied even for bulk changes (demo load / reset).
export function syncThrough(next: Database): void {
  if (!isSupabaseEnabled()) return
  const nextClone = clone(next)
  queue = queue
    .then(async () => {
      const prev = lastSynced ?? emptyDb()

      const perTable = M.map((m) => ({
        m,
        ...diffCollection(
          prev[m.collection] as unknown as Record<string, unknown>[],
          nextClone[m.collection] as unknown as Record<string, unknown>[],
          m,
        ),
      }))
      const lines = invoiceLineDiff(prev, nextClone)

      // Phase 1: upserts, parents before children.
      for (const { m, upserts } of perTable) await upsertRows(m.table, upserts)
      await upsertRows('invoice_lines', lines.upserts)
      await applyAppState(prev, nextClone)

      // Phase 2: deletes, children before parents.
      await deleteRows('invoice_lines', lines.deletes)
      for (let i = perTable.length - 1; i >= 0; i--) {
        await deleteRows(perTable[i].m.table, perTable[i].deletes)
      }

      lastSynced = nextClone
    })
    .catch((e) => {
      onError?.(e)
      console.error('Supabase sync failed', e)
    })
}

function emptyDb(): Database {
  return {
    version: DB_VERSION, settings: DEFAULT_SETTINGS,
    sequences: { job: 0, invoice: 0, receipt: 0, issue: 0, adjustment: 0, payment: 0, expense: 0, dc: 0, companyCode: 0, materialCode: 0, productCode: 0 },
    companies: [], materials: [], products: [], jobs: [], productionEvents: [], receipts: [],
    issues: [], adjustments: [], deliveryChallans: [], invoices: [], payments: [], expenses: [], auditLog: [],
    users: [],
  }
}
