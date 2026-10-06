// Finished Goods data-access — Supabase-direct. Movements are append-only via the
// SECURITY DEFINER RPCs fg_receive / fg_dispatch (migration 0072), which enforce
// prod_can() and the balance invariants (FG received <= QC-accepted; dispatch <=
// FG balance). Balances are DERIVED (never stored) via the finished_goods_balance
// view. Dispatch continues to be finalized by the existing delivery-challan flow.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb } from '@/lib/api/supabaseCrud'
import type { FinishedGoodsBalance, FinishedGoodsEntry } from '@/types'

export async function listFgForJob(jobId: string): Promise<FinishedGoodsEntry[]> {
  const { data, error } = await sb()
    .from(maps.finishedGoods.table)
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => fromRow<FinishedGoodsEntry>(r as Row, maps.finishedGoods))
}

export async function listFgBalances(): Promise<FinishedGoodsBalance[]> {
  const { data, error } = await sb().from(maps.finishedGoodsBalance.table).select('*')
  if (error) throw error
  return (data ?? []).map((r) => fromRow<FinishedGoodsBalance>(r as Row, maps.finishedGoodsBalance))
}

export async function fgBalanceForJob(jobId: string): Promise<number> {
  const { data, error } = await sb()
    .from(maps.finishedGoodsBalance.table)
    .select('balance')
    .eq('job_id', jobId)
    .maybeSingle()
  if (error) throw error
  return data ? Number((data as { balance: number }).balance) : 0
}

export interface ReceiveFgInput {
  jobId: string
  qty: number
  binNo?: string
  qcInspectionId?: string
}

export async function receiveFg(input: ReceiveFgInput): Promise<FinishedGoodsEntry> {
  const { data, error } = await sb().rpc('fg_receive', {
    p_id: uid('fg_'),
    p_job_id: input.jobId,
    p_qty: input.qty,
    p_bin: input.binNo ?? null,
    p_qc_inspection_id: input.qcInspectionId ?? null,
    p_event_id: uid('pev_'),
  })
  if (error) throw error
  return fromRow<FinishedGoodsEntry>((data as Row[])[0] ?? (data as Row), maps.finishedGoods)
}

export interface DispatchFgInput {
  jobId: string
  qty: number
  referenceId?: string // delivery challan id when linked
  note?: string
}

export async function dispatchFg(input: DispatchFgInput): Promise<FinishedGoodsEntry> {
  const { data, error } = await sb().rpc('fg_dispatch', {
    p_id: uid('fg_'),
    p_job_id: input.jobId,
    p_qty: input.qty,
    p_reference_id: input.referenceId ?? null,
    p_note: input.note ?? null,
  })
  if (error) throw error
  return fromRow<FinishedGoodsEntry>((data as Row[])[0] ?? (data as Row), maps.finishedGoods)
}
