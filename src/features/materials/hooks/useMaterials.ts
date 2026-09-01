import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import { sb } from '@/lib/api/supabaseCrud'
import { SHOP_SCOPE, roundMoney } from '@/data/computations'
import type { MaterialReceiptStock } from '@/types'
import { useChallans } from '@/features/deliveries/hooks/useDeliveries'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import * as api from '../api/materialsApi'

// Balance of a material in an owner scope via the material_balance RPC.
// scope: undefined/SHOP_SCOPE -> shop stock (company_id null); else a company id.
export function useMaterialBalance(materialId: string, scope?: string) {
  const companyId = !scope || scope === SHOP_SCOPE ? null : scope
  return useQuery({
    queryKey: ['materialBalance', materialId, companyId ?? 'shop'],
    queryFn: async () => {
      const { data, error } = await sb().rpc('material_balance', {
        p_material_id: materialId,
        p_company_id: companyId,
      })
      if (error) throw error
      return Number(data)
    },
    enabled: !!materialId,
  })
}

// ---- Materials master ----
export function useMaterials() {
  return useQuery({ queryKey: qk.materials.all, queryFn: api.listMaterials })
}

export function useCreateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.MaterialCreateInput) => api.createMaterial(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.materials.all }),
  })
}

export function useUpdateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.MaterialUpdateInput }) =>
      api.updateMaterial(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.materials.all }),
  })
}

export function useDeleteMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteMaterial(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.materials.all }),
  })
}

// ---- Stock movements ----
export function useReceipts() {
  return useQuery({ queryKey: qk.stock.receipts, queryFn: api.listReceipts })
}
export function useIssues() {
  return useQuery({ queryKey: qk.stock.issues, queryFn: api.listIssues })
}
export function useAdjustments() {
  return useQuery({ queryKey: qk.stock.adjustments, queryFn: api.listAdjustments })
}

// Any stock movement changes balances everywhere → invalidate the whole 'stock'
// prefix (receipts + issues + adjustments).
function invalidateStock(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.stock.all })
}

export function useCreateReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.ReceiptInput) => api.createReceipt(input),
    onSuccess: () => invalidateStock(qc),
  })
}

export function useCreateIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ input, override }: { input: api.IssueInput; override?: boolean }) =>
      api.createIssue(input, override),
    onSuccess: () => invalidateStock(qc),
  })
}

export function useCreateAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.AdjustmentInput) => api.createAdjustment(input),
    onSuccess: () => invalidateStock(qc),
  })
}

export function useUpdateReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.ReceiptUpdateInput }) =>
      api.updateReceipt(id, patch),
    onSuccess: () => invalidateStock(qc),
  })
}

export function useRemoveReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.removeReceipt(id),
    onSuccess: () => invalidateStock(qc),
  })
}

export function useRemoveIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.removeIssue(id),
    onSuccess: () => invalidateStock(qc),
  })
}

// ---- Own material purchases + ledger ----
export function useOwnPurchases() {
  return useQuery({ queryKey: qk.stock.ownPurchases, queryFn: api.listOwnPurchases })
}

export function useCreateOwnPurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.OwnPurchaseInput) => api.createOwnPurchase(input),
    onSuccess: () => {
      invalidateStock(qc) // receipts/ledger/ownPurchases (prefix)
      qc.invalidateQueries({ queryKey: qk.expenses.all }) // linked expense
    },
  })
}

export function useLedger(filter: api.LedgerFilter = {}) {
  return useQuery({
    queryKey: [...qk.stock.ledger, filter],
    queryFn: () => api.listLedger(filter),
  })
}

// Per-source stock (material_receipt_stock view): received/dispatched/available
// per received stock. Feeds the per-source stock grid and dispatch source picker.
export function useReceiptStock(filter: api.ReceiptStockFilter = {}) {
  return useQuery({
    queryKey: [...qk.stock.receiptStock, filter],
    queryFn: () => api.listReceiptStock(filter),
  })
}

// Client-side per-source stock. Dispatched quantities are read from the DOCUMENTS
// themselves — each delivery-challan / invoice line records which received stock
// (sourceReceiptId) it consumed — so per-source Available is accurate whether or
// not migration 0015 has tagged the issue ledger. A source's Available =
// Received − dispatched by all active documents + source adjustments.
//   • availableOnly  — hide depleted sources (dispatch pickers).
//   • excludeChallanId — omit this challan's own dispatch, so when editing a
//     challan its lines are "free" to re-allocate (Available shows the headroom
//     excluding itself).
export function useSourceStock(
  filter: {
    scope?: string
    materialId?: string
    availableOnly?: boolean
    excludeChallanId?: string
  } = {},
): MaterialReceiptStock[] {
  const { data: receipts = [] } = useReceipts()
  const { data: adjustments = [] } = useAdjustments()
  const { data: challans = [] } = useChallans()
  const { data: invoices = [] } = useInvoices()
  const { scope, materialId, availableOnly, excludeChallanId } = filter
  return useMemo(() => {
    const dcBy = new Map<string, number>()
    const invBy = new Map<string, number>()
    const adjBy = new Map<string, number>()
    // Delivery-challan dispatches (skip cancelled + this challan when editing).
    for (const c of challans) {
      if (c.status === 'Cancelled') continue
      if (excludeChallanId && c.id === excludeChallanId) continue
      for (const l of c.lines) {
        const sid = l.sourceReceiptId
        if (sid && l.quantity > 0) dcBy.set(sid, (dcBy.get(sid) ?? 0) + l.quantity)
      }
    }
    // Direct-invoice dispatches (skip cancelled).
    for (const iv of invoices) {
      if (iv.status === 'Cancelled') continue
      for (const l of iv.lines) {
        const sid = l.sourceReceiptId
        if (sid && l.quantity > 0) invBy.set(sid, (invBy.get(sid) ?? 0) + l.quantity)
      }
    }
    for (const a of adjustments) {
      if (a.sourceReceiptId)
        adjBy.set(a.sourceReceiptId, (adjBy.get(a.sourceReceiptId) ?? 0) + a.quantity)
    }
    let rows: MaterialReceiptStock[] = receipts.map((r) => {
      const dcQty = roundMoney(dcBy.get(r.id) ?? 0)
      const invoiceQty = roundMoney(invBy.get(r.id) ?? 0)
      const adjusted = roundMoney(adjBy.get(r.id) ?? 0)
      const totalDispatched = roundMoney(dcQty + invoiceQty)
      const available = roundMoney(r.quantity - totalDispatched + adjusted)
      return {
        receiptId: r.id,
        receiptNo: r.receiptNo,
        date: r.date,
        materialId: r.materialId,
        companyId: r.companyId,
        ownerType: r.ownerType,
        ownership: r.companyId == null ? 'Shop' : 'Company',
        sourceDocNo: r.reference,
        supplier: r.supplier,
        unit: r.unit,
        received: roundMoney(r.quantity),
        dcQty,
        invoiceQty,
        otherOut: 0,
        totalDispatched,
        adjusted,
        available,
        status: available <= 0 ? 'Fully Dispatched' : 'Available',
      }
    })
    if (scope === SHOP_SCOPE) rows = rows.filter((r) => r.companyId == null)
    else if (scope) rows = rows.filter((r) => r.companyId === scope)
    if (materialId) rows = rows.filter((r) => r.materialId === materialId)
    if (availableOnly) rows = rows.filter((r) => r.available > 0)
    return rows
  }, [
    receipts,
    adjustments,
    challans,
    invoices,
    scope,
    materialId,
    availableOnly,
    excludeChallanId,
  ])
}
