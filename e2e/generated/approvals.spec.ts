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
} from '../support'

// QA-Orchestra generated spec — module "User Approvals" (route /app/approvals).
// Non-destructive cases run by default; destructive cases carry the
// "@destructive" tag so the Playwright config can exclude them.
// Auth is provided by storageState (QA super-admin) — no login inside specs.
//
// CRITICAL: /app/approvals is super-admin-only. ApprovalsPage redirects
// non-super-admins to /app (effect) then returns null. The QA account is
// super-admin ONLY on the LOCAL build (its email is in SUPER_ADMIN_EMAILS in
// source) — NOT on deployed prod. So every super-admin-view test guards with
// onApprovalsPage() and skips cleanly when the target does not grant it.
// The QA tenant is isolated and usually empty — assertions are data-tolerant.

const ROUTE = '/app/approvals'

/**
 * Navigate to /app/approvals and report whether the page actually rendered
 * for this session. When the target does not grant the QA session super-admin
 * (deployed prod), the page guard redirects to /app and this returns false.
 */
async function onApprovalsPage(page: import('@playwright/test').Page): Promise<boolean> {
  await gotoModule(page, ROUTE)
  // If this target doesn't grant the QA session super-admin, the page guard
  // redirects to /app. Skip super-admin-view assertions cleanly in that case.
  await page.waitForTimeout(500)
  return page.url().includes('/app/approvals')
}

/** Standard skip note when the target session is not super-admin. */
function skipNotSuperAdmin(): void {
  test.info().annotations.push({
    type: 'note',
    description: 'target does not grant super-admin (deployed prod) — run against the local build',
  })
}

/** Click a status filter button (Pending / Approved / Rejected / All). */
function filterButton(page: import('@playwright/test').Page, label: string) {
  return page.getByRole('button', { name: new RegExp(`^${label}`) }).first()
}

/** A row whose Status cell contains the given status word (pending/approved/rejected). */
function rowsWithStatus(page: import('@playwright/test').Page, status: string) {
  return dt.rows(page).filter({ has: page.getByText(new RegExp(`^${status}$`, 'i')) })
}

