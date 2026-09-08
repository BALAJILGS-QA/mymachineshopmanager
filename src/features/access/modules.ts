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

import type { AppUser, UserRole } from '@/types'
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

// ---- Roles & Permissions page logic (shared by RolesPage + its tests) -------

// The current manager on the roles page: the email-based super admin (no row) or
// an approved Admin (their own AppUser record).
export interface ManagerCtx {
  isSuperAdmin: boolean
  me?: AppUser | null
}

// Only the super admin or an Admin may manage roles/access.
export function canManageRoles(ctx: ManagerCtx): boolean {
  return ctx.isSuperAdmin || ctx.me?.role === 'Admin'
}

// Case/whitespace-insensitive company match (an Admin's "shop"). Two blank
// company names never match (an unset company must not group strangers together).
export function sameCompany(a?: string, b?: string): boolean {
  const x = (a ?? '').trim().toLowerCase()
  const y = (b ?? '').trim().toLowerCase()
  return x !== '' && x === y
}

// Users a manager may administer. Super admin: every approved user. Admin: only
// approved role-'User' accounts in their own shop (same companyName), excluding
// themselves — never other shops, other Admins or the super admin. Sorted by name.
export function scopeUsersForManager(ctx: ManagerCtx, users: AppUser[]): AppUser[] {
  const approved = users.filter((u) => u.status === 'approved')
  const scoped = ctx.isSuperAdmin
    ? approved
    : approved.filter(
        (u) =>
          (u.role ?? 'User') === 'User' &&
          u.id !== ctx.me?.id &&
          sameCompany(u.companyName, ctx.me?.companyName),
      )
  return [...scoped].sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email))
}

// The grantable (toggleable) modules for a manager — their own effective set
// minus the always-on modules. Both super admin and Admin resolve to all today,
// but this stays correct if an Admin is ever given a restricted set.
export function grantableKeysFor(ctx: ManagerCtx): ModuleKey[] {
  const eff = effectiveModuleKeys({ isSuperAdmin: ctx.isSuperAdmin, user: ctx.me })
  const keys = eff === 'all' ? MODULES.map((m) => m.key) : eff
  return keys.filter((k) => !ALWAYS_ON.includes(k))
}

// The permissions array to persist for a saved access change. Admin ⇒ [] (the
// role implies all). User ⇒ the checked allowed keys PLUS any existing keys
// OUTSIDE the manager's allowed scope, so a scoped Admin can never strip access
// the super admin granted in a module the Admin doesn't manage.
export function mergeSavedPermissions(opts: {
  role: UserRole
  allowedKeys: ModuleKey[]
  checked: ModuleKey[]
  existing?: string[] | null
}): string[] {
  if (opts.role === 'Admin') return []
  const preserved = (opts.existing ?? []).filter(
    (k) => isModuleKey(k) && !opts.allowedKeys.includes(k),
  )
  return [...new Set<string>([...preserved, ...opts.checked])]
}

// Human summary of what a user can reach, for the roles table's Access column.
export function accessSummary(u: AppUser): string {
  const eff = effectiveModuleKeys({ isSuperAdmin: false, user: u })
  if (eff === 'all') return 'All modules'
  const granted = eff.filter((k) => !ALWAYS_ON.includes(k)).length
  return granted === 0 ? 'Dashboard only' : `${granted} of ${MODULES.length} modules`
}
