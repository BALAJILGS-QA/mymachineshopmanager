import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/reservationsApi'

// Per-order material status (required/reserved/consumed/free/balance).
export function useJobMaterialStatus(jobId: string) {
  return useQuery({
    queryKey: qk.reservations.status(jobId),
    queryFn: () => api.getJobMaterialStatus(jobId),
    enabled: !!jobId,
  })
}

// Reservation ledger for one order.
export function useReservationsForJob(jobId: string) {
  return useQuery({
    queryKey: qk.reservations.forJob(jobId),
    queryFn: () => api.listReservationsForJob(jobId),
    enabled: !!jobId,
  })
}

// A reservation movement changes reservations, the per-order status, and (for
// Consume) the physical stock ledger. Reservations are also reflected on the
// order's free stock, so refresh jobs too.
function invalidateReservation(qc: ReturnType<typeof useQueryClient>, jobId: string) {
  qc.invalidateQueries({ queryKey: qk.reservations.all })
  qc.invalidateQueries({ queryKey: qk.reservations.status(jobId) })
  qc.invalidateQueries({ queryKey: qk.stock.all })
  qc.invalidateQueries({ queryKey: qk.jobs.all })
}

export function useSetMaterialRequirement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      jobId,
      requiredQty,
      ownerScope,
    }: {
      jobId: string
      requiredQty: number
      ownerScope?: string | null
    }) => api.setMaterialRequirement(jobId, requiredQty, ownerScope),
    onSuccess: (_d, { jobId }) => invalidateReservation(qc, jobId),
  })
}

export function useReserveMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      jobId,
      quantity,
      override,
    }: {
      jobId: string
      quantity: number
      override?: boolean
    }) => api.reserveMaterial(jobId, quantity, override),
    onSuccess: (_d, { jobId }) => invalidateReservation(qc, jobId),
  })
}

export function useReleaseMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, quantity, note }: { jobId: string; quantity: number; note?: string }) =>
      api.releaseMaterial(jobId, quantity, note),
    onSuccess: (_d, { jobId }) => invalidateReservation(qc, jobId),
  })
}

export function useConsumeMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, quantity, note }: { jobId: string; quantity: number; note?: string }) =>
      api.consumeMaterial(jobId, quantity, note),
    onSuccess: (_d, { jobId }) => invalidateReservation(qc, jobId),
  })
}
