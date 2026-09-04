// Tool Room data access. Simple masters/records go through the shared generic
// CRUD (selectAll/insertRow/updateRow/deleteRow over the rowMap `maps`); every
// quantity-changing operation goes through the atomic public.tool_move() RPC
// (migration 0028) so availability can never be edited directly and can never go
// negative under concurrency. Reads degrade to [] when Supabase is absent.

import { supabase, isSupabaseEnabled } from '@/data/supabase'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextDocNo, nextCode } from '@/lib/api/numbering'
import { uid } from '@/lib/id'
import type {
  Tool,
  ToolCalibration,
  ToolCategory,
  ToolInventoryRow,
  ToolMaintenance,
  ToolReservation,
  ToolTransaction,
  ToolTxnType,
} from './types'

const TXN_PATTERN = 'TR-{FY}-{#####}'

function enabled(): boolean {
  return isSupabaseEnabled() && !!supabase
}

function crud<T extends { id: string }>(mapKey: keyof typeof maps, idPrefix: string) {
  const map = maps[mapKey]
  return {
    list: async (): Promise<T[]> => (enabled() ? selectAll<T>(map) : []),
    create: async (input: Partial<T>): Promise<T> =>
      insertRow<T>(map, { id: uid(idPrefix), ...input } as Record<string, unknown>),
    update: async (id: string, patch: Partial<T>): Promise<T> =>
      updateRow<T>(map, id, patch as Record<string, unknown>),
    remove: async (id: string): Promise<void> => deleteRow(map, id),
  }
}

// ---- Masters ---------------------------------------------------------------
export const categoriesApi = {
  ...crud<ToolCategory>('toolCategories', 'tcat_'),
  create: async (input: Partial<ToolCategory>): Promise<ToolCategory> => {
    const code = input.code || (enabled() ? await nextCode('tool_cat', 'TC', 3) : undefined)
    return insertRow<ToolCategory>(maps.toolCategories, {
      id: uid('tcat_'),
      active: true,
      ...input,
      code,
    } as Record<string, unknown>)
  },
}

export const toolsApi = {
  ...crud<Tool>('tools', 'tool_'),
  get: async (id: string): Promise<Tool | undefined> => {
    if (!enabled() || !supabase) return undefined
    const { data, error } = await supabase.from('tools').select('*').eq('id', id).single()
    if (error) throw error
    return fromRow<Tool>(data as Row, maps.tools)
  },
  create: async (input: Partial<Tool>): Promise<Tool> => {
    const code = input.code || (enabled() ? await nextCode('tool_code', 'TL', 4) : undefined)
    return insertRow<Tool>(maps.tools, {
      id: uid('tool_'),
      status: 'active',
      uom: 'nos',
      ...input,
      code,
    } as Record<string, unknown>)
  },
}

export const reservationsApi = crud<ToolReservation>('toolReservations', 'tres_')
export const maintenanceApi = crud<ToolMaintenance>('toolMaintenance', 'tmnt_')
export const calibrationsApi = crud<ToolCalibration>('toolCalibrations', 'tcal_')

// ---- Inventory + ledger (read) ---------------------------------------------
export const inventoryApi = {
  list: async (): Promise<ToolInventoryRow[]> => {
    if (!enabled() || !supabase) return []
    const { data, error } = await supabase.from('tool_inventory').select('*')
    if (error) throw error
    return (data ?? []).map((r) => fromRow<ToolInventoryRow>(r as Row, maps.toolInventory))
  },
  one: async (toolId: string): Promise<ToolInventoryRow | undefined> => {
    if (!enabled() || !supabase) return undefined
    const { data, error } = await supabase
      .from('tool_inventory')
      .select('*')
      .eq('tool_id', toolId)
      .maybeSingle()
    if (error) throw error
    return data ? fromRow<ToolInventoryRow>(data as Row, maps.toolInventory) : undefined
  },
}

