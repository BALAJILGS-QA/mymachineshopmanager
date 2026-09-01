import { redirect } from 'next/navigation'

// Preserve the Vite behaviour (__root.tsx notFoundComponent): any unknown URL
// redirects to the landing page. Static routes take precedence over this
// catch-all, and /app/* unknowns are handled by app/app/[...rest].
export default function Page() {
  redirect('/')
}
