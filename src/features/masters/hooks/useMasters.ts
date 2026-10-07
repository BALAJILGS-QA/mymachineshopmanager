import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import type { Machine, Operation, Routing, RoutingStep, WorkCenter } from '@/types'
import * as api from '../mastersApi'

// Generic master CRUD hook-set bound to a query key + api object.
function masterHooks<T extends { id: string }>(
  key: QueryKey,
  crud: {
    list: () => Promise<T[]>
    create: (input: Partial<T>) => Promise<T>
    update: (id: string, patch: Partial<T>) => Promise<T>
    remove: (id: string) => Promise<void>
  },
) {
  const useList = () => useQuery({ queryKey: key, queryFn: crud.list })
  const useCreate = () => {
    const client = useQueryClient()
    return useMutation({
      mutationFn: (input: Partial<T>) => crud.create(input),
      onSuccess: () => client.invalidateQueries({ queryKey: key }),
    })
  }
  const useUpdate = () => {
    const client = useQueryClient()
    return useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<T> }) => crud.update(id, patch),
      onSuccess: () => client.invalidateQueries({ queryKey: key }),
    })
  }
  const useRemove = () => {
    const client = useQueryClient()
    return useMutation({
      mutationFn: (id: string) => crud.remove(id),
      onSuccess: () => client.invalidateQueries({ queryKey: key }),
    })
  }
  return { useList, useCreate, useUpdate, useRemove }
}

export const workCenters = masterHooks<WorkCenter>(qk.masters.workCenters, api.workCentersApi)
export const machines = masterHooks<Machine>(qk.masters.machines, api.machinesApi)
export const operations = masterHooks<Operation>(qk.masters.operations, api.operationsApi)
export const routings = masterHooks<Routing>(qk.masters.routings, api.routingsApi)

// Convenience list hooks (used across pages/forms for pickers).
export const useWorkCenters = workCenters.useList
export const useMachines = machines.useList
export const useOperations = operations.useList
export const useRoutings = routings.useList

// ---- Routing steps ---------------------------------------------------------
export function useRoutingSteps(routingId: string) {
  return useQuery({
    queryKey: qk.masters.routingSteps(routingId),
    queryFn: () => api.listRoutingSteps(routingId),
    enabled: !!routingId,
  })
}

export function useCreateRoutingStep() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<RoutingStep> & { routingId: string }) =>
      api.createRoutingStep(input),
    onSuccess: (_d, v) =>
      client.invalidateQueries({ queryKey: qk.masters.routingSteps(v.routingId) }),
  })
}

export function useUpdateRoutingStep(routingId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RoutingStep> }) =>
      api.updateRoutingStep(id, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.masters.routingSteps(routingId) }),
  })
}

export function useDeleteRoutingStep(routingId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteRoutingStep(id),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.masters.routingSteps(routingId) }),
  })
}
