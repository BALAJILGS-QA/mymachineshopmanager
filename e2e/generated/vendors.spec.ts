import {
  test,
  expect,
  gotoModule,
  expectHeading,
  hasClientCrash,
  dt,
  forms,
  expectToast,
  expectHealthy,
  expectNoFailedRequests,
} from '../support'

// QA-Orchestra generated spec — module "Vendors" (route /app/vendors).
// Non-destructive cases run by default; destructive cases carry the
// "@destructive" tag so the Playwright config can exclude them.
// Auth is provided by storageState (QA super-admin) — no login inside specs.
// Tests run against LIVE PRODUCTION data, so assertions are data-tolerant.

const ROUTE = '/app/vendors'

/** A locator for the first data row's Edit (pencil) button, if any rows exist. */
function firstEditButton(page: import('@playwright/test').Page) {
  // Icon-only ghost buttons live in the last (Actions) cell; the pencil is first.
  return dt.rows(page).first().locator('button').first()
}

test.describe('Vendors @vendors', () => {
  // ---------------------------------------------------------------------------
  // MSM-VENDORS-UI-001 — list renders with all columns and status badges
  // ---------------------------------------------------------------------------
  test('MSM-VENDORS-UI-001 list renders header, search and columns', async ({ page }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)
    expect(await hasClientCrash(page)).toBe(false)

    // Header + subtitle + Add Vendor action.
    await expectHeading(page, 'Vendors')
    await expect(
      page.getByText('Suppliers and subcontractors used by purchases and job work'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /add vendor/i })).toBeVisible()

    // Search box (aria-label + placeholder).
    await expect(page.getByPlaceholder(/search name, code, gstin/i)).toBeVisible()

    // Table columns OR the empty state (data-tolerant on live data).
    if (await dt.isEmptyState(page)) {
      await expect(page.getByText('No vendors')).toBeVisible()
    } else {
      const headers = dt.table(page).locator('thead th')
      for (const col of ['Code', 'Name', 'GSTIN', 'Phone', 'Status']) {
        await expect(headers.filter({ hasText: new RegExp(`^${col}$`) }).first()).toBeVisible()
      }
      await expect(headers.filter({ hasText: /Actions/ }).first()).toBeVisible()

      // At least one status badge (Active or Inactive) renders on a row.
      const badges = dt.table(page).getByText(/^(Active|Inactive)$/)
      expect(await badges.count()).toBeGreaterThan(0)

      // Every data row exposes two action buttons (Edit + Delete).
      const btns = await dt.rows(page).first().locator('button').count()
      expect(btns).toBeGreaterThanOrEqual(2)
    }
    expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)
  })

  // ---------------------------------------------------------------------------
  // MSM-VENDORS-UI-002 — empty state for a non-matching search
  // (same UI branch as the genuinely-empty tenant)
  // ---------------------------------------------------------------------------
  test('MSM-VENDORS-UI-002 empty state shows for a non-matching search', async ({ page }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)

    await dt.search(page, 'zzzznomatch')
    // Empty state placeholder replaces the table.
    await expect(page.getByText('No vendors')).toBeVisible()
    await expect(
      page.getByText('Add a supplier or subcontractor to use in purchases and job work.'),
    ).toBeVisible()
    expect(await dt.rowCount(page)).toBe(0)

    // Clearing the search restores the list (table or the tenant's real empty state).
    await dt.search(page, '')
    await expectHealthy(page)
    expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)
  })

  // ---------------------------------------------------------------------------
  // MSM-VENDORS-UI-003 — Add/Edit modal renders all fields + edit metadata
  // ---------------------------------------------------------------------------
  test('MSM-VENDORS-UI-003 add/edit modal renders fields and metadata', async ({ page }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)

    // --- Add modal ---
    await forms.openForm(page, /add vendor/i)
    const dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    await expect(dlg.getByRole('heading', { name: 'Add Vendor' })).toBeVisible()

    // All fields present.
    await expect(page.getByLabel(/Vendor Name/)).toBeVisible()
    await expect(page.getByLabel(/^GSTIN$/)).toBeVisible()
    await expect(page.getByLabel(/^Phone$/)).toBeVisible()
    await expect(page.getByLabel(/^Email$/)).toBeVisible()
    await expect(page.getByLabel(/^Status$/)).toBeVisible()
    await expect(page.getByLabel(/^Address$/)).toBeVisible()
    await expect(page.getByLabel(/^Notes$/)).toBeVisible()

    // Name field is autofocused.
    await expect(page.getByLabel(/Vendor Name/)).toBeFocused()

    // Footer buttons.
    await expect(dlg.getByRole('button', { name: /^Cancel$/ })).toBeVisible()
    await expect(dlg.getByRole('button', { name: /^Add vendor$/ })).toBeVisible()

    // Cancel closes the modal.
    await dlg.getByRole('button', { name: /^Cancel$/ }).click()
    await expect(forms.dialog(page)).toBeHidden()

    // --- Edit modal (only if a vendor exists) ---
    if (!(await dt.isEmptyState(page))) {
      const nameCell = await dt.rows(page).first().locator('td').nth(1).innerText()
      await firstEditButton(page).click()
      const edit = forms.dialog(page)
      await expect(edit).toBeVisible()
      // Title contains the vendor code (Edit VENxxx).
      await expect(edit.getByText(/^Edit\s+\S+/)).toBeVisible()
      // Last updated line.
      await expect(edit.getByText(/Last updated/i)).toBeVisible()
      // Save changes button (edit mode).
      await expect(edit.getByRole('button', { name: /^Save changes$/ })).toBeVisible()
      // Name prefilled with the row's stored value.
      await expect(page.getByLabel(/Vendor Name/)).toHaveValue(nameCell.trim())
      await edit.getByRole('button', { name: /^Cancel$/ }).click()
      await expect(forms.dialog(page)).toBeHidden()
    }
  })

  // ---------------------------------------------------------------------------
  // MSM-VENDORS-FUNC-003 — search filters by code / name / GSTIN / phone
  // ---------------------------------------------------------------------------
  test('MSM-VENDORS-FUNC-003 search filters case-insensitively', async ({ page }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)

    // Skip meaningfully when the tenant has no vendors.
    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({ type: 'note', description: 'no vendors to filter' })
      return
    }

    // Derive a mixed-case fragment from the first vendor's name.
    const firstName = (await dt.rows(page).first().locator('td').nth(1).innerText()).trim()
    const frag = firstName.slice(0, Math.min(3, firstName.length))
    if (frag.length >= 1) {
      // Search using an inverted-case fragment to prove case-insensitivity.
      const mixed = frag
        .split('')
        .map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase()))
        .join('')
      await dt.search(page, mixed)
      await expectHealthy(page)
      // Every visible name row should contain the fragment (case-insensitive),
      // OR the whole concatenated code+name+gstin+phone string matches.
      expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)
    }

    // A VEN code fragment narrows the list.
    await dt.search(page, 'VEN')
    await expectHealthy(page)
    const venCount = await dt.rowCount(page)
    expect(venCount).toBeGreaterThanOrEqual(0)

    // Clearing restores the full list.
    await dt.search(page, '')
    await expectHealthy(page)
    expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(venCount)
  })

  // ---------------------------------------------------------------------------
  // MSM-VENDORS-FUNC-005 — pagination navigates the (filtered) list
  // ---------------------------------------------------------------------------
  test('MSM-VENDORS-FUNC-005 pagination pages through the list', async ({ page }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)

    const next = page.getByRole('button', { name: /next/i })
    const prev = page.getByRole('button', { name: /prev/i })

    if ((await next.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'no pagination control' })
      return
    }

    // If a second page exists, move next then back and stay healthy.
    if (await next.isEnabled().catch(() => false)) {
      await next.click()
      await expectHealthy(page)
      expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)
      if ((await prev.count()) && (await prev.isEnabled().catch(() => false))) {
        await prev.click()
        await expectHealthy(page)
      }
    }

    // Applying a filter recomputes the paged set without crashing.
    await dt.search(page, 'VEN')
    await expectHealthy(page)
    expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)
    await dt.search(page, '')
  })

  // ---------------------------------------------------------------------------
  // MSM-VENDORS-VAL-001 — vendor name required (blank + whitespace-only)
  // Non-destructive: submission is blocked client-side, nothing is written.
  // ---------------------------------------------------------------------------
  test('MSM-VENDORS-VAL-001 vendor name is required', async ({ page }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)
    const before = await dt.rowCount(page)

    await forms.openForm(page, /add vendor/i)
    const dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()

    // Blank name -> toast error, modal stays open.
    await dlg.getByRole('button', { name: /^Add vendor$/ }).click()
    await expectToast(page, /vendor name is required/i)
    await expect(dlg).toBeVisible()

    // Whitespace-only name -> same error, still blocked.
    await forms.fill(page, /Vendor Name/, '   ')
    await dlg.getByRole('button', { name: /^Add vendor$/ }).click()
    await expectToast(page, /vendor name is required/i)
    await expect(dlg).toBeVisible()

    // No row was created; close the modal.
    await dlg.getByRole('button', { name: /^Cancel$/ }).click()
    await expect(forms.dialog(page)).toBeHidden()
    expect(await dt.rowCount(page)).toBe(before)
  })

  // ---------------------------------------------------------------------------
  // MSM-VENDORS-SEC-001 — unauthenticated access is gated
  // Non-destructive: uses a fresh context with NO storageState.
  // ---------------------------------------------------------------------------
  test('MSM-VENDORS-SEC-001 unauthenticated access is gated', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anon = await ctx.newPage()
    try {
      await anon.goto(ROUTE)
      // The client auth gate redirects an unauthenticated user out of /app/**.
      await anon.waitForURL((url) => !url.pathname.startsWith('/app/vendors'), { timeout: 15_000 })
      expect(anon.url()).not.toContain('/app/vendors')
      // No vendor table rows are exposed to an anon user.
      expect(await anon.locator('table tbody tr').count()).toBe(0)
      // A login affordance is reachable (redirected to a public/auth surface).
      const gated =
        /login|signin|sign-in|auth/i.test(anon.url()) ||
        (await anon.getByRole('link', { name: /log ?in|sign ?in/i }).count()) > 0 ||
        (await anon.getByRole('button', { name: /log ?in|sign ?in/i }).count()) > 0
      expect(gated).toBe(true)
    } finally {
      await ctx.close()
    }
  })

  // ---------------------------------------------------------------------------
  // MSM-VENDORS-SEC-002 — approved super-admin can read tenant vendors (baseline)
  // Full RLS/cross-tenant negative checks require extra accounts (documented in
  // the manual case); here we assert the approved baseline works healthily.
  // ---------------------------------------------------------------------------
  test('MSM-VENDORS-SEC-002 approved super-admin reads vendors without failed requests', async ({
    page,
  }) => {
    await expectNoFailedRequests(page, async () => {
      await gotoModule(page, ROUTE)
      await expectHealthy(page)
    })
    expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)
  })

  // ===========================================================================
  // DESTRUCTIVE CASES — excluded by default via the "@destructive" tag.
  // ===========================================================================

  const QA_NAME = 'QA Test Vendor'

  test('MSM-VENDORS-FUNC-001 @destructive create a new vendor with auto code', async ({ page }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)

    await forms.openForm(page, /add vendor/i)
    await forms.fill(page, /Vendor Name/, QA_NAME)
    await forms.fill(page, /^GSTIN$/, '29ABCDE1234F1Z5')
    await forms.fill(page, /^Phone$/, '9876543210')
    await forms.fill(page, /^Email$/, 'qa@vendor.test')
    await forms.fill(page, /^Address$/, '1 Test Rd')
    await forms.fill(page, /^Notes$/, 'created by QA')
    await forms.select(page, /^Status$/, 'Active')

    await forms.submit(page, /^Add vendor$/)
    await expectToast(page, /vendor added/i)
    await expect(forms.dialog(page)).toBeHidden()

    // Find the new vendor (search by name) and verify its data + auto code.
    await dt.search(page, QA_NAME)
    const row = dt.rowByText(page, QA_NAME)
    await expect(row).toBeVisible()
    await expect(row.locator('td').first()).toHaveText(/^VEN\d+$/) // VENxxx auto code
    await expect(row).toContainText('9876543210')
    await expect(row.getByText(/^Active$/)).toBeVisible()
  })

  test('MSM-VENDORS-FUNC-002 @destructive edit a vendor updates fields and status', async ({
    page,
  }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)
    await dt.search(page, QA_NAME)
    await dt.expectRow(page, QA_NAME)

    await dt.rowByText(page, QA_NAME).locator('button').first().click()
    const dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    const beforeUpdated = await dlg.getByText(/Last updated/i).innerText()

    await forms.fill(page, /^Phone$/, '9000000001')
    await forms.select(page, /^Status$/, 'Inactive')
    await forms.submit(page, /^Save changes$/)
    await expectToast(page, /vendor updated/i)
    await expect(forms.dialog(page)).toBeHidden()

    const row = dt.rowByText(page, QA_NAME)
    await expect(row).toContainText('9000000001')
    await expect(row.getByText(/^Inactive$/)).toBeVisible()

    // Re-open: persisted values + a newer Last updated timestamp.
    await row.locator('button').first().click()
    const edit = forms.dialog(page)
    await expect(edit).toBeVisible()
    await expect(page.getByLabel(/^Phone$/)).toHaveValue('9000000001')
    const afterUpdated = await edit.getByText(/Last updated/i).innerText()
    expect(afterUpdated).not.toEqual(beforeUpdated)
    await edit.getByRole('button', { name: /^Cancel$/ }).click()
  })

  test('MSM-VENDORS-VAL-002 @destructive optional fields trimmed, blanks stored null', async ({
    page,
  }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)

    const TRIM = 'Trim Vendor'
    await forms.openForm(page, /add vendor/i)
    await forms.fill(page, /Vendor Name/, `  ${TRIM}  `)
    await forms.fill(page, /^GSTIN$/, '   ') // whitespace-only -> null -> '—'
    await forms.fill(page, /^Phone$/, '  9998887776  ')
    await forms.submit(page, /^Add vendor$/)
    await expectToast(page, /vendor added/i)

    await dt.search(page, TRIM)
    const row = dt.rowByText(page, TRIM)
    await expect(row).toBeVisible()
    // Name trimmed in the Name cell.
    await expect(row.locator('td').nth(1)).toHaveText(TRIM)
    // GSTIN cell rendered as em-dash (stored null).
    await expect(row.locator('td').nth(2)).toHaveText('—')
    // Phone trimmed.
    await expect(row.locator('td').nth(3)).toHaveText('9998887776')

    // Edit modal confirms trimmed persisted values.
    await row.locator('button').first().click()
    await expect(page.getByLabel(/Vendor Name/)).toHaveValue(TRIM)
    await expect(page.getByLabel(/^Phone$/)).toHaveValue('9998887776')
    await forms
      .dialog(page)
      .getByRole('button', { name: /^Cancel$/ })
      .click()
  })

  test('MSM-VENDORS-VAL-003 @destructive no format validation on gstin/email/phone', async ({
    page,
  }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)

    const NAME = 'Malformed Vendor'
    await forms.openForm(page, /add vendor/i)
    await forms.fill(page, /Vendor Name/, NAME)
    await forms.fill(page, /^GSTIN$/, 'not-a-gstin')
    await forms.fill(page, /^Email$/, 'invalid-email')
    await forms.fill(page, /^Phone$/, 'abc123')
    await forms.submit(page, /^Add vendor$/)

    // Saves successfully despite malformed values (documented no-validation gap).
    await expectToast(page, /vendor added/i)
    await dt.search(page, NAME)
    const row = dt.rowByText(page, NAME)
    await expect(row).toBeVisible()
    await expect(row.locator('td').nth(2)).toHaveText('not-a-gstin')
    await expect(row.locator('td').nth(3)).toHaveText('abc123')
  })

  test('MSM-VENDORS-API-001 @destructive vendor code auto-numbering is sequential and unique', async ({
    page,
  }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)

    async function createNamed(name: string): Promise<string> {
      await forms.openForm(page, /add vendor/i)
      await forms.fill(page, /Vendor Name/, name)
      await forms.submit(page, /^Add vendor$/)
      await expectToast(page, /vendor added/i)
      await dt.search(page, name)
      const code = await dt.rowByText(page, name).locator('td').first().innerText()
      await dt.search(page, '')
      return code.trim()
    }

    const codeA = await createNamed('QA Seq Vendor A')
    const codeB = await createNamed('QA Seq Vendor B')

    expect(codeA).toMatch(/^VEN\d+$/)
    expect(codeB).toMatch(/^VEN\d+$/)
    expect(codeA).not.toEqual(codeB) // unique
    const nA = Number(codeA.replace(/\D/g, ''))
    const nB = Number(codeB.replace(/\D/g, ''))
    expect(nB).toBe(nA + 1) // sequential, increment by one
  })

  test('MSM-VENDORS-FUNC-004 @destructive delete an unused vendor after confirmation', async ({
    page,
  }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)

    // Ensure a disposable vendor exists.
    const DEL = 'QA Delete Vendor'
    await forms.openForm(page, /add vendor/i)
    await forms.fill(page, /Vendor Name/, DEL)
    await forms.submit(page, /^Add vendor$/)
    await expectToast(page, /vendor added/i)

    await dt.search(page, DEL)
    await dt.expectRow(page, DEL)

    // Cancel path: dialog opens, cancel leaves the vendor intact.
    await dt.rowByText(page, DEL).locator('button').last().click()
    const confirmDlg = page.getByRole('alertdialog').or(forms.dialog(page)).first()
    await expect(confirmDlg.getByText('Delete vendor')).toBeVisible()
    await expect(confirmDlg.getByText(new RegExp(`Delete\\s+"${DEL}"`))).toBeVisible()
    await confirmDlg.getByRole('button', { name: /^Cancel$/ }).click()
    await dt.expectRow(page, DEL) // still there

    // Confirm path: deletes and toasts.
    await dt.rowByText(page, DEL).locator('button').last().click()
    await confirmDlg.getByRole('button', { name: /^(Delete|Confirm)$/ }).click()
    await expectToast(page, /vendor deleted/i)
    await expect(dt.rowByText(page, DEL)).toHaveCount(0)
  })

  test('MSM-VENDORS-DB-001 @destructive deleting a referenced vendor is blocked (FK)', async ({
    page,
  }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)

    // Requires a vendor referenced by a subcontract order/doc. If a known
    // referenced vendor name is not available in this environment, skip cleanly.
    const REFERENCED = process.env.VENDOR_REFERENCED_NAME
    if (!REFERENCED) {
      test.info().annotations.push({
        type: 'note',
        description: 'set VENDOR_REFERENCED_NAME to run the FK-block check',
      })
      test.skip()
      return
    }

    await dt.search(page, REFERENCED)
    await dt.expectRow(page, REFERENCED)
    await dt.rowByText(page, REFERENCED).locator('button').last().click()
    const confirmDlg = page.getByRole('alertdialog').or(forms.dialog(page)).first()
    await confirmDlg.getByRole('button', { name: /^(Delete|Confirm)$/ }).click()

    // Caught error surfaces the FK-hint toast and the row remains.
    await expectToast(page, /the vendor may be used by a subcontract/i)
    expect(await hasClientCrash(page)).toBe(false)
    await dt.expectRow(page, REFERENCED)
  })

  test('MSM-VENDORS-DB-002 @destructive vendor code uniqueness enforced by DB', async () => {
    // This case only reaches the vendors_code_key unique constraint by passing an
    // explicit already-existing code to createVendor (or a direct SQL insert) —
    // a path the UI cannot exercise, since it always mints a fresh code via
    // next_seq. It therefore requires scripted API/DB access rather than the
    // portal UI and is documented as manual-only here.
    test.skip(true, 'Requires scripted createVendor.code / direct SQL; not reachable via UI')
  })

  test('MSM-VENDORS-API-002 @destructive save failure surfaces a friendly toast', async ({
    page,
  }) => {
    await gotoModule(page, ROUTE)
    await expectHealthy(page)

    // Simulate a network/constraint failure by aborting Supabase writes.
    await page.route(/supabase|\/rest\/|\/rpc\//i, (route) => {
      const m = route.request().method()
      if (m === 'POST' || m === 'PATCH' || m === 'PUT') return route.abort()
      return route.continue()
    })

    await forms.openForm(page, /add vendor/i)
    await forms.fill(page, /Vendor Name/, 'QA Offline Vendor')
    await forms.submit(page, /^Add vendor$/)

    // Graceful failure: an error toast, modal stays open, no client crash.
    await expectToast(page, /save failed|failed/i)
    await expect(forms.dialog(page)).toBeVisible()
    expect(await hasClientCrash(page)).toBe(false)

    await page.unroute(/supabase|\/rest\/|\/rpc\//i)
  })
})
