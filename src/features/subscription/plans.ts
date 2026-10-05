// Subscription plan catalogue for My Machine Shop Manager.
//
// Three paid tiers (monthly, INR) plus the 30-day free trial every tenant starts
// on at approval. Tiers map to the actual feature modules in src/features/* so the
// marketing copy and any future entitlement-gating stay in one place. Billing unit
// = one tenant (one shop). The super admin (platform operator) is never billed.

export type PlanId = 'starter' | 'professional' | 'enterprise'

export interface Plan {
  id: PlanId
  name: string
  /** Monthly price in INR (exclusive of GST). */
  price: number
  tagline: string
  /** Short audience description. */
  audience: string
  /** Quantitative limits shown on the card. */
  limits: { users: string; companies: string; invoicesPerMonth: string }
  /** Feature bullets (what this tier unlocks). */
  features: string[]
  /** Highlight the recommended tier. */
  popular?: boolean
}

export const TRIAL_DAYS = 30

// Show the "upgrade" reminder once the trial has this many days (or fewer) left.
export const TRIAL_REMINDER_DAYS = 5

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 399,
    tagline: 'Run the core of a small job shop.',
    audience: 'Solo owners & small CNC/job shops getting off spreadsheets.',
    limits: { users: '3 users', companies: '25 customers', invoicesPerMonth: '100 invoices / mo' },
    features: [
      'Dashboard & KPIs',
      'Job orders & production tracking',
      'Materials & stock (basic)',
      'Delivery challans with PDF',
      'GST-ready invoices & payments',
      'Expenses',
      'Standard reports',
      'Email support',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 499,
    tagline: 'Everything a growing shop needs to scale.',
    audience: 'Growing shops that need inventory depth, GST accounting & tool room.',
    popular: true,
    limits: { users: '10 users', companies: 'Unlimited', invoicesPerMonth: '500 invoices / mo' },
    features: [
      'Everything in Starter, plus:',
      'Inventory — movements, adjustments, transfers',
      'Payments — multi-invoice settlement & deductions',
      'Accounting & GST — ledger, e-invoice, e-way bill',
      'Purchase management & vendors',
      'Tool Room — issue/return, calibration, maintenance',
      'CRM & sales workspace',
      'Custom document numbering & branding',
      'Email + chat support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 699,
    tagline: 'The complete manufacturing back office.',
    audience: 'Established manufacturers running HR/payroll & subcontracting.',
    limits: { users: 'Unlimited', companies: 'Unlimited', invoicesPerMonth: 'Unlimited' },
    features: [
      'Everything in Professional, plus:',
      'Workforce & HRM — employees, attendance, payroll',
      'Subcontracting & supply chain',
      'Production planning',
      'Advanced reports & exports',
      'Unlimited users & records',
      'Priority support',
    ],
  },
]

export function planById(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}

export function formatINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`
}
