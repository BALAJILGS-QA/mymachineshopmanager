import { test, expect, type Page } from '@playwright/test'

// Validates that module sub-pages render as a tab strip (not a button hub):
// clicking a module in the sidebar redirects to its first tab, the tabs persist
// across sibling pages, and standalone pages show no tabs.
// Runs only against a Supabase build (skips on the local-only shell).
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

test('module opens its first tab and shows a persistent tab strip', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop sidebar only')
  await login(page)

  // Sidebar module link → redirects to the first tab (Job Orders / /app/jobs).
  await page.getByRole('link', { name: 'Production Planning', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/jobs$/)

  // The module's items render as a tab strip (nav labelled with the module).
  const tabs = page.getByRole('navigation', { name: 'Production Planning' })
  await expect(tabs).toBeVisible()
  await expect(tabs.getByRole('link', { name: 'Job Orders' })).toBeVisible()
  await expect(tabs.getByRole('link', { name: 'Production' })).toBeVisible()
  await expect(tabs.getByRole('link', { name: 'Materials & Stock' })).toBeVisible()

  // Switching tabs navigates and keeps the strip (tab behaviour, not buttons).
  await tabs.getByRole('link', { name: 'Materials & Stock' }).click()
  await expect(page).toHaveURL(/\/app\/materials$/)
  await expect(
    page.getByRole('navigation', { name: 'Production Planning' }).getByRole('link', {
      name: 'Materials & Stock',
    }),
  ).toBeVisible()
})

test('standalone pages (Dashboard) show no module tabs', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop only')
  await login(page)
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  // No module tab strip is rendered for a standalone page (dashboard shortcut
  // cards may still link to sub-pages — those aren't tabs).
  await expect(page.getByRole('navigation', { name: 'Production Planning' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Accounts & Finance' })).toHaveCount(0)
})
