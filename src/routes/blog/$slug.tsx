import { createFileRoute } from '@tanstack/react-router'
import { BlogPostPage } from '@/features/site/BlogPostPage'

export const Route = createFileRoute('/blog/$slug')({
  component: BlogPostPage,
})
