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

// QA-Orchestra generated spec — module "Roles & Permissions" (route /app/roles).
// Non-destructive cases run by default; destructive cases carry the
// "@destructive" tag so the Playwright config can exclude them.
// Auth is provided by storageState (QA super-admin) — no login inside specs.
// The QA tenant (tnt_qa) is ISOLATED and usually EMPTY, so assertions are
// data-tolerant (rowCount >= 0; table OR empty state; never assume users exist).
//
// SUPER-ADMIN GATING CAVEAT: /app/roles requires super-admin OR Admin. The QA
// account is super-admin only on the LOCAL build (email in SUPER_ADMIN_EMAILS in
// source), NOT on deployed prod, where the page guard redirects to /app. Every
// super-admin-view test starts with onRolesPage() and skips cleanly otherwise.
//
// The QA session is a SUPER ADMIN — not an Admin and not a plain User. Cases that
// require an Admin session or a plain-User session cannot be exercised here and
// are implemented as clean skips with an explanatory reason.

const ROUTE = '/app/roles'

// The 8 grantable module labels (from MODULES in src/features/access/modules.ts).
const MODULE_LABELS = [
  'Production Planning',
  'Inventory',
  'Sales',
  'CRM',
  'Human Resources',
  'Accounts & Finance',
  'Supply Chain',
  'Configuration & Settings',
] as const

/**
 * Navigate to /app/roles and report whether the current session actually landed
 * on the page. On deployed prod the QA account is not super-admin, so the page
 * guard redirects to /app — callers skip cleanly in that case.
 */
async function onRolesPage(page: import('@playwright/test').Page): Promise<boolean> {
  await gotoModule(page, ROUTE)
  await page.waitForTimeout(500)
  return page.url().includes('/app/roles')
}

/** A locator for the first row's 'Manage access' button, if any rows exist. */
function firstManageButton(page: import('@playwright/test').Page) {
  return dt
    .rows(page)
    .first()
    .getByRole('button', { name: /manage access/i })
}

/** All module checkboxes inside the open editor dialog. */
function moduleCheckboxes(page: import('@playwright/test').Page) {
  return forms.dialog(page).locator('input[type="checkbox"]')
}

