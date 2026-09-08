import { describe, it, expect } from 'vitest'
import { ShieldCheck } from 'lucide-react'
import type { AppUser, UserRole } from '@/types'
import type { NavItem } from '@/components/layout/nav'
import { isNavItemVisible } from '@/components/layout/nav'
import {
  MODULES,
  accessSummary,
  canAccessModule,
  canManageRoles,
  effectiveModuleKeys,
  grantableKeysFor,
  isModuleKey,
  mergeSavedPermissions,
  sameCompany,
  scopeUsersForManager,
} from './modules'

// These cover the Roles & Permissions cases that cannot be exercised via the
// super-admin Playwright session (Admin/plain-User branches) or aren't UI-visible
// (config/data invariants). Keys map to qa/manual-testcases/_raw/roles.json.

function user(over: Partial<AppUser>): AppUser {
  return {
    id: over.id ?? 'usr_' + Math.random().toString(36).slice(2),
    email: over.email ?? 'a@b.com',
    fullName: over.fullName ?? 'A B',
    companyName: over.companyName ?? 'Shop A',
    phone: '',
    address: '',
    gstin: '',
    role: (over.role ?? 'User') as UserRole,
    status: over.status ?? 'approved',
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
    permissions: over.permissions,
    ...over,
  }
}

describe('effectiveModuleKeys', () => {
  it('super admin gets all modules', () => {
    expect(effectiveModuleKeys({ isSuperAdmin: true })).toBe('all')
  })
  it('an Admin gets all modules', () => {
    expect(effectiveModuleKeys({ isSuperAdmin: false, user: user({ role: 'Admin' }) })).toBe('all')
  })
  it('MSM-ROLES-FUNC-005: a User with null permissions defaults to all (not locked out)', () => {
    expect(
      effectiveModuleKeys({
        isSuperAdmin: false,
        user: user({ role: 'User', permissions: undefined }),
      }),
    ).toBe('all')
  })
  it('a User with an explicit set gets exactly those keys plus always-on dashboard', () => {
    const eff = effectiveModuleKeys({
      isSuperAdmin: false,
      user: user({ role: 'User', permissions: ['inventory', 'accounts'] }),
    })
    expect(eff).not.toBe('all')
    expect([...(eff as string[])].sort()).toEqual(['accounts', 'dashboard', 'inventory'])
  })
  it('MSM-ROLES-VAL-002: unknown/invalid permission keys are ignored', () => {
    const eff = effectiveModuleKeys({
      isSuperAdmin: false,
      user: user({ role: 'User', permissions: ['inventory', 'not-a-module', ''] }),
    })
    expect([...(eff as string[])].sort()).toEqual(['dashboard', 'inventory'])
  })
  it('an empty permission array yields dashboard only', () => {
    const eff = effectiveModuleKeys({
      isSuperAdmin: false,
      user: user({ role: 'User', permissions: [] }),
    })
    expect(eff).toEqual(['dashboard'])
  })
})

describe('canAccessModule (route-guard logic)', () => {
  it('MSM-ROLES-SEC-003: a User is blocked from a module they were not granted', () => {
    const eff = effectiveModuleKeys({
      isSuperAdmin: false,
      user: user({ role: 'User', permissions: ['inventory'] }),
    })
    expect(canAccessModule(eff, 'inventory')).toBe(true)
    expect(canAccessModule(eff, 'hrm')).toBe(false)
    expect(canAccessModule(eff, 'dashboard')).toBe(true)
  })
  it('allows unknown/ungated routes and everything under all', () => {
    expect(canAccessModule('all', 'hrm')).toBe(true)
    expect(canAccessModule(['dashboard'], undefined)).toBe(true)
  })
})

describe('sameCompany (MSM-ROLES-VAL-003)', () => {
  it('matches case- and whitespace-insensitively', () => {
    expect(sameCompany('Shop A', '  shop a ')).toBe(true)
    expect(sameCompany('ACME', 'acme')).toBe(true)
  })
  it('never groups two blank/unset company names together', () => {
    expect(sameCompany('', '')).toBe(false)
    expect(sameCompany(undefined, undefined)).toBe(false)
    expect(sameCompany('   ', 'Shop A')).toBe(false)
  })
})

describe('scopeUsersForManager', () => {
  const superAdmin = { isSuperAdmin: true as const, me: null }
  const adminMe = user({ id: 'me', role: 'Admin', companyName: 'Shop A', email: 'admin@a.com' })
  const teammate = user({ id: 't1', role: 'User', companyName: 'Shop A', fullName: 'Zoe' })
  const teammate2 = user({ id: 't2', role: 'User', companyName: 'shop a', fullName: 'Amy' })
  const otherShop = user({ id: 'o1', role: 'User', companyName: 'Shop B' })
  const otherAdmin = user({ id: 'a2', role: 'Admin', companyName: 'Shop A' })
  const pending = user({ id: 'p1', role: 'User', companyName: 'Shop A', status: 'pending' })
  const all = [adminMe, teammate, teammate2, otherShop, otherAdmin, pending]

  it('super admin sees every approved user', () => {
    const rows = scopeUsersForManager(superAdmin, all)
    expect(rows).toHaveLength(5) // all except the pending one
    expect(rows.some((u) => u.status !== 'approved')).toBe(false)
  })

  it('MSM-ROLES-SEC-005: an Admin sees only same-company Users — not other shops, other Admins, the pending, or self', () => {
    const rows = scopeUsersForManager({ isSuperAdmin: false, me: adminMe }, all)
    const ids = rows.map((u) => u.id)
    expect(ids).toEqual(['t2', 't1']) // Amy before Zoe (sorted by name), both Shop A Users
    expect(ids).not.toContain('me') // self excluded
    expect(ids).not.toContain('o1') // other shop excluded
    expect(ids).not.toContain('a2') // other Admin excluded
    expect(ids).not.toContain('p1') // pending excluded
  })
})

