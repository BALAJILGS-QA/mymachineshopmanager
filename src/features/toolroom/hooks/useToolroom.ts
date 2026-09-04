// TanStack Query hooks for Tool Room. Pages talk only to these. Every mutation
// that moves stock invalidates BOTH the inventory view and the ledger (plus any
// record list it touches) so availability, history and records stay in lockstep.

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../toolroomApi'
import type {
  Tool,
  ToolCalibration,
  ToolCategory,
  ToolMaintenance,
  ToolReservation,
} from '../types'

interface CrudApi<T> {
  list: () => Promise<T[]>
  create: (input: Partial<T>) => Promise<T>
  update: (id: string, patch: Partial<T>) => Promise<T>
  remove: (id: string) => Promise<void>
}

function useCrud<T extends { id: string }>(key: QueryKey, crud: CrudApi<T>) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: key })
  const list = useQuery({ queryKey: key, queryFn: crud.list })
  const create = useMutation({ mutationFn: crud.create, onSuccess: invalidate })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<T> }) => crud.update(id, patch),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: (id: string) => crud.remove(id), onSuccess: invalidate })
  return { list, create, update, remove }
}

// ---- Masters + records -----------------------------------------------------
export const useToolCategories = () =>
  useCrud<ToolCategory>(qk.toolroom.categories, api.categoriesApi)
export const useTools = () => useCrud<Tool>(qk.toolroom.tools, api.toolsApi)
export const useReservations = () =>
  useCrud<ToolReservation>(qk.toolroom.reservations, api.reservationsApi)
export const useMaintenanceRecords = () =>
  useCrud<ToolMaintenance>(qk.toolroom.maintenance, api.maintenanceApi)
export const useCalibrationRecords = () =>
  useCrud<ToolCalibration>(qk.toolroom.calibrations, api.calibrationsApi)

export function useTool(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.toolroom.tool(id) : ['toolroom', 'tools', 'none'],
    queryFn: () => api.toolsApi.get(id as string),
    enabled: !!id,
  })
}

// ---- Inventory + ledger ----------------------------------------------------
export function useToolInventory() {
  return useQuery({ queryKey: qk.toolroom.inventory, queryFn: api.inventoryApi.list })
}

export function useToolTransactions(toolId?: string) {
  return useQuery({
    queryKey: qk.toolroom.transactions(toolId),
    queryFn: () => (toolId ? api.transactionsApi.forTool(toolId) : api.transactionsApi.list()),
  })
}

// ---- Actions (stock-moving) ------------------------------------------------
// One hook exposing every ledger action. Each mutation invalidates the shared
// caches (inventory view + ledger + record lists) so grids reflect moves at once.
// Mutation variables are the argument tuple of the underlying service function.
export function useToolActions() {
  const qc = useQueryClient()
  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: qk.toolroom.inventory })
    qc.invalidateQueries({ queryKey: ['toolroom', 'transactions'] })
    qc.invalidateQueries({ queryKey: qk.toolroom.reservations })
    qc.invalidateQueries({ queryKey: qk.toolroom.maintenance })
    qc.invalidateQueries({ queryKey: qk.toolroom.calibrations })
    qc.invalidateQueries({ queryKey: qk.toolroom.tools })
  }

  const receive = useMutation({ mutationFn: api.receiveTool, onSuccess })
  const issue = useMutation({
    mutationFn: (v: { input: Omit<api.MoveInput, 'txnType'>; fromReservation?: boolean }) =>
      api.issueTool(v.input, v.fromReservation),
    onSuccess,
  })
  const returnTool = useMutation({
    mutationFn: (v: {
      input: Omit<api.MoveInput, 'txnType'>
      disposition: api.ReturnDisposition
    }) => api.returnTool(v.input, v.disposition),
    onSuccess,
  })
  const consume = useMutation({ mutationFn: api.consumeTool, onSuccess })
  const reserve = useMutation({ mutationFn: api.reserveTool, onSuccess })
  const release = useMutation({ mutationFn: api.releaseReservation, onSuccess })
  const issueReservation = useMutation({
    mutationFn: (v: {
      res: ToolReservation
      qty: number
      ctx?: { machine?: string; employee?: string; note?: string }
    }) => api.issueFromReservation(v.res, v.qty, v.ctx),
    onSuccess,
  })
  const transfer = useMutation({ mutationFn: api.transferTool, onSuccess })
  const scrap = useMutation({ mutationFn: api.scrapTool, onSuccess })
  const adjust = useMutation({ mutationFn: api.adjustStock, onSuccess })
  const sendMaintenance = useMutation({ mutationFn: api.sendMaintenance, onSuccess })
  const completeMaintenance = useMutation({
    mutationFn: (v: {
      record: ToolMaintenance
      outcome: 'passed' | 'failed'
      patch?: Partial<ToolMaintenance>
    }) => api.completeMaintenance(v.record, v.outcome, v.patch),
    onSuccess,
  })
  const sendCalibration = useMutation({ mutationFn: api.sendCalibration, onSuccess })
  const completeCalibration = useMutation({
    mutationFn: (v: {
      record: ToolCalibration
      outcome: 'pass' | 'fail'
      patch?: Partial<ToolCalibration>
    }) => api.completeCalibration(v.record, v.outcome, v.patch),
    onSuccess,
  })

  return {
    receive,
    issue,
    returnTool,
    consume,
    reserve,
    release,
    issueReservation,
    transfer,
    scrap,
    adjust,
    sendMaintenance,
    completeMaintenance,
    sendCalibration,
    completeCalibration,
  }
}
