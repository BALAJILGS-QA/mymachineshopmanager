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
