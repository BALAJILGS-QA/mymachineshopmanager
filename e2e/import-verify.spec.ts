import { test, expect } from '@playwright/test'

// Verifies the imported real dataset renders in the live app.
const EMAIL = process.env.APP_EMAIL || 'admin@sreebalajiindustries.com'
const PASS = process.env.APP_PASS || 'Balaji@2026'

test('imported invoices and payments render', async ({ page }) => {
  await page.goto('/login')
  const email = page.getByPlaceholder('you@example.com')
  if (!(await email.isVisible().catch(() => false))) test.skip(true, 'not Supabase build')
  await email.fill(EMAIL)
  await page.getByPlaceholder('••••••••').fill(PASS)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20000 })

  const nav = (name: string) =>
    page.getByRole('navigation').getByRole('link', { name, exact: true }).click()

  await nav('Invoices')
  await expect(page.getByText(/INV-\d{3}/).first()).toBeVisible({ timeout: 10000 })

  await nav('Payments')
  await expect(page.getByText(/PAY-IMP-\d{3}/).first()).toBeVisible({ timeout: 10000 })
})
