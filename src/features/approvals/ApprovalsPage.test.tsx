// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AppUser, UserRole } from '@/types'

// Component coverage for the User Approvals branches the super-admin Playwright
// session cannot reach (non-super-admin gate) plus the createdAt crash-guard.
// Keys map to qa/manual-testcases/_raw/approvals.json.

const h = vi.hoisted(() => ({
  auth: {
    isSuperAdmin: true,
    session: { email: 'super@x.com', username: 's', role: 'SuperAdmin' },
  },
  users: [] as AppUser[],
  navigate: vi.fn(),
  approve: vi.fn().mockResolvedValue(undefined),
  reject: vi.fn().mockResolvedValue(undefined),
  confirm: vi.fn().mockResolvedValue(false),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/features/auth/auth', () => ({ useAuth: () => h.auth }))
vi.mock('@/components/nav/app-link', () => ({ useAppNavigate: () => h.navigate }))
vi.mock('./hooks/useUsers', () => ({
  useUsers: () => ({ data: h.users }),
  useApproveUser: () => ({ mutateAsync: h.approve, isPending: false }),
  useRejectUser: () => ({ mutateAsync: h.reject, isPending: false }),
}))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => h.toast }))
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => h.confirm }))

import { ApprovalsPage } from './ApprovalsPage'

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
    status: over.status ?? 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  h.navigate.mockClear()
})

describe('ApprovalsPage — access gate', () => {
  it('MSM-APPROVALS-SEC-001: a non-super-admin is redirected to /app and nothing renders', () => {
    h.auth = { isSuperAdmin: false, session: { email: 'user@a.com', username: 'u', role: 'User' } }
    h.users = []
    const { container } = render(<ApprovalsPage />)
    expect(h.navigate).toHaveBeenCalledWith('/app', { replace: true })
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ApprovalsPage — createdAt crash guard', () => {
  it('MSM-APPROVALS-FUNC-004: the Approved and All filters render without crashing when a user lacks createdAt', async () => {
    h.auth = {
      isSuperAdmin: true,
      session: { email: 'super@x.com', username: 's', role: 'SuperAdmin' },
    }
    h.users = [
      user({ id: 'p', role: 'User', status: 'pending', fullName: 'Penny Pending' }),
      // Legacy/seed account with NO createdAt — the case that used to crash.
      user({
        id: 'a',
        role: 'User',
        status: 'approved',
        fullName: 'Andy Approved',
        createdAt: undefined as unknown as string,
      }),
    ]
    render(<ApprovalsPage />)
    // Default (Pending) view is healthy.
    expect(screen.getByRole('heading', { name: 'User Approvals' })).toBeInTheDocument()

    // Switching to Approved then All must not throw (the (u.createdAt ?? '') guard).
    await userEvent.click(screen.getByRole('button', { name: 'Approved' }))
    expect(screen.getByText('Andy Approved')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByText('Andy Approved')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'User Approvals' })).toBeInTheDocument()
  })
})
