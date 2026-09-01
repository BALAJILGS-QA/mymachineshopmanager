import {
  LayoutDashboard,
  ClipboardList,
  Factory,
  Boxes,
  Truck,
  FileText,
  Wallet,
  ShoppingCart,
  TrendingUp,
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

// A titled section of the sidebar. An untitled group renders as standalone
// links with no header (Dashboard, Sales). When `to` is set the title is a
// clickable link to that group's hub landing page (which shows its items as
// buttons).
export interface NavGroup {
  title?: string
  to?: LinkProps['to']
  items: NavItem[]
}

// PRD 14 — navigation grouped into modules. Routes live under /app (the public
// marketing site owns the root). Sales is intentionally its own standalone
// module; Materials & Stock sits with Production, Purchase Management with
// Accounts & Finance.
export const NAV_GROUPS: NavGroup[] = [
  { items: [{ to: '/app', label: 'Dashboard', icon: LayoutDashboard, short: 'Home' }] },
  {
    title: 'Production Planning',
    to: '/app/production-planning',
    items: [
      { to: '/app/jobs', label: 'Job Orders', icon: ClipboardList, short: 'Jobs' },
      { to: '/app/production', label: 'Production', icon: Factory, short: 'Floor' },
      { to: '/app/materials', label: 'Materials & Stock', icon: Boxes, short: 'Stock' },
    ],
  },
  { items: [{ to: '/app/sales', label: 'Sales', icon: TrendingUp, short: 'Sales' }] },
  {
    title: 'Accounts & Finance',
    to: '/app/accounts',
    items: [
      { to: '/app/expenses', label: 'Purchase Management', icon: ShoppingCart, short: 'Purchase' },
      { to: '/app/deliveries', label: 'Delivery Challan', icon: Truck, short: 'Challan' },
      { to: '/app/invoices', label: 'Invoices', icon: FileText, short: 'Invoices' },
      { to: '/app/payments', label: 'Payments', icon: Wallet, short: 'Pay' },
    ],
  },
  {
    title: 'Configuration & Settings',
    to: '/app/configuration',
    items: [
      { to: '/app/companies', label: 'Companies', icon: Building2, short: 'Company' },
      {
        to: '/app/approvals',
        label: 'User Approvals',
        icon: ShieldCheck,
        short: 'Approvals',
        superAdmin: true,
      },
      { to: '/app/reports', label: 'Reports', icon: BarChart3, short: 'Reports' },
      { to: '/app/settings', label: 'Settings', icon: SettingsIcon, short: 'Settings' },
    ],
  },
]

// Flattened list — used for the current-page label lookup and mobile nav.
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

// Items shown in the mobile bottom bar (most-used shop-floor screens); the rest
// (Dashboard, Job Orders, Production, Expenses, Reports, …) live in the "More" sheet.
export const MOBILE_PRIMARY = [
  '/app/materials',
  '/app/deliveries',
  '/app/invoices',
  '/app/payments',
]
