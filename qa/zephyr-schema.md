# Zephyr Scale — manual test case CSV schema

The QA-Orchestra pipeline emits manual test cases as CSV files importable into
**Zephyr Scale** (Test Case import → CSV). One row per test case. Steps are
encoded as a single cell with numbered lines (Zephyr's "Test Script (Plain
Text)" style); split into Step/Expected columns on import if preferred.

## Columns

| Column           | Description                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| `Key`            | Stable id: `MSM-<MODULE>-<CATEGORY>-<NNN>` (e.g. `MSM-INVOICES-UI-001`). |
| `Name`           | Test case title (concise, action-oriented).                              |
| `Folder`         | `/<Module>/<Category>` — Zephyr folder path.                             |
| `Category`       | One of: UI, Validation, Functionality, API, Security, Database.          |
| `Priority`       | Highest / High / Normal / Low.                                           |
| `Status`         | Zephyr status: Draft / Approved.                                         |
| `Automation`     | Manual / Automated (Phase 6 flips this to `Automated`).                  |
| `AutomatedTest`  | Relative path to the Playwright spec + test title once automated.        |
| `Component`      | Module label.                                                            |
| `Objective`      | What the test verifies.                                                  |
| `Precondition`   | State required before execution (e.g. "Logged in as QA super-admin").    |
| `TestData`       | Inputs / fixtures used.                                                  |
| `Steps`          | Numbered steps, newline-separated inside the cell.                       |
| `ExpectedResult` | Overall expected outcome.                                                |
| `Labels`         | Space/comma tags (e.g. `regression smoke @destructive`).                 |

## Categories (required coverage per module)

- **UI** — layout, headings, tables, empty states, responsive, navigation.
- **Validation** — required fields, formats, boundaries, inline errors.
- **Functionality** — core CRUD/workflows, state transitions, calculations.
- **API** — Supabase REST/RPC responses, status codes, payload shape, RLS.
- **Security** — auth gating, super-admin-only routes, RLS isolation, XSS/inputs.
- **Database** — persistence, referential integrity, computed/derived values.
