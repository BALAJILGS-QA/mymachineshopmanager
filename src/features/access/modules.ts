// Top-level module access control (client-side UX gating).
//
// The super admin grants each approved 'User' a set of top-level modules; the
// sidebar and a route guard filter on that set (see AppShell). This is a UX
// layer only — Supabase RLS still protects the underlying data server-side, so a
// bypassed check here can never grant real access.
//
// Effective access is resolved by `effectiveModuleKeys`:
//   • the super admin (email-based) and any 'Admin' user  → every module ('all')
//   • a 'User' with `permissions` undefined (never configured / legacy) → 'all'
//   • a 'User' with `permissions` set → exactly those keys + the always-on ones

import type { AppUser } from '@/types'
import type { ModuleKey, NavGroup } from '@/components/layout/nav'

export interface ModuleInfo {
  key: ModuleKey
  label: string
  description: string
}

// Modules always available to every signed-in user — never shown as a toggle in
// the permissions editor (a user must always have a landing page).
export const ALWAYS_ON: readonly ModuleKey[] = ['dashboard']

// The grantable modules, in sidebar order. Labels mirror the NAV_GROUPS titles;
// descriptions are UX copy for the permissions editor. `dashboard` is omitted —
// it is always on (see ALWAYS_ON) and rendered as a locked row by the editor.
export const MODULES: ModuleInfo[] = [
  {
    key: 'production',
    label: 'Production Planning',
    description: 'Job orders, production floor, tool room',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Materials, stock, movements, transfers, reports',
  },
  { key: 'sales', label: 'Sales', description: 'Sales pipeline and orders' },
  { key: 'crm', label: 'CRM', description: 'Contacts and customer messages' },
  { key: 'hrm', label: 'Human Resources', description: 'Employees, attendance, leave, payroll' },
  {
    key: 'accounts',
    label: 'Accounts & Finance',
    description: 'Purchases, invoices, payments, ledger, GST',
  },
  { key: 'supply_chain', label: 'Supply Chain', description: 'Vendors and subcontracting' },
  {
    key: 'configuration',
    label: 'Configuration & Settings',
    description: 'Companies, reports, settings',
  },
]

const ALL_KEYS = new Set<string>([...ALWAYS_ON, ...MODULES.map((m) => m.key)])
export function isModuleKey(value: string): value is ModuleKey {
  return ALL_KEYS.has(value)
}

// The modules a user may access, or 'all' for unrestricted access. `user` is the
// AppUser record for the current session (undefined for the super admin, who is
// email-based and has no row).
export function effectiveModuleKeys(opts: {
  isSuperAdmin: boolean
  user?: AppUser | null
}): ModuleKey[] | 'all' {
  if (opts.isSuperAdmin) return 'all'
  const u = opts.user
  if (u?.role === 'SuperAdmin' || u?.role === 'Admin') return 'all'
  // Never configured (or legacy account) → don't lock anyone out.
  if (!u || u.permissions == null) return 'all'
  const set = new Set<ModuleKey>(ALWAYS_ON)
  for (const k of u.permissions) if (isModuleKey(k)) set.add(k)
  return [...set]
}

export function canAccessModule(effective: ModuleKey[] | 'all', key?: ModuleKey): boolean {
  if (!key) return true // unknown/ungated route → allow (data still RLS-protected)
  return effective === 'all' || effective.includes(key)
}

// Filter sidebar groups down to the modules the user may access.
export function filterGroupsByAccess(
  groups: NavGroup[],
  effective: ModuleKey[] | 'all',
): NavGroup[] {
  if (effective === 'all') return groups
  return groups.filter((g) => effective.includes(g.key))
}
