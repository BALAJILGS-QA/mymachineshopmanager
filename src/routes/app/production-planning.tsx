import { createFileRoute, redirect } from '@tanstack/react-router'

// The module landing redirects to its first tab — the sub-pages render as a tab
// strip (see AppShell), so there is no separate hub/button page.
export const Route = createFileRoute('/app/production-planning')({
  beforeLoad: () => {
    throw redirect({ to: '/app/jobs' })
  },
})
