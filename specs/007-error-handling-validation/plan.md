# Implementation Plan: Error Handling and Validation Best Practices

**Branch**: `007-error-handling-validation` | **Date**: 2026-03-27 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/007-error-handling-validation/spec.md`

---

## Summary

Introduce a unified `AppError` type and three-category error taxonomy across all store-app service layers; consolidate pre-write validation for transactions, journal entries, and bills into a single `businessValidationService`; create a `useErrorHandler` hook that gives every UI page a centralized notification channel; and add `expires_at` enforcement to `public_access_tokens` via a Postgres RPC update and SQL migration. No IndexedDB schema change is needed. All existing service contracts are backward-compatible (callers that currently ignore errors continue to work; callers that want structured errors opt in).

---

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18  
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38  
**Storage**: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary)  
**Testing**: Vitest (unit tests, service layer only)  
**Target Platform**: Web (Netlify SPA) + Electron (Windows NSIS x64 desktop)  
**Project Type**: offline-first POS web-app + desktop-app  
**Performance Goals**: Works fully offline; syncs within seconds of reconnect; sub-100ms local reads from IndexedDB  
**Constraints**: offline-capable, multi-currency (USD + LBP), multilingual (en/ar/fr), RTL layout, RBAC per branch, atomic financial transactions, no server-side ledger RPCs  
**Scale/Scope**: Single-store or multi-branch; 10–100 concurrent sessions per store

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Gate | Principle | Status | Notes |
|------|-----------|--------|-------|
| CG-01 | Offline-First Data Flow | **PASS** | `AppError` and validation are TypeScript types/service modules. No Supabase access from UI added. `publicStatementService.ts` already isolates Supabase access. |
| CG-02 | UI Data Access Boundary | **PASS** | New `useErrorHandler` hook lives in `hooks/`. No `lib/db` or `lib/supabase` imports in pages or components. |
| CG-03 | Event-Driven Sync | **PASS** | No `setInterval` added. No changes to sync or event emission paths. |
| CG-04 | Financial Atomicity | **PASS** | Validation wraps `transactionService.createTransaction()` — it does not replace or bypass it. The atomicity contract is unchanged. |
| CG-05 | Client-Side Ledger | **PASS** | No new server-side RPCs for ledger computation. The `get_customer_by_token` RPC update adds expiry logic only, not ledger computation. |
| CG-06 | Branch Isolation | **PASS** | `AppError` carries optional `details` (developer-only). No branch data is leaked in error payloads to users. `businessValidationService` receives `branch_id` from its callers (no cross-branch queries). |
| CG-07 | RBAC Enforcement | **PASS** | No new routes or user-facing operations added. Existing RBAC checks in callers are unaffected. |
| CG-08 | Double-Entry Accounting | **PASS** | Pre-write journal validation enforces debit=credit before any `journalService.createJournalEntry()` call. Immutability of existing entries is unchanged. |
| CG-09 | Schema Consistency | **PASS** | `public_access_tokens` `expires_at` column requires one SQL migration committed to `supabase/migrations/`. No IndexedDB version bump needed (table is Supabase-only, not synced). |
| CG-10 | Multilingual | **PASS** | All user-facing error message strings added to `i18n/locales/en.ts`, `ar.ts`, `fr.ts`. `AppError.message` will store a translation key; `useErrorHandler` resolves it via `getTranslatedString()`. |
| CG-11 | Local Date Extraction | **N/A** | Feature does not produce or filter by local calendar dates. No date extraction is involved. |

**Post-design re-check**: All gates still pass after Phase 1 design. No violations introduced.

---

## Project Structure

### Documentation (this feature)

```text
specs/007-error-handling-validation/
├── plan.md              ← This file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── error-handling-contract.md   ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit.tasks)
```

### Source Code (store-app)

New files introduced by this feature:

```text
apps/store-app/src/
├── types/
│   └── errors.ts                          ← NEW: AppError, ErrorCategory, ValidationResult, AppErrorCode
├── services/
│   └── businessValidationService.ts       ← NEW: pre-write validation rules (transactions, journals, bills)
├── hooks/
│   └── useErrorHandler.ts                 ← NEW: centralized UI error notification hook
├── components/
│   └── common/
│       └── ErrorToastContainer.tsx        ← NEW: renders error notifications from useErrorHandler state
└── contexts/
    └── ErrorNotificationContext.tsx        ← NEW: provides useErrorHandler state to the React tree

supabase/migrations/
└── add_expires_at_to_public_access_tokens.sql   ← NEW: adds expires_at + updates get_customer_by_token RPC
```

Existing files modified by this feature:

```text
apps/store-app/src/
├── services/
│   ├── transactionService.ts              ← MODIFY: wrap errors as AppError; call businessValidationService
│   ├── journalService.ts                  ← MODIFY: wrap throw new Error → AppError throws
│   ├── crudHelperService.ts               ← MODIFY: wrap throw new Error → AppError throws
│   └── publicStatementService.ts          ← MODIFY: handle expired-token null case explicitly
├── contexts/
│   └── App.tsx                            ← MODIFY: add ErrorNotificationProvider to provider composition
├── i18n/locales/
│   ├── en.ts                              ← MODIFY: add error message keys
│   ├── ar.ts                              ← MODIFY: add Arabic translations
│   └── fr.ts                              ← MODIFY: add French translations
└── pages/ (all 9 page files)             ← MODIFY: replace console.error with handleError from useErrorHandler
```

**Structure decision**: Single store-app project (no new sub-packages). No admin-app changes needed. `types/errors.ts` is store-app-only (not added to `@pos-platform/shared`).

---

## Complexity Tracking

No constitution gate violations. This section is intentionally empty — no special justification required.
