// Inventory module domain types. The only new persistent entity is the Stock
// Transfer (migration 0029). Everything else in the Inventory module reuses the
// existing Materials & Stock data model (materials, receipts, issues,
// adjustments, the material_receipt_stock + inventory_ledger views).

export type StockTransferStatus =
  'draft' | 'requested' | 'approved' | 'in_transit' | 'completed' | 'cancelled'

export interface StockTransfer {
  id: string
  transferNo?: string
  materialId: string
  companyId?: string // null = own/shop scope
  fromLocation: string
  toLocation: string
  quantity: number
  unit?: string
  transferDate: string
  requestedBy?: string
  approvedBy?: string
  status?: StockTransferStatus
  remarks?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}
