import { type Page, type Locator, expect } from '@playwright/test'

// QA-Orchestra — form + dialog actions. The app wraps Radix Dialog as `Modal`
// and uses React-Hook-Form + Zod on migrated forms; fields are addressed by
// their accessible label wherever possible.

/** The open modal dialog, if any. */
export function dialog(page: Page): Locator {
  return page.getByRole('dialog')
}

/** Open a create/add form via its trigger button (name is a substring/RegExp). */
export async function openForm(page: Page, trigger: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: trigger }).first().click()
}

/**
 * Locate a form control by its label, tolerant of legacy pages where the
 * `<label>` is NOT associated (no htmlFor/id) with its control. Tries, in order:
 * accessible label → a control inside the label → the control immediately
 * following the label element. Use this instead of raw page.getByLabel for form
 * controls so specs work across both RHF/Field pages and older raw-label pages.
 */
export function control(page: Page, label: string | RegExp): Locator {
  const associated = page.getByLabel(label).first()
  const text =
    typeof label === 'string'
      ? new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      : label
  const lbl = page.locator('label').filter({ hasText: text }).first()
  const adjacent = lbl.locator(
    'xpath=following::*[self::select or self::input or self::textarea][1]',
  )
  const inside = lbl.locator('select, input, textarea').first()
  // Prefer the accessible match; the .or() chain falls through when it is absent.
  return associated.or(inside).or(adjacent).first()
}

/** Fill a labelled field (input/select/textarea), tolerant of legacy labels. */
export async function fill(page: Page, label: string | RegExp, value: string): Promise<void> {
  const field = control(page, label)
  const tag = await field.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'input')
  if (tag === 'select')
    await field.selectOption({ label: value }).catch(() => field.selectOption(value))
  else await field.fill(value)
}

/** Select an option in a labelled <select>, tolerant of legacy labels. */
export async function select(page: Page, label: string | RegExp, option: string): Promise<void> {
  await control(page, label)
    .selectOption({ label: option })
    .catch(() => control(page, label).selectOption(option))
}

/** Submit the active form/dialog by its button label (default: Save/Create). */
export async function submit(
  page: Page,
  name: string | RegExp = /save|create|add|submit/i,
): Promise<void> {
  const scope = (await dialog(page).count()) ? dialog(page) : page
  await scope.getByRole('button', { name }).first().click()
}

/** Assert an inline validation / error message is shown for a field or form. */
export async function expectValidationError(page: Page, message: string | RegExp): Promise<void> {
  await expect(page.getByText(message).first()).toBeVisible({ timeout: 8_000 })
}
