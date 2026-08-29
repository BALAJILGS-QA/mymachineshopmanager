import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '@/features/site/LandingPage'

// Public marketing + merged login/register. Server-rendered for SEO.
export const Route = createFileRoute('/')({
  component: LandingPage,
})
