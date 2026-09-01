'use client'

import { useRouter } from 'next/navigation'
import { AuthForm } from '@/features/auth/AuthForm'

// Client island: injects Next navigation into the (router-agnostic) AuthForm.
// The portal lives at /app. During the migration /app is still served by the
// Vite app; once the portal is ported to Next this push resolves within Next.
export function LandingAuth() {
  const router = useRouter()
  return <AuthForm onAuthenticated={() => router.push('/app')} />
}
