# Login bot protection — Google reCAPTCHA v2

Production bot/credential-stuffing/brute-force protection for the MSM
authentication surfaces (login, sign-up, password-reset), built on **Google
reCAPTCHA v2** ("I'm not a robot" checkbox + image-grid puzzles) with
**server-side verification**.

---

## 1. Provider selected & why

**Google reCAPTCHA v2 (Checkbox).** Chosen per product requirement for the exact
"I'm not a robot" checkbox that escalates to the familiar image puzzles ("select
all images with a bus/traffic light") on suspicious traffic.

Trade-off accepted: Supabase Auth can natively verify only hCaptcha / Cloudflare
Turnstile, **not** reCAPTCHA. So reCAPTCHA verification is done by **our own
server routes** (see §2). (If you ever want zero custom server auth, hCaptcha
gives a near-identical checkbox+puzzle UX with native Supabase enforcement.)

## 2. Architecture — reCAPTCHA-gated server auth proxy

MSM normally authenticates client-direct to Supabase. Because reCAPTCHA must be
verified server-side and Supabase won't do it, login/sign-up/forgot now POST to
**our** API routes, which verify the token with Google **before** touching
Supabase, then hand any session back to the browser:

```
User → form → reCAPTCHA widget → g-recaptcha token
     → POST /api/auth/login { email, password, captchaToken }
          → verify token with Google siteverify (SECRET, server-side)  ← the gate
          → if invalid/missing/replayed: 400, Supabase NOT called
          → if valid: supabase.auth.signInWithPassword (sessionless anon client)
          → return { session: { access_token, refresh_token } }
     → browser: supabase.auth.setSession(session)  → existing approval gate runs
     → redirect to /app
```

Key properties:

- **Server-side verification is mandatory and unbypassable from the browser.** A
  direct API call, DOM edit, or tampered JS that omits/forges the token is
  rejected at the route before Supabase is touched.
- **Secret never reaches the client.** `RECAPTCHA_SECRET_KEY` is read only in
  `src/server/recaptcha.ts`.
- **Session model unchanged.** The server returns tokens; the browser calls
  `setSession`, so sessions still live client-side (no cookies/middleware/SSR
  rewrite). The existing approval gate (`list_app_users`), tenant cache-clear and
  `resolveSupabaseSession` all keep working.
- `/reset-password` (`updateUser` on an existing recovery session) is unchanged —
  no captcha needed there.

### Routes

| Route                   | Verifies captcha | Then                                           | Returns                        |
| ----------------------- | ---------------- | ---------------------------------------------- | ------------------------------ |
| `POST /api/auth/login`  | yes              | `signInWithPassword`                           | `{ session }` or generic error |
| `POST /api/auth/signup` | yes              | `signUp` + `register_pending_user` RPC         | `{ ok, pending }` (no sign-in) |
| `POST /api/auth/forgot` | yes              | `resetPasswordForEmail` (same-origin redirect) | always `{ ok: true }`          |

Shared server helpers live in `src/server/authSupport.ts` (sessionless anon
client, client-IP, same-origin redirect) and `src/server/rateLimit.ts`.

## 3. Frontend flow

- `src/components/security/Recaptcha.tsx` — reCAPTCHA v2 widget. Loads the Google
  script once (explicit render), exposes `reset()` via ref, renders **nothing**
  when no site key is configured.
- `src/components/security/CaptchaField.tsx` — "Verify you are human" caption +
  widget + accessible (`role="alert"`) status line for expired/error. Normalises
  callbacks to a single `onToken(token | null)`.
- `src/lib/security/recaptcha.ts` — `recaptchaSiteKey()`, `isRecaptchaEnabled()`.
- Each form holds a `captchaToken` + `captchaRef`; the submit button is disabled
  until the token exists (when configured); after a rejected attempt the
  single-use token is cleared and the widget reset. Double-submit is prevented by
  the RHF `isSubmitting` disabled state.

Surfaces wired: `app/login/login-form.tsx`, `app/signup/signup-form.tsx`,
`app/forgot-password/forgot-form.tsx`, and the landing card
`src/features/auth/AuthForm.tsx` (Sign-In + Sign-Up). The token flows through
`useAuth().login(id, pw, token)` / `register(input, token)` in
`src/features/auth/auth.tsx`, which call the routes above.

## 4. Graceful no-op (no regression)

When `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is **unset**, the widget renders nothing and
the forms do not gate. The routes also skip the captcha check when
`RECAPTCHA_SECRET_KEY` is unset (they still proxy auth). So the change is safe to
ship before provisioning; protection turns on once the keys are set.

## 5. Environment variables

| Variable                         | Where           | Secret? | Purpose                                            |
| -------------------------------- | --------------- | ------- | -------------------------------------------------- |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Vercel + `.env` | No      | Public widget key (inlined into the client bundle) |
| `RECAPTCHA_SECRET_KEY`           | Vercel (server) | **Yes** | Server-side Google siteverify                      |

Create a **reCAPTCHA v2 "I'm not a robot" Checkbox** site at
<https://www.google.com/recaptcha/admin/create>, add your domains
(`mymachineshopmanager.vercel.app`, `localhost`). See `.env.example`.

## 6. Local development setup

1. Copy `.env.example` → `.env.local` (git-ignored by the `.env.*` rule).
2. Set `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` + `RECAPTCHA_SECRET_KEY`.
3. For risk-free local testing use Google's **always-pass test keys** (they show
   a "for testing only" banner and accept any solve):
   - Site: `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI`
   - Secret: `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe`
4. `npm run dev`.

## 7. Vercel production setup

1. Project → **Settings → Environment Variables** (Production, and Preview if
   wanted):
   - `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`
   - `RECAPTCHA_SECRET_KEY`
2. Redeploy so the site key is inlined into the client bundle and the routes can
   read the secret.

There is **no Supabase dashboard step** for reCAPTCHA (unlike Turnstile/hCaptcha)
— enforcement is entirely in our routes.

## 8. Rate limiting / brute-force strategy

Because login now flows through our server, requests are visible to our
infrastructure, so protection is layered:

- **reCAPTCHA** forces a fresh solved challenge per attempt — the primary
  anti-automation control.
- **`src/server/rateLimit.ts`** — a best-effort in-memory per-IP fixed window
  (login 10/min, signup+forgot 5/min). Honest limitation: Vercel Functions are
  multi-instance/stateless, so this is per-warm-instance, not global. **No DB
  table is introduced.**
- **Supabase GoTrue built-in auth rate limits** (per project) still apply.
- **Recommended for production:** a **Vercel Firewall/WAF** rate-limit rule on
  `/api/auth/*`, and/or back the limiter with Upstash Redis / Vercel KV for a
  strict shared limit.
- Generic error copy (`Invalid email or password`) prevents account enumeration.

## 9. Error handling & messages

| Situation                        | User sees                                                      |
| -------------------------------- | -------------------------------------------------------------- |
| Bad credentials                  | "Invalid email or password." (never reveals which)             |
| Captcha missing (client gate)    | "Please complete the verification."                            |
| Captcha invalid/expired (server) | "Verification failed. Please complete the verification again." |
| Too many attempts (429)          | "Too many attempts. Please wait a minute and try again."       |
| Server misconfigured / network   | "…temporarily unavailable…" / "Request failed…"                |

## 10. Testing strategy

- **Unit** (`npm run test`):
  - `src/server/recaptcha.test.ts` — verifier fails closed on missing secret /
    missing token / non-200 / network error; surfaces Google codes incl.
    `timeout-or-duplicate` (replay); correct siteverify body.
  - `src/server/rateLimit.test.ts` — window allow/block/reset, key isolation.
- **E2E** (`npm run test:e2e`): `e2e/login-captcha.spec.ts` — gating/no-op UX and
  that `/api/auth/login` never returns a session for bad/missing input (the
  direct-API bypass guarantee). Branches on widget presence; only probes login to
  avoid backend side effects.

## 11. CAPTCHA test-mode configuration

Never automate solving a real challenge. Build with Google's test keys (§6) to
drive the widget; keep real keys for production. The e2e spec auto-detects the
widget and adapts.

## 12. Security considerations (summary)

- Server-side verification is the gate; it cannot be bypassed from the browser or
  by calling the API directly (no token → 400, no auth).
- Secret is server-only; Supabase service-role key is never used/exposed.
- Replayed tokens rejected by Google (`timeout-or-duplicate`); widget reset after
  each failed attempt to force a fresh token.
- Auth errors are generic (no enumeration). Forgot-password always returns the
  same result.
- Forgot-password redirect is derived from the request origin, not client input
  (no open redirect).
- No passwords, captcha tokens, or access/refresh tokens are logged.

## 13. Residual risks

- The in-memory limiter is best-effort on serverless (see §8) — add Vercel WAF /
  Redis for a hard guarantee.
- reCAPTCHA is deterrence, not a guarantee — solver services exist; it raises cost.
- Login tokens transit our API route (HTTPS); equivalent exposure to the client
  already storing them, but it is one more hop to keep patched.
- Until keys are provisioned the feature is a deliberate no-op.

## 14. Troubleshooting

| Symptom                                   | Likely cause / fix                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| Widget doesn't appear                     | `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` unset at **build** time, or an ad-blocker.      |
| "ERROR for site owner: Invalid site key"  | Site key not registered for this domain — add the domain in the reCAPTCHA admin. |
| All logins fail with a verification error | Secret missing/mismatched on the server, or domain not allow-listed.             |
| "Verification expired…"                   | Token aged out before submit — the widget refreshes; just resolve + resubmit.    |
| Lots of 429s                              | Rate limit tripped (or shared IP) — tune limits / add WAF rule.                  |
