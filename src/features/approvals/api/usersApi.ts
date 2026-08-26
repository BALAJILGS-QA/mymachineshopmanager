// Users / registration-approval data-access (service) layer. Approving or
// rejecting also mirrors the decision into the server-side approval registry
// (RLS gate) when Supabase is configured — encapsulated here so the UI does one
// call. Delegates to userRepo today; re-pointed at Supabase in phase 5b.

import { userRepo } from '@/data/repo'
import { setRemoteApproval } from '@/data/backend'
import { isSupabaseEnabled } from '@/data/supabase'
import type { AppUser } from '@/types'

export async function listUsers(): Promise<AppUser[]> {
  return userRepo.list()
}

export async function approveUser(id: string, by: string, email: string): Promise<AppUser> {
  const user = userRepo.approve(id, by)
  if (isSupabaseEnabled()) await setRemoteApproval(email, true)
  return user
}

export async function rejectUser(id: string, by: string, email: string): Promise<AppUser> {
  const user = userRepo.reject(id, by)
  if (isSupabaseEnabled()) await setRemoteApproval(email, false)
  return user
}
