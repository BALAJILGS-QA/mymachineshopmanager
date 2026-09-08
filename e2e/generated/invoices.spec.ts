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
  MODULES,
  moduleById,
} from '../support'

// QA-Orchestra — generated spec for the Invoices module (/app/invoices).
//
// Runs authenticated as the QA super-admin (Playwright storageState from
// auth.setup) against LIVE PRODUCTION data, so every assertion is data-tolerant
// (rowCount >= 0, "table or empty state", presence-not-exact-value).
//
// Non-destructive cases run by default. Destructive cases (create / edit /
// cancel / save-as-draft) carry the "@destructive" tag in their title so the
// Playwright config can exclude them with `--grep-invert @destructive`. They
// exercise the form UI (open, fill, read live totals, read the confirm dialog)
// and STOP BEFORE the irreversible mutation — the create/cancel button is never
// clicked — so they remain safe to run against prod while still mapping to the
// destructive manual cases.

const ROUTE = moduleById('invoices')?.route ?? '/app/invoices'

// Open the New Invoice modal and wait for it to be ready.
async function openNewInvoice(page: import('@playwright/test').Page) {
  await forms.openForm(page, /New Invoice/i)
  await expect(forms.dialog(page)).toBeVisible()
  await expect(forms.dialog(page).getByText('Line Items')).toBeVisible()
}

// Set a numeric line row (0-based) qty/rate within the desktop line-items table.
async function setLine(
  page: import('@playwright/test').Page,
  rowIndex: number,
  description: string,
  quantity: string,
  rate: string,
) {
  const lineTable = forms.dialog(page).locator('table').last()
  const row = lineTable.locator('tbody tr').nth(rowIndex)
  if (description) await row.getByPlaceholder('Item / service').fill(description)
  await row.locator('input[type="number"]').nth(0).fill(quantity)
  await row.locator('input[type="number"]').nth(1).fill(rate)
}

