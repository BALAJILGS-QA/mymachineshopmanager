// Shared Tool Room UI helpers: status/condition tones, a tool <select> that
// shows live availability, an inline bucket-availability strip, and a small
// action-modal wrapper. Kept presentational so pages stay thin.

import { type ReactNode, useMemo } from 'react'
import { Badge } from '@/components/ui/primitives'
import type { ToolInventoryRow } from './types'

export const CLASSIFICATIONS = [
  'cutting_tool',
  'measuring_tool',
  'hand_tool',
  'power_tool',
  'machine_accessory',
  'fixture',
  'jig',
  'die',
  'mold',
  'drill',
  'end_mill',
  'milling_cutter',
  'turning_tool',
  'insert',
  'tap',
  'reamer',
  'grinding_tool',
  'welding_accessory',
  'inspection_tool',
  'safety_accessory',
  'other',
] as const

export function titleCase(s?: string): string {
  if (!s) return '—'
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Tool master status → badge tone.
const STATUS_TONE: Record<string, string> = {
  active: 'green',
  inactive: 'slate',
  archived: 'red',
}
export function ToolStatusBadge({ status }: { status?: string }) {
  return <Badge tone={STATUS_TONE[status ?? 'active'] ?? 'slate'}>{titleCase(status)}</Badge>
}

// Availability status for the inventory grid / availability card.
export function availabilityLabel(row: ToolInventoryRow): { label: string; tone: string } {
  if (row.availableQty <= 0) return { label: 'Out of stock', tone: 'red' }
  if (row.isLowStock) return { label: 'Low stock', tone: 'amber' }
  return { label: 'Available', tone: 'green' }
}

// Only Badge's supported tones (slate/blue/green/amber/red/violet).
const BUCKET_TONE: Record<string, string> = {
  available: 'green',
  reserved: 'blue',
  issued: 'amber',
  maintenance: 'violet',
  calibration: 'blue',
  damaged: 'red',
  scrap: 'slate',
}

// Compact strip of non-zero bucket counts (used on cards + detail).
export function BucketStrip({ row }: { row: ToolInventoryRow }) {
  const cells: Array<[string, number]> = [
    ['available', row.availableQty],
    ['reserved', row.reservedQty],
    ['issued', row.issuedQty],
    ['maintenance', row.maintenanceQty],
    ['calibration', row.calibrationQty],
    ['damaged', row.damagedQty],
    ['scrap', row.scrapQty],
  ]
  return (
    <div className="flex flex-wrap gap-1.5">
      {cells
        .filter(([, v]) => v > 0)
        .map(([k, v]) => (
          <Badge key={k} tone={BUCKET_TONE[k] ?? 'slate'}>
            {titleCase(k)}: {v}
          </Badge>
        ))}
    </div>
  )
}

// A tool <select> that shows each tool's live available quantity. `bucket`
// controls which quantity is shown in the option label (e.g. 'issued' for
// returns) — purely informational; the DB still enforces the real balance.
export function ToolSelect({
  inventory,
  value,
  onChange,
  bucket = 'availableQty',
  placeholder = 'Select a tool…',
  required,
}: {
  inventory: ToolInventoryRow[]
  value: string
  onChange: (toolId: string) => void
  bucket?: keyof Pick<
    ToolInventoryRow,
    'availableQty' | 'issuedQty' | 'reservedQty' | 'maintenanceQty' | 'calibrationQty' | 'onHandQty'
  >
  placeholder?: string
  required?: boolean
}) {
  const options = useMemo(
    () => [...inventory].sort((a, b) => a.name.localeCompare(b.name)),
    [inventory],
  )
  return (
    <select
      className="input"
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((t) => (
        <option key={t.toolId} value={t.toolId}>
          {t.code ? `${t.code} · ` : ''}
          {t.name} ({Number(t[bucket] ?? 0)} {t.uom ?? ''})
        </option>
      ))}
    </select>
  )
}

// Small labelled metric used on the availability card.
export function AvailCell({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className={`text-2xs font-medium uppercase tracking-wide ${tone ?? 'text-slate-500'}`}>
        {label}
      </p>
    </div>
  )
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-right text-sm text-slate-900">{children}</span>
    </div>
  )
}
