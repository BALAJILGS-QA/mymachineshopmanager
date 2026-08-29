import { createFileRoute, redirect } from '@tanstack/react-router'

// Login is merged into the landing page — preserve the old /login URL as a redirect.
export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true })
  },
})
