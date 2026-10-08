import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import type { EstimationStatus } from '@/types'
import * as api from '../api/estimationApi'

export function useEstimations() {
  return useQuery({ queryKey: qk.estimations.all, queryFn: api.listEstimations })
}

export function useEstimation(id: string) {
  return useQuery({
    queryKey: qk.estimations.detail(id),
    queryFn: () => api.getEstimation(id),
    enabled: !!id,
  })
}

export function useEstimationOperations(id: string) {
  return useQuery({
    queryKey: qk.estimations.operations(id),
    queryFn: () => api.listEstimationOperations(id),
    enabled: !!id,
  })
}

function useInvalidate() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: qk.estimations.all })
}

export function useCreateEstimation() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: api.createEstimation, onSuccess: invalidate })
}

export function useUpdateEstimation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.EstimationInput }) =>
      api.updateEstimation(id, input),
    onSuccess: (_d, { id }) => {
      client.invalidateQueries({ queryKey: qk.estimations.all })
      client.invalidateQueries({ queryKey: qk.estimations.detail(id) })
      client.invalidateQueries({ queryKey: qk.estimations.operations(id) })
    },
  })
}

export function useSetEstimationStatus() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: EstimationStatus }) =>
      api.setEstimationStatus(id, status),
    onSuccess: (_d, { id }) => {
      client.invalidateQueries({ queryKey: qk.estimations.all })
      client.invalidateQueries({ queryKey: qk.estimations.detail(id) })
    },
  })
}

export function useDeleteEstimation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api.deleteEstimation(id),
    onSuccess: invalidate,
  })
}
