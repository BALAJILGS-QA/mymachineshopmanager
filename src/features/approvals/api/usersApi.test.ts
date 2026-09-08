import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AppUser, UserRole } from '@/types'

// Unit coverage for the app_state read-modify-write in updateUserAccess — the
// "only the target user changes / a single singleton upsert is issued" invariant
// (MSM-ROLES-DB-003 / DB-001 / API-001), without touching a real backend.

const store = vi.hoisted(() => ({
  users: [] as AppUser[],
  lastUpsert: null as { id: string; data: { users: AppUser[] } } | null,
}))

vi.mock('@/lib/api/supabaseCrud', () => ({
  sb: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { data: { users: store.users } }, error: null }),
        }),
      }),
      upsert: async (payload: { id: string; data: { users: AppUser[] } }) => {
        store.lastUpsert = payload
        return { error: null }
      },
    }),
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
  store.lastUpsert = null
  store.users = [
    user({ id: 'u1', email: 'u1@a.com', role: 'User', permissions: [] }),
    user({ id: 'u2', email: 'u2@a.com', role: 'User', permissions: ['hrm'] }),
  ]
})

describe('updateUserAccess', () => {
  it('MSM-ROLES-DB-003: updates only the target user, leaving others untouched', async () => {
    const u2Before = JSON.stringify(store.users[1])
    await updateUserAccess('u1', { role: 'User', permissions: ['inventory'] })

    expect(store.lastUpsert).not.toBeNull()
    const written = store.lastUpsert!.data.users
    const u1 = written.find((u) => u.id === 'u1')!
    const u2 = written.find((u) => u.id === 'u2')!
    expect(u1.permissions).toEqual(['inventory'])
    // The other user is byte-for-byte unchanged (no collateral write).
    expect(JSON.stringify(u2)).toBe(u2Before)
  })

  it('MSM-ROLES-DB-001 / API-001: issues a single upsert to the app_state singleton', async () => {
    await updateUserAccess('u2', { role: 'Admin', permissions: [] })
    expect(store.lastUpsert!.id).toBe('singleton')
    const u2 = store.lastUpsert!.data.users.find((u) => u.id === 'u2')!
    expect(u2.role).toBe('Admin')
  })

  it('throws for an unknown user id (no upsert)', async () => {
    await expect(updateUserAccess('nope', { role: 'User', permissions: [] })).rejects.toThrow(
      /not found/i,
    )
    expect(store.lastUpsert).toBeNull()
  })
})
