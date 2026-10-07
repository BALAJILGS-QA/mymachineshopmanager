import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import type { JobOperation } from '@/types'
import * as api from '../api/jobOperationsApi'

export function useJobOperations(jobId: string) {
  return useQuery({
    queryKey: qk.jobOperations.forJob(jobId),
    queryFn: () => api.listJobOperations(jobId),
    enabled: !!jobId,
  })
}

function useInvalidate(jobId: string) {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: qk.jobOperations.forJob(jobId) })
}

export function useCreateJobOperation(jobId: string) {
  const invalidate = useInvalidate(jobId)
  return useMutation({
    mutationFn: (input: Partial<JobOperation>) => api.createJobOperation({ jobId, ...input }),
    onSuccess: invalidate,
  })
}

export function useUpdateJobOperation(jobId: string) {
  const invalidate = useInvalidate(jobId)
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<JobOperation> }) =>
      api.updateJobOperation(id, patch),
    onSuccess: invalidate,
  })
}

export function useDeleteJobOperation(jobId: string) {
  const invalidate = useInvalidate(jobId)
  return useMutation({
    mutationFn: (id: string) => api.deleteJobOperation(id),
    onSuccess: invalidate,
  })
}

export function useInstantiateRouting(jobId: string) {
  const invalidate = useInvalidate(jobId)
  return useMutation({
    mutationFn: ({ routingId, replace }: { routingId: string; replace?: boolean }) =>
      api.instantiateRouting(jobId, routingId, replace ?? true),
    onSuccess: invalidate,
  })
}

export function useStartJobOperation(jobId: string) {
  const invalidate = useInvalidate(jobId)
  return useMutation({
    mutationFn: ({ id, operator }: { id: string; operator?: string }) =>
      api.startJobOperation(id, operator),
    onSuccess: invalidate,
  })
}

export function useCompleteJobOperation(jobId: string) {
  const invalidate = useInvalidate(jobId)
  return useMutation({
    mutationFn: ({
      id,
      qty,
      actualMin,
      note,
    }: {
      id: string
      qty?: number
      actualMin?: number
      note?: string
    }) => api.completeJobOperation(id, { qty, actualMin, note }),
    onSuccess: invalidate,
  })
}

export function useSkipJobOperation(jobId: string) {
  const invalidate = useInvalidate(jobId)
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => api.skipJobOperation(id, note),
    onSuccess: invalidate,
  })
}