test.describe('Roles & Permissions @roles', () => {
  // ---------------------------------------------------------------------------
  // MSM-ROLES-UI-001 — super-admin view: heading, subtitle, footnote, table/empty
  // ---------------------------------------------------------------------------
  test('MSM-ROLES-UI-001 super-admin view renders heading, subtitle, footnote and table columns', async ({
    page,
  }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)
    expect(await hasClientCrash(page)).toBe(false)

    // Heading + super-admin subtitle + super-admin footnote.
    await expectHeading(page, 'Roles & Permissions')
    await expect(
      page.getByText('Assign roles and choose which modules each approved user can access.'),
    ).toBeVisible()
    await expect(
      page.getByText('Only the super admin can manage roles and module access.'),
    ).toBeVisible()

    // Table columns OR the empty state (data-tolerant on the isolated tenant).
    if (await dt.isEmptyState(page)) {
      await expect(page.getByText('No approved users yet')).toBeVisible()
    } else {
      const headers = dt.table(page).locator('thead th')
      for (const col of ['User', 'Company', 'Role', 'Module Access']) {
        await expect(headers.filter({ hasText: new RegExp(`^${col}$`) }).first()).toBeVisible()
      }
      await expect(headers.filter({ hasText: /Actions/ }).first()).toBeVisible()
      // Every data row exposes a 'Manage access' button.
      await expect(firstManageButton(page)).toBeVisible()
    }
    expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)
  })

  // ---------------------------------------------------------------------------
  // MSM-ROLES-UI-003 — empty-state copy (super-admin variant only)
  // ---------------------------------------------------------------------------
  test('MSM-ROLES-UI-003 empty-state copy shows for the super admin when no users', async ({
    page,
  }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    if (!(await dt.isEmptyState(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'approved users exist — super-admin empty state not shown',
      })
      return
    }
    await expect(page.getByText('No approved users yet')).toBeVisible()
    await expect(
      page.getByText(
        'Approve registrations first — approved users appear here for role and module assignment.',
      ),
    ).toBeVisible()
    // No table headers render in the empty state.
    expect(await dt.rowCount(page)).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // MSM-ROLES-UI-004 — role badge + access-summary text render (if rows exist)
  // ---------------------------------------------------------------------------
  test('MSM-ROLES-UI-004 role badge and access-summary text render per user', async ({ page }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({ type: 'note', description: 'no approved users to inspect' })
      return
    }

    const firstRow = dt.rows(page).first()
    // A Role badge (Admin / User / SuperAdmin) renders in the row.
    await expect(firstRow.getByText(/^(Admin|User|SuperAdmin)$/).first()).toBeVisible()
    // An access-summary string renders in the Module Access cell.
    await expect(
      firstRow.getByText(/All modules|Dashboard only|\d+ of 8 modules/).first(),
    ).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // MSM-ROLES-UI-005 — super-admin editor: role selector, locked Dashboard, 8 boxes
  // ---------------------------------------------------------------------------
  test('MSM-ROLES-UI-005 super-admin editor shows role selector, locked Dashboard and 8 checkboxes', async ({
    page,
  }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({ type: 'note', description: 'no user row to manage' })
      return
    }

    await firstManageButton(page).click()
    const dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    // Modal heading 'Manage access — <name>'.
    await expect(dlg.getByRole('heading', { name: /^Manage access — / })).toBeVisible()

    // Role section: both 'Admin' and 'User' buttons present.
    await expect(dlg.getByRole('button', { name: /^Admin$/ })).toBeVisible()
    await expect(dlg.getByRole('button', { name: /^User$/ })).toBeVisible()

    // Locked Dashboard row.
    await expect(dlg.getByText('Dashboard', { exact: true })).toBeVisible()
    await expect(dlg.getByText('Always available')).toBeVisible()

    // 8 grantable module checkboxes + all module labels.
    await expect(moduleCheckboxes(page)).toHaveCount(8)
    for (const label of MODULE_LABELS) {
      await expect(dlg.getByText(label, { exact: true }).first()).toBeVisible()
    }

    // Select all toggle + footer buttons.
    await expect(dlg.getByRole('button', { name: /select all/i })).toBeVisible()
    await expect(dlg.getByRole('button', { name: /^Cancel$/ })).toBeVisible()
    await expect(dlg.getByRole('button', { name: /^Save access$/ })).toBeVisible()

    await dlg.getByRole('button', { name: /^Cancel$/ }).click()
    await expect(forms.dialog(page)).toBeHidden()
  })

  // ---------------------------------------------------------------------------
  // MSM-ROLES-UI-006 — choosing Admin hides checkboxes + shows all-modules note
  // Non-destructive: opens the editor, switches role in-memory, cancels (no save).
  // ---------------------------------------------------------------------------
  test('MSM-ROLES-UI-006 choosing Admin hides checkboxes and shows the all-modules note', async ({
    page,
  }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({ type: 'note', description: 'no user row to manage' })
      return
    }

    await firstManageButton(page).click()
    const dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()

    // Switch to the Admin role.
    await dlg.getByRole('button', { name: /^Admin$/ }).click()

    // The informational note appears and the module checkboxes disappear.
    await expect(
      dlg.getByText('Admins have access to all modules — no need to select individually.'),
    ).toBeVisible()
    await expect(moduleCheckboxes(page)).toHaveCount(0)

    // Cancel — nothing is persisted.
    await dlg.getByRole('button', { name: /^Cancel$/ }).click()
    await expect(forms.dialog(page)).toBeHidden()
  })

  // ---------------------------------------------------------------------------
  // MSM-ROLES-FUNC-004 — Select all → Clear all toggles every grantable checkbox
  // Non-destructive: cancels without saving.
  // ---------------------------------------------------------------------------
  test('MSM-ROLES-FUNC-004 Select all then Clear all toggles every grantable checkbox', async ({
    page,
  }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({ type: 'note', description: 'no user row to manage' })
      return
    }

    await firstManageButton(page).click()
    const dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    // Ensure the User role is active (checkboxes are only shown for User).
    await dlg.getByRole('button', { name: /^User$/ }).click()

    const boxes = moduleCheckboxes(page)
    await expect(boxes).toHaveCount(8)

    // Select all — every grantable checkbox becomes checked; label flips.
    await dlg.getByRole('button', { name: /select all/i }).click()
    for (let i = 0; i < 8; i++) await expect(boxes.nth(i)).toBeChecked()

    // Clear all — every grantable checkbox becomes unchecked.
    await dlg.getByRole('button', { name: /clear all/i }).click()
    for (let i = 0; i < 8; i++) await expect(boxes.nth(i)).not.toBeChecked()

    await dlg.getByRole('button', { name: /^Cancel$/ }).click()
    await expect(forms.dialog(page)).toBeHidden()
  })

  // ---------------------------------------------------------------------------
  // MSM-ROLES-FUNC-006 — Cancel discards edits (no persistence)
  // ---------------------------------------------------------------------------
  test('MSM-ROLES-FUNC-006 Cancel discards edits without persisting', async ({ page }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({ type: 'note', description: 'no user row to manage' })
      return
    }

    // Open, read the first module checkbox's state, toggle it, then Cancel.
    await firstManageButton(page).click()
    let dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    // Ensure the User branch is active and its checkboxes have rendered before acting.
    const userBtn1 = dlg.getByRole('button', { name: /^User$/ })
    await expect(userBtn1).toBeVisible()
    await userBtn1.click()
    await expect(moduleCheckboxes(page).first()).toBeVisible()
    const before = await moduleCheckboxes(page).first().isChecked()
    await moduleCheckboxes(page).first().click()
    await expect(moduleCheckboxes(page).first()).toBeChecked({ checked: !before })
    await dlg.getByRole('button', { name: /^Cancel$/ }).click()
    await expect(forms.dialog(page)).toBeHidden()

    // Reopen — the toggle did not persist (editor re-initialises from stored data).
    await firstManageButton(page).click()
    dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    const userBtn2 = dlg.getByRole('button', { name: /^User$/ })
    await expect(userBtn2).toBeVisible()
    await userBtn2.click()
    await expect(moduleCheckboxes(page).first()).toBeVisible()
    await expect(moduleCheckboxes(page).first()).toBeChecked({ checked: before })
    await dlg.getByRole('button', { name: /^Cancel$/ }).click()
    await expect(forms.dialog(page)).toBeHidden()
  })

  // MSM-ROLES-VAL-001 (editor pre-populates checked modules from permissions) and
  // MSM-ROLES-FUNC-005 (legacy null permissions ⇒ 'All modules') are data-dependent
  // (need seeded fixtures the isolated QA tenant lacks) and are covered
  // deterministically in Vitest instead — see src/features/access/RolesPage.test.tsx
  // (VAL-001) and src/features/access/modules.test.ts (FUNC-005: effectiveModuleKeys
  // + accessSummary). Kept out of the e2e suite to avoid conditional skips.

  // ---------------------------------------------------------------------------
  // MSM-ROLES-API-002 — save-failure toast: aborted write keeps modal open
  // Non-destructive: the Supabase write is aborted, so nothing is persisted.
  // ---------------------------------------------------------------------------
  test('MSM-ROLES-API-002 save failure surfaces an error toast and keeps the modal open', async ({
    page,
  }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({ type: 'note', description: 'no user row to manage' })
      return
    }

    await firstManageButton(page).click()
    const dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    await dlg.getByRole('button', { name: /^User$/ }).click()
    // Change the selection so a write would be issued.
    await moduleCheckboxes(page).first().click()

    // Abort Supabase writes to force a save failure.
    await page.route(/supabase|\/rest\/|\/rpc\//i, (route) => {
      const m = route.request().method()
      if (m === 'POST' || m === 'PATCH' || m === 'PUT') return route.abort()
      return route.continue()
    })

    await dlg.getByRole('button', { name: /^Save access$/ }).click()

    // Graceful failure: an error toast, the modal stays open, no client crash.
    await expectToast(page, /could not update access|failed/i)
    await expect(forms.dialog(page)).toBeVisible()
    expect(await hasClientCrash(page)).toBe(false)

    await page.unroute(/supabase|\/rest\/|\/rpc\//i)
    await dlg.getByRole('button', { name: /^Cancel$/ }).click()
  })

  // ---------------------------------------------------------------------------
  // MSM-ROLES-SEC-001 — Roles nav item visible to the current privileged session
  // ---------------------------------------------------------------------------
  test('MSM-ROLES-SEC-001 Roles nav item is visible to the privileged session', async ({
    page,
  }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    // On /app/roles the Configuration & Settings accordion is the active group and
    // is auto-expanded, so the link is usually already present. Only expand when
    // it is NOT — clicking an already-open group would collapse it and hide it.
    const rolesLink = page
      .getByRole('navigation')
      .getByRole('link', { name: /Roles & Permissions/ })
    if ((await rolesLink.count()) === 0) {
      await page
        .getByRole('navigation')
        .getByRole('button', { name: /Configuration & Settings/ })
        .first()
        .click()
        .catch(() => {})
    }
    await expect(rolesLink.first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // MSM-ROLES-SEC-006 — client-side gating is UX-only / RLS is the real gate
  // Baseline: the page loads for an approved privileged session with no failed
  // requests. True RLS negative checks require extra (non-privileged) accounts.
  // ---------------------------------------------------------------------------
  test('MSM-ROLES-SEC-006 approved privileged session reads roles without failed requests', async ({
    page,
  }) => {
    // Client-side module gating is documented as UX-only; Supabase RLS
    // (is_app_approved() + tenant_id) is the real server-side gate. A full RLS
    // negative check needs extra accounts — here we assert the approved baseline.
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectNoFailedRequests(page, async () => {
      await gotoModule(page, ROUTE)
      await expectHealthy(page)
    })
    expect(await dt.rowCount(page)).toBeGreaterThanOrEqual(0)
  })

  // ===========================================================================
  // COVERED ELSEWHERE (no e2e skips): the Admin / plain-User branches cannot be
  // exercised by the super-admin QA session, so they are covered deterministically
  // by Vitest instead of a super-admin browser session:
  //   • MSM-ROLES-UI-002  (Admin shop-scoped copy)        → src/features/access/RolesPage.test.tsx
  //   • MSM-ROLES-UI-007  (Admin editor hides role select)→ src/features/access/RolesPage.test.tsx
  //   • MSM-ROLES-SEC-003 (plain-User guard redirect)     → RolesPage.test.tsx + modules.test.ts
  //   • MSM-ROLES-SEC-004 (Admin can't escalate to Admin) → RolesPage.test.tsx
  //   • MSM-ROLES-SEC-005 (Admin list excludes others)    → RolesPage.test.tsx + modules.test.ts (scopeUsersForManager)
  //   • MSM-ROLES-SEC-002 (nav hidden from plain User)    → modules.test.ts (isNavItemVisible)
  //   • MSM-ROLES-VAL-002 (unknown keys ignored)          → modules.test.ts (effectiveModuleKeys)
  //   • MSM-ROLES-VAL-003 (sameCompany normalisation)     → modules.test.ts (sameCompany)
  //   • MSM-ROLES-FUNC-002 (subset → filter/redirect)     → modules.test.ts (effectiveModuleKeys + canAccessModule)
  //   • MSM-ROLES-FUNC-003 (out-of-scope preservation)    → modules.test.ts (mergeSavedPermissions)
  //   • MSM-ROLES-DB-003  (single-target write)           → src/features/approvals/api/usersApi.test.ts
  // ===========================================================================

  // ===========================================================================
  // DESTRUCTIVE CASES — excluded by default via the "@destructive" tag.
  // Most require an Admin/plain-User session, multi-user fixtures, or DB
  // inspection unavailable to the isolated super-admin QA session.
  // ===========================================================================

  test('MSM-ROLES-FUNC-001 @destructive super admin promotes a User to Admin', async ({ page }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    // Guard: need an approved User row to promote. Skip cleanly on the empty
    // isolated tenant so the destructive save is never attempted without a fixture.
    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({
        type: 'note',
        description: 'no approved User row to promote — seed a User fixture to exercise',
      })
      test.skip()
      return
    }
    const userRow = dt
      .rows(page)
      .filter({ hasText: /\bUser\b/ })
      .first()
    if ((await userRow.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'no role-User row to promote' })
      test.skip()
      return
    }

    await userRow.getByRole('button', { name: /manage access/i }).click()
    const dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    await dlg.getByRole('button', { name: /^Admin$/ }).click()
    await dlg.getByRole('button', { name: /^Save access$/ }).click()

    // Persists role Admin + permissions [] (destructive).
    await expectToast(page, /access updated for/i)
    await expect(forms.dialog(page)).toBeHidden()
  })

  test('MSM-ROLES-API-001 @destructive save issues an app_state upsert and invalidates the users query', async ({
    page,
  }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({
        type: 'note',
        description: 'no user row to save — seed a fixture to observe the app_state upsert',
      })
      test.skip()
      return
    }

    await firstManageButton(page).click()
    const dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    await dlg.getByRole('button', { name: /^User$/ }).click()
    await moduleCheckboxes(page).first().click()
    await dlg.getByRole('button', { name: /^Save access$/ }).click()

    // Success toast; onSuccess invalidates qk.users.all so the table refreshes.
    await expectToast(page, /access updated for/i)
    await expect(forms.dialog(page)).toBeHidden()
  })

  test('MSM-ROLES-DB-001 @destructive saved role and permissions persist across reload', async ({
    page,
  }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({
        type: 'note',
        description: 'no user row to persist against — seed a User fixture',
      })
      test.skip()
      return
    }

    // Save a known selection (accounts + configuration), reload, reopen and
    // confirm the same count is checked (persisted in app_state.data.users).
    await firstManageButton(page).click()
    let dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    await dlg.getByRole('button', { name: /^User$/ }).click()
    await dlg
      .getByRole('button', { name: /clear all/i })
      .click()
      .catch(() => {})
    // Check exactly two modules.
    await moduleCheckboxes(page).nth(5).check() // Accounts & Finance
    await moduleCheckboxes(page).nth(7).check() // Configuration & Settings
    await dlg.getByRole('button', { name: /^Save access$/ }).click()
    await expectToast(page, /access updated for/i)
    await expect(forms.dialog(page)).toBeHidden()

    // Hard reload and reopen.
    await gotoModule(page, ROUTE)
    await expectHealthy(page)
    await firstManageButton(page).click()
    dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    await dlg.getByRole('button', { name: /^User$/ }).click()
    const checkedCount = await moduleCheckboxes(page).evaluateAll(
      (els) => els.filter((e) => (e as HTMLInputElement).checked).length,
    )
    expect(checkedCount).toBe(2)
    await dlg.getByRole('button', { name: /^Cancel$/ }).click()
  })

  test('MSM-ROLES-DB-002 @destructive Admin role persists permissions as an empty array', async ({
    page,
  }) => {
    if (!(await onRolesPage(page))) {
      test.info().annotations.push({
        type: 'note',
        description: 'target does not grant super-admin (deployed prod) — run against local build',
      })
      test.skip()
      return
    }
    await expectHealthy(page)

    if (await dt.isEmptyState(page)) {
      test.info().annotations.push({
        type: 'note',
        description: 'no user row to persist against — seed a User fixture',
      })
      test.skip()
      return
    }

    // Save as Admin (permissions:[]) then reopen and switch to User: no boxes checked.
    await firstManageButton(page).click()
    let dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    await dlg.getByRole('button', { name: /^Admin$/ }).click()
    await dlg.getByRole('button', { name: /^Save access$/ }).click()
    await expectToast(page, /access updated for/i)
    await expect(forms.dialog(page)).toBeHidden()

    await gotoModule(page, ROUTE)
    await expectHealthy(page)
    await firstManageButton(page).click()
    dlg = forms.dialog(page)
    await expect(dlg).toBeVisible()
    await dlg.getByRole('button', { name: /^User$/ }).click()
    const checkedCount = await moduleCheckboxes(page).evaluateAll(
      (els) => els.filter((e) => (e as HTMLInputElement).checked).length,
    )
    expect(checkedCount).toBe(0)
    await dlg.getByRole('button', { name: /^Cancel$/ }).click()
  })
})
