// Finance authorization follows the app's baseline: any approved, authenticated
// user manages Accounts & Finance — exactly like companies / invoices / payments
// (whose RLS is a single `is_app_approved()` policy). The HR RBAC layer is
// available for future fine-grained control, but until roles are actually
// assigned (the access list is empty) it must NOT lock approved users out of the
// module. So: if no RBAC grants exist yet, grant all finance capabilities; once
// real grants exist, defer to them. Mirrors the DB change in migration 0026.

import { usePermissions, type PermissionsApi, type PermKey } from '@/features/hrm/permissions'

export function useFinanceAccess(): PermissionsApi {
  const perms = usePermissions()
  const bootstrap = perms.keys.length === 0 // no roles configured → app baseline
  return {
    isLoading: perms.isLoading,
    can: (key: PermKey) => bootstrap || perms.can(key),
    scopeOf: perms.scopeOf,
    keys: perms.keys,
  }
}
