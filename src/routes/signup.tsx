import { createFileRoute, redirect } from '@tanstack/react-router'

// Sign-up is merged into the landing page — preserve the old /signup URL as a redirect.
export const Route = createFileRoute('/signup')({
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true })
  },
})
