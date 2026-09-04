'use client'

// Header business-entity switcher. Renders nothing for single-membership users
// (the entire current userbase), so it is safe to mount unconditionally once the
// `set-active-tenant` Edge Function is deployed. Uses framework-agnostic imports
// only (no next/* — this lives under src/features per the repo rule).

import { useMyTenants, useSetActiveTenant } from './useTenant'

export function TenantSwitcher() {
  const { data: tenants = [], isLoading } = useMyTenants()
  const setActive = useSetActiveTenant()

  // Nothing to switch when the user belongs to zero or one tenant.
  if (isLoading || tenants.length <= 1) return null

  return (
    <select
      className="rounded-md border border-charcoal-200 bg-white px-2 py-1 text-sm text-charcoal-800 disabled:opacity-60"
      aria-label="Switch business entity"
      defaultValue=""
      disabled={setActive.isPending}
      onChange={(e) => {
        if (e.target.value) setActive.mutate(e.target.value)
      }}
    >
      <option value="" disabled>
        Switch business…
      </option>
      {tenants.map((t) => (
        <option key={t.tenantId} value={t.tenantId}>
          {t.name} ({t.code})
        </option>
      ))}
    </select>
  )
}
