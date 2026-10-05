// Users / registration-approval data-access — Supabase RPCs only. The user registry
// lives in the super-admin-only app_state singleton, so every read and write goes
// through a scoped SECURITY DEFINER RPC: `list_app_users` (scoped read),
// `set_user_approval` (approve/reject — also stamps status + grants the tenant),
// and `set_user_access` (role / module grants). A client can never read or rewrite
// another user's record directly.

import { sb } from '@/lib/api/supabaseCrud'
import type { AppUser, UserRole } from '@/types'

export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await sb().rpc('list_app_users')
  if (error) throw error
  return (Array.isArray(data) ? data : []) as AppUser[]
}

async function decide(
  id: string,
  status: 'approved' | 'rejected',
  _by: string,
  email: string,
): Promise<AppUser> {
  // set_user_approval (super-admin only in the DB) flips approved_users, the tenant
  // membership AND the app_state registry status/decidedAt/decidedBy in one step.
  const { error } = await sb().rpc('set_user_approval', {
    p_email: email,
    p_approved: status === 'approved',
  })
  if (error) throw error
  const user = (await listUsers()).find((u) => u.id === id)
  if (!user) throw new Error('User not found')
  return user
}

// Update a user's role and/or granted modules via the authorization-checked RPC
// (super admin, or an Admin for a role='User' account in their own shop).
export async function updateUserAccess(
  id: string,
  patch: { role?: UserRole; permissions?: string[] },
): Promise<AppUser> {
  const { data, error } = await sb().rpc('set_user_access', {
    p_id: id,
    p_role: patch.role ?? null,
    p_permissions: patch.permissions ?? null,
  })
  if (error) throw error
  return data as AppUser
}

export async function approveUser(id: string, by: string, email: string): Promise<AppUser> {
  return decide(id, 'approved', by, email)
}

export async function rejectUser(id: string, by: string, email: string): Promise<AppUser> {
  return decide(id, 'rejected', by, email)
}
