// Invoices data-access - Supabase-direct. create runs an RPC that inserts the
// invoice + its lines atomically; status changes (cancel -> release challans) run
// an RPC. Lines are a child table, joined on read and replaced on update.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll, updateRow } from '@/lib/api/supabaseCrud'
import { nextNumberedDoc } from '@/lib/api/numbering'
import type { Invoice, InvoiceLine, InvoiceStatus } from '@/types'

export type InvoiceCreateInput = Omit<Invoice, 'id' | 'invoiceNo' | 'createdAt' | 'updatedAt'> & {
  invoiceNo?: string
}
export type InvoiceUpdateInput = Partial<Invoice>

function lineFromRow(r: Row): InvoiceLine {
  return {
    id: r.id as string,
    jobId: (r.job_id as string) ?? undefined,
    description: r.description as string,
    quantity: Number(r.quantity),
    rate: Number(r.rate),
    materialId: (r.material_id as string) ?? undefined,
    ownerType: (r.owner_type as InvoiceLine['ownerType']) ?? undefined,
    sourceReceiptId: (r.source_receipt_id as string) ?? undefined,
  }
}

export async function listInvoices(): Promise<Invoice[]> {
  const invoices = await selectAll<Invoice>(maps.invoices)
  const { data: lineRows, error } = await sb()
    .from('invoice_lines')
    .select('*')
    .order('line_no', { ascending: true })
  if (error) throw error
  const byInvoice = new Map<string, InvoiceLine[]>()
  for (const r of (lineRows ?? []) as Row[]) {
    const arr = byInvoice.get(r.invoice_id as string) ?? []
    arr.push(lineFromRow(r))
    byInvoice.set(r.invoice_id as string, arr)
  }
  return invoices.map((inv) => ({ ...inv, lines: byInvoice.get(inv.id) ?? [] }))
}

export async function createInvoice(input: InvoiceCreateInput): Promise<Invoice> {
  const invoiceNo = input.invoiceNo?.trim() || (await nextNumberedDoc('invoice'))
  const lines = input.lines.map((l) => ({
    id: l.id || uid('l_'),
    jobId: l.jobId ?? '',
    description: l.description,
    quantity: l.quantity,
    rate: l.rate,
    // A line with a materialId deducts stock server-side (create_invoice RPC);
    // a sourceReceiptId makes it consume that specific received stock.
    materialId: l.materialId ?? '',
    ownerType: l.ownerType ?? '',
    sourceReceiptId: l.sourceReceiptId ?? '',
    unit: l.unit ?? '',
  }))
  const { data, error } = await sb().rpc('create_invoice', {
    p_id: uid('inv_'),
    p_invoice_no: invoiceNo,
    p_date: input.date,
    p_company_id: input.companyId,
    p_billing_address: input.billingAddress ?? null,
    p_shipping_address: input.shippingAddress ?? null,
    p_reference: input.reference ?? null,
    p_dc_reference: input.dcReference ?? null,
    p_discount: input.discount,
    p_tax_percent: input.taxPercent,
    p_cgst_percent: input.cgstPercent ?? null,
    p_sgst_percent: input.sgstPercent ?? null,
    p_status: input.status,
    p_notes: input.notes ?? null,
    p_lines: lines,
  })
  if (error) throw error
  const inv = fromRow<Invoice>((data as Row[])[0], maps.invoices)
  return { ...inv, lines: input.lines }
}

export async function updateInvoice(id: string, patch: InvoiceUpdateInput): Promise<Invoice> {
  const header = await updateRow<Invoice>(maps.invoices, id, patch) // 'lines' isn't a column, ignored
  if (patch.lines) {
    await sb().from('invoice_lines').delete().eq('invoice_id', id)
    if (patch.lines.length) {
      const rows = patch.lines.map((l, i) => ({
        id: l.id || uid('l_'),
        invoice_id: id,
        job_id: l.jobId ?? null,
        description: l.description,
        quantity: l.quantity,
        rate: l.rate,
        line_no: i,
        // Persist every line field on edit, including the stock link. The
        // per-source stock view derives an invoice's dispatched quantity from
        // material_id + source_receipt_id + quantity on the line, so keeping
        // source_receipt_id here lets edits (qty/material/source) flow through
        // to stock instead of silently dropping the allocation.
        material_id: l.materialId ?? null,
        owner_type: l.ownerType ?? null,
        source_receipt_id: l.sourceReceiptId ?? null,
      }))
      const { error } = await sb().from('invoice_lines').insert(rows)
      if (error) throw error
    }
  }
  return { ...header, lines: patch.lines ?? [] }
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
  const { data, error } = await sb().rpc('set_invoice_status', { p_id: id, p_status: status })
  if (error) throw error
  return { ...fromRow<Invoice>((data as Row[])[0], maps.invoices), lines: [] }
}
