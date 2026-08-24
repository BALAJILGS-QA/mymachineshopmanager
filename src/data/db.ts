// Low-level persistence. The entire dataset is held in one JSON document in
// localStorage. This keeps the MVP zero-cost and deployable as a pure static
// SPA. The shape mirrors what a Supabase/Postgres schema would hold, so the
// repository layer can be re-pointed at a real backend later without touching
// the UI (see docs/supabase-schema.sql).

import type {
  AuditLog,
  Company,
  Expense,
  Invoice,
  JobOrder,
  Material,
  MaterialIssue,
  MaterialReceipt,
  Payment,
  ProductionEvent,
  Settings,
  StockAdjustment,
} from '@/types'

export interface Sequences {
  job: number
  invoice: number
  receipt: number
  issue: number
  adjustment: number
  payment: number
  expense: number
  companyCode: number
  materialCode: number
}

export interface Database {
  version: number
  settings: Settings
  sequences: Sequences
  companies: Company[]
  materials: Material[]
  jobs: JobOrder[]
  productionEvents: ProductionEvent[]
  receipts: MaterialReceipt[]
  issues: MaterialIssue[]
  adjustments: StockAdjustment[]
  invoices: Invoice[]
  payments: Payment[]
  expenses: Expense[]
  auditLog: AuditLog[]
}

const STORAGE_KEY = 'cnc-shop-db'
export const DB_VERSION = 1

let cache: Database | null = null
// Monotonic revision bumped on every persisted change. React binds to this so
// it re-renders even though repo mutations update arrays in place.
let revision = 0
const listeners = new Set<() => void>()

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getRevision(): number {
  return revision
}

function emit() {
  revision++
  listeners.forEach((fn) => fn())
}

export function loadDb(): Database | null {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Database
    cache = parsed
    return parsed
  } catch (e) {
    console.error('Failed to load DB', e)
    return null
  }
}

export function saveDb(db: Database): void {
  cache = db
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch (e) {
    console.error('Failed to save DB', e)
    throw new Error('Storage write failed. Local storage may be full.')
  }
  emit()
}

export function getDb(): Database {
  const db = loadDb()
  if (!db) throw new Error('Database not initialised')
  return db
}

// Apply a mutation to the DB atomically and persist. After the mutation runs
// (which may update collections in place), every top-level collection is
// shallow-copied into a fresh Database object so React selectors and
// useMemo() dependencies keyed on array identity recompute. Without this,
// in-place push/splice keeps the same array reference and the UI goes stale.
export function mutate<T>(fn: (db: Database) => T): T {
  const db = getDb()
  const result = fn(db)
  const next: Database = {
    ...db,
    version: DB_VERSION,
    settings: { ...db.settings },
    sequences: { ...db.sequences },
    companies: [...db.companies],
    materials: [...db.materials],
    jobs: [...db.jobs],
    productionEvents: [...db.productionEvents],
    receipts: [...db.receipts],
    issues: [...db.issues],
    adjustments: [...db.adjustments],
    invoices: [...db.invoices],
    payments: [...db.payments],
    expenses: [...db.expenses],
    auditLog: [...db.auditLog],
  }
  saveDb(next)
  return result
}

export function resetDb(): void {
  cache = null
  localStorage.removeItem(STORAGE_KEY)
  emit()
}

export function exportDb(): string {
  return JSON.stringify(getDb(), null, 2)
}

export function importDb(json: string): void {
  const parsed = JSON.parse(json) as Database
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.companies)) {
    throw new Error('Invalid backup file')
  }
  saveDb(parsed)
}

export function hasDb(): boolean {
  return loadDb() !== null
}
