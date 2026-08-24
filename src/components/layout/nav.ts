import {
  LayoutDashboard,
  ClipboardList,
  Factory,
  Boxes,
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

// PRD 14 — MVP navigation order.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, short: 'Home' },
  { to: '/jobs', label: 'Job Orders', icon: ClipboardList, short: 'Jobs' },
  { to: '/production', label: 'Production', icon: Factory, short: 'Floor' },
  { to: '/materials', label: 'Materials & Stock', icon: Boxes, short: 'Stock' },
  { to: '/invoices', label: 'Invoices', icon: FileText, short: 'Invoices' },
  { to: '/payments', label: 'Payments', icon: Wallet, short: 'Pay' },
  { to: '/expenses', label: 'Expenses', icon: Receipt, short: 'Expense' },
  { to: '/reports', label: 'Reports', icon: BarChart3, short: 'Reports' },
  { to: '/companies', label: 'Companies', icon: Building2, short: 'Company' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, short: 'Settings' },
]

// Items shown in the mobile bottom bar (most-used); rest live in the drawer.
export const MOBILE_PRIMARY = ['/', '/jobs', '/materials', '/invoices']
