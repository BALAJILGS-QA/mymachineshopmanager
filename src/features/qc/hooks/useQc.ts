import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/qcApi'

export function useJobInspections(jobId: string) {
  return useQuery({
    queryKey: qk.qc.forJob(jobId),
    queryFn: () => api.listInspectionsForJob(jobId),
    enabled: !!jobId,
  })
}

export function useInspectionDetail(inspectionId: string) {
  return useQuery({
    queryKey: qk.qc.inspection(inspectionId),
    queryFn: () => api.getInspectionDetail(inspectionId),
    enabled: !!inspectionId,
  })
}

export function useRecordInspection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.RecordInspectionInput) => api.recordInspection(input),
    onSuccess: (ins) => {
      qc.invalidateQueries({ queryKey: qk.qc.forJob(ins.jobId) })
      qc.invalidateQueries({ queryKey: qk.jobs.all })
      qc.invalidateQueries({ queryKey: qk.production.events(ins.jobId) })
    },
  })
}
