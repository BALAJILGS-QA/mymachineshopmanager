import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/fgApi'

export function useFgBalances() {
  return useQuery({ queryKey: qk.fg.balances, queryFn: api.listFgBalances })
}

export function useFgForJob(jobId: string) {
  return useQuery({
    queryKey: qk.fg.forJob(jobId),
    queryFn: () => api.listFgForJob(jobId),
    enabled: !!jobId,
  })
}

export function useReceiveFg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.ReceiveFgInput) => api.receiveFg(input),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: qk.fg.forJob(row.jobId) })
      qc.invalidateQueries({ queryKey: qk.fg.balances })
      qc.invalidateQueries({ queryKey: qk.jobs.all })
      qc.invalidateQueries({ queryKey: qk.production.events(row.jobId) })
    },
  })
}

export function useDispatchFg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.DispatchFgInput) => api.dispatchFg(input),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: qk.fg.forJob(row.jobId) })
      qc.invalidateQueries({ queryKey: qk.fg.balances })
      qc.invalidateQueries({ queryKey: qk.jobs.all })
    },
  })
}
