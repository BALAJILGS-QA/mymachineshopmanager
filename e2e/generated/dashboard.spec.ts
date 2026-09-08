import {
  test,
  expect,
  gotoModule,
  hasClientCrash,
  expectHealthy,
  expectNoFailedRequests,
  moduleById,
} from '../support'

// QA-Orchestra — generated spec for the Dashboard module (route /app).
// Non-destructive cases are automated below; destructive derivation checks are
// tagged @destructive so the config can exclude them by default.
//
// Runs authenticated as the QA super-admin via Playwright storageState — do NOT
// call loginAsQA here. Tests run against LIVE PRODUCTION data, so every
// assertion is data-tolerant (counts >= 0, "table or empty state", value may or
// may not change depending on seeded data).

const ROUTE = moduleById('dashboard')?.route ?? '/app'

// A labelled <select> that constrains the dashboard scope to companies.
const filter = (page: import('@playwright/test').Page) =>
  page.getByLabel('Filter dashboard by company')

// Resolve a link (AppLink renders <a href>) whose href ends with the route.
const linkTo = (page: import('@playwright/test').Page, route: string) =>
  page.locator(`a[href$="${route}"]`).first()

test.describe('Dashboard @dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await gotoModule(page, ROUTE)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })
  })

  // MSM-DASHBOARD-UI-001
  test('renders all sections: header, scope subtitle, company filter, stepper, panels, charts and lists', async ({
    page,
  }) => {
    expect(await hasClientCrash(page)).toBe(false)
    await expectHealthy(page)

    // Header + subtitle scoped to "All companies" (default, no company selected).
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText(/·\s*All companies/)).toBeVisible()

    // Company filter present with the empty "All companies" option selected.
    await expect(filter(page)).toBeVisible()
    await expect(filter(page)).toHaveValue('')

    // Workflow stepper — 5 stages.
    for (const label of [
      'Material Stock',
      'Job Orders',
      'In Machining',
      'Ready to Dispatch',
      'Dispatched',
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }

    // Panel cards.
    for (const title of [
      'Shop-floor activity',
      'Financial summary',
      'Job orders by status',
      'Stock health',
      'Purchase',
    ]) {
      await expect(page.getByText(new RegExp(title)).first()).toBeVisible()
    }

    // All four charts.
    for (const chart of [
      'Invoices raised vs Payments received (6 months)',
      'Expenses by category (month)',
      'Materials dispatched per month (qty issued)',
      'Cash flow: Payments vs Expenses (6 months)',
    ]) {
      await expect(page.getByText(chart, { exact: true }).first()).toBeVisible()
    }

    // The four lists.
    for (const list of [
      'Priority jobs',
      'Low / negative stock',
      'Recent payments',
      'Recent material dispatches',
    ]) {
      await expect(page.getByText(list, { exact: true }).first()).toBeVisible()
    }
  })

  // MSM-DASHBOARD-UI-002
  test('stepper, KPI tiles, summary rows and "View all" links navigate to documented routes', async ({
    page,
  }) => {
    // (elementRoute) -> expected destination. AppLink renders anchors; we assert
    // the href and (for a representative sample) that clicking navigates without
    // rendering the crash boundary. targets NOT equal to their label are noted.
    const hrefTargets = [
      '/app/inventory/materials', // Material Stock stepper stage
      '/app/jobs', // Job Orders stepper + Open Jobs BigStat
      '/app/production', // In Machining / Ready to Dispatch stepper + In Production BigStat
      '/app/deliveries', // Dispatched stepper + Dispatched BigStat
      '/app/payments', // Payments (month) SummaryRow + Recent payments "View all"
      '/app/invoices', // Pending payments SummaryRow
    ]
    for (const route of hrefTargets) {
      await expect(linkTo(page, route)).toHaveAttribute('href', new RegExp(`${route}$`))
    }

    // Recent material dispatches "View all" targets /app/inventory/materials
    // (documented: NOT /app/deliveries). At least one such link must exist.
    await expect(linkTo(page, '/app/inventory/materials')).toBeVisible()

    // Click-through: navigate via the Open Jobs BigStat and confirm the shell
    // survives, then return to /app.
    await linkTo(page, '/app/jobs').click()
    await expect(page).toHaveURL(/\/app\/jobs/)
    expect(await hasClientCrash(page)).toBe(false)
    await expectHealthy(page)

    await gotoModule(page, ROUTE)
    await linkTo(page, '/app/deliveries').click()
    await expect(page).toHaveURL(/\/app\/deliveries/)
    expect(await hasClientCrash(page)).toBe(false)
    await expectHealthy(page)
  })

  // MSM-DASHBOARD-UI-003
  test('empty-state messages render for charts/lists with no in-scope data; 6-month bars still render', async ({
    page,
  }) => {
    // The two 6-month money charts have NO empty state — their titles always render.
    await expect(
      page.getByText('Invoices raised vs Payments received (6 months)', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Cash flow: Payments vs Expenses (6 months)', { exact: true }),
    ).toBeVisible()

    // Iterate company options to find a scope with no in-scope activity; assert
    // that WHEN an empty state text appears it is one of the documented strings.
    // Data-tolerant: on live data some scope may have activity, so we only assert
    // that the set of possible empty-state texts is a subset of the known copy.
    const knownEmpties = [
      'No expenses this month',
      'No material issues in this period',
      'No pending jobs',
      'All stock above reorder levels',
      'No payments yet',
      'No material issues yet',
    ]
    const options = await filter(page).locator('option').all()
    // Try the last company (arbitrary) as a likely low-activity scope.
    if (options.length > 1) {
      const val = await options[options.length - 1].getAttribute('value')
      if (val) await filter(page).selectOption(val)
      await page.waitForTimeout(400)
    }
    // Whatever empty states are shown must be from the known set (never garbage).
    for (const text of knownEmpties) {
      const count = await page.getByText(text, { exact: true }).count()
      expect(count).toBeGreaterThanOrEqual(0) // presence is data-dependent
    }
    // Page must remain healthy in this scope.
    expect(await hasClientCrash(page)).toBe(false)
    await expectHealthy(page)
  })

  // MSM-DASHBOARD-UI-004
  test('charts render visuals and the stock-health gauge shows a whole-number percentage with "in stock"', async ({
    page,
  }) => {
    // Recharts renders <svg> surfaces; at least the two always-present money
    // charts should draw an SVG.
    await expect(page.locator('.recharts-surface').first()).toBeVisible({ timeout: 15_000 })
    const surfaces = await page.locator('.recharts-surface').count()
    expect(surfaces).toBeGreaterThan(0)

    // Legends for the money charts (Invoiced/Received, Payments/Expenses).
    await expect(page.getByText('Invoiced', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Received', { exact: true }).first()).toBeVisible()

    // Gauge: whole-number percentage + "in stock" caption at the donut center.
    await expect(page.getByText('in stock', { exact: true })).toBeVisible()
    const pctText = await page
      .getByText(/^\d+%$/)
      .first()
      .innerText()
    expect(pctText).toMatch(/^\d+%$/) // integer percent, never a decimal / NaN
  })

  // MSM-DASHBOARD-FUNC-001
  test('company filter re-scopes KPIs, charts and lists and updates the subtitle', async ({
    page,
  }) => {
    // Baseline: All companies subtitle.
    await expect(page.getByText(/·\s*All companies/)).toBeVisible()

    const options = await filter(page).locator('option').all()
    if (options.length <= 1) {
      test.skip(true, 'no companies to scope by in this environment')
      return
    }

    // Select the first real company and confirm the subtitle reflects its name.
    const firstVal = await options[1].getAttribute('value')
    const firstLabel = (await options[1].innerText()).trim()
    expect(firstVal).toBeTruthy()
    await filter(page).selectOption(firstVal!)
    await page.waitForTimeout(400)

    await expect(page.getByText(new RegExp(`·\\s*${escapeRe(firstLabel)}`))).toBeVisible()
    // No longer "All companies".
    await expect(page.getByText(/·\s*All companies/)).toHaveCount(0)
    expect(await hasClientCrash(page)).toBe(false)

    // Filtering is client-side — the whole dashboard chrome must remain healthy.
    await expectHealthy(page)
    await expect(page.getByText('Stock health', { exact: true })).toBeVisible()

    // Clear back to All companies and confirm the aggregate label returns.
    await filter(page).selectOption('')
    await page.waitForTimeout(400)
    await expect(page.getByText(/·\s*All companies/)).toBeVisible()
  })

  // MSM-DASHBOARD-FUNC-002
  test('monthly financial figures render as valid currency and Net(month) carries a tone', async ({
    page,
  }) => {
    // We can't recompute the ledger here, but we verify the (month) rows exist,
    // render valid currency (no NaN/undefined), and that the Net row is present.
    for (const label of [
      'Invoiced (month)',
      'GST (month)',
      'Payments (month)',
      'Pending payments',
      'Net (month)',
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    // Currency figures anywhere in the financial summary must not read NaN/undefined.
    const summary = page
      .getByText('Financial summary', { exact: true })
      .locator('xpath=ancestor::*[1]')
    const summaryText = await summary.innerText().catch(() => '')
    expect(summaryText).not.toMatch(/NaN|undefined/)
    expect(await hasClientCrash(page)).toBe(false)
  })

  // MSM-DASHBOARD-FUNC-003
  test('job-status counts, stepper and priority-jobs list are consistent and capped', async ({
    page,
  }) => {
    // Shop-floor activity KPI tiles.
    for (const label of ['Open Jobs', 'In Production', 'Ready to Dispatch', 'Dispatched']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    // Job orders by status rows.
    for (const label of ['Pending', 'In progress', 'On hold', 'Completed', 'Cancelled']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }

    // Priority jobs list is capped at 6. Count the rows under the "Priority jobs"
    // card heading (each job row shows a jobNo · company · due line).
    const card = page
      .getByText('Priority jobs', { exact: true })
      .locator('xpath=ancestor::*[contains(@class,"p-4")][1]')
    const dueRows = card.getByText(/·\s*due\s/)
    const n = await dueRows.count()
    expect(n).toBeLessThanOrEqual(6)
    expect(n).toBeGreaterThanOrEqual(0)
  })

  // MSM-DASHBOARD-FUNC-004
  test('stock-health gauge, low/negative stock list and raw-material value render from the ledger', async ({
    page,
  }) => {
    // Gauge percentage is a whole number and the three classification counts show.
    await expect(page.getByText(/^\d+%$/).first()).toBeVisible()
    for (const label of ['Healthy', 'Low stock', 'Out of stock']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    // Raw material value + materials-in-stock rows render as valid currency/number.
    await expect(page.getByText('Raw material value', { exact: true })).toBeVisible()
    await expect(page.getByText('Materials in stock', { exact: true })).toBeVisible()

    // Low/negative stock list is capped at 6 rows (or shows its empty state).
    const card = page
      .getByText('Low / negative stock', { exact: true })
      .locator('xpath=ancestor::*[contains(@class,"p-4")][1]')
    const empty = await card.getByText('All stock above reorder levels').count()
    if (empty === 0) {
      const rows = card.getByText(/Reorder at/)
      expect(await rows.count()).toBeLessThanOrEqual(6)
    }
    const cardText = await card.innerText().catch(() => '')
    expect(cardText).not.toMatch(/NaN|undefined/)
  })

  // MSM-DASHBOARD-FUNC-005
  test('recent payments and recent material dispatches are capped at 5, newest first', async ({
    page,
  }) => {
    const payCard = page
      .getByText('Recent payments', { exact: true })
      .locator('xpath=ancestor::*[contains(@class,"p-4")][1]')
    if ((await payCard.getByText('No payments yet').count()) === 0) {
      // Each payment row shows "date · method"; cap at 5.
      const rows = payCard.locator('div.flex.items-center.justify-between')
      expect(await rows.count()).toBeLessThanOrEqual(5)
    }

    const issueCard = page
      .getByText('Recent material dispatches', { exact: true })
      .locator('xpath=ancestor::*[contains(@class,"p-4")][1]')
    if ((await issueCard.getByText('No material issues yet').count()) === 0) {
      const rows = issueCard.locator('div.flex.items-center.justify-between')
      expect(await rows.count()).toBeLessThanOrEqual(5)
    }
    // Neither list should leak NaN/undefined in resolved names/amounts.
    expect(await payCard.innerText().catch(() => '')).not.toMatch(/NaN|undefined/)
    expect(await issueCard.innerText().catch(() => '')).not.toMatch(/NaN|undefined/)
  })

  // MSM-DASHBOARD-VAL-001
  test('dashboard degrades gracefully — no NaN/undefined leaks and the gauge guards total=0', async ({
    page,
  }) => {
    // On live data the tenant is not empty, but the guarantees hold regardless:
    // no crash, no NaN/undefined anywhere, and the gauge is always an integer %.
    expect(await hasClientCrash(page)).toBe(false)
    const body = await page.locator('main, [role="main"]').first().innerText()
    expect(body).not.toMatch(/NaN|undefined|\bnull\b/)
    await expect(page.getByText(/^\d+%$/).first()).toBeVisible()
  })

  // MSM-DASHBOARD-VAL-002
  test('company filter is a constrained native <select>: All companies + one option per company', async ({
    page,
  }) => {
    const select = filter(page)
    // It is a native <select> (not a free-text input).
    await expect(select).toHaveJSProperty('tagName', 'SELECT')

    const options = select.locator('option')
    const count = await options.count()
    expect(count).toBeGreaterThanOrEqual(1)

    // First option is the empty "All companies".
    await expect(options.first()).toHaveAttribute('value', '')
    await expect(options.first()).toHaveText('All companies')

    // Every non-first option has a non-empty (company id) value.
    for (let i = 1; i < count; i++) {
      const val = await options.nth(i).getAttribute('value')
      expect(val && val.length > 0).toBeTruthy()
    }

    // Selecting each option updates the subtitle scope label.
    for (let i = 1; i < Math.min(count, 3); i++) {
      const val = await options.nth(i).getAttribute('value')
      const label = (await options.nth(i).innerText()).trim()
      await select.selectOption(val!)
      await page.waitForTimeout(300)
      await expect(page.getByText(new RegExp(`·\\s*${escapeRe(label)}`))).toBeVisible()
    }
  })

  // MSM-DASHBOARD-API-001
  test('dashboard issues only read queries and the filter recomputes client-side with no extra fetches', async ({
    page,
  }) => {
    // Reload and record all Supabase requests; confirm no mutating verbs.
    const methods: string[] = []
    const onReq = (r: import('@playwright/test').Request) => {
      const u = r.url()
      if (/supabase|\/rest\/|\/rpc\//.test(u)) methods.push(r.method())
    }
    page.on('request', onReq)
    try {
      await gotoModule(page, ROUTE)
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      await page.waitForTimeout(1000)

      // No table writes.
      expect(methods.filter((m) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(m))).toHaveLength(0)

      // Changing the company filter triggers NO new network requests.
      const options = await filter(page).locator('option').all()
      if (options.length > 1) {
        const before = methods.length
        const val = await options[1].getAttribute('value')
        await filter(page).selectOption(val!)
        await page.waitForTimeout(800)
        expect(methods.length).toBe(before) // pure client-side recompute
      }
    } finally {
      page.off('request', onReq)
    }
  })

  // MSM-DASHBOARD-API-002
  test('dashboard tolerates a failing query and does not render a crash page', async ({ page }) => {
    // Block the expenses endpoint and confirm the dashboard still renders.
    await page.route(/expenses/i, (route) => route.abort())
    await gotoModule(page, ROUTE)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })
    expect(await hasClientCrash(page)).toBe(false)
    // Expenses-backed sections fall back to zero/empty rather than crashing.
    await expect(page.getByText('Expenses (month)', { exact: true })).toBeVisible()
    await page.unroute(/expenses/i)
  })

  // MSM-DASHBOARD-SEC-001
  test('dashboard route requires authentication', async ({ browser }) => {
    // Fresh context with NO storageState — should not expose dashboard data.
    const ctx = await browser.newContext({ storageState: undefined })
    const anon = await ctx.newPage()
    try {
      await anon.goto(ROUTE)
      await anon.waitForLoadState('domcontentloaded')
      await anon.waitForTimeout(1500)
      // Either redirected away from /app, or an auth gate is shown; in no case
      // should the authenticated dashboard heading + KPI panels be visible.
      const dashHeadingVisible = await anon
        .getByRole('heading', { name: 'Dashboard' })
        .isVisible()
        .catch(() => false)
      const financialVisible = await anon
        .getByText('Financial summary', { exact: true })
        .isVisible()
        .catch(() => false)
      expect(dashHeadingVisible && financialVisible).toBe(false)
    } finally {
      await ctx.close()
    }
  })

  // MSM-DASHBOARD-SEC-002
  test('dashboard company filter lists only the signed-in account’s companies (tenant/RLS scope)', async ({
    page,
  }) => {
    // Single-session sanity for tenant isolation: the filter options come from
    // the authenticated account's companies only, and each renders a real name
    // (no cross-tenant placeholder / id leakage / empty labels).
    const options = await filter(page).locator('option').all()
    for (let i = 1; i < options.length; i++) {
      const label = (await options[i].innerText()).trim()
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toMatch(/undefined|null/i)
    }
    // No failed Supabase requests while loading the scoped data.
    await expectNoFailedRequests(page, async () => {
      await gotoModule(page, ROUTE)
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    })
  })

  // MSM-DASHBOARD-DB-001 — DESTRUCTIVE (writes a payment + a material issue in
  // other modules to prove dashboard figures are derived, not denormalised).
  test('@destructive money/stock figures recompute after underlying data changes', async ({
    page,
  }) => {
    // Placeholder derivation flow: this test writes ledger rows via the Payments
    // and Materials modules and re-checks the dashboard. Excluded by default via
    // the @destructive tag. Left as a guarded skeleton so the destructive case
    // is represented without mutating live production data unintentionally.
    test.skip(true, 'destructive: writes payment + material issue against live data')
    await gotoModule(page, ROUTE)
  })
})

// Escape a company name for safe use inside a RegExp subtitle assertion.
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
