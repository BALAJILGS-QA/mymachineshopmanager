// Payments data-access (service) layer. Async by contract; delegates to
// paymentRepo today, re-pointed at Supabase in phase 5b. Creating/removing a
// payment also recomputes the linked invoice's status inside the repo.

import { paymentRepo } from '@/data/repo'
import type { Payment } from '@/types'

export type PaymentCreateInput = Parameters<typeof paymentRepo.create>[0]

export async function listPayments(): Promise<Payment[]> {
  return paymentRepo.list()
}

export async function createPayment(input: PaymentCreateInput): Promise<Payment> {
  return paymentRepo.create(input)
}

export async function deletePayment(id: string): Promise<void> {
  paymentRepo.remove(id)
}