export const transactionsApi = {
  // Recent movements across all tools (bounded — the ledger can be huge).
  list: async (limit = 200): Promise<ToolTransaction[]> => {
    if (!enabled() || !supabase) return []
    const { data, error } = await supabase
      .from('tool_transactions')
      .select('*')
      .order('at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map((r) => fromRow<ToolTransaction>(r as Row, maps.toolTransactions))
  },
  forTool: async (toolId: string): Promise<ToolTransaction[]> => {
    if (!enabled() || !supabase) return []
    const { data, error } = await supabase
      .from('tool_transactions')
      .select('*')
      .eq('tool_id', toolId)
      .order('at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((r) => fromRow<ToolTransaction>(r as Row, maps.toolTransactions))
  },
}

// ---- The single atomic mover ----------------------------------------------
export interface MoveInput {
  toolId: string
  txnType: ToolTxnType
  qty: number
  unit?: string
  unitCost?: number
  locationFrom?: string
  locationTo?: string
  jobId?: string
  machine?: string
  operation?: string
  employee?: string
  department?: string
  purpose?: string
  condition?: string
  reservationId?: string
  maintenanceId?: string
  calibrationId?: string
  serialNumber?: string
  batchNo?: string
  refType?: string
  refId?: string
  refNo?: string
  refKey?: string
  note?: string
  adjustBucket?: string
  adjustIn?: boolean
  allowNegative?: boolean
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is required for Tool Room transactions')
  return supabase
}

// Post one movement through tool_move(). Generates the ledger number, then the
// DB validates permission + non-negative buckets and writes atomically.
export async function postMove(input: MoveInput): Promise<ToolTransaction> {
  const sb = requireSupabase()
  const txnNo = await nextDocNo('tool_txn', TXN_PATTERN)
  const { data, error } = await sb.rpc('tool_move', {
    p_id: uid('ttx_'),
    p_txn_no: txnNo,
    p_tool_id: input.toolId,
    p_txn_type: input.txnType,
    p_qty: input.qty,
    p_unit: input.unit ?? null,
    p_unit_cost: input.unitCost ?? null,
    p_location_from: input.locationFrom ?? null,
    p_location_to: input.locationTo ?? null,
    p_job_id: input.jobId ?? null,
    p_machine: input.machine ?? null,
    p_operation: input.operation ?? null,
    p_employee: input.employee ?? null,
    p_department: input.department ?? null,
    p_purpose: input.purpose ?? null,
    p_condition: input.condition ?? null,
    p_reservation_id: input.reservationId ?? null,
    p_maintenance_id: input.maintenanceId ?? null,
    p_calibration_id: input.calibrationId ?? null,
    p_serial_number: input.serialNumber ?? null,
    p_batch_no: input.batchNo ?? null,
    p_ref_type: input.refType ?? null,
    p_ref_id: input.refId ?? null,
    p_ref_no: input.refNo ?? null,
    p_ref_key: input.refKey ?? null,
    p_note: input.note ?? null,
    p_adjust_bucket: input.adjustBucket ?? null,
    p_adjust_in: input.adjustIn ?? true,
    p_allow_negative: input.allowNegative ?? false,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return fromRow<ToolTransaction>(row as Row, maps.toolTransactions)
}

// ---- Convenience service functions (map UI intents → ledger + records) ------

export const receiveTool = (i: Omit<MoveInput, 'txnType'>) => postMove({ ...i, txnType: 'receipt' })

export const transferTool = (i: Omit<MoveInput, 'txnType'>) =>
  postMove({ ...i, txnType: 'transfer' })

export const scrapTool = (i: Omit<MoveInput, 'txnType'>) => postMove({ ...i, txnType: 'scrap' })

export const consumeTool = (i: Omit<MoveInput, 'txnType'>) => postMove({ ...i, txnType: 'consume' })

export const adjustStock = (i: Omit<MoveInput, 'txnType'>) => postMove({ ...i, txnType: 'adjust' })

export const issueTool = (i: Omit<MoveInput, 'txnType'>, fromReservation = false) =>
  postMove({ ...i, txnType: fromReservation ? 'issue_reserved' : 'issue' })

// Return maps the inspected condition to the destination bucket.
export type ReturnDisposition = 'available' | 'damaged' | 'maintenance' | 'calibration'
export function returnTool(i: Omit<MoveInput, 'txnType'>, disposition: ReturnDisposition) {
  const map: Record<ReturnDisposition, ToolTxnType> = {
    available: 'return_available',
    damaged: 'return_damaged',
    maintenance: 'return_maintenance',
    calibration: 'return_calibration',
  }
  return postMove({ ...i, txnType: map[disposition] })
}

// Reserve: create the reservation record AND move stock available→reserved.
export async function reserveTool(
  input: Omit<MoveInput, 'txnType'> & {
    requiredDate?: string
    reservedBy?: string
  },
): Promise<{ reservation: ToolReservation; txn: ToolTransaction }> {
  const reservationNo = enabled() ? await nextDocNo('tool_resv', 'TR-RSV-{FY}-{####}') : undefined
  const reservation = await insertRow<ToolReservation>(maps.toolReservations, {
    id: uid('tres_'),
    reservationNo,
    toolId: input.toolId,
    qty: input.qty,
    issuedQty: 0,
    requiredDate: input.requiredDate,
    jobId: input.jobId,
    machine: input.machine,
    operation: input.operation,
    employee: input.employee,
    reservedBy: input.reservedBy,
    status: 'reserved',
    notes: input.note,
  } as Record<string, unknown>)
  const txn = await postMove({
    ...input,
    txnType: 'reserve',
    reservationId: reservation.id,
    refType: 'reservation',
    refId: reservation.id,
    refNo: reservationNo,
  })
  return { reservation, txn }
}

// Issue (part of) a reservation: move reserved→issued and advance the record.
export async function issueFromReservation(
  res: ToolReservation,
  qty: number,
  ctx: { machine?: string; employee?: string; note?: string } = {},
): Promise<void> {
  const outstanding = (res.qty ?? 0) - (res.issuedQty ?? 0)
  if (qty > outstanding) throw new Error(`Only ${outstanding} still reserved on this reservation`)
  await postMove({
    toolId: res.toolId,
    txnType: 'issue_reserved',
    qty,
    jobId: res.jobId,
    machine: ctx.machine ?? res.machine,
    employee: ctx.employee,
    operation: res.operation,
    reservationId: res.id,
    refType: 'reservation',
    refId: res.id,
    refNo: res.reservationNo,
    note: ctx.note,
  })
  const issued = (res.issuedQty ?? 0) + qty
  await updateRow<ToolReservation>(maps.toolReservations, res.id, {
    issuedQty: issued,
    status: issued >= (res.qty ?? 0) ? 'fully_issued' : 'partially_issued',
  } as Record<string, unknown>)
}

// Cancel/release the outstanding portion of a reservation.
export async function releaseReservation(res: ToolReservation): Promise<void> {
  const outstanding = (res.qty ?? 0) - (res.issuedQty ?? 0)
  if (outstanding > 0) {
    await postMove({
      toolId: res.toolId,
      txnType: 'release',
      qty: outstanding,
      reservationId: res.id,
      refType: 'reservation',
      refId: res.id,
      refNo: res.reservationNo,
    })
  }
  await updateRow<ToolReservation>(maps.toolReservations, res.id, {
    status: 'cancelled',
  } as Record<string, unknown>)
}

// Send a tool for maintenance: create the record + move available→maintenance.
export async function sendMaintenance(
  input: Omit<MoveInput, 'txnType'> & Partial<ToolMaintenance>,
): Promise<{ record: ToolMaintenance; txn: ToolTransaction }> {
  const maintenanceNo = enabled() ? await nextDocNo('tool_maint', 'TR-MNT-{FY}-{####}') : undefined
  const record = await insertRow<ToolMaintenance>(maps.toolMaintenance, {
    id: uid('tmnt_'),
    maintenanceNo,
    toolId: input.toolId,
    qty: input.qty,
    serialNumber: input.serialNumber,
    maintenanceType: input.maintenanceType ?? 'preventive',
    maintenanceDate: input.maintenanceDate,
    dueDate: input.dueDate,
    serviceProvider: input.serviceProvider,
    technician: input.technician,
    description: input.description,
    status: 'open',
  } as Record<string, unknown>)
  const txn = await postMove({
    toolId: input.toolId,
    txnType: 'maintenance_send',
    qty: input.qty,
    maintenanceId: record.id,
    refType: 'maintenance',
    refId: record.id,
    refNo: maintenanceNo,
    note: input.note,
  })
  return { record, txn }
}

// Complete maintenance: move maintenance→available (pass) or →scrap (fail) and
// close the record.
export async function completeMaintenance(
  record: ToolMaintenance,
  outcome: 'passed' | 'failed',
  patch: Partial<ToolMaintenance> = {},
): Promise<void> {
  await postMove({
    toolId: record.toolId,
    txnType: outcome === 'passed' ? 'maintenance_pass' : 'maintenance_scrap',
    qty: record.qty ?? 1,
    maintenanceId: record.id,
    refType: 'maintenance',
    refId: record.id,
    refNo: record.maintenanceNo,
    condition: patch.condition,
  })
  await updateRow<ToolMaintenance>(maps.toolMaintenance, record.id, {
    ...patch,
    result: outcome,
    status: outcome === 'passed' ? 'completed' : 'scrapped',
  } as Record<string, unknown>)
}

// Send a tool for calibration: create the record + move available→calibration.
export async function sendCalibration(
  input: Omit<MoveInput, 'txnType'> & Partial<ToolCalibration>,
): Promise<{ record: ToolCalibration; txn: ToolTransaction }> {
  const calibrationNo = enabled() ? await nextDocNo('tool_calib', 'TR-CAL-{FY}-{####}') : undefined
  const record = await insertRow<ToolCalibration>(maps.toolCalibrations, {
    id: uid('tcal_'),
    calibrationNo,
    toolId: input.toolId,
    qty: input.qty,
    serialNumber: input.serialNumber,
    calibrationDate: input.calibrationDate,
    dueDate: input.dueDate,
    agency: input.agency,
    status: 'valid',
  } as Record<string, unknown>)
  const txn = await postMove({
    toolId: input.toolId,
    txnType: 'calibrate_send',
    qty: input.qty,
    calibrationId: record.id,
    refType: 'calibration',
    refId: record.id,
    refNo: calibrationNo,
    note: input.note,
  })
  return { record, txn }
}

// Complete calibration: pass → back to available; fail → scrap. Record updated.
export async function completeCalibration(
  record: ToolCalibration,
  outcome: 'pass' | 'fail',
  patch: Partial<ToolCalibration> = {},
): Promise<void> {
  await postMove({
    toolId: record.toolId,
    txnType: outcome === 'pass' ? 'calibrate_pass' : 'calibrate_scrap',
    qty: record.qty ?? 1,
    calibrationId: record.id,
    refType: 'calibration',
    refId: record.id,
    refNo: record.calibrationNo,
  })
  await updateRow<ToolCalibration>(maps.toolCalibrations, record.id, {
    ...patch,
    result: outcome,
    status: outcome === 'pass' ? 'valid' : 'failed',
  } as Record<string, unknown>)
}
