# My Machine Shop Manager — Subscription Plan

> Commercial packaging + tiering for the MSM multi-tenant SaaS, mapped to the
> actual feature modules in the codebase. Target market: Indian precision / CNC
> machine shops & MSME manufacturers (GST-registered). Currency: INR. Billing unit:
> **one tenant = one shop/business**. Three tiers at **₹399 / ₹499 / ₹699 per month**,
> every tenant starts on a **30-day free trial**.

---

## 1. Role model (who pays, who operates)

| Role                     | Who                                                                                             | Billable?                                         | Scope                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Super Admin**          | **`admin@sreebalajiindustries.com` only** — the product/support team                            | **No** — platform operator, never a customer seat | Cross-tenant: approve registrations, see every tenant's subscription, change plans, extend trials, suspend |
| **Tenant Owner / Admin** | The customer (shop owner). On approval the account becomes **Admin** of its own isolated tenant | Yes — the paying account                          | Their own tenant only: all licensed modules, manage their staff                                            |
| **Tenant Member**        | Staff invited by the owner                                                                      | Seat within the tenant                            | RBAC-scoped modules                                                                                        |

On approval the super admin grants the account **Admin of its own tenant** and a
**30-day free trial** starts automatically. Plans, trials and billing attach to the
**tenant**, never to the platform operator (who is reported as `exempt`).

---

## 2. Tiers at a glance

|                           | **Free Trial**   | **Starter**           | **Professional** | **Enterprise**           |
| ------------------------- | ---------------- | --------------------- | ---------------- | ------------------------ |
| Price (monthly, +18% GST) | Free **30 days** | **₹399**              | **₹499**         | **₹699**                 |
| Target                    | Evaluating       | Solo / small job shop | Growing shop     | Established manufacturer |
| User seats                | Full access      | 3                     | 10               | Unlimited                |
| Customers (companies)     | —                | 25                    | Unlimited        | Unlimited                |
| Invoices / month          | —                | 100                   | 500              | Unlimited                |
| Support                   | Email            | Email                 | Email + chat     | Priority                 |

Every tenant begins on the 30-day trial with full access. A reminder popup appears
in the **last 5 days** (covering the 5 / 3 / 1-day marks) with an **Upgrade plan**
button that opens the subscription page (`/app/subscription`).

---

## 3. Feature matrix (module → tier)

Modules map directly to `src/features/*` and the portal nav groups.

| Module / capability                                               | Starter ₹399 | Professional ₹499 | Enterprise ₹699 |
| ----------------------------------------------------------------- | :----------: | :---------------: | :-------------: |
| Dashboard & summary KPIs                                          |      ✅      |        ✅         |       ✅        |
| Companies / customers & vendors                                   |      ✅      |        ✅         |       ✅        |
| Job orders & production tracking                                  |      ✅      |        ✅         |       ✅        |
| Materials & stock (basic)                                         |      ✅      |        ✅         |       ✅        |
| Delivery challans (+ PDF)                                         |      ✅      |        ✅         |       ✅        |
| GST-ready invoices & payments                                     |      ✅      |        ✅         |       ✅        |
| Expenses                                                          |      ✅      |        ✅         |       ✅        |
| Standard reports                                                  |      ✅      |        ✅         |       ✅        |
| Inventory — movements, adjustments, **transfers**                 |      —       |        ✅         |       ✅        |
| Payments — **multi-invoice settlement, deductions (TDS/freight)** |      —       |        ✅         |       ✅        |
| **Accounts & Finance** — ledger, GST returns, e-Invoice, e-Way    |      —       |        ✅         |       ✅        |
| Purchase management & vendors                                     |      —       |        ✅         |       ✅        |
| **Tool Room** (issue/return, calibration, maintenance)            |      —       |        ✅         |       ✅        |
| CRM & sales workspace                                             |      —       |        ✅         |       ✅        |
| Custom document numbering & branding                              |      —       |        ✅         |       ✅        |
| **Workforce & HRM** — employees, attendance, payroll              |      —       |         —         |       ✅        |
| **Subcontracting / Supply Chain**                                 |      —       |         —         |       ✅        |
| Production planning                                               |      —       |         —         |       ✅        |
| Advanced analytics & exports                                      |      —       |         —         |       ✅        |
| Unlimited users & records                                         |      —       |         —         |       ✅        |

Rationale: core order-to-cash (jobs → challan → invoice → payment) is in every tier
so the product is useful on day one. The upgrade drivers are **inventory depth +
GST accounting + Tool Room** (Professional) and **HRM/Payroll + subcontracting**
(Enterprise).

---

## 4. What is implemented (this change)

- **`tenants`** gains `plan`, `subscription_status`, `trial_started_at`,
  `trial_ends_at` (migration `0062_subscription_trial.sql`).
- **Approval → Admin + 30-day trial**: `set_user_approval` sets the account role to
  `Admin` (approved_users + app_state registry) and starts the tenant trial;
  `provision_isolated_tenant_for` stamps a 30-day trial on new tenants.
- **RPCs**: `get_my_subscription()` (caller's plan/trial/days-left; super admin =
  `exempt`), `set_tenant_plan(plan)` (owner/admin picks a tier),
  `list_user_subscriptions()` (super-admin view of every tenant's subscription).
- **Frontend**: `src/features/subscription/*` — plan catalogue, subscription page
  (`/app/subscription`), and a trial-reminder popup (`TrialBanner`) shown in the
  last 5 trial days. The super-admin Approvals screen shows each user's plan + trial
  status.

---

## 5. Not yet built (follow-ups)

- **Payment integration** (Razorpay recommended, India-first): checkout, webhooks →
  `subscription_status`, dunning (`active → past_due → suspended`). Today
  `set_tenant_plan` records the chosen plan; activation is manual.
- **Hard entitlement enforcement**: the plan limits/feature matrix above are defined
  in `src/features/subscription/plans.ts` and shown to the user, but modules are not
  yet gated by plan at the nav/route/RPC layer. Add a `has_entitlement(tenant, key)`
  helper + `useEntitlements()` hook to enforce both client- and server-side.
- **Usage metering** (invoices/month, seats) for the quantitative limits.
- **GST tax invoice** to the customer per billing cycle (18% GST; POS from
  `tenants.gstin`).

---

_Prepared from the live codebase: feature modules in `src/features/*`, the
multi-tenant model (migrations 0039–0048), and the role model where
`admin@sreebalajiindustries.com` is the sole platform operator. Pricing
(₹399/₹499/₹699) is the agreed starting point — validate against customer interviews
before locking._
