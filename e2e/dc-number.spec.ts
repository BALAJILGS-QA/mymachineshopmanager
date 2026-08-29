import { test, expect, type Page } from '@playwright/test'

const EMAIL = process.env.APP_EMAIL || 'admin@sreebalajiindustries.com'
const PASS = process.env.APP_PASS || 'Balaji@2026'

async function login(page: Page) {
  await page.goto('/')
  const email = page.getByPlaceholder('you@example.com')
  if (!(await email.isVisible().catch(() => false))) test.skip(true, 'not a Supabase build')
  await email.fill(EMAIL)
  await page.getByPlaceholder('••••••••').fill(PASS)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20000 })
}

test('New Challan form has a Challan No. field with Auto/Manual toggle', async ({
  page,
  viewport,
}) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop only')
  await login(page)
  await page.goto('/app/deliveries')
  await page.getByRole('button', { name: /New Challan/i }).click()

  // Field is present and shows an auto (read-only) value by default.
  const dcNo = page.getByLabel('Challan No.')
  await expect(dcNo).toBeVisible()
  await expect(dcNo).toHaveValue(/.+/) // auto preview, not empty
  await expect(dcNo).toBeDisabled() // auto = read-only

  // Switch to Manual: field becomes editable and accepts a custom number.
  await page.getByRole('button', { name: 'Manual', exact: true }).click()
  await expect(dcNo).toBeEnabled()
  await dcNo.fill('DC-MANUAL-TEST-1')
  await expect(dcNo).toHaveValue('DC-MANUAL-TEST-1')

  // Back to Auto: read-only preview again.
  await page.getByRole('button', { name: 'Auto', exact: true }).click()
  await expect(dcNo).toBeDisabled()
})
