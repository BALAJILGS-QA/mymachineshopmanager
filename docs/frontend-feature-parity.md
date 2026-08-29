# Frontend Feature Parity Checklist

Every existing feature must end at ✅ Migrated + ✅ Tested with **zero unintentional
loss**. Filled during Phases 4–6.

Legend: ✅ done · ⏳ pending · ⚠️ needs manual verification · ❌ missing (must be zero at completion)

## Core modules

| Module                 | Key workflows to preserve                                                                                              | Migrated | Tested |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| Auth                   | login, register→pending, super-admin approval, logout, change password, session persist/expiry, unauthorized redirect  | ⏳       | ⏳     |
| Dashboard              | KPI tiles, cash-flow & expense charts, priority jobs, low-stock alerts, recent payments/expenses                       | ⏳       | ⏳     |
| Companies              | list/create/edit, code/GSTIN, active-inactive, delete-guard (txn companies can't delete)                               | ⏳       | ⏳     |
| Job Orders             | create/edit, status+priority, due/overdue, qty, `create_job` RPC (auto material issue)                                 | ⏳       | ⏳     |
| Production             | queue by priority, start/hold/complete/deliver via `transition_job`, event history                                     | ⏳       | ⏳     |
| Inventory / Materials  | material master, receipts, issues (stock guard), adjustments, company-wise + overall balances, low/negative validation | ⏳       | ⏳     |
| Delivery Challans      | create, line items, status lifecycle, print view + PDF, invoiced-guard                                                 | ⏳       | ⏳     |
| Invoices               | build from jobs or manual, line items, discount/CGST/SGST, status lifecycle, print + PDF                               | ⏳       | ⏳     |
| Payments               | full/partial/advance, method, auto-recalculated outstanding                                                            | ⏳       | ⏳     |
| Expenses               | categorized, company/job allocation                                                                                    | ⏳       | ⏳     |
| Reports                | job/stock/movement/invoice/payment/expense/outstanding, filters, CSV/XLSX export                                       | ⏳       | ⏳     |
| Settings               | units/material types/expense categories, numbering, shop profile, currency/tax, backup/restore, password               | ⏳       | ⏳     |
| Approvals (SuperAdmin) | list pending, approve/reject, RLS mirror                                                                               | ⏳       | ⏳     |
| Public site            | landing (+ merged login/register), blog list, blog post, SEO metadata                                                  | ⏳       | ⏳     |

## Cross-cutting UI/UX

| Concern                                   | Migrated | Tested |
| ----------------------------------------- | -------- | ------ |
| Sidebar / topbar / mobile bottom-nav      | ⏳       | ⏳     |
| Toast notifications                       | ⏳       | ⏳     |
| Confirm dialogs                           | ⏳       | ⏳     |
| Modals (portal)                           | ⏳       | ⏳     |
| Loading / empty / error states            | ⏳       | ⏳     |
| Pagination / filtering / sorting / search | ⏳       | ⏳     |
| Responsive (desktop/laptop/tablet/mobile) | ⏳       | ⏳     |
| Print pages (challan, invoice)            | ⏳       | ⏳     |
| CSV / XLSX export, PDF export             | ⏳       | ⏳     |
| Currency/number/date formatting           | ⏳       | ⏳     |

## Business-rule guards (must remain enforced)

- Unique job/invoice/receipt/payment/DC numbers · companies with transactions can't be
  deleted (inactivate) · stock never silently negative · invoice totals + outstanding
  system-calculated · positive payment amounts · completed qty ≤ ordered (unless
  overproduction) · cancelled financial docs kept in history · configurable INR currency.
