import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/productionApi'

export function useJobDocuments(jobId: string) {
  return useQuery({
    queryKey: qk.production.documents(jobId),
    queryFn: () => api.listJobDocuments(jobId),
    enabled: !!jobId,
  })
}

export function useUploadJobDrawing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.UploadDrawingInput) => api.uploadJobDrawing(input),
    onSuccess: (doc) => qc.invalidateQueries({ queryKey: qk.production.documents(doc.jobId) }),
  })
}

export function usePrograms(jobId: string) {
  return useQuery({
    queryKey: qk.production.programs(jobId),
    queryFn: () => api.listPrograms(jobId),
    enabled: !!jobId,
  })
}

export function useProgramRevisions(programId: string) {
  return useQuery({
    queryKey: qk.production.programRevisions(programId),
    queryFn: () => api.listProgramRevisions(programId),
    enabled: !!programId,
  })
}

export function useCreateProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.CreateProgramInput) => api.createProgram(input),
    onSuccess: (p) => qc.invalidateQueries({ queryKey: qk.production.programs(p.jobId) }),
  })
}

export function useAddProgramRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.AddRevisionInput) => api.addProgramRevision(input),
    onSuccess: (rev) => {
      qc.invalidateQueries({ queryKey: qk.production.programRevisions(rev.programId) })
      qc.invalidateQueries({ queryKey: ['production', 'programs'] }) // refresh program status
    },
  })
}

export function useApproveProgramRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (revisionId: string) => api.approveProgramRevision(revisionId),
    onSuccess: (rev) => {
      qc.invalidateQueries({ queryKey: qk.production.programRevisions(rev.programId) })
      qc.invalidateQueries({ queryKey: ['production', 'programs'] })
    },
  })
}
