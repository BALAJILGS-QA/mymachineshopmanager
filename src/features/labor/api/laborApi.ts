// Labor / resource time tracking (migration 0080) — Supabase-direct.
// The ledger is read-only under RLS; clock in/out go through the SECURITY
// DEFINER RPCs so permissions + the one-open-session rule are enforced server-side.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb } from '@/lib/api/supabaseCrud'
import type { LaborActivity, LaborTimeLog } from '@/types'

const map = (r: Row) => fromRow<LaborTimeLog>(r, maps.laborTimeLogs)

// All currently-open sessions (ended_at null) across the tenant — the real-time board.
export async function listOpenLabor(): Promise<LaborTimeLog[]> {
  const { data, error } = await sb()
    .from('labor_time_logs')
    .select('*')
    .is('ended_at', null)
    .order('started_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(map)
}

// All sessions in a date window (by start date), for reporting. from/to are
// inclusive ISO dates (YYYY-MM-DD); omit for everything.
export async function listAllLabor(from?: string, to?: string): Promise<LaborTimeLog[]> {
  let q = sb().from('labor_time_logs').select('*').order('started_at', { ascending: false })
  if (from) q = q.gte('started_at', `${from}T00:00:00`)
  if (to) q = q.lte('started_at', `${to}T23:59:59`)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(map)
}

// Full session history for one order (open + closed).
export async function listLaborForJob(jobId: string): Promise<LaborTimeLog[]> {
  const { data, error } = await sb()
    .from('labor_time_logs')
    .select('*')
    .eq('job_id', jobId)
    .order('started_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(map)
}

export interface ClockInInput {
  employeeId: string
  jobOperationId?: string
  jobId?: string
  machineId?: string
  activity?: LaborActivity
  note?: string
}

export async function clockIn(input: ClockInInput): Promise<LaborTimeLog> {
  const { data, error } = await sb().rpc('labor_clock_in', {
    p_id: uid('lt_'),
    p_employee_id: input.employeeId,
    p_job_operation_id: input.jobOperationId ?? null,
    p_job_id: input.jobId ?? null,
    p_machine_id: input.machineId ?? null,
    p_activity: input.activity ?? 'Run',
    p_note: input.note ?? null,
  })
  if (error) throw error
  return map(data as Row)
}

export async function clockOut(
  id: string,
  opts: { note?: string; downtimeReason?: string } = {},
): Promise<LaborTimeLog> {
  const { data, error } = await sb().rpc('labor_clock_out', {
    p_id: id,
    p_note: opts.note ?? null,
    p_downtime_reason: opts.downtimeReason ?? null,
  })
  if (error) throw error
  return map(data as Row)
}
