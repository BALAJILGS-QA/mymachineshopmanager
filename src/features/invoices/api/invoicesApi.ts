// Invoices data-access (service) layer. Async by contract; delegates to
// invoiceRepo today, re-pointed at Supabase in phase 5b. Cancelling an invoice
// frees any delivery challan raised against it (handled in the repo), so the
// hook invalidates deliveries too.

import { invoiceRepo } from '@/data/repo'
import type { Invoice, InvoiceStatus } from '@/types'

export type InvoiceCreateInput = Parameters<typeof invoiceRepo.create>[0]
export type InvoiceUpdateInput = Parameters<typeof invoiceRepo.update>[1]

export async function listInvoices(): Promise<Invoice[]> {
  return invoiceRepo.list()
}

export async function createInvoice(input: InvoiceCreateInput): Promise<Invoice> {
  return invoiceRepo.create(input)
}

export async function updateInvoice(id: string, patch: InvoiceUpdateInput): Promise<Invoice> {
  return invoiceRepo.update(id, patch)
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
  return invoiceRepo.setStatus(id, status)
}
