// Optional realistic demo dataset. Loaded on demand from Settings so reviewers
// can see the dashboard, reports and workflows populated. Built entirely
// through the repo layer so every business rule still applies.

import { format, subDays } from 'date-fns'
import {
  companyRepo,
  expenseRepo,
  invoiceRepo,
  jobRepo,
  materialRepo,
  paymentRepo,
  stockRepo,
} from './repo'
import { getDb, resetDb, saveDb } from './db'
import { buildInitialDb } from './seed'

const d = (daysAgo: number) => format(subDays(new Date(), daysAgo), 'yyyy-MM-dd')

export function loadDemoData(): void {
  resetDb()
  saveDb(buildInitialDb())

  const companies = companyRepo.list()
  const byName = (n: string) => companies.find((c) => c.name === n)!
  const flowra = byName('Flowra Global')
  const vahinie = byName('Vahinie Engineering')
  const nirmal = byName('Nirmal Pumps')
  const local = byName('Local')

  // Materials
  const ms = materialRepo.create({
    name: 'MS Round Bar 50mm',
    type: 'Mild Steel',
    unit: 'Kg',
    description: 'IS 2062 round bar',
    defaultRate: 68,
    reorderLevel: 200,
    active: true,
  })
  const ss = materialRepo.create({
    name: 'SS 304 Sheet 3mm',
    type: 'Stainless Steel 304',
    unit: 'Kg',
    defaultRate: 245,
    reorderLevel: 100,
    active: true,
  })
  const en8 = materialRepo.create({
    name: 'EN8 Bright Bar 25mm',
    type: 'EN8',
    unit: 'Kg',
    defaultRate: 92,
    reorderLevel: 150,
    active: true,
  })
  const alu = materialRepo.create({
    name: 'Aluminium Block 6061',
    type: 'Aluminium',
    unit: 'Kg',
    defaultRate: 310,
    reorderLevel: 80,
    active: true,
  })

  // Receipts (stock in)
  stockRepo.receipt({ date: d(30), materialId: ms.id, ownerType: 'Company', companyId: flowra.id, supplier: 'Sri Steel Traders', quantity: 500, unit: 'Kg', rate: 66, batchNo: 'H-2231' })
  stockRepo.receipt({ date: d(28), materialId: ss.id, ownerType: 'Company', companyId: nirmal.id, supplier: 'Metro Metals', quantity: 300, unit: 'Kg', rate: 240, batchNo: 'H-8890' })
  stockRepo.receipt({ date: d(25), materialId: en8.id, ownerType: 'Shop', supplier: 'Bright Bars Co', quantity: 400, unit: 'Kg', rate: 90 })
  stockRepo.receipt({ date: d(20), materialId: alu.id, ownerType: 'Company', companyId: vahinie.id, supplier: 'Alu Depot', quantity: 120, unit: 'Kg', rate: 305 })
  stockRepo.receipt({ date: d(10), materialId: ms.id, ownerType: 'Company', companyId: flowra.id, supplier: 'Sri Steel Traders', quantity: 250, unit: 'Kg', rate: 69 })

  // Jobs
  const j1 = jobRepo.create({ companyId: flowra.id, partName: 'Pump Shaft 40mm', partNumber: 'FL-SHFT-40', materialId: ms.id, orderedQty: 100, orderDate: d(26), dueDate: d(-4), priority: 'High', status: 'Pending', rate: 450, customerPo: 'PO-FL-1188' })
  const j2 = jobRepo.create({ companyId: nirmal.id, partName: 'Impeller Casing', partNumber: 'NP-IMP-7', materialId: ss.id, orderedQty: 40, orderDate: d(22), dueDate: d(2), priority: 'Urgent', status: 'Pending', rate: 1250 })
  const j3 = jobRepo.create({ companyId: vahinie.id, partName: 'Bracket Assembly', materialId: alu.id, orderedQty: 60, orderDate: d(18), dueDate: d(6), priority: 'Normal', status: 'Pending', rate: 380 })
  const j4 = jobRepo.create({ companyId: flowra.id, partName: 'Coupling Hub', partNumber: 'FL-CPL-2', materialId: en8.id, orderedQty: 200, orderDate: d(15), dueDate: d(10), priority: 'Normal', status: 'Pending', rate: 210 })
  jobRepo.create({ companyId: local.id, partName: 'Custom Spacer', orderedQty: 500, orderDate: d(12), dueDate: d(-1), priority: 'Low', status: 'Pending', rate: 45 })

  // Issue material + progress jobs
  stockRepo.issue({ date: d(20), materialId: ms.id, jobId: j1.id, quantity: 180, unit: 'Kg', note: 'First lot' })
  jobRepo.transition(j1.id, 'In Progress', { operator: 'Ravi' })
  jobRepo.transition(j1.id, 'In Progress', { completedQty: 60, note: '60 machined' })

  stockRepo.issue({ date: d(16), materialId: ss.id, jobId: j2.id, quantity: 120, unit: 'Kg' })
  jobRepo.transition(j2.id, 'In Progress', { operator: 'Suresh', completedQty: 40 })
  jobRepo.transition(j2.id, 'Completed', {})

  stockRepo.issue({ date: d(9), materialId: en8.id, jobId: j4.id, quantity: 220, unit: 'Kg' })
  jobRepo.transition(j4.id, 'In Progress', { operator: 'Ravi', completedQty: 200 })
  jobRepo.transition(j4.id, 'Completed', {})
  jobRepo.transition(j4.id, 'Delivered', { note: 'DC-4471' })

  jobRepo.transition(j3.id, 'On Hold', { note: 'Awaiting drawing revision' })

  // Invoices from completed jobs
  const inv1 = invoiceRepo.create({
    date: d(6), companyId: nirmal.id, reference: j2.jobNo, taxPercent: 18, discount: 0, status: 'Unpaid',
    lines: [{ id: 'l1', jobId: j2.id, description: 'Impeller Casing (machining)', quantity: 40, rate: 1250 }],
  })
  const inv2 = invoiceRepo.create({
    date: d(3), companyId: flowra.id, reference: j4.jobNo, taxPercent: 18, discount: 500, status: 'Unpaid',
    lines: [{ id: 'l1', jobId: j4.id, description: 'Coupling Hub', quantity: 200, rate: 210 }],
  })
  const inv3 = invoiceRepo.create({
    date: d(1), companyId: local.id, reference: '', taxPercent: 0, discount: 0, status: 'Unpaid',
    lines: [{ id: 'l1', description: 'Custom turning work', quantity: 120, rate: 45 }],
  })

  // Payments
  paymentRepo.create({ date: d(2), companyId: nirmal.id, invoiceId: inv1.id, amount: 30000, method: 'Bank Transfer', reference: 'NEFT-99812', isAdvance: false })
  paymentRepo.create({ date: d(4), companyId: flowra.id, amount: 20000, method: 'UPI', reference: 'UPI-adv', isAdvance: true, notes: 'Advance towards upcoming jobs' })
  invoiceRepo.get(inv2.id) // no-op ref
  void inv3

  // Expenses
  const exp = (daysAgo: number, category: string, amount: number, method: any, vendor?: string, jobId?: string, companyId?: string) =>
    expenseRepo.create({ date: d(daysAgo), category, amount, method, vendor, jobId, companyId, notes: '' })
  exp(28, 'Electricity', 18500, 'Bank Transfer', 'TNEB')
  exp(24, 'Cutting Tools', 7400, 'UPI', 'Tool World', j1.id, flowra.id)
  exp(20, 'Coolant/Oil', 3200, 'Cash', 'Lubes India')
  exp(14, 'Maintenance', 5600, 'Cash', 'Spindle Service')
  exp(9, 'Labour/Contract', 12000, 'Bank Transfer', 'Contract Gang')
  exp(4, 'Transport', 2100, 'Cash', 'Local Carrier', j4.id, flowra.id)
  exp(2, 'Consumables', 1800, 'UPI', 'Hardware Mart')

  // Refresh invoice badges
  getDb().invoices.forEach((i) => invoiceRepo.refreshStatus(i.id))
}
