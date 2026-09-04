// Inventory module hooks. Stock Transfers get their own CRUD hook; everything
// else the Inventory pages need is re-exported from the existing Materials
// hooks so there is exactly one stock data layer.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../inventoryApi'
import type { StockTransfer } from '../types'

export function useStockTransfers() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.inventory.transfers })
  const list = useQuery({ queryKey: qk.inventory.transfers, queryFn: api.listTransfers })
  const create = useMutation({ mutationFn: api.createTransfer, onSuccess: invalidate })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<StockTransfer> }) =>
      api.updateTransfer(id, patch),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.removeTransfer(id),
    onSuccess: invalidate,
  })
  return { list, create, update, remove }
}

// Re-export the existing materials/stock hooks so Inventory pages import from one
// place without duplicating the data layer.
export {
  useMaterials,
  useReceipts,
  useIssues,
  useAdjustments,
  useOwnPurchases,
  useSourceStock,
  useLedger,
} from '@/features/materials/hooks/useMaterials'
