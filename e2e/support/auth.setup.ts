import { test as setup, expect } from '@playwright/test'
import { QA, SUPABASE_REF, STORAGE_STATE } from './credentials'

// QA-Orchestra — one-time authentication via TOKEN INJECTION (deterministic).
// Fetches a real Supabase session with the QA credentials, writes it into
// localStorage under the supabase-js key, and snapshots storageState so every
// spec starts authenticated. Avoids flaky UI-login + localStorage-capture races.
setup('authenticate QA super-admin', async ({ page }) => {
  // Land on the app origin first; the token fetch runs in the BROWSER context
  // (the app's own network path reaches Supabase; Playwright's request context
  // may be proxy-blocked).
  await page.goto('/login')
  const session = await page.evaluate(
    async ([url, anon, email, password]) => {
      const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!r.ok) throw new Error(`login ${r.status}: ${await r.text()}`)
      return r.json()
    },
    [QA.supabaseUrl, QA.supabaseAnonKey, QA.email, QA.password] as const,
  )
  await page.evaluate(
    ([ref, s]) => localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s)),
    [SUPABASE_REF, session] as const,
  )

  // Reload → the app hydrates the injected session and enters the portal.
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 25_000 })

  await page.context().storageState({ path: STORAGE_STATE })
})
