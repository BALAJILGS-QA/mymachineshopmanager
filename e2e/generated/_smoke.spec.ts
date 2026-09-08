import { test, expect, gotoModule, expectHealthy, dt, MODULES } from '../support'

// QA-Orchestra framework smoke — proves the shared support library works against
// the authenticated prod session (storageState from auth.setup). Non-destructive.
test.describe('QA-Orchestra framework smoke @smoke', () => {
  test('dashboard loads for the QA super-admin', async ({ page }) => {
    await gotoModule(page, '/app')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expectHealthy(page)
  })

  test('invoices list renders (table or empty state)', async ({ page }) => {
    await gotoModule(page, '/app/invoices')
    await expectHealthy(page)
    const count = await dt.rowCount(page)
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('module registry routes are all reachable (spot check)', async ({ page }) => {
    for (const m of MODULES.filter((x) => ['jobs', 'materials', 'payments'].includes(x.id))) {
      await gotoModule(page, m.route)
      await expectHealthy(page)
    }
  })
})
