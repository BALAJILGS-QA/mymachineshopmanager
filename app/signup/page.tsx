import { redirect } from 'next/navigation'

// Compatibility redirect: sign-up is merged into the landing page. Preserves the
// old /signup URL (was src/routes/signup.tsx, which redirected to '/').
export default function SignupRedirect() {
  redirect('/')
}