describe('grantableKeysFor', () => {
  it('excludes the always-on dashboard and returns all 8 modules for both managers', () => {
    const asSuper = grantableKeysFor({ isSuperAdmin: true, me: null })
    const asAdmin = grantableKeysFor({ isSuperAdmin: false, me: user({ role: 'Admin' }) })
    expect(asSuper).toEqual(MODULES.map((m) => m.key))
    expect(asAdmin).toEqual(MODULES.map((m) => m.key))
    expect(asSuper).not.toContain('dashboard')
  })
})

describe('mergeSavedPermissions', () => {
  const allowedKeys = MODULES.map((m) => m.key)
  it('MSM-ROLES-DB-002: Admin role persists an empty permissions array', () => {
    expect(
      mergeSavedPermissions({
        role: 'Admin',
        allowedKeys,
        checked: ['inventory'],
        existing: ['hrm'],
      }),
    ).toEqual([])
  })
  it('User persists exactly the checked keys', () => {
    expect(
      mergeSavedPermissions({
        role: 'User',
        allowedKeys,
        checked: ['inventory', 'accounts'],
        existing: [],
      }),
    ).toEqual(['inventory', 'accounts'])
  })
  it('MSM-ROLES-FUNC-003: preserves existing modules OUTSIDE the manager’s allowed scope', () => {
    // A restricted Admin who can only grant ['inventory'] edits a user who already
    // has 'hrm' (out of scope). Saving with inventory checked must keep hrm.
    const restricted: typeof allowedKeys = ['inventory']
    const result = mergeSavedPermissions({
      role: 'User',
      allowedKeys: restricted,
      checked: ['inventory'],
      existing: ['hrm', 'inventory'],
    })
    expect([...result].sort()).toEqual(['hrm', 'inventory'])
  })
  it('deduplicates and ignores unknown existing keys', () => {
    const result = mergeSavedPermissions({
      role: 'User',
      allowedKeys: ['inventory'],
      checked: ['inventory'],
      existing: ['inventory', 'bogus'],
    })
    expect(result).toEqual(['inventory'])
  })
})

describe('canManageRoles', () => {
  it('true for the super admin and for an Admin; false for a plain User', () => {
    expect(canManageRoles({ isSuperAdmin: true, me: null })).toBe(true)
    expect(canManageRoles({ isSuperAdmin: false, me: user({ role: 'Admin' }) })).toBe(true)
    expect(canManageRoles({ isSuperAdmin: false, me: user({ role: 'User' }) })).toBe(false)
    expect(canManageRoles({ isSuperAdmin: false, me: null })).toBe(false)
  })
})

describe('accessSummary', () => {
  it('summarises All modules / Dashboard only / N of 8 modules', () => {
    expect(accessSummary(user({ role: 'Admin' }))).toBe('All modules')
    expect(accessSummary(user({ role: 'User', permissions: undefined }))).toBe('All modules')
    expect(accessSummary(user({ role: 'User', permissions: [] }))).toBe('Dashboard only')
    expect(accessSummary(user({ role: 'User', permissions: ['inventory', 'hrm'] }))).toBe(
      `2 of ${MODULES.length} modules`,
    )
  })
})

describe('isNavItemVisible (nav role flags)', () => {
  const item = (over: Partial<NavItem>): NavItem => ({
    to: '/x',
    label: 'X',
    short: 'X',
    icon: ShieldCheck,
    ...over,
  })
  it('MSM-ROLES-SEC-001 / SEC-002: a manageAccess item shows to super admin & Admin, hidden from a plain User', () => {
    const roles = item({ to: '/app/roles', manageAccess: true })
    expect(isNavItemVisible(roles, { isSuperAdmin: true, isAdmin: false })).toBe(true)
    expect(isNavItemVisible(roles, { isSuperAdmin: false, isAdmin: true })).toBe(true)
    expect(isNavItemVisible(roles, { isSuperAdmin: false, isAdmin: false })).toBe(false)
  })
  it('a superAdmin-only item (Approvals) is hidden from an Admin and a User', () => {
    const approvals = item({ to: '/app/approvals', superAdmin: true })
    expect(isNavItemVisible(approvals, { isSuperAdmin: true, isAdmin: false })).toBe(true)
    expect(isNavItemVisible(approvals, { isSuperAdmin: false, isAdmin: true })).toBe(false)
    expect(isNavItemVisible(approvals, { isSuperAdmin: false, isAdmin: false })).toBe(false)
  })
  it('a normal item is visible to everyone', () => {
    expect(isNavItemVisible(item({}), { isSuperAdmin: false, isAdmin: false })).toBe(true)
  })
})

describe('isModuleKey', () => {
  it('recognises real module keys and rejects others', () => {
    expect(isModuleKey('inventory')).toBe(true)
    expect(isModuleKey('dashboard')).toBe(true)
    expect(isModuleKey('nope')).toBe(false)
  })
})
