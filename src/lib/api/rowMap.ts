// Canonical mapping between TypeScript domain fields (camelCase) and Postgres
// columns (snake_case), plus generic row<->entity converters. Every Supabase
// api module uses this so the mapping lives in exactly one place. (This replaces
// the private M[] table inside data/backend.ts, which Part D removes.)

export interface TableMap {
  table: string
  fields: Record<string, string> // tsField -> db_column
  numeric: string[] // tsFields that must be coerced to Number on read
}

export const maps = {
  companies: {
    table: 'companies',
    numeric: [],
    fields: {
      id: 'id',
      code: 'code',
      name: 'name',
      contactPerson: 'contact_person',
      phone: 'phone',
      email: 'email',
      billingAddress: 'billing_address',
      gstin: 'gstin',
      active: 'active',
      notes: 'notes',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  materials: {
    table: 'materials',
    numeric: ['defaultRate', 'reorderLevel'],
    fields: {
      id: 'id',
      code: 'code',
      name: 'name',
      companyId: 'company_id',
      type: 'type',
      unit: 'unit',
      description: 'description',
      defaultRate: 'default_rate',
      reorderLevel: 'reorder_level',
      active: 'active',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  products: {
    table: 'products',
    numeric: ['rate'],
    fields: {
      id: 'id',
      code: 'code',
      name: 'name',
      rate: 'rate',
      unit: 'unit',
      hsn: 'hsn',
      active: 'active',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  jobs: {
    table: 'job_orders',
    numeric: ['orderedQty', 'completedQty', 'rejectedQty', 'rate'],
    fields: {
      id: 'id',
      jobNo: 'job_no',
      companyId: 'company_id',
      customerPo: 'customer_po',
      partName: 'part_name',
      partNumber: 'part_number',
      materialId: 'material_id',
      orderedQty: 'ordered_qty',
      completedQty: 'completed_qty',
      rejectedQty: 'rejected_qty',
      rate: 'rate',
      orderDate: 'order_date',
      dueDate: 'due_date',
      priority: 'priority',
      status: 'status',
      notes: 'notes',
      startedAt: 'started_at',
      completedAt: 'completed_at',
      deliveredAt: 'delivered_at',
      operator: 'operator',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  productionEvents: {
    table: 'production_events',
    numeric: ['completedQty'],
    fields: {
      id: 'id',
      jobId: 'job_id',
      type: 'type',
      fromStatus: 'from_status',
      toStatus: 'to_status',
      completedQty: 'completed_qty',
      note: 'note',
      operator: 'operator',
      at: 'at',
    },
  },
  receipts: {
    table: 'material_receipts',
    numeric: ['quantity', 'rate'],
    fields: {
      id: 'id',
      receiptNo: 'receipt_no',
      date: 'date',
      materialId: 'material_id',
      ownerType: 'owner_type',
      companyId: 'company_id',
      jobId: 'job_id',
      supplier: 'supplier',
      quantity: 'quantity',
      unit: 'unit',
      rate: 'rate',
      batchNo: 'batch_no',
      reference: 'reference',
      notes: 'notes',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  issues: {
    table: 'material_issues',
    numeric: ['quantity'],
    fields: {
      id: 'id',
      issueNo: 'issue_no',
      date: 'date',
      materialId: 'material_id',
      jobId: 'job_id',
      companyId: 'company_id',
      quantity: 'quantity',
      unit: 'unit',
      note: 'note',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  adjustments: {
    table: 'stock_adjustments',
    numeric: ['quantity'],
    fields: {
      id: 'id',
      adjNo: 'adj_no',
      date: 'date',
      materialId: 'material_id',
      companyId: 'company_id',
      quantity: 'quantity',
      unit: 'unit',
      reason: 'reason',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  deliveryChallans: {
    table: 'delivery_challans',
    numeric: [],
    fields: {
      id: 'id',
      dcNo: 'dc_no',
      date: 'date',
      companyId: 'company_id',
      jobId: 'job_id',
      reference: 'reference',
      vehicleNo: 'vehicle_no',
      lines: 'lines',
      notes: 'notes',
      status: 'status',
      invoiceId: 'invoice_id',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  invoices: {
    table: 'invoices',
    numeric: ['discount', 'taxPercent', 'cgstPercent', 'sgstPercent'],
    fields: {
      id: 'id',
      invoiceNo: 'invoice_no',
      date: 'date',
      companyId: 'company_id',
      billingAddress: 'billing_address',
      shippingAddress: 'shipping_address',
      reference: 'reference',
      dcReference: 'dc_reference',
      discount: 'discount',
      taxPercent: 'tax_percent',
      cgstPercent: 'cgst_percent',
      sgstPercent: 'sgst_percent',
      status: 'status',
      notes: 'notes',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  payments: {
    table: 'payments',
    numeric: ['amount'],
    fields: {
      id: 'id',
      paymentNo: 'payment_no',
      date: 'date',
      companyId: 'company_id',
      invoiceId: 'invoice_id',
      amount: 'amount',
      method: 'method',
      reference: 'reference',
      isAdvance: 'is_advance',
      notes: 'notes',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  expenses: {
    table: 'expenses',
    numeric: ['amount'],
    fields: {
      id: 'id',
      expenseNo: 'expense_no',
      date: 'date',
      category: 'category',
      amount: 'amount',
      method: 'method',
      vendor: 'vendor',
      reference: 'reference',
      companyId: 'company_id',
      jobId: 'job_id',
      notes: 'notes',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  auditLog: {
    table: 'audit_log',
    numeric: [],
    fields: {
      id: 'id',
      at: 'at',
      entity: 'entity',
      entityId: 'entity_id',
      action: 'action',
      summary: 'summary',
      actor: 'actor',
    },
  },
  ownPurchases: {
    table: 'own_material_purchases',
    numeric: ['quantity', 'totalCost', 'totalGst', 'totalAmount'],
    fields: {
      id: 'id',
      supplier: 'supplier',
      materialId: 'material_id',
      purchaseDate: 'purchase_date',
      quantity: 'quantity',
      unit: 'unit',
      totalCost: 'total_cost',
      totalGst: 'total_gst',
      totalAmount: 'total_amount',
      notes: 'notes',
      receiptId: 'receipt_id',
      expenseId: 'expense_id',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  inventoryLedger: {
    table: 'inventory_ledger',
    numeric: ['qtyIn', 'qtyOut'],
    fields: {
      id: 'id',
      materialId: 'material_id',
      companyId: 'company_id',
      ownership: 'ownership',
      txnType: 'txn_type',
      qtyIn: 'qty_in',
      qtyOut: 'qty_out',
      unit: 'unit',
      date: 'date',
      docNo: 'doc_no',
      referenceType: 'reference_type',
      referenceId: 'reference_id',
      note: 'note',
      createdAt: 'created_at',
    },
  },
} satisfies Record<string, TableMap>

export type Row = Record<string, unknown>

// DB row -> TS entity. null -> undefined; numeric strings -> Number.
export function fromRow<T>(row: Row, map: TableMap): T {
  const obj: Record<string, unknown> = {}
  for (const [tsField, col] of Object.entries(map.fields)) {
    let v = row[col]
    if (v === null) v = undefined
    else if (map.numeric.includes(tsField) && v !== undefined) v = Number(v)
    obj[tsField] = v
  }
  return obj as T
}

// TS entity -> DB row. undefined -> null (so columns are explicitly cleared).
export function toRow(entity: Record<string, unknown>, map: TableMap): Row {
  const row: Row = {}
  for (const [tsField, col] of Object.entries(map.fields)) {
    const v = entity[tsField]
    row[col] = v === undefined ? null : v
  }
  return row
}
