import { test, expect, type Page } from '@playwright/test'

// Validates that an Open (un-invoiced) delivery challan can be fully edited — all
// fields + materials via the multi-select — and that created/last-updated history
// is shown. Read-only: opens the edit modal and asserts affordances, then cancels
// without saving (no data mutated). Skips on the local-only shell.
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

test('Open challan: full edit affordances + history are shown', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop only')
  await login(page)
  await page.goto('/app/deliveries')

  // Widen the date range (defaults to the current month) so older challans list.
  await page.getByLabel('From').fill('')
  await page.getByLabel('To').fill('')

  // Wait for the re-filtered table to render an Open ("Not Invoiced") row.
  const openRows = page.locator('tbody tr', { hasText: 'Not Invoiced' })
  await expect(openRows.first()).toBeVisible({ timeout: 10000 })

  await openRows.first().getByTitle('Edit').click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // Full-edit banner only renders for an Open challan (canFullEdit).
  await expect(dialog.getByText('you can change every field')).toBeVisible()
  // The per-source dispatch picker is available in edit (anchor on its persistent
  // hint; the summary reads "N selected" once sources are mapped).
  await expect(dialog.getByText('Each option is one received stock')).toBeVisible()
  // Company + Date are editable (not locked) on an Open challan.
  await expect(dialog.getByRole('combobox').first()).toBeEnabled()
  // Created / last-updated history is displayed clearly.
  await expect(dialog.getByText('Created', { exact: false })).toBeVisible()
  await expect(dialog.getByText('Last updated', { exact: false })).toBeVisible()

  // Close without saving — no mutation.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
})
