import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AppUser, UserRole } from '@/types'

// Unit coverage for the RPC-delegated user access API. The read-modify-write now
// lives server-side (set_user_access, SECURITY DEFINER + authorization checks), so
// here we assert the client calls the right RPC with the right args and surfaces
// its result/errors (MSM-ROLES-API-001).

const store = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
}))

vi.mock('@/lib/api/supabaseCrud', () => ({
  sb: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      store.calls.push({ fn, args })
      if (fn === 'set_user_access') {
        if (args.p_id === 'nope') return { data: null, error: { message: 'User not found' } }
        return {
          data: {
            id: args.p_id,
            role: args.p_role ?? 'User',
            permissions: args.p_permissions ?? [],
          },
          error: null,
        }
      }
      return { data: null, error: null }
    },
  }),
}))

import { updateUserAccess } from './usersApi'

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
  store.calls = []
})

describe('updateUserAccess', () => {
  it('MSM-ROLES-API-001: delegates to set_user_access with id/role/permissions', async () => {
    const result = await updateUserAccess('u1', { role: 'User', permissions: ['inventory'] })

    expect(store.calls).toHaveLength(1)
    expect(store.calls[0]).toEqual({
      fn: 'set_user_access',
      args: { p_id: 'u1', p_role: 'User', p_permissions: ['inventory'] },
    })
    expect(result.permissions).toEqual(['inventory'])
  })

  it('passes a role change through to the RPC', async () => {
    const result = await updateUserAccess('u2', { role: 'Admin', permissions: [] })
    expect(store.calls[0].args).toMatchObject({ p_id: 'u2', p_role: 'Admin' })
    expect(result.role).toBe('Admin')
  })

  it('surfaces an unknown-user error from the RPC', async () => {
    await expect(updateUserAccess('nope', { role: 'User', permissions: [] })).rejects.toThrow(
      /not found/i,
    )
  })

  it('sends nulls when no role/permissions are supplied', async () => {
    await updateUserAccess('u3', {})
    expect(store.calls[0].args).toEqual({ p_id: 'u3', p_role: null, p_permissions: null })
    // keep the shared AppUser factory/type import exercised
    expect(user({ id: 'u3' }).id).toBe('u3')
  })
})
