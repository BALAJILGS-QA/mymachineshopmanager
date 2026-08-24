import { test, expect } from '@playwright/test'

// Runs only against a Supabase-configured build (VITE_SUPABASE_* present).
// Verifies: Supabase login → hydrate → write-through persist → re-hydrate from
// Supabase after clearing the local data cache → cleanup delete.

const EMAIL = process.env.APP_EMAIL || 'admin@sreebalajiindustries.com'
const PASS = process.env.APP_PASS || 'Balaji@2026'
const NAME = `E2E ${Date.now()}` // unique per run to avoid leftover collisions

test('supabase: login, persist, re-hydrate from cloud', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop navigation only')

  await page.goto('/')
  // Only meaningful against a Supabase build (email login). Skip in local mode.
  const emailField = page.getByPlaceholder('you@example.com')
  if (!(await emailField.isVisible().catch(() => false))) {
    test.skip(true, 'app not in Supabase mode (no VITE_SUPABASE_* at build)')
  }
  await emailField.fill(EMAIL)
  await page.getByPlaceholder('••••••••').fill(PASS)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20000 })

  const companies = () =>
    page.getByRole('navigation').getByRole('link', { name: 'Companies', exact: true }).click()

  // Create a company.
  await companies()
  await page.getByRole('button', { name: 'Add Company' }).click()
  await page.getByLabel('Company Name').fill(NAME)
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText(NAME)).toBeVisible()

  // Allow async write-through, then drop ONLY the local data cache (keep the
  // Supabase auth session) and reload so hydration must come from the cloud.
  await page.waitForTimeout(3000)
  await page.evaluate(() => localStorage.removeItem('cnc-shop-db'))
  await page.reload()
  // Reload keeps the /companies URL; wait for the shell then the row, which can
  // only be present if it was re-hydrated from Supabase (local cache was wiped).
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Companies', exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(NAME)).toBeVisible({ timeout: 10000 })

  // Cleanup: delete the test company (write-through removes it from Supabase).
  const row = page.getByRole('row').filter({ hasText: NAME })
  await row.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(NAME)).toHaveCount(0)
  await page.waitForTimeout(2500)
})
