import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/jobsApi'

export function useJobs() {
  return useQuery({ queryKey: qk.jobs.all, queryFn: api.listJobs })
}

export function useJobEvents(jobId: string) {
  return useQuery({
    queryKey: qk.production.events(jobId),
    queryFn: () => api.listJobEvents(jobId),
    enabled: !!jobId,
  })
}

export function useCreateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.JobCreateInput) => api.createJob(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.jobs.all })
      // Creating a job can auto-issue material — refresh stock.
      qc.invalidateQueries({ queryKey: qk.stock.all })
    },
  })
}

export function useUpdateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.JobUpdateInput }) =>
      api.updateJob(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.jobs.all }),
  })
}

export function useDeleteJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.jobs.all }),
  })
}

export function useTransitionJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      to,
      opts,
    }: {
      id: string
      to: Parameters<typeof api.transitionJob>[1]
      opts?: api.JobTransitionOpts
    }) => api.transitionJob(id, to, opts),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: qk.jobs.all })
      qc.invalidateQueries({ queryKey: qk.production.events(job.id) })
    },
  })
}
