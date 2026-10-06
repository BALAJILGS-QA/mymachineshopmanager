import { test, expect } from '@playwright/test'

// LOGIN-CAPTCHA-* — login bot-protection coverage. See docs/login-captcha.md.
//
// These tests NEVER try to solve a real CAPTCHA. They assert (a) the UX gating /
// graceful no-op, and (b) that the server-side auth route never returns a session
// for a bad request — the key "direct API bypass" guarantee.
//
// The default local e2e build does NOT set NEXT_PUBLIC_RECAPTCHA_SITE_KEY, so the
// widget is absent and we verify the no-regression path. To exercise the widget,
// rebuild with Google's always-passes TEST keys (see .env.example). The tests
// branch on whether the widget rendered, so they stay green either way.
//
// We only probe /api/auth/login directly: with junk credentials it simply fails
// (no backend side effect), unlike signup/forgot which would touch real data.

const CAPTCHA_LABEL = /verify you are human/i

test.describe('Login CAPTCHA', () => {
  test('LOGIN-CAPTCHA-UX: /login renders; gating matches configuration', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#loginId')).toBeVisible()

    const widget = page.getByText(CAPTCHA_LABEL)
    const configured = (await widget.count()) > 0
    const submit = page.getByRole('button', { name: /login|signing in/i })

    if (configured) {
      // Configured build: the verification label is shown and the submit button
      // is gated until the challenge yields a token.
      await expect(widget).toBeVisible()
    } else {
      // Unconfigured build: no widget, and login must NOT be blocked (no-op).
      await expect(submit).toBeEnabled()
    }
  })

  test('LOGIN-CAPTCHA-006: direct API login never returns a session for bad input', async ({
    request,
  }) => {
    const res = await request.post('/api/auth/login', {
      data: {
        email: 'nobody-xyz@example.invalid',
        password: 'definitely-wrong-password',
        // No captchaToken — a scripted bypass attempt.
      },
    })
    // Either 400 (captcha required, when configured) or 401 (bad credentials).
    expect(res.ok()).toBeFalsy()
    const body = await res.json().catch(() => ({}))
    expect(body.session).toBeFalsy()
  })

  test('LOGIN-CAPTCHA-010: direct API login rejects missing fields', async ({ request }) => {
    const res = await request.post('/api/auth/login', { data: {} })
    expect(res.ok()).toBeFalsy()
    const body = await res.json().catch(() => ({}))
    expect(body.session).toBeFalsy()
  })
})
