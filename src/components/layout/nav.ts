import {
  LayoutDashboard,
  ClipboardList,
  Factory,
  Boxes,
  Truck,
  FileText,
  Wallet,
  Receipt,
  BarChart3,
  Building2,
  ShieldCheck,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react'
import type { LinkProps } from '@tanstack/react-router'

export interface NavItem {
  to: LinkProps['to']
  label: string
  icon: LucideIcon
  short: string
  superAdmin?: boolean // visible only to the super admin
}

// PRD 14 — MVP navigation order. Routes live under /app (the public marketing
// site owns the root).
export const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, short: 'Home' },
  { to: '/app/jobs', label: 'Job Orders', icon: ClipboardList, short: 'Jobs' },
  { to: '/app/production', label: 'Production', icon: Factory, short: 'Floor' },
  { to: '/app/materials', label: 'Inventory', icon: Boxes, short: 'Inventory' },
  { to: '/app/deliveries', label: 'Delivery Challan', icon: Truck, short: 'Challan' },
  { to: '/app/invoices', label: 'Invoices', icon: FileText, short: 'Invoices' },
  { to: '/app/payments', label: 'Payments', icon: Wallet, short: 'Pay' },
  { to: '/app/expenses', label: 'Expenses', icon: Receipt, short: 'Expense' },
  { to: '/app/reports', label: 'Reports', icon: BarChart3, short: 'Reports' },
  { to: '/app/companies', label: 'Companies', icon: Building2, short: 'Company' },
  {
    to: '/app/approvals',
    label: 'User Approvals',
    icon: ShieldCheck,
    short: 'Approvals',
    superAdmin: true,
  },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon, short: 'Settings' },
]

// Items shown in the mobile bottom bar (most-used shop-floor screens); the rest
// (Dashboard, Job Orders, Production, Expenses, Reports, …) live in the "More" sheet.
export const MOBILE_PRIMARY = [
  '/app/materials',
  '/app/deliveries',
  '/app/invoices',
  '/app/payments',
]
