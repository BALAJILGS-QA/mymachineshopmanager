import { redirect } from 'next/navigation'

// Compatibility redirect: login is merged into the landing page. Preserves the
// old /login URL (was src/routes/login.tsx, which redirected to '/').
export default function LoginRedirect() {
  redirect('/')
}
