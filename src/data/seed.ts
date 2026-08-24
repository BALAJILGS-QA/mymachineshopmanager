import type { Company, Material, Settings } from '@/types'
import { nowISO } from '@/lib/format'
import { uid } from '@/lib/id'
import type { Database } from './db'
import { DB_VERSION } from './db'

export const DEFAULT_SETTINGS: Settings = {
  currency: 'INR',
  currencySymbol: '₹',
  timezone: 'Asia/Kolkata',
  defaultTaxPercent: 18,
  allowOverproduction: false,
  allowNegativeStock: false,
  units: ['Nos', 'Kg', 'Meter', 'mm', 'Ton', 'Litre', 'Set', 'Sheet', 'Bar'],
  materialTypes: [
    'Mild Steel',
    'Stainless Steel 304',
    'Stainless Steel 316',
    'Aluminium',
    'Brass',
    'Cast Iron',
    'EN8',
    'EN19',
    'EN24',
  ],
  expenseCategories: [
    'Cutting Tools',
    'Coolant/Oil',
    'Electricity',
    'Maintenance',
    'Consumables',
    'Transport',
    'Labour/Contract',
    'Repairs',
    'Packing',
    'Miscellaneous',
  ],
  numbering: {
    job: 'JOB-{FY}-{####}',
    invoice: 'INV-{FY}-{####}',
    receipt: 'RCP-{FY}-{####}',
    issue: 'ISS-{FY}-{####}',
    adjustment: 'ADJ-{FY}-{####}',
    payment: 'PAY-{FY}-{####}',
    expense: 'EXP-{FY}-{####}',
  },
  company: {
    name: 'My CNC Machine Shop',
    address: '',
    phone: '',
    email: '',
    gstin: '',
  },
}

const INITIAL_COMPANIES = [
  'Flowra Global',
  'Vahinie Engineering',
  'Nirmal Pumps',
  'Local',
]

export function buildInitialDb(): Database {
  const ts = nowISO()
  const companies: Company[] = INITIAL_COMPANIES.map((name, i) => ({
    id: uid('cmp_'),
    code: `C${String(i + 1).padStart(3, '0')}`,
    name,
    active: true,
    createdAt: ts,
    updatedAt: ts,
  }))

  const materials: Material[] = []

  return {
    version: DB_VERSION,
    settings: DEFAULT_SETTINGS,
    sequences: {
      job: 0,
      invoice: 0,
      receipt: 0,
      issue: 0,
      adjustment: 0,
      payment: 0,
      expense: 0,
      companyCode: companies.length,
      materialCode: 0,
    },
    companies,
    materials,
    jobs: [],
    productionEvents: [],
    receipts: [],
    issues: [],
    adjustments: [],
    invoices: [],
    payments: [],
    expenses: [],
    auditLog: [],
  }
}
