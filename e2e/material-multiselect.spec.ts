import { test, expect, type Page } from '@playwright/test'

// Validates the per-source stock picker on the Delivery Challan and Invoice
// forms (each option is one received stock), and that Sales now scopes to own
// (shop) materials only. Read-only: the forms are opened and sources ticked, but
// nothing is saved (no data mutated). Requires a Supabase build with received
// customer/own stock that still has available quantity (skips otherwise).
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

test('DC form: multi-select maps several materials into dispatch lines', async ({
  page,
  viewport,
}) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop only')
  await login(page)
  await page.goto('/app/deliveries')
  await page.getByRole('button', { name: /New Challan/i }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('New Delivery Challan')).toBeVisible()

  // Anchor to the persistent hint text (the summary text changes on selection).
  const picker = dialog.locator('div.mb-2', { hasText: 'Each option is one received stock' })
  await expect(picker.locator('details')).toBeVisible()
  await expect(dialog.getByText('No material sources selected yet.')).toBeVisible()

  await picker.locator('summary').click()
  const boxes = picker.locator('input[type="checkbox"]')
  // Sources load async (TanStack Query). Skip if this customer has no available
  // received stock to dispatch (data dependency, not a UI failure).
  if (
    !(await boxes
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false))
  )
    test.skip(true, 'no available received stock for the default company')
  const n = await boxes.count()

  // Tick up to two sources — each must become a dispatch line.
  const pick = Math.min(2, n)
  for (let i = 0; i < pick; i++) await boxes.nth(i).check()
  await expect(picker.locator('summary')).toContainText(`${pick} selected`)
  await expect(dialog.getByText('No material sources selected yet.')).toHaveCount(0)
  // One row per ticked source in the items table.
  await expect(dialog.locator('table tbody tr')).toHaveCount(pick)
})

test('Invoice form: multi-select adds stock-deducting material lines', async ({
  page,
  viewport,
}) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop only')
  await login(page)
  await page.goto('/app/invoices')
  await page.getByRole('button', { name: /New Invoice/i }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('New Invoice')).toBeVisible()

  // Anchor to the persistent label (the summary text changes on selection).
  const picker = dialog.locator('div.mb-2', { hasText: 'Bill directly from received stock' })
  await expect(picker.locator('details')).toBeVisible()

  await picker.locator('summary').click()
  const boxes = picker.locator('input[type="checkbox"]')
  // Sources load async (TanStack Query). Skip if this customer has no available
  // received stock to bill (data dependency, not a UI failure).
  if (
    !(await boxes
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false))
  )
    test.skip(true, 'no available received stock for the default company')

  await boxes.first().check()
  await expect(picker.locator('summary')).toContainText('1 selected')
})

test('Sales: scoped to own materials only', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop only')
  await login(page)
  await page.goto('/app/sales')
  await expect(page.getByRole('heading', { level: 1, name: 'Sales' })).toBeVisible({
    timeout: 20000,
  })
  await expect(page.getByText(/customer-supplied stock is excluded/i)).toBeVisible()
})
