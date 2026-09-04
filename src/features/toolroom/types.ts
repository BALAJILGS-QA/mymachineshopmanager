// Tool Room domain types. camelCase mirrors the snake_case columns mapped in
// src/lib/api/rowMap.ts (toolCategories, tools, toolTransactions, toolInventory,
// toolReservations, toolMaintenance, toolCalibrations).

export type ToolBucket =
  | 'available'
  | 'reserved'
  | 'issued'
  | 'maintenance'
  | 'calibration'
  | 'damaged'
  | 'scrap'
  | 'consumed'

// Every ledger movement type understood by the tool_move() RPC. The RPC derives
// the required permission + bucket transition from this, so the client never
// chooses buckets directly.
export type ToolTxnType =
  | 'receipt'
  | 'reserve'
  | 'release'
  | 'issue'
  | 'issue_reserved'
  | 'return_available'
  | 'return_damaged'
  | 'return_maintenance'
  | 'return_calibration'
  | 'consume'
  | 'transfer'
  | 'maintenance_send'
  | 'maintenance_pass'
  | 'maintenance_scrap'
  | 'calibrate_send'
  | 'calibrate_pass'
  | 'calibrate_scrap'
  | 'scrap'
  | 'adjust'

export interface ToolCategory {
  id: string
  code?: string
  name: string
  description?: string
  parentId?: string
  active?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Tool {
  id: string
  code?: string
  name: string
  categoryId?: string
  subCategory?: string
  classification?: string
  toolType?: string
  description?: string
  manufacturer?: string
  brand?: string
  modelNumber?: string
  partNumber?: string
  oemNumber?: string
  serialNumber?: string
  specification?: string
  size?: string
  dimension?: string
  material?: string
  grade?: string
  standard?: string
  uom?: string
  minStock?: number
  maxStock?: number
  reorderLevel?: number
  reorderQty?: number
  safetyStock?: number
  binLocation?: string
  rack?: string
  shelf?: string
  storeLocation?: string
  warehouse?: string
  toolRoomLocation?: string
  purchaseDate?: string
  expectedLife?: number
  lifeUnit?: string
  replacementFrequency?: string
  currentCondition?: string
  unitCost?: number
  isSerialized?: boolean
  isBatchControlled?: boolean
  isLotControlled?: boolean
  calibrationRequired?: boolean
  calibrationFrequencyDays?: number
  maintenanceRequired?: boolean
  maintenanceFrequencyDays?: number
  inspectionRequired?: boolean
  returnRequired?: boolean
  isConsumable?: boolean
  status?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}

export interface ToolTransaction {
  id: string
  txnNo?: string
  toolId: string
  txnType: ToolTxnType
  qty: number
  fromBucket?: ToolBucket
  toBucket?: ToolBucket
  unit?: string
  unitCost?: number
  locationFrom?: string
  locationTo?: string
  jobId?: string
  machine?: string
  operation?: string
  employee?: string
  department?: string
  purpose?: string
  condition?: string
  reservationId?: string
  maintenanceId?: string
  calibrationId?: string
  serialNumber?: string
  batchNo?: string
  refType?: string
  refId?: string
  refNo?: string
  refKey?: string
  note?: string
  actorEmail?: string
  at?: string
}

// Row shape of the tool_inventory view (server-aggregated bucket balances).
export interface ToolInventoryRow {
  toolId: string
  code?: string
  name: string
  categoryId?: string
  brand?: string
  partNumber?: string
  serialNumber?: string
  uom?: string
  storeLocation?: string
  warehouse?: string
  toolRoomLocation?: string
  binLocation?: string
  minStock: number
  reorderLevel: number
  isConsumable?: boolean
  toolStatus?: string
  availableQty: number
  reservedQty: number
  issuedQty: number
  maintenanceQty: number
  calibrationQty: number
  damagedQty: number
  scrapQty: number
  consumedQty: number
  onHandQty: number
  netQty: number
  isOutOfStock?: boolean
  isLowStock?: boolean
}

export interface ToolReservation {
  id: string
  reservationNo?: string
  toolId: string
  qty: number
  issuedQty?: number
  requiredDate?: string
  jobId?: string
  machine?: string
  operation?: string
  employee?: string
  reservedBy?: string
  status?: 'reserved' | 'partially_issued' | 'fully_issued' | 'cancelled' | 'completed'
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export interface ToolMaintenance {
  id: string
  maintenanceNo?: string
  toolId: string
  qty?: number
  serialNumber?: string
  maintenanceType?: string
  maintenanceDate?: string
  dueDate?: string
  serviceProvider?: string
  technician?: string
  cost?: number
  partsUsed?: string
  description?: string
  result?: 'passed' | 'failed'
  condition?: string
  nextDueDate?: string
  status?: 'open' | 'completed' | 'scrapped'
  createdAt?: string
  updatedAt?: string
}

export interface ToolCalibration {
  id: string
  calibrationNo?: string
  toolId: string
  qty?: number
  serialNumber?: string
  calibrationDate?: string
  dueDate?: string
  agency?: string
  certificateNo?: string
  result?: 'pass' | 'fail'
  accuracy?: string
  tolerance?: string
  status?: 'valid' | 'due_soon' | 'overdue' | 'failed'
  certificatePath?: string
  remarks?: string
  createdAt?: string
  updatedAt?: string
}
