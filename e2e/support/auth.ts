import { type Page, expect } from '@playwright/test'
import { QA } from './credentials'

// QA-Orchestra — authentication actions. Reused by every generated spec and by
// auth.setup.ts. Do NOT re-implement login inside individual specs; call these.

/**
 * Log in as the QA super-admin through the UI. Handles both the dedicated
 * `/login` page and the login form merged into the landing page. Idempotent:
 * if already authenticated it returns immediately.
 */
export async function loginAsQA(page: Page): Promise<void> {
  if (await isAuthenticated(page)) return

  // Dedicated /login page (app/login/login-form.tsx): #loginId + #password,
  // submit button labelled "Login".
  await page.goto('/login')
  const loginId = page.locator('#loginId')
  if (await loginId.count()) {
    await loginId.fill(QA.email)
    await page.locator('#password').fill(QA.password)
    await page.getByRole('button', { name: /login|sign in/i }).click()
  } else {
    // Landing-page AuthForm fallback (src/features/auth/AuthForm.tsx).
    await page.goto('/')
    const email = page.getByPlaceholder('you@example.com')
    await expect(email, 'login email field should be visible (Supabase build)').toBeVisible({
      timeout: 15_000,
    })
    await email.fill(QA.email)
    await page.getByPlaceholder('••••••••').fill(QA.password)
    await page
      .getByRole('button', { name: /sign in|login/i })
      .first()
      .click()
  }

  // Landing in the portal is the success signal.
  await page.waitForURL(/\/app(\/|$)/, { timeout: 25_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 25_000 })
}

/** True when a portal session is already active in the current context. */
export async function isAuthenticated(page: Page): Promise<boolean> {
  await page.goto('/app').catch(() => {})
  return page
    .getByRole('heading', { name: 'Dashboard' })
    .isVisible({ timeout: 5_000 })
    .catch(() => false)
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /log ?out|sign ?out/i }).click({ timeout: 5_000 })
}
