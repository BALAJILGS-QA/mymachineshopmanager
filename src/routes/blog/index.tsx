import { createFileRoute } from '@tanstack/react-router'
import { BlogListPage } from '@/features/site/BlogListPage'

export const Route = createFileRoute('/blog/')({
  component: BlogListPage,
})
