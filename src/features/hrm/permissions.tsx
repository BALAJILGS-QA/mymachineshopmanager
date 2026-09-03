// HRM authorization on the client. The source of truth is the DB (RLS + the RBAC
// tables from migration 0019); this hook is a UX layer that hides controls the
// caller cannot use. Every mutation is still enforced server-side, so a stale or
// bypassed check here can never grant real access.
//
// It reads the caller's effective permissions from the `hr_my_access` RPC (one
// row per permission at its broadest scope). In local-only mode (no Supabase)
// it grants everything so the module is fully explorable in dev.

import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseEnabled } from '@/data/supabase'
import { qk } from '@/lib/api/queryKeys'
import { logger } from '@/lib/logger'

export type Scope = 'self' | 'team' | 'department' | 'company' | 'all'

// The permission catalog understood by the app (mirrors hr_permissions.key).
export type PermKey =
  | 'HRM_VIEW'
  | 'EMPLOYEE_VIEW'
  | 'EMPLOYEE_CREATE'
  | 'EMPLOYEE_EDIT'
  | 'EMPLOYEE_ARCHIVE'
  | 'DEPARTMENT_MANAGE'
  | 'DESIGNATION_MANAGE'
  | 'ORG_VIEW'
  | 'ATTENDANCE_VIEW'
  | 'ATTENDANCE_EDIT'
  | 'ATTENDANCE_APPROVE'
  | 'SHIFT_MANAGE'
  | 'LEAVE_VIEW'
  | 'LEAVE_APPLY'
  | 'LEAVE_APPROVE'
  | 'LEAVE_REJECT'
  | 'HOLIDAY_MANAGE'
  | 'PAYROLL_VIEW'
  | 'PAYROLL_PROCESS'
  | 'PAYROLL_APPROVE'
  | 'PAYROLL_FINALIZE'
  | 'DOCUMENT_VIEW'
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_DELETE'
  | 'ASSET_MANAGE'
  | 'ADVANCE_MANAGE'
  | 'EXPENSE_VIEW'
  | 'EXPENSE_APPROVE'
  | 'RECRUITMENT_VIEW'
  | 'RECRUITMENT_MANAGE'
  | 'PERFORMANCE_VIEW'
  | 'PERFORMANCE_MANAGE'
  | 'TRAINING_VIEW'
  | 'TRAINING_MANAGE'
  | 'REPORT_VIEW'
  | 'REPORT_EXPORT'
  | 'HR_SETTINGS_MANAGE'
  | 'ROLE_MANAGE'
  | 'AUDIT_VIEW'

export interface AccessRow {
  permission_key: PermKey
  scope: Scope
}

export interface PermissionsApi {
  isLoading: boolean
  /** true when the caller holds the permission at any scope. */
  can: (key: PermKey) => boolean
  /** the broadest scope the caller has for a permission, or undefined. */
  scopeOf: (key: PermKey) => Scope | undefined
  /** all permission keys held (for debugging / settings UI). */
  keys: PermKey[]
}

async function fetchAccess(): Promise<AccessRow[]> {
  if (!isSupabaseEnabled() || !supabase) return [] // handled by grant-all fallback
  const { data, error } = await supabase.rpc('hr_my_access')
  if (error) {
    logger.warn('hr_my_access failed — HR controls will be hidden', error)
    return []
  }
  return (data ?? []) as AccessRow[]
}

export function usePermissions(): PermissionsApi {
  const localMode = !isSupabaseEnabled()
  const query = useQuery({
    queryKey: qk.hrm.access,
    queryFn: fetchAccess,
    staleTime: 5 * 60_000,
    enabled: !localMode,
  })

  const rows = query.data ?? []
  const map = new Map<PermKey, Scope>()
  for (const r of rows) map.set(r.permission_key, r.scope)

  return {
    isLoading: localMode ? false : query.isLoading,
    can: (key) => localMode || map.has(key),
    scopeOf: (key) => (localMode ? 'all' : map.get(key)),
    keys: localMode ? [] : Array.from(map.keys()),
  }
}

// Declarative gate: render children only when the caller holds `perm`. Reads
// permissions via usePermissions() directly — React Query dedupes the fetch, so
// many <Can> on a page share one request without needing a context provider.
export function Can({
  perm,
  fallback = null,
  children,
}: {
  perm: PermKey
  fallback?: ReactNode
  children: ReactNode
}) {
  const perms = usePermissions()
  if (perms.isLoading) return null
  return perms.can(perm) ? <>{children}</> : <>{fallback}</>
}
