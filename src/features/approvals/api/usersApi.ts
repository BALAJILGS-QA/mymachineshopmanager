// Users / registration-approval data-access - Supabase-direct. Profiles live in
// app_state.data.users (JSON); approving/rejecting also mirrors the decision into
// the server-side approval registry (RLS gate) via the set_user_approval RPC.

import { sb } from '@/lib/api/supabaseCrud'
import type { AppUser } from '@/types'

async function readAppState(): Promise<{ cur: Record<string, unknown>; users: AppUser[] }> {
  const { data, error } = await sb()
    .from('app_state')
    .select('data')
    .eq('id', 'singleton')
    .maybeSingle()
  if (error) throw error
  const cur = (data?.data as Record<string, unknown> | null) ?? {}
  const users = (Array.isArray(cur.users) ? cur.users : []) as AppUser[]
  return { cur, users }
}

export async function listUsers(): Promise<AppUser[]> {
  return (await readAppState()).users
}

// Mirror an approval decision into the server-side registry (no-op if the policy
// RPC isn't present, so a missing migration doesn't break the local update).
async function setRemoteApproval(email: string, approved: boolean): Promise<void> {
  const { error } = await sb().rpc('set_user_approval', { p_email: email, p_approved: approved })
  if (error && !/function .* does not exist|not find the function/i.test(error.message)) {
    throw error
  }
}

async function decide(
  id: string,
  status: 'approved' | 'rejected',
  by: string,
  email: string,
): Promise<AppUser> {
  const { cur, users } = await readAppState()
  const idx = users.findIndex((u) => u.id === id)
  if (idx < 0) throw new Error('User not found')
  users[idx] = { ...users[idx], status, decidedAt: new Date().toISOString(), decidedBy: by }
  const { error } = await sb()
    .from('app_state')
    .upsert({ id: 'singleton', data: { ...cur, users } })
  if (error) throw error
  await setRemoteApproval(email, status === 'approved')
  return users[idx]
}

export async function approveUser(id: string, by: string, email: string): Promise<AppUser> {
  return decide(id, 'approved', by, email)
}

export async function rejectUser(id: string, by: string, email: string): Promise<AppUser> {
  return decide(id, 'rejected', by, email)
}
