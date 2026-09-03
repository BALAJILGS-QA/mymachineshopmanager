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
  Handshake,
  ArrowLeftRight,
  BarChart3,
  Building2,
  ShieldCheck,
  Users,
  Landmark,
  Warehouse,
  UserCog,
  CalendarCheck,
  Plane,
  Briefcase,
  Target,
  GraduationCap,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  short: string
  superAdmin?: boolean // visible only to the super admin
}

// Per-module semantic icon accent (inactive sidebar state only — the active
// state is always unified orange + white). The token maps to concrete classes
// in the app shell so colours stay centralised (no scattered hex).
export type MenuAccent = 'blue' | 'orange' | 'emerald' | 'violet' | 'amber' | 'cyan' | 'slate'

// A titled section of the sidebar. An untitled group renders as standalone
// links with no header (Dashboard, Sales). When `to` is set the title is a
// clickable link to that group's hub landing page (which shows its items as
// buttons).
export interface NavGroup {
  title?: string
  to?: string
  icon?: LucideIcon // parent-module icon shown in the sidebar accordion header
  accent?: MenuAccent // per-module inactive icon colour
  items: NavItem[]
}

// PRD 14 — navigation grouped into modules. Routes live under /app (the public
// marketing site owns the root). Sales is intentionally its own standalone
// module; Materials & Stock sits with Production, Purchase Management with
// Accounts & Finance.
export const NAV_GROUPS: NavGroup[] = [
  {
    accent: 'blue',
    items: [{ to: '/app', label: 'Dashboard', icon: LayoutDashboard, short: 'Home' }],
  },
  {
    title: 'Production Planning',
    to: '/app/production-planning',
    icon: Factory,
    accent: 'orange',
    items: [
      { to: '/app/jobs', label: 'Job Orders', icon: ClipboardList, short: 'Jobs' },
      { to: '/app/production', label: 'Production', icon: Factory, short: 'Floor' },
      { to: '/app/materials', label: 'Materials & Stock', icon: Boxes, short: 'Stock' },
    ],
  },
  {
    accent: 'emerald',
    items: [{ to: '/app/sales', label: 'Sales', icon: TrendingUp, short: 'Sales' }],
  },
  { accent: 'violet', items: [{ to: '/app/crm', label: 'CRM', icon: Users, short: 'CRM' }] },
  {
    title: 'Human Resources',
    to: '/app/hrm',
    icon: UserCog,
    accent: 'violet',
    items: [
      { to: '/app/hrm/employees', label: 'Employees', icon: Users, short: 'People' },
      { to: '/app/hrm/attendance', label: 'Attendance', icon: CalendarCheck, short: 'Attend' },
      { to: '/app/hrm/leave', label: 'Leave Management', icon: Plane, short: 'Leave' },
      { to: '/app/hrm/payroll', label: 'Payroll', icon: Wallet, short: 'Payroll' },
      { to: '/app/hrm/recruitment', label: 'Recruitment', icon: Briefcase, short: 'Hiring' },
      { to: '/app/hrm/performance', label: 'Performance', icon: Target, short: 'Reviews' },
      { to: '/app/hrm/training', label: 'Training', icon: GraduationCap, short: 'Training' },
      { to: '/app/hrm/reports', label: 'HR Reports', icon: BarChart3, short: 'Reports' },
      { to: '/app/hrm/settings', label: 'HR Settings', icon: SettingsIcon, short: 'HR Setup' },
    ],
  },
  {
    title: 'Accounts & Finance',
    to: '/app/accounts',
    icon: Landmark,
    accent: 'amber',
    items: [
      { to: '/app/expenses', label: 'Purchase Management', icon: ShoppingCart, short: 'Purchase' },
      { to: '/app/deliveries', label: 'Delivery Challan', icon: Truck, short: 'Challan' },
      { to: '/app/invoices', label: 'Invoices', icon: FileText, short: 'Invoices' },
      { to: '/app/payments', label: 'Payments', icon: Wallet, short: 'Pay' },
    ],
  },
  {
    title: 'Supply Chain',
    to: '/app/supply-chain',
    icon: Warehouse,
    accent: 'cyan',
    items: [
      { to: '/app/vendors', label: 'Vendors', icon: Handshake, short: 'Vendors' },
      {
        to: '/app/subcontracting',
        label: 'Subcontracting',
        icon: ArrowLeftRight,
        short: 'Job Work',
      },
    ],
  },
  {
    title: 'Configuration & Settings',
    to: '/app/configuration',
    icon: SettingsIcon,
    accent: 'slate',
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

// The titled module a path belongs to — matched by a sub-item (prefix) or the
// group's own hub path. Drives the in-module tab bar and sidebar highlight.
// Untitled groups (Dashboard, Sales) are standalone and return undefined.
export function moduleGroupForPath(pathname: string): NavGroup | undefined {
  const within = (to?: string) => !!to && (pathname === to || pathname.startsWith(`${to}/`))
  return NAV_GROUPS.find(
    (g) => g.title && (g.items.some((i) => within(i.to as string)) || within(g.to as string)),
  )
}

// Items shown in the mobile bottom bar (most-used shop-floor screens); the rest
// (Dashboard, Job Orders, Production, Expenses, Reports, …) live in the "More" sheet.
export const MOBILE_PRIMARY = [
  '/app/materials',
  '/app/deliveries',
  '/app/invoices',
  '/app/payments',
]
