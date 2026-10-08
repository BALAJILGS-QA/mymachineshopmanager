// Quotation data-access — Supabase-direct. create/update/status/convert run
// through the server-side RPCs (0088) for atomicity, permission checks, status
// history and the idempotent job conversion. GST/total math lives in computations.ts.

import { uid } from '@/lib/id'
import { maps, fromRow, toRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll } from '@/lib/api/supabaseCrud'
import { nextNumberedDoc } from '@/lib/api/numbering'
import type {
  JobOrder,
  Quotation,
  QuotationLine,
  QuotationStatus,
  QuotationStatusHistory,
} from '@/types'

export type QuotationInput = Omit<
  Quotation,
  'id' | 'quotationNo' | 'createdAt' | 'updatedAt' | 'lines'
> & { lines?: QuotationLine[] }

export async function listQuotations(): Promise<Quotation[]> {
  return selectAll<Quotation>(maps.quotations)
}

export async function getQuotation(id: string): Promise<Quotation | null> {
  const { data, error } = await sb().from('quotations').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? fromRow<Quotation>(data as Row, maps.quotations) : null
}

export async function listQuotationLines(quotationId: string): Promise<QuotationLine[]> {
  const { data, error } = await sb()
    .from('quotation_lines')
    .select('*')
    .eq('quotation_id', quotationId)
    .order('line_no')
  if (error) throw error
  return (data as Row[]).map((r) => fromRow<QuotationLine>(r, maps.quotationLines))
}

export async function listQuotationHistory(quotationId: string): Promise<QuotationStatusHistory[]> {
  const { data, error } = await sb()
    .from('quotation_status_history')
    .select('*')
    .eq('quotation_id', quotationId)
    .order('at', { ascending: false })
  if (error) throw error
  return (data as Row[]).map((r) => fromRow<QuotationStatusHistory>(r, maps.quotationStatusHistory))
}

function headerJson(input: QuotationInput): Row {
  const row = toRow(input as unknown as Record<string, unknown>, maps.quotations)
  delete row.id
  delete row.quotation_no
  delete row.tenant_id
  delete row.created_at
  delete row.updated_at
  return row
}

function linesJson(lines: QuotationLine[] = []): Row[] {
  return lines.map((l, i) => ({
    id: l.id || '',
    line_no: l.lineNo || i + 1,
    part_number: l.partNumber ?? null,
    description: l.description,
    hsn: l.hsn ?? null,
    quantity: l.quantity ?? 1,
    unit: l.unit ?? null,
    unit_price: l.unitPrice ?? 0,
    discount_percent: l.discountPercent ?? 0,
    gst_percent: l.gstPercent ?? 0,
    line_total: l.lineTotal ?? 0,
  }))
}

export async function createQuotation(input: QuotationInput): Promise<Quotation> {
  const id = uid('quo_')
  const no = await nextNumberedDoc('quotation')
  const { data, error } = await sb().rpc('create_quotation', {
    p_id: id,
    p_quotation_no: no,
    p_header: headerJson(input),
    p_lines: linesJson(input.lines),
  })
  if (error) throw error
  return fromRow<Quotation>(data as Row, maps.quotations)
}

export async function updateQuotation(id: string, input: QuotationInput): Promise<Quotation> {
  const { data, error } = await sb().rpc('update_quotation', {
    p_id: id,
    p_header: headerJson(input),
    p_lines: linesJson(input.lines),
  })
  if (error) throw error
  return fromRow<Quotation>(data as Row, maps.quotations)
}

export async function setQuotationStatus(
  id: string,
  status: QuotationStatus,
  note?: string,
): Promise<Quotation> {
  const { data, error } = await sb().rpc('set_quotation_status', {
    p_id: id,
    p_status: status,
    p_note: note ?? null,
  })
  if (error) throw error
  return fromRow<Quotation>(data as Row, maps.quotations)
}

// Create a revision: a fresh Draft quotation that copies this one's content,
// bumps revision_no and links back via revises_quotation_id. The original is
// preserved untouched for traceability.
export async function reviseQuotation(
  source: Quotation,
  lines: QuotationLine[],
): Promise<Quotation> {
  const input: QuotationInput = {
    ...source,
    status: 'Draft',
    revisionNo: (source.revisionNo || 1) + 1,
    revisesQuotationId: source.id,
    jobOrderId: undefined,
    sentAt: undefined,
    acceptedAt: undefined,
    rejectedAt: undefined,
    approvedBy: undefined,
    approvedAt: undefined,
    lines,
  }
  return createQuotation(input)
}

// Convert an accepted quotation into a Production Order (idempotent server-side).
export async function convertQuotationToJob(quotationId: string): Promise<JobOrder> {
  const jobId = uid('job_')
  const jobNo = await nextNumberedDoc('job')
  const { data, error } = await sb().rpc('convert_quotation_to_job', {
    p_quotation_id: quotationId,
    p_job_id: jobId,
    p_job_no: jobNo,
  })
  if (error) throw error
  return fromRow<JobOrder>(data as Row, maps.jobs)
}
