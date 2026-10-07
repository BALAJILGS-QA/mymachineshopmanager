import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/laborApi'

// Open sessions power the real-time board; refetch on an interval so elapsed
// times and new clock-ins surface without a manual reload.
export function useOpenLabor() {
  return useQuery({
    queryKey: qk.labor.open,
    queryFn: api.listOpenLabor,
    refetchInterval: 20_000,
  })
}

export function useLaborForJob(jobId: string) {
  return useQuery({
    queryKey: qk.labor.forJob(jobId),
    queryFn: () => api.listLaborForJob(jobId),
    enabled: !!jobId,
  })
}

function useInvalidateLabor(jobId?: string) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: qk.labor.open })
    if (jobId) qc.invalidateQueries({ queryKey: qk.labor.forJob(jobId) })
  }
}

export function useClockIn(jobId?: string) {
  const invalidate = useInvalidateLabor(jobId)
  return useMutation({
    mutationFn: (input: api.ClockInInput) => api.clockIn(input),
    onSuccess: invalidate,
  })
}

export function useClockOut(jobId?: string) {
  const invalidate = useInvalidateLabor(jobId)
  return useMutation({
    mutationFn: ({
      id,
      note,
      downtimeReason,
    }: {
      id: string
      note?: string
      downtimeReason?: string
    }) => api.clockOut(id, { note, downtimeReason }),
    onSuccess: invalidate,
  })
}
