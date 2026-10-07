// Quality Control data-access — Supabase-direct. The inspection write is a single
// atomic SECURITY DEFINER RPC (qc_record_inspection, migration 0072) that stores
// the inspection + dimensions + 10-sample measurements, derives pass/fail, rolls
// up accepted/rejected/rework onto the job, and transitions the job status with
// prod_can() authorization. Reads use the RLS-gated qc_* tables directly.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb } from '@/lib/api/supabaseCrud'
import type {
  QcDecision,
  QcDimension,
  QcDimensionInput,
  QcInspection,
  QcMeasurement,
} from '@/types'

export async function listInspectionsForJob(jobId: string): Promise<QcInspection[]> {
  const { data, error } = await sb()
    .from(maps.qcInspections.table)
    .select('*')
    .eq('job_id', jobId)
    .order('inspected_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => fromRow<QcInspection>(r as Row, maps.qcInspections))
}

export interface InspectionDetail {
  dimensions: QcDimension[]
  measurements: QcMeasurement[]
}

export async function getInspectionDetail(inspectionId: string): Promise<InspectionDetail> {
  const dimRes = await sb()
    .from(maps.qcDimensions.table)
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('seq', { ascending: true })
  if (dimRes.error) throw dimRes.error
  const dimensions = (dimRes.data ?? []).map((r) =>
    fromRow<QcDimension>(r as Row, maps.qcDimensions),
  )
  if (dimensions.length === 0) return { dimensions, measurements: [] }
  const measRes = await sb()
    .from(maps.qcMeasurements.table)
    .select('*')
    .in(
      'dimension_id',
      dimensions.map((d) => d.id),
    )
  if (measRes.error) throw measRes.error
  const measurements = (measRes.data ?? []).map((r) =>
    fromRow<QcMeasurement>(r as Row, maps.qcMeasurements),
  )
  return { dimensions, measurements }
}

export interface RecordInspectionInput {
  jobId: string
  inspector?: string
  inspectorEmployeeId?: string
  producedQty: number
  acceptedQty: number
  rejectedQty: number
  reworkQty: number
  decision: QcDecision
  remarks?: string
  dimensions: QcDimensionInput[]
}

export async function recordInspection(input: RecordInspectionInput): Promise<QcInspection> {
  const { data, error } = await sb().rpc('qc_record_inspection', {
    p_inspection_id: uid('qci_'),
    p_job_id: input.jobId,
    p_inspector: input.inspector ?? null,
    p_inspector_employee_id: input.inspectorEmployeeId ?? null,
    p_produced: input.producedQty,
    p_accepted: input.acceptedQty,
    p_rejected: input.rejectedQty,
    p_rework: input.reworkQty,
    p_decision: input.decision,
    p_remarks: input.remarks ?? null,
    p_dimensions: input.dimensions,
    p_event_id: uid('pev_'),
  })
  if (error) throw error
  return fromRow<QcInspection>((data as Row[])[0] ?? (data as Row), maps.qcInspections)
}
