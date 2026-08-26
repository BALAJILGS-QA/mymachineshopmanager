// Delivery challans data-access (service) layer. Async by contract; delegates to
// dcRepo today, re-pointed at Supabase in phase 5b. Status changes (invoiced /
// cancelled) and reopen interact with invoices — the hooks invalidate both.

import { dcRepo } from '@/data/repo'
import type { DeliveryChallan, DcStatus } from '@/types'

export type DcCreateInput = Parameters<typeof dcRepo.create>[0]
export type DcUpdateInput = Parameters<typeof dcRepo.update>[1]

export async function listChallans(): Promise<DeliveryChallan[]> {
  return dcRepo.list()
}

export async function createChallan(input: DcCreateInput): Promise<DeliveryChallan> {
  return dcRepo.create(input)
}

export async function updateChallan(id: string, patch: DcUpdateInput): Promise<DeliveryChallan> {
  return dcRepo.update(id, patch)
}

export async function deleteChallan(id: string): Promise<void> {
  dcRepo.remove(id)
}

export async function setChallanStatus(
  id: string,
  status: DcStatus,
  invoiceId?: string,
): Promise<DeliveryChallan> {
  return dcRepo.setStatus(id, status, invoiceId)
}

export async function reopenChallan(id: string): Promise<DeliveryChallan> {
  return dcRepo.reopen(id)
}