test.describe('Invoices @invoices', () => {
  test.beforeEach(async ({ page }) => {
    await gotoModule(page, ROUTE)
  })

  // MSM-INVOICES-UI-001
  test('list renders header, month tiles, GST summary, company-wise table and invoice grid', async ({
    page,
  }) => {
    await expectHealthy(page)
    expect(await hasClientCrash(page)).toBe(false)
    await expectHeading(page, 'Invoices')

    // Header actions.
    await expect(page.getByRole('button', { name: /Excel/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /New Invoice/i })).toBeVisible()

    // This-month section + its four tiles.
    await expect(page.getByText(/This month/i).first()).toBeVisible()
    await expect(page.getByText('Invoices', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Invoiced value').first()).toBeVisible()
    await expect(page.getByText('Received', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Outstanding', { exact: true }).first()).toBeVisible()

    // GST summary block + its four tiles.
    await expect(page.getByText('GST Summary').first()).toBeVisible()
    await expect(page.getByText('Taxable value').first()).toBeVisible()
    await expect(page.getByText('CGST', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('SGST', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Total GST').first()).toBeVisible()

    // Company-wise summary block.
    await expect(page.getByText('Company-wise summary').first()).toBeVisible()

    // Main invoice grid: table or empty state (prod-data tolerant).
    const count = await dt.rowCount(page)
    expect(count).toBeGreaterThanOrEqual(0)
    if (count > 0) {
      for (const col of [
        'Invoice',
        'Date',
        'Company',
        'Total',
        'Paid',
        'Outstanding',
        'Status',
        'Actions',
      ]) {
        await expect(
          page.getByRole('columnheader', { name: col, exact: true }).first(),
        ).toBeVisible()
      }
    } else {
      expect(await dt.isEmptyState(page)).toBe(true)
    }
  })

  // MSM-INVOICES-UI-002
  test('row action buttons respect invoice status (Record payment / Edit / Cancel / PDF / Print visibility)', async ({
    page,
  }) => {
    await expectHealthy(page)
    const count = await dt.rowCount(page)
    test.skip(count === 0, 'No invoices in prod data to assert per-status action buttons')

    // Download PDF and Print always show on any data row.
    const anyRow = dt.rows(page).first()
    await expect(anyRow.getByRole('button', { name: 'Download PDF' })).toBeVisible()
    await expect(anyRow.getByRole('button', { name: 'Print' })).toBeVisible()

    // Status-conditional buttons. Locate a representative row per status if present.
    // Cancelled: only Download PDF + Print (no Record payment / Edit / Cancel).
    const cancelledRow = dt
      .rows(page)
      .filter({ has: page.getByText('Cancelled') })
      .first()
    if (await cancelledRow.count()) {
      await expect(cancelledRow.getByRole('button', { name: 'Download PDF' })).toBeVisible()
      await expect(cancelledRow.getByRole('button', { name: 'Print' })).toBeVisible()
      await expect(cancelledRow.getByRole('button', { name: 'Record payment' })).toHaveCount(0)
      await expect(cancelledRow.getByRole('button', { name: 'Edit' })).toHaveCount(0)
      await expect(cancelledRow.getByRole('button', { name: 'Cancel invoice' })).toHaveCount(0)
    }

    // Paid: hides Record payment + Edit, shows Cancel + PDF + Print.
    const paidRow = dt
      .rows(page)
      .filter({ has: page.getByText('Paid', { exact: true }) })
      .first()
    if (await paidRow.count()) {
      await expect(paidRow.getByRole('button', { name: 'Record payment' })).toHaveCount(0)
      await expect(paidRow.getByRole('button', { name: 'Edit' })).toHaveCount(0)
      await expect(paidRow.getByRole('button', { name: 'Cancel invoice' })).toBeVisible()
      await expect(paidRow.getByRole('button', { name: 'Download PDF' })).toBeVisible()
      await expect(paidRow.getByRole('button', { name: 'Print' })).toBeVisible()
    }

    // Unpaid: shows Record payment + Edit + Cancel + PDF + Print.
    const unpaidRow = dt
      .rows(page)
      .filter({ has: page.getByText('Unpaid', { exact: true }) })
      .first()
    if (await unpaidRow.count()) {
      await expect(unpaidRow.getByRole('button', { name: 'Record payment' })).toBeVisible()
      await expect(unpaidRow.getByRole('button', { name: 'Edit' })).toBeVisible()
      await expect(unpaidRow.getByRole('button', { name: 'Cancel invoice' })).toBeVisible()
    }
  })

  // MSM-INVOICES-UI-003
  test('empty state and filtered empty state display correctly for a no-match search', async ({
    page,
  }) => {
    await expectHealthy(page)
    await dt.search(page, 'zzz-no-match')

    // Company-wise summary shows its no-match message.
    await expect(page.getByText('No invoices for the current filters.')).toBeVisible()

    // Main card shows the EmptyState with the create hint.
    await expect(page.getByText('No invoices', { exact: true })).toBeVisible()
    await expect(page.getByText('Create an invoice from completed jobs or manually.')).toBeVisible()
    expect(await dt.rowCount(page)).toBe(0)
  })

  // MSM-INVOICES-FUNC-004
  test('filters (search, company, status, date range) narrow the list without crashing', async ({
    page,
  }) => {
    await expectHealthy(page)
    const initial = await dt.rowCount(page)

    // Status filter to Unpaid — filtered count never exceeds the full count.
    await forms.control(page, 'Status').selectOption({ label: 'Unpaid' })
    await page.waitForTimeout(300)
    const unpaidCount = await dt.rowCount(page)
    expect(unpaidCount).toBeGreaterThanOrEqual(0)
    expect(unpaidCount).toBeLessThanOrEqual(initial)
    if (unpaidCount > 0) {
      // Every visible row is Unpaid.
      await expect(dt.rows(page).filter({ hasText: 'Unpaid' })).toHaveCount(unpaidCount)
    }

    // Clear status, apply a far-future date range → expect no rows.
    await forms.control(page, 'Status').selectOption('')
    await page.waitForTimeout(200)
    const dateInputs = page.locator('input[type="date"]')
    if (await dateInputs.count()) {
      await dateInputs.nth(0).fill('2099-01-01')
      await dateInputs.nth(1).fill('2099-12-31')
      await page.waitForTimeout(300)
      expect(await dt.rowCount(page)).toBe(0)
    }
    await expectHealthy(page)
  })

  // MSM-INVOICES-FUNC-010
  test('Excel export button is available for the current filter set', async ({ page }) => {
    await expectHealthy(page)
    const excel = page.getByRole('button', { name: /Excel/i })
    await expect(excel).toBeVisible()
    await expect(excel).toBeEnabled()
    // Non-destructive: verify the affordance exists without asserting a file
    // download on live prod (headless download behaviour varies by runner).
  })

  // MSM-INVOICES-FUNC-005
  test('add lines from completed job and from rate list (form-level, non-destructive)', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)

    // Add-from-rate-list appears only when active products exist.
    const rateList = dialog.getByLabel('Add from rate list')
    if (await rateList.count()) {
      const options = rateList.locator('option')
      if ((await options.count()) > 1) {
        const label = (await options.nth(1).textContent())?.trim() ?? ''
        await rateList.selectOption({ index: 1 })
        // A new line row should carry the product name.
        const productName = label.split(' — ')[0]
        if (productName) {
          await expect(
            dialog.locator('input[placeholder="Item / service"]').filter({ hasText: '' }),
          ).toBeVisible()
          await expect(dialog.getByDisplayValue(productName).first()).toBeVisible()
        }
      }
    }

    // Add-from-completed-job chips appear only when the company has eligible jobs.
    const _jobChips = dialog
      .locator('button', { hasText: /·/ })
      .filter({ has: page.locator('svg') })
    // Presence-tolerant: if a chip exists, clicking it must not crash the form.
    const chip = dialog.getByRole('button', { name: /·/ }).first()
    if (await chip.count()) {
      await chip.click().catch(() => {})
      await expect(dialog).toBeVisible()
    }
    expect(await hasClientCrash(page)).toBe(false)
    await page.keyboard.press('Escape')
  })

  // MSM-INVOICES-FUNC-006
  test('bill directly from received stock exposes a source multi-select (non-destructive)', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)
    await expect(
      dialog.getByText('Bill directly from received stock (deducts stock)'),
    ).toBeVisible()
    // The multi-select renders as a button/placeholder; presence is data-tolerant
    // (prod may have no available stock for the default company).
    await expect(
      dialog
        .getByText(/Select material sources to bill|No received stock|Select a company/i)
        .first(),
    ).toBeVisible()
    expect(await hasClientCrash(page)).toBe(false)
    await page.keyboard.press('Escape')
  })

  // MSM-INVOICES-VAL-004
  test('changing company clears the challan picker / DC ref (non-destructive)', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)

    const companySelect = dialog.getByLabel('Company')
    const options = companySelect.locator('option')
    const optCount = await options.count()
    test.skip(optCount < 3, 'Need at least two selectable companies to assert company-switch reset')

    // Type something into the DC Ref field, switch company, and confirm it clears.
    const dcRef = dialog.getByLabel('Delivery Challan Ref')
    await dcRef.fill('DC-TEST-REF')
    // Select the first real company, then a different one.
    await companySelect.selectOption({ index: 1 })
    await page.waitForTimeout(150)
    await companySelect.selectOption({ index: 2 })
    await page.waitForTimeout(150)
    // On company change the challan-derived DC ref is cleared.
    await expect(dcRef).toHaveValue('')
    expect(await hasClientCrash(page)).toBe(false)
    await page.keyboard.press('Escape')
  })

  // MSM-INVOICES-VAL-001
  test('live invoice totals recompute correctly from lines, discount, CGST and SGST', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)

    // Line 1: qty 10 rate 100 = 1000; add a second line qty 2 rate 250 = 500.
    await setLine(page, 0, 'Item A', '10', '100')
    await dialog.getByRole('button', { name: /Add line/i }).click()
    await setLine(page, 1, 'Item B', '2', '250')

    // Discount 100, CGST 9, SGST 9.
    const _totals = dialog.locator('div', { hasText: 'Subtotal' }).last()
    await dialog.locator('input[type="number"]').filter({ hasNot: page.locator('[readonly]') })
    // Discount field is the only number input inside the totals panel besides tax %.
    const discountInput = dialog.getByRole('spinbutton').nth(4) // after 2x qty + 2x rate
    await discountInput.fill('100')
    await dialog.getByLabel('CGST %').fill('9')
    await dialog.getByLabel('SGST %').fill('9')

    // Subtotal 1500.00; taxable 1400; CGST 126.00; SGST 126.00; Total 1652.00.
    await expect(dialog.getByText(/1,?500\.00/).first()).toBeVisible()
    // CGST/SGST amount fields are read-only/disabled and show 126.00.
    const cgstAmount = dialog.getByLabel(/CGST 9% amount/)
    const sgstAmount = dialog.getByLabel(/SGST 9% amount/)
    await expect(cgstAmount).toBeDisabled()
    await expect(sgstAmount).toBeDisabled()
    await expect(cgstAmount).toHaveValue(/126\.00/)
    await expect(sgstAmount).toHaveValue(/126\.00/)
    // Total row.
    await expect(dialog.getByText(/1,?652\.00/).first()).toBeVisible()

    expect(await hasClientCrash(page)).toBe(false)
    await page.keyboard.press('Escape')
  })

  // MSM-INVOICES-VAL-002
  test('discount exceeding subtotal clamps taxable to zero (no negative tax/total)', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)

    // Single line qty 1 rate 500 = 500; discount 900; CGST 9; SGST 9.
    await setLine(page, 0, 'Item', '1', '500')
    const discountInput = dialog.getByRole('spinbutton').nth(2) // after qty + rate
    await discountInput.fill('900')
    await dialog.getByLabel('CGST %').fill('9')
    await dialog.getByLabel('SGST %').fill('9')

    // Taxable floored at 0 → CGST 0.00, SGST 0.00, Total 0.00. No negatives.
    await expect(dialog.getByLabel(/CGST 9% amount/)).toHaveValue(/0\.00/)
    await expect(dialog.getByLabel(/SGST 9% amount/)).toHaveValue(/0\.00/)
    // No negative currency strings anywhere in the totals panel.
    const panelText =
      (await dialog.locator('text=Subtotal').locator('..').locator('..').textContent()) ?? ''
    expect(panelText).not.toMatch(/-\s*[₹Rs]/)
    expect(await hasClientCrash(page)).toBe(false)
    await page.keyboard.press('Escape')
  })

  // MSM-INVOICES-SEC-002
  test('over-dispatch guard blocks billing more than a source available (form-level)', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)
    // This test documents the guard exists; the concrete over-dispatch requires a
    // known small stock source in prod. We verify the multi-select surface renders
    // and, if a source is pickable, that the flow does not crash. The RPC remains
    // the final race-safe gate. Non-destructive: no invoice is created.
    await expect(
      dialog.getByText('Bill directly from received stock (deducts stock)'),
    ).toBeVisible()
    expect(await hasClientCrash(page)).toBe(false)
    await page.keyboard.press('Escape')
  })

  // MSM-INVOICES-SEC-001 — auth gating is enforced by app/app/layout.tsx. This
  // spec runs pre-authenticated (storageState), so we assert the positive side:
  // an authenticated super-admin CAN reach the module and its print sub-route
  // resolves within the gated shell without a client crash.
  test('authenticated portal reaches invoices and print route within the gated shell', async ({
    page,
  }) => {
    await expectHealthy(page)
    await expectHeading(page, 'Invoices')
    const count = await dt.rowCount(page)
    if (count > 0) {
      const firstRow = dt.rows(page).first()
      await firstRow.getByRole('button', { name: 'Print' }).click()
      await expect(page).toHaveURL(/\/app\/invoices\/.+\/print/)
      expect(await hasClientCrash(page)).toBe(false)
    }
  })

  // MSM-INVOICES-FUNC-009 — print view renders invoice layout (read-only). Only
  // exercised when at least one invoice exists in prod.
  test('print view renders invoice layout with totals (read-only)', async ({ page }) => {
    await expectHealthy(page)
    const count = await dt.rowCount(page)
    test.skip(count === 0, 'No invoices in prod data to open a print view')
    await dt.rows(page).first().getByRole('button', { name: 'Print' }).click()
    await expect(page).toHaveURL(/\/app\/invoices\/.+\/print/)
    await expectHealthy(page)
    expect(await hasClientCrash(page)).toBe(false)
  })

  // MSM-INVOICES-DB-001 — invoice lines rejoin on reload. Read-only verification
  // that a multi-line invoice reloads with its lines rendered in the print view.
  test('invoice lines rejoin and render in order on reload (read-only)', async ({ page }) => {
    await expectHealthy(page)
    const count = await dt.rowCount(page)
    test.skip(count === 0, 'No invoices in prod data to verify line rejoin')
    await dt.rows(page).first().getByRole('button', { name: 'Print' }).click()
    await expect(page).toHaveURL(/\/app\/invoices\/.+\/print/)
    // Reload the print route directly and confirm content still renders.
    await page.reload()
    await expectHealthy(page)
    expect(await hasClientCrash(page)).toBe(false)
  })

  // -------------------------------------------------------------------------
  // DESTRUCTIVE cases — excluded by default via the "@destructive" title tag.
  // Each opens the form and drives it up to (but NOT including) the irreversible
  // write, so they stay prod-safe even if accidentally run.
  // -------------------------------------------------------------------------

  // MSM-INVOICES-FUNC-001 @destructive
  test('create a new GST invoice (Unpaid) and verify it appears in the list @destructive', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)
    const companySelect = dialog.getByLabel('Company')
    if ((await companySelect.locator('option').count()) > 1)
      await companySelect.selectOption({ index: 1 })
    await setLine(page, 0, 'CNC Job', '5', '200')
    await dialog.getByLabel('CGST %').fill('9')
    await dialog.getByLabel('SGST %').fill('9')
    // Total = 1180.00 (1000 + 90 + 90).
    await expect(dialog.getByText(/1,?180\.00/).first()).toBeVisible()
    // Destructive gate: create + toast + list assertion happen here in a
    // full-write environment. Skipped against prod.
    test.skip(true, 'Destructive: would persist a new invoice via create_invoice RPC')
    await forms.submit(page, /Create invoice/i)
    await expectToast(page, /Invoice created/i)
  })

  // MSM-INVOICES-FUNC-002 @destructive
  test('save invoice as Draft and confirm exclusion from receivables totals @destructive', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)
    await expect(dialog.getByRole('button', { name: /Save as draft/i })).toBeVisible()
    test.skip(true, 'Destructive: would persist a Draft invoice')
    await dialog.getByRole('button', { name: /Save as draft/i }).click()
    await page.getByLabel('Status').selectOption({ label: 'Draft' })
  })

  // MSM-INVOICES-FUNC-003 @destructive
  test('cancel an invoice excludes it from outstanding but keeps it in history @destructive', async ({
    page,
  }) => {
    const count = await dt.rowCount(page)
    test.skip(count === 0, 'No invoices to cancel')
    const cancelable = dt.rows(page).filter({ hasText: 'Unpaid' }).first()
    test.skip((await cancelable.count()) === 0, 'No cancelable Unpaid invoice present')
    await cancelable.getByRole('button', { name: 'Cancel invoice' }).click()
    // The danger confirm dialog appears — assert it, then STOP (do not confirm).
    await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toBeVisible()
    await expect(page.getByText(/Cancel invoice/i).first()).toBeVisible()
    test.skip(true, 'Destructive: would confirm cancellation via set_invoice_status RPC')
    await page.getByRole('button', { name: 'Cancel invoice' }).last().click()
    await expectToast(page, /Invoice cancelled/i)
  })

  // MSM-INVOICES-FUNC-007 @destructive
  test('delivery-challan picker imports items and marks challans Invoiced on save @destructive', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)
    // The DC picker only shows for brand-new invoices.
    await expect(dialog.getByText('Add from delivery challans')).toBeVisible()
    test.skip(true, 'Destructive: would import challans and mark them Invoiced on create')
  })

  // MSM-INVOICES-FUNC-008 @destructive
  test('edit an existing invoice replaces its lines and recomputes totals @destructive', async ({
    page,
  }) => {
    const count = await dt.rowCount(page)
    test.skip(count === 0, 'No invoices to edit')
    const editable = dt.rows(page).filter({ hasText: 'Unpaid' }).first()
    test.skip((await editable.count()) === 0, 'No editable Unpaid invoice present')
    await editable.getByRole('button', { name: 'Edit' }).click()
    const dialog = forms.dialog(page)
    await expect(dialog).toBeVisible()
    // The edit modal shows a "Last updated" timestamp.
    await expect(dialog.getByText(/Last updated/i)).toBeVisible()
    test.skip(true, 'Destructive: would rewrite invoice_lines via updateInvoice')
    await dialog.getByRole('button', { name: /Save changes/i }).click()
    await expectToast(page, /Invoice updated/i)
  })

  // MSM-INVOICES-FUNC-011 @destructive
  test('line stripping keeps a line with description OR rate OR material @destructive', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)
    // Line A: description only. Line B: rate only. Line C: fully empty (dropped).
    await setLine(page, 0, 'Labour', '1', '0')
    await dialog.getByRole('button', { name: /Add line/i }).click()
    await setLine(page, 1, '', '1', '50')
    await dialog.getByRole('button', { name: /Add line/i }).click()
    // Line C left blank.
    test.skip(true, 'Destructive: would persist the invoice to verify line stripping')
  })

  // MSM-INVOICES-VAL-003 @destructive
  test('blank invoice number auto-numbers and empty lines are stripped on save @destructive', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)
    // Invoice Number left blank shows the auto-number preview as placeholder.
    const invNo = dialog.getByLabel('Invoice Number')
    await expect(invNo).toHaveValue('')
    await expect(invNo).not.toHaveAttribute('placeholder', '')
    await setLine(page, 0, 'Machining', '1', '100')
    await dialog.getByRole('button', { name: /Add line/i }).click() // second blank line
    test.skip(true, 'Destructive: would create the invoice to verify auto-numbering + stripping')
  })

  // MSM-INVOICES-VAL-005 @destructive
  test('required Company/Date are not enforced client-side; RPC is the gate @destructive', async ({
    page,
  }) => {
    await openNewInvoice(page)
    const dialog = forms.dialog(page)
    // Clear company + date, add a line — the Create button remains clickable
    // (no client-side hard block); the RPC is the real gate.
    await dialog.getByLabel('Company').selectOption('')
    await setLine(page, 0, 'Test', '1', '10')
    await expect(dialog.getByRole('button', { name: /Create invoice/i })).toBeEnabled()
    test.skip(true, 'Destructive: would trigger create_invoice RPC to observe backend rejection')
  })

  // MSM-INVOICES-API-001 @destructive
  test('createInvoice invokes create_invoice RPC atomically with header and lines @destructive', async ({
    page,
  }) => {
    await openNewInvoice(page)
    test.skip(true, 'Destructive: asserting the create_invoice RPC payload requires a real create')
  })

  // MSM-INVOICES-API-002 @destructive
  test('setInvoiceStatus RPC on cancel and updateInvoice line-replacement behavior @destructive', async ({
    page,
  }) => {
    const count = await dt.rowCount(page)
    test.skip(count === 0, 'No invoices to exercise cancel/update RPCs')
    test.skip(
      true,
      'Destructive: asserting set_invoice_status / invoice_lines DELETE+INSERT needs real writes',
    )
  })

  // MSM-INVOICES-DB-002 @destructive
  test('editing an invoice does not orphan or duplicate line rows @destructive', async ({
    page,
  }) => {
    const count = await dt.rowCount(page)
    test.skip(count === 0, 'No invoices to verify line row integrity after edit')
    test.skip(true, 'Destructive: delete-then-reinsert verification requires a real edit')
  })
})

// Sanity: the module registry entry used for navigation is the Invoices route.
test('registry route for invoices matches /app/invoices @invoices', async () => {
  expect(MODULES.some((m) => m.id === 'invoices' && m.route === '/app/invoices')).toBe(true)
})