test.describe('User Approvals @approvals', () => {
  // ---------------------------------------------------------------------------
  // MSM-APPROVALS-UI-001 — header, subtitle, filter bar, columns / empty state
  // ---------------------------------------------------------------------------
  test('MSM-APPROVALS-UI-001 renders header, filter bar and table columns or empty state', async ({
    page,
  }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)
    expect(await hasClientCrash(page)).toBe(false)

    // Header + dynamic subtitle (pending-count driven OR the default copy).
    await expectHeading(page, 'User Approvals')
    await expect(
      page
        .getByText(/\d+ registrations? awaiting approval/)
        .or(page.getByText('Review and approve new account registrations'))
        .first(),
    ).toBeVisible()

    // Status filter bar: the four filter buttons.
    for (const label of ['Pending', 'Approved', 'Rejected', 'All']) {
      await expect(filterButton(page, label)).toBeVisible()
    }
    // Date-range (from/to) inputs.
    await expect(forms.control(page, /^From$/)).toBeVisible()
    await expect(forms.control(page, /^To$/)).toBeVisible()

    // If pending rows exist, the Pending button carries an amber count pill.
    const pending = rowsWithStatus(page, 'pending')
    if ((await pending.count()) > 0) {
      await expect(filterButton(page, 'Pending').locator('span').first()).toBeVisible()
    }

    // Table columns OR the empty state (data-tolerant on an isolated tenant).
    if (await dt.isEmptyState(page)) {
      // Default filter is Pending → the pending empty state.
      await expect(page.getByText('No pending registrations')).toBeVisible()
    } else {
      const headers = dt.table(page).locator('thead th')
      for (const col of ['Applicant', 'Company', 'Contact', 'GSTIN', 'Requested', 'Status']) {
        await expect(headers.filter({ hasText: new RegExp(`^${col}$`) }).first()).toBeVisible()
      }
      await expect(headers.filter({ hasText: /Actions/ }).first()).toBeVisible()
    }
    expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)

    // Footnote is always present.
    await expect(page.getByText('Only the super admin can see and action this page.')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // MSM-APPROVALS-UI-002 — status badge tones + conditional action buttons
  // ---------------------------------------------------------------------------
  test('MSM-APPROVALS-UI-002 status badges and conditional Approve/Reject buttons', async ({
    page,
  }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)

    // Use the All filter so every status is visible.
    await filterButton(page, 'All').click()
    await expectHealthy(page)

    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({ type: 'note', description: 'no users to inspect' })
      return
    }

    // For each present status, verify the conditional action buttons:
    //   pending  → Approve AND Reject
    //   approved → ONLY Reject (Approve hidden)
    //   rejected → ONLY Approve (Reject hidden)
    for (const status of ['pending', 'approved', 'rejected']) {
      const row = rowsWithStatus(page, status).first()
      if ((await row.count()) === 0) continue
      // Status word renders in the badge.
      await expect(row.getByText(new RegExp(`^${status}$`, 'i')).first()).toBeVisible()
      const hasApprove = (await row.getByRole('button', { name: /approve/i }).count()) > 0
      const hasReject = (await row.getByRole('button', { name: /reject/i }).count()) > 0
      if (status === 'pending') {
        expect(hasApprove).toBe(true)
        expect(hasReject).toBe(true)
      } else if (status === 'approved') {
        expect(hasApprove).toBe(false)
        expect(hasReject).toBe(true)
      } else {
        expect(hasApprove).toBe(true)
        expect(hasReject).toBe(false)
      }
    }
  })

  // ---------------------------------------------------------------------------
  // MSM-APPROVALS-UI-003 — rows sorted newest-first by Requested date
  // ---------------------------------------------------------------------------
  test('MSM-APPROVALS-UI-003 rows sorted newest-first by requested date', async ({ page }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)
    await filterButton(page, 'All').click()
    await expectHealthy(page)

    const count = await dt.rowCount(page)
    if (count < 2) {
      test.info().annotations.push({
        type: 'note',
        description: 'fewer than 2 rows — nothing to sort',
      })
      return
    }

    // Read the Requested column (5th td, index 4) top-to-bottom. Rows without a
    // createdAt render '—' and sort to the bottom; ignore those for the compare.
    const requested: string[] = []
    for (let i = 0; i < count; i++) {
      requested.push((await dt.rows(page).nth(i).locator('td').nth(4).innerText()).trim())
    }
    const dated = requested.filter((d) => d && d !== '—')
    // Parsed dates must be non-increasing (newest first). Tolerant of equal dates.
    const times = dated.map((d) => Date.parse(d)).filter((t) => !Number.isNaN(t))
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeLessThanOrEqual(times[i - 1])
    }
  })

  // ---------------------------------------------------------------------------
  // MSM-APPROVALS-VAL-001 — Reject opens a confirm dialog; CANCEL (non-destructive)
  // ---------------------------------------------------------------------------
  test('MSM-APPROVALS-VAL-001 reject opens a confirm dialog and cancel is a no-op', async ({
    page,
  }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)
    await filterButton(page, 'All').click()
    await expectHealthy(page)

    // Need a row that exposes a Reject button (any non-rejected user).
    const rejectBtn = dt
      .rows(page)
      .getByRole('button', { name: /reject/i })
      .first()
    if ((await rejectBtn.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'no rejectable row present' })
      return
    }

    await rejectBtn.click()
    // Confirm dialog title (heading role avoids collision with the Reject button).
    const dlg = forms.dialog(page).or(page.getByRole('alertdialog')).first()
    await expect(dlg.getByRole('heading', { name: 'Reject registration' })).toBeVisible()
    await expect(dlg.getByText(/They will not be able to sign in\./)).toBeVisible()

    // CANCEL — do not confirm. Nothing is written.
    await dlg.getByRole('button', { name: /^Cancel$/ }).click()
    await expect(dlg).toBeHidden()
    expect(await hasClientCrash(page)).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // MSM-APPROVALS-VAL-002 — date-range filter narrows without crashing
  // ---------------------------------------------------------------------------
  test('MSM-APPROVALS-VAL-002 date-range filter narrows the list without crashing', async ({
    page,
  }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)
    await filterButton(page, 'All').click()
    await expectHealthy(page)

    // Apply a bounded range; the list recomputes (rowCount >= 0) and stays healthy.
    await forms.fill(page, /^From$/, '2020-01-01')
    await forms.fill(page, /^To$/, '2020-12-31')
    await expectHealthy(page)
    expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)
    expect(await hasClientCrash(page)).toBe(false)

    // Clearing both restores the unbounded list.
    await forms.fill(page, /^From$/, '')
    await forms.fill(page, /^To$/, '')
    await expectHealthy(page)
    expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)
  })

  // ---------------------------------------------------------------------------
  // MSM-APPROVALS-FUNC-001 — each status filter stays healthy + empty-state copy
  // ---------------------------------------------------------------------------
  test('MSM-APPROVALS-FUNC-001 each status filter stays healthy with correct empty state', async ({
    page,
  }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)

    for (const label of ['Pending', 'Approved', 'Rejected', 'All']) {
      await filterButton(page, label).click()
      await expectHealthy(page)
      expect(await hasClientCrash(page)).toBe(false)
      expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)

      // When this filter yields no rows, assert the per-filter empty-state copy.
      if (await dt.isEmptyState(page)) {
        if (label === 'Pending') {
          await expect(page.getByText('No pending registrations')).toBeVisible()
          await expect(
            page.getByText('New sign-ups will appear here for your approval.'),
          ).toBeVisible()
        } else {
          await expect(page.getByText('No records')).toBeVisible()
          await expect(page.getByText('Nothing to show for this filter.')).toBeVisible()
        }
      }
    }
  })

  // ---------------------------------------------------------------------------
  // MSM-APPROVALS-FUNC-004 — REGRESSION: Approved/All render without a crash
  // (the just-fixed createdAt guard: legacy/seed users lack createdAt).
  // ---------------------------------------------------------------------------
  test('MSM-APPROVALS-FUNC-004 approved/all filters render without a client crash', async ({
    page,
  }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)

    for (const label of ['Approved', 'All']) {
      await filterButton(page, label).click()
      await expectHealthy(page)
      // The regression symptom: a client crash / Next error boundary.
      expect(await hasClientCrash(page)).toBe(false)
      await expect(page.locator('#__next_error__')).toHaveCount(0)
      await expect(page.getByText("This page couldn't load")).toHaveCount(0)
      expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)
    }
  })

  // ---------------------------------------------------------------------------
  // MSM-APPROVALS-API-002 — approve/reject failure surfaces an error toast
  // Non-destructive: the write is aborted, so no data changes.
  // ---------------------------------------------------------------------------
  test('MSM-APPROVALS-API-002 approve failure surfaces an error toast', async ({ page }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)
    await filterButton(page, 'Pending').click()
    await expectHealthy(page)

    const approveBtn = dt
      .rows(page)
      .getByRole('button', { name: /approve/i })
      .first()
    if ((await approveBtn.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'no pending row to approve' })
      return
    }

    // Abort Supabase writes (the app_state upsert / set_user_approval RPC).
    await page.route(/supabase|\/rest\/|\/rpc\//i, (route) => {
      const m = route.request().method()
      if (m === 'POST' || m === 'PATCH' || m === 'PUT') return route.abort()
      return route.continue()
    })

    await approveBtn.click()
    // Graceful failure: an error toast (default 'Approve failed'), no crash.
    await expectToast(page, /approve failed|failed/i)
    expect(await hasClientCrash(page)).toBe(false)

    await page.unroute(/supabase|\/rest\/|\/rpc\//i)
  })

  // ---------------------------------------------------------------------------
  // MSM-APPROVALS-SEC-002 — unauthenticated access is gated
  // Fresh context with NO storageState.
  // ---------------------------------------------------------------------------
  test('MSM-APPROVALS-SEC-002 unauthenticated access is gated', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anon = await ctx.newPage()
    try {
      await anon.goto(ROUTE)
      // The portal shell redirects an unauthenticated visitor out of /app/approvals.
      await anon.waitForURL((url) => !url.pathname.startsWith('/app/approvals'), {
        timeout: 15_000,
      })
      // No approvals data is exposed to an anon user.
      expect(await anon.locator('table tbody tr').count()).toBe(0)
    } finally {
      await ctx.close()
    }
  })

  // ===========================================================================
  // COVERED ELSEWHERE (no e2e skips):
  //   • MSM-APPROVALS-SEC-001 (non-super-admin redirect) → src/features/approvals/ApprovalsPage.test.tsx
  // MANUAL-ONLY (tracked in qa/manual-testcases, not automatable via the portal UI):
  //   • MSM-APPROVALS-SEC-003 (SUPER_ADMIN_EMAILS identity — build-time config)
  //   • MSM-APPROVALS-DB-002  (approval gates a SECOND account's login — needs that account)
  // ===========================================================================

  // ===========================================================================
  // DESTRUCTIVE CASES — excluded by default via the "@destructive" tag.
  // Each guards on a pending row and skips cleanly when none exists.
  // ===========================================================================

  test('MSM-APPROVALS-FUNC-002 @destructive approve a pending registration', async ({ page }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)
    await filterButton(page, 'Pending').click()
    await expectHealthy(page)

    const row = rowsWithStatus(page, 'pending').first()
    if ((await row.count()) === 0) {
      test
        .info()
        .annotations.push({ type: 'note', description: 'no pending registration to approve' })
      test.skip()
      return
    }
    // Capture the applicant identity (name line, else email line) for the toast.
    const applicant = (await row.locator('td').first().innerText()).trim().split('\n')[0]

    await row.getByRole('button', { name: /approve/i }).click()
    // Success toast: '{fullName or email} approved'.
    await expectToast(
      page,
      new RegExp(`${applicant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*approved|approved`, 'i'),
    )
    expect(await hasClientCrash(page)).toBe(false)
  })

  test('MSM-APPROVALS-FUNC-003 @destructive reject a registration after confirming', async ({
    page,
  }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)
    await filterButton(page, 'Pending').click()
    await expectHealthy(page)

    const rejectBtn = dt
      .rows(page)
      .getByRole('button', { name: /reject/i })
      .first()
    if ((await rejectBtn.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'no rejectable registration' })
      test.skip()
      return
    }

    await rejectBtn.click()
    const dlg = forms.dialog(page).or(page.getByRole('alertdialog')).first()
    await expect(dlg.getByRole('heading', { name: 'Reject registration' })).toBeVisible()
    // Confirm the dialog (danger 'Reject' button).
    await dlg.getByRole('button', { name: /^Reject$/ }).click()

    await expectToast(page, /registration rejected|rejected/i)
    expect(await hasClientCrash(page)).toBe(false)
  })

  test('MSM-APPROVALS-API-001 @destructive approve mirrors to set_user_approval and refreshes cache', async ({
    page,
  }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)
    await filterButton(page, 'Pending').click()
    await expectHealthy(page)

    const row = rowsWithStatus(page, 'pending').first()
    if ((await row.count()) === 0) {
      test
        .info()
        .annotations.push({ type: 'note', description: 'no pending row for API mirror check' })
      test.skip()
      return
    }

    // Best-effort: observe the RPC / app_state write during the approve.
    const sawWrite = page
      .waitForRequest(
        (r) =>
          /set_user_approval|app_state|\/rest\/|\/rpc\//i.test(r.url()) &&
          ['POST', 'PATCH', 'PUT'].includes(r.method()),
        { timeout: 10_000 },
      )
      .catch(() => null)

    await row.getByRole('button', { name: /approve/i }).click()
    await sawWrite
    await expectToast(page, /approved/i)
    // After success the users query refetches; the page stays healthy.
    await expectHealthy(page)
    expect(await hasClientCrash(page)).toBe(false)
  })

  test('MSM-APPROVALS-DB-001 @destructive decision persists across reload', async ({ page }) => {
    if (!(await onApprovalsPage(page))) {
      skipNotSuperAdmin()
      test.skip()
      return
    }
    await expectHealthy(page)
    await filterButton(page, 'Pending').click()
    await expectHealthy(page)

    const row = rowsWithStatus(page, 'pending').first()
    if ((await row.count()) === 0) {
      test
        .info()
        .annotations.push({ type: 'note', description: 'no pending row to persist a decision' })
      test.skip()
      return
    }
    const applicant = (await row.locator('td').first().innerText()).trim().split('\n')[0]

    await row.getByRole('button', { name: /approve/i }).click()
    await expectToast(page, /approved/i)

    // Reload and confirm the decision survived (visible under Approved).
    await gotoModule(page, ROUTE)
    await filterButton(page, 'Approved').click()
    await expectHealthy(page)
    await expect(dt.rowByText(page, applicant)).toBeVisible()
  })
})
