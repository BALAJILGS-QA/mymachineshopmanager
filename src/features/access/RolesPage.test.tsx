// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AppUser, UserRole } from '@/types'

// Component-level coverage for the Roles & Permissions branches that the QA
// super-admin Playwright session cannot exercise (Admin view, plain-User guard).
// Keys map to qa/manual-testcases/_raw/roles.json.

const h = vi.hoisted(() => ({
  auth: { isSuperAdmin: false, session: { email: '', username: '', role: 'User' } },
  users: [] as AppUser[],
  navigate: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/features/auth/auth', () => ({ useAuth: () => h.auth }))
vi.mock('@/components/nav/app-link', () => ({ useAppNavigate: () => h.navigate }))
vi.mock('@/features/approvals/hooks/useUsers', () => ({
  useUsers: () => ({ data: h.users }),
  useUpdateUserAccess: () => ({ mutateAsync: h.update, isPending: false }),
}))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => h.toast }))

import { RolesPage } from './RolesPage'

function user(over: Partial<AppUser>): AppUser {
  return {
    id: over.id ?? 'usr_x',
    email: over.email ?? 'a@b.com',
    fullName: over.fullName ?? 'A B',
    companyName: over.companyName ?? 'Shop A',
    phone: '',
    address: '',
    gstin: '',
    role: (over.role ?? 'User') as UserRole,
    status: over.status ?? 'approved',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  h.navigate.mockClear()
  h.update.mockClear()
  h.toast.success.mockClear()
})

describe('RolesPage — plain User', () => {
  it('MSM-ROLES-SEC-003: a plain User is redirected to /app and nothing renders', () => {
    h.auth = { isSuperAdmin: false, session: { email: 'user@a.com', username: 'u', role: 'User' } }
    h.users = [user({ id: 'me', email: 'user@a.com', role: 'User' })]
    const { container } = render(<RolesPage />)
    expect(h.navigate).toHaveBeenCalledWith('/app', { replace: true })
    expect(container).toBeEmptyDOMElement()
  })
})

describe('RolesPage — Admin (shop user)', () => {
  const adminMe = user({
    id: 'me',
    email: 'admin@a.com',
    role: 'Admin',
    fullName: 'Adam Admin',
    companyName: 'Shop A',
  })
  const teammate = user({
    id: 't1',
    email: 'zoe@a.com',
    role: 'User',
    fullName: 'Zoe User',
    companyName: 'shop a',
  })
  const otherShop = user({
    id: 'o1',
    email: 'x@b.com',
    role: 'User',
    fullName: 'Other Shopper',
    companyName: 'Shop B',
  })
  const otherAdmin = user({
    id: 'a2',
    email: 'boss@a.com',
    role: 'Admin',
    fullName: 'Boss Admin',
    companyName: 'Shop A',
  })

  beforeEach(() => {
    h.auth = { isSuperAdmin: false, session: { email: 'admin@a.com', username: 'a', role: 'User' } }
    h.users = [adminMe, teammate, otherShop, otherAdmin]
  })

  it('MSM-ROLES-UI-002 / SEC-005: shop-scoped copy and only same-company Users are listed', () => {
    render(<RolesPage />)
    expect(h.navigate).not.toHaveBeenCalled()
    expect(
      screen.getByText(/Grant your shop.s users access to the modules you manage\./),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/You can grant module access to users in your shop\./),
    ).toBeInTheDocument()
    // Only the same-company teammate (case-insensitive) — not other shop, other Admin, or self.
    expect(screen.getByText('Zoe User')).toBeInTheDocument()
    expect(screen.queryByText('Other Shopper')).not.toBeInTheDocument()
    expect(screen.queryByText('Boss Admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Adam Admin')).not.toBeInTheDocument()
  })

  it('MSM-ROLES-UI-007 / SEC-004: the Admin editor hides the role selector but shows module checkboxes', async () => {
    render(<RolesPage />)
    await userEvent.click(screen.getByRole('button', { name: /manage access/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    // No role selector for an Admin (its unique description text is absent).
    expect(screen.queryByText('Full access to every module.')).not.toBeInTheDocument()
    expect(screen.queryByText('Only the modules selected below.')).not.toBeInTheDocument()
    // Module checkboxes and the locked Dashboard row ARE shown.
    expect(screen.getAllByRole('checkbox')).toHaveLength(8)
    expect(screen.getByText('Always available')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save access/i })).toBeInTheDocument()
  })
})

describe('RolesPage — super admin', () => {
  it('renders super-admin copy and the editor shows the role selector', async () => {
    h.auth = {
      isSuperAdmin: true,
      session: { email: 'super@x.com', username: 's', role: 'SuperAdmin' },
    }
    h.users = [user({ id: 'u1', email: 'u1@a.com', role: 'User', fullName: 'Some User' })]
    render(<RolesPage />)
    expect(
      screen.getByText('Assign roles and choose which modules each approved user can access.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /manage access/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    // Role selector present (super admin only).
    expect(screen.getByText('Full access to every module.')).toBeInTheDocument()
    expect(screen.getByText('Only the modules selected below.')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(8)
  })

  it('MSM-ROLES-VAL-001: the editor pre-checks exactly the modules from the user’s stored permissions', async () => {
    h.auth = {
      isSuperAdmin: true,
      session: { email: 'super@x.com', username: 's', role: 'SuperAdmin' },
    }
    h.users = [
      user({
        id: 'u1',
        email: 'u1@a.com',
        role: 'User',
        fullName: 'Perm User',
        permissions: ['inventory', 'hrm'],
      }),
    ]
    render(<RolesPage />)
    await userEvent.click(screen.getByRole('button', { name: /manage access/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    const boxFor = (label: string) =>
      within(screen.getByText(label, { exact: true }).closest('label') as HTMLElement).getByRole(
        'checkbox',
      )
    expect(boxFor('Inventory')).toBeChecked()
    expect(boxFor('Human Resources')).toBeChecked()
    expect(boxFor('Sales')).not.toBeChecked()
    expect(boxFor('Accounts & Finance')).not.toBeChecked()
  })
})
