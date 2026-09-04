// Pure, dependency-free Tool Room inventory math. This is the client-side mirror
// of the authoritative SQL (tool_inventory view + tool_bucket_balance()): the DB
// is the source of truth, but keeping the same rules here lets the UI derive a
// tool's live breakdown from its ledger and gives us fast, isolated unit tests.
// NEVER edit derived quantities by hand — always post a transaction.

import type { ToolBucket, ToolTransaction, ToolTxnType } from './types'

export const BUCKETS: ToolBucket[] = [
  'available',
  'reserved',
  'issued',
  'maintenance',
  'calibration',
  'damaged',
  'scrap',
  'consumed',
]

// Buckets whose quantity is still physically on hand (scrap + consumed have left).
const ON_HAND: ToolBucket[] = [
  'available',
  'reserved',
  'issued',
  'maintenance',
  'calibration',
  'damaged',
]

export interface ToolStock {
  available: number
  reserved: number
  issued: number
  maintenance: number
  calibration: number
  damaged: number
  scrap: number
  consumed: number
  onHand: number
  net: number
}

export function emptyStock(): ToolStock {
  return {
    available: 0,
    reserved: 0,
    issued: 0,
    maintenance: 0,
    calibration: 0,
    damaged: 0,
    scrap: 0,
    consumed: 0,
    onHand: 0,
    net: 0,
  }
}

// Per-bucket balance = Σ(qty into bucket) − Σ(qty out of bucket), then the
// on-hand and net roll-ups. Mirrors public.tool_inventory exactly.
export function computeToolStock(txns: ToolTransaction[]): ToolStock {
  const bal: Record<ToolBucket, number> = {
    available: 0,
    reserved: 0,
    issued: 0,
    maintenance: 0,
    calibration: 0,
    damaged: 0,
    scrap: 0,
    consumed: 0,
  }
  for (const t of txns) {
    const q = Number(t.qty) || 0
    if (t.toBucket) bal[t.toBucket] += q
    if (t.fromBucket) bal[t.fromBucket] -= q
  }
  const onHand = ON_HAND.reduce((s, b) => s + bal[b], 0)
  const net = BUCKETS.reduce((s, b) => s + bal[b], 0)
  return { ...bal, onHand, net }
}

export function isLowStock(availableQty: number, reorderLevel: number): boolean {
  return reorderLevel > 0 && availableQty <= reorderLevel
}

// Suggested purchase quantity to bring a tool back above its reorder level,
// never below one reorder batch. Used to prefill a purchase request.
export function suggestReorderQty(
  availableQty: number,
  reorderLevel: number,
  reorderQty: number,
  maxStock?: number,
): number {
  const deficit = Math.max(0, reorderLevel - availableQty)
  let qty = Math.max(deficit, reorderQty)
  if (maxStock && maxStock > 0) qty = Math.min(qty, Math.max(0, maxStock - availableQty))
  return Math.max(0, Math.round(qty))
}

export interface ToolLife {
  expected: number
  used: number
  remaining: number
  usagePercent: number
  stage: 'ok' | 'warn' | 'critical' | 'expired'
}

// Tool-life status from an expected life + consumed usage. Thresholds match the
// dashboard alerts (80% warn, 90% critical, 100% expired). expected <= 0 → n/a.
export function computeToolLife(
  expected: number,
  used: number,
  warnPct = 80,
  criticalPct = 90,
): ToolLife | null {
  if (!expected || expected <= 0) return null
  const remaining = Math.max(0, expected - used)
  const usagePercent = Math.min(100, Math.round((used / expected) * 100))
  const stage: ToolLife['stage'] =
    usagePercent >= 100
      ? 'expired'
      : usagePercent >= criticalPct
        ? 'critical'
        : usagePercent >= warnPct
          ? 'warn'
          : 'ok'
  return { expected, used, remaining, usagePercent, stage }
}

// Human label for a ledger transaction type (used across history views).
const TXN_LABELS: Record<ToolTxnType, string> = {
  receipt: 'Received',
  reserve: 'Reserved',
  release: 'Reservation released',
  issue: 'Issued',
  issue_reserved: 'Issued (from reservation)',
  return_available: 'Returned (good)',
  return_damaged: 'Returned (damaged)',
  return_maintenance: 'Returned for maintenance',
  return_calibration: 'Returned for calibration',
  consume: 'Consumed',
  transfer: 'Transferred',
  maintenance_send: 'Sent for maintenance',
  maintenance_pass: 'Maintenance completed',
  maintenance_scrap: 'Scrapped after maintenance',
  calibrate_send: 'Sent for calibration',
  calibrate_pass: 'Calibration passed',
  calibrate_scrap: 'Scrapped after calibration',
  scrap: 'Scrapped',
  adjust: 'Adjusted',
}

export function txnLabel(type: ToolTxnType): string {
  return TXN_LABELS[type] ?? type
}
