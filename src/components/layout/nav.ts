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
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  short: string
}

// PRD 14 — MVP navigation order. Routes live under /app (the public marketing
// site owns the root).
export const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, short: 'Home' },
  { to: '/app/jobs', label: 'Job Orders', icon: ClipboardList, short: 'Jobs' },
  { to: '/app/production', label: 'Production', icon: Factory, short: 'Floor' },
  { to: '/app/materials', label: 'Materials & Stock', icon: Boxes, short: 'Stock' },
  { to: '/app/deliveries', label: 'Delivery Challan', icon: Truck, short: 'Challan' },
  { to: '/app/invoices', label: 'Invoices', icon: FileText, short: 'Invoices' },
  { to: '/app/payments', label: 'Payments', icon: Wallet, short: 'Pay' },
  { to: '/app/expenses', label: 'Expenses', icon: Receipt, short: 'Expense' },
  { to: '/app/reports', label: 'Reports', icon: BarChart3, short: 'Reports' },
  { to: '/app/companies', label: 'Companies', icon: Building2, short: 'Company' },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon, short: 'Settings' },
]

// Items shown in the mobile bottom bar (most-used); rest live in the drawer.
export const MOBILE_PRIMARY = ['/app', '/app/jobs', '/app/materials', '/app/invoices']
