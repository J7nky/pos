<!--
  SYNC IMPACT REPORT — Constitution Amendment v1.4.1 → v1.5.0
  Generated: 2026-04-19

  Prior amendment: v1.4.0 → v1.4.1 (2026-04-19, PATCH accuracy sweep — line
  counts refreshed, anti-patterns marked RESOLVED, §12/§13 numbering fix).

  Version change:   1.4.1 → 1.5.0
  Bump rationale:   MINOR — three new non-negotiable principles added with their
                    corresponding Constitution Check gates. Existing gates CG-01
                    through CG-11 are unchanged. Gates are renumbered only by
                    extension (new IDs appended), so plans that cite CG-01…CG-11
                    remain valid.

  Added principles / gates:
    §3.XII   Testing Discipline                    `CG-12`
             Services under /services and operations under /contexts/offlineData/
             operations/ MUST ship Vitest coverage. Changes touching sync-affecting
             files MUST pass `pnpm parity:gate`.
    §3.XIII  Shared Package as the Source of Truth `CG-13`
             Utilities, types, and constants used by more than one app MUST live
             in @pos-platform/shared. Duplication across apps is a violation.
    §3.XIV   Undo Payload Storage Boundary         `CG-14`
             Undo state MUST live in sessionStorage only. Persisting undo payloads
             to IndexedDB/Dexie or localStorage is FORBIDDEN. Codifies the decision
             established in the 011-undo-system-fixes work.

  Modified sections:
    §3       Core Architectural Principles — three principles appended (XII–XIV).
    §10      Code Review Checklist — three new items added.
    §12.2    Constitution Check Gate Mapping — three new rows (CG-12, CG-13, CG-14).
    §12.3    `plan.md` alignment — gate count 11 → 14.

  Removed principles / gates: none

  Templates requiring updates:
    ✅ .specify/memory/constitution.md (this file — now updated)
    ⚠  .specify/templates/plan-template.md
         → Constitution Check placeholder should now enumerate CG-01 through CG-14.
    ⚠  .specify/templates/spec-template.md
         → Features exposing undo must reference CG-14; features adding services
           or operations must reference CG-12; cross-app utilities must reference CG-13.
    ⚠  .specify/templates/tasks-template.md
         → Foundational phase guidance should mention Vitest test-file creation
           alongside any new service or operation file (CG-12).

  Follow-up TODOs:
    - Propagate CG-12..CG-14 into the three template files flagged above.
    - Consider, in a future MINOR bump: CG-15 Observability (comprehensiveLoggingService
      usage), CG-16 Security for public-token routes (§8.O), CG-17 Electron peripheral
      access boundary.
-->

# Souq POS — Project Constitution

> This document is the authoritative technical reference for AI planning tools (spec-kit and similar). It captures architecture, data flow, module inventory, anti-patterns, and hard rules derived from a full static analysis of the codebase. Every plan, spec, or task generated for this project must be validated against this constitution before execution.

---

## 1. Project Identity

| Property | Value |
|----------|-------|
| **Product name** | Souq POS |
| **Version** | 3.0.0 |
| **Repo type** | pnpm monorepo |
| **Apps** | `store-app` (Vite SPA + Electron), `admin-app` (Vite SPA) |
| **Shared package** | `@pos-platform/shared` (types, constants, utils) |
| **Runtime targets** | Web (Netlify), Electron (Windows NSIS x64) |
| **Node requirement** | ≥18; pnpm ≥8 (pnpm@10.20.0) |
| **Key frameworks** | React 18, React Router 7, TypeScript 5.x, Vite 7, Tailwind CSS 3 |
| **Local DB** | Dexie v4 (IndexedDB), schema version 54 |
| **Remote DB/Auth** | Supabase JS v2 (PostgreSQL + Auth + Realtime + Storage) |
| **Desktop runtime** | Electron 38, electron-builder, auto-updater (GitHub releases) |
| **Peripheral support** | serialport, usb, escpos, node-thermal-printer (receipt printers) |
| **i18n** | English, Arabic, French; RTL support |

---

## 2. Architecture

### 2.1 Monorepo Layout

```
pos-1/
├── apps/
│   ├── store-app/          ← Main POS/ERP (~100+ source files, ~45k lines)
│   └── admin-app/          ← Super-admin SPA (~45 source files)
├── packages/
│   └── shared/             ← @pos-platform/shared (types, constants, utils)
├── supabase/migrations/    ← branch_event_log.sql (only committed migration)
├── docs/                   ← Design decision docs (markdown)
├── netlify.toml            ← Single Netlify config (fragile — see §8)
└── package.json            ← Root workspace (pnpm scripts)
```

### 2.2 Store App Internal Structure

```
apps/store-app/src/
├── main.tsx                ← React entry, RouterProvider
├── router.tsx              ← Route definitions; hash (Electron) vs browser router
├── App.tsx                 ← Provider composition root
├── pages/                  ← 12 page files (~10k lines)
├── contexts/               ← 3 contexts + offlineData/ submodule
│   ├── OfflineDataContext.tsx      ← Composer/orchestrator (1,150 lines)
│   ├── SupabaseAuthContext.tsx     ← Auth (865 lines)
│   ├── CustomerFormContext.tsx     ← Lightweight cross-page form state
│   └── offlineData/                ← Decomposed domain hooks + operations
│       ├── types.ts
│       ├── offlineDataContextContract.ts
│       ├── index.ts
│       ├── use*DataLayer.ts        ← 17 domain hooks
│       └── operations/             ← 12 pure operation files
├── services/               ← ~50 service files (~29k lines)
├── components/             ← 80+ component files
├── hooks/                  ← 20 custom hooks
├── lib/
│   ├── db.ts               ← Dexie POSDatabase (1,773 lines, 54 versions)
│   └── supabase.ts         ← Supabase client singleton
├── types/                  ← database.ts, accounting.ts, index.ts, etc.
├── utils/                  ← 30+ utility files
├── constants/              ← transactionCategories, paymentCategories, etc.
├── i18n/                   ← en, ar, fr locale files
└── scripts/                ← 11 browser-runnable migration/test scripts [⚠ see §8.H]
```

### 2.3 Architectural Pattern

**Offline-First Layered Architecture.** The entire system is designed to work without internet and sync when connectivity is available. The mandatory data access pattern is:

```
Supabase (remote)
    ↕  syncService.ts (upload dirty rows / download changes)
IndexedDB / Dexie (local — single source of truth)
    ↕  OfflineDataContext (state + CRUD facade)
         ↕  UI (pages / components / hooks)
```

**Provider composition in `App.tsx`:**
```
RouterProvider
└── App [ErrorBoundary]
    └── SupabaseAuthProvider
        └── OfflineDataProvider
            └── I18nProvider
                └── CustomerFormProvider
                    └── BranchAwareAppContent → Layout → Pages
```

**Router strategy:** `createHashRouter` in Electron (file:// protocol); `createBrowserRouter` on web. Detection via `window.electronAPI`.

### 2.4 Technical Context Quick Reference (for `/speckit.plan`)

When filling the `Technical Context` block in `plan.md`, use these values verbatim:

```
Language/Version:     TypeScript 5.x, React 18, Node.js ≥18
Primary Dependencies: Dexie v4, Supabase JS v2, React Router 7,
                      Tailwind CSS 3, Vite 7, Electron 38
Storage:              Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary)
Testing:              Vitest (unit tests, service layer only — see §8.Q)
Target Platform:      Web (Netlify SPA) + Electron (Windows NSIS x64 desktop)
Project Type:         offline-first POS web-app + desktop-app
Performance Goals:    Works fully offline; syncs within seconds of reconnect;
                      sub-100ms local reads from IndexedDB
Constraints:          offline-capable, multi-currency (USD + LBP),
                      multilingual (en/ar/fr), RTL layout, RBAC per branch,
                      atomic financial transactions, no server-side ledger RPCs
Scale/Scope:          Single-store or multi-branch; 10–100 concurrent sessions per store
```

---

## 3. Core Architectural Principles (NON-NEGOTIABLE)

> Every `/speckit.plan` Constitution Check MUST evaluate each principle below as a
> pass/fail gate (CG-01 through CG-11). See §12 for the formal gate-mapping table.

### I. Offline-First Data Flow `CG-01`
All CRUD operations MUST write to IndexedDB first, then sync to Supabase.
The UI MUST NEVER read from or write to Supabase directly.
IndexedDB is the single authoritative local source of truth.

### II. UI Data Access Boundary `CG-02`
**UI (pages, components, layouts) MUST only import from:**
- `hooks/` — e.g. `useOfflineData`, `useCurrency`, `useSupabaseAuth`
- `services/` — business logic that does not expose db/supabase to callers
- `contexts/` — e.g. `OfflineDataContext`, `SupabaseAuthContext`

**UI MUST NEVER import:**
- `lib/db` or `getDB()` — no direct IndexedDB access
- `lib/supabase` — no Supabase client
- Any repository-layer abstraction

ESLint `no-restricted-imports` in `eslint.config.js` enforces this as a build-time error.

### III. Event-Driven Sync (No Polling) + Upload-Then-Emit Contract `CG-03`
Sync MUST be event-driven, never timer-driven.

**Upload-then-emit is the authoritative contract:** Events MUST be emitted to
`branch_event_log` by `syncService.uploadLocalChanges()` *after* each batch is confirmed
uploaded to Supabase — NEVER before. This guarantees the record exists when Device B fetches
it. Emitting events before upload is FORBIDDEN.

**performSync / auto-sync MUST use `syncService.uploadOnly()`** (upload-only path). Remote
changes are downloaded exclusively via `eventStreamService` (Supabase Realtime + version-based
catch-up). The full `syncService.sync()` (which also runs a table-scan download) is reserved
for initial hydration and explicit `fullResync()` calls only.

**Only one allowed periodic interval:** `eventStreamService` MAY run a single ~5-minute
catch-up safety net for missed Realtime events. No other `setInterval` is permitted anywhere
in the sync or event path.

**Deletion detection** runs at most once per 30-minute window (enforced by
`SYNC_CONFIG.deletionDetectionInterval = 1_800_000`) with a 5-minute startup grace period
(`SYNC_CONFIG.deletionDetectionStartupGrace = 300_000`) so the very first post-cold-start
sync never immediately issues 24+ extra paginated ID-scan queries.

### IV. Financial Atomicity via TransactionService `CG-04`
All financial transactions MUST go through `transactionService.createTransaction()`.
Direct database writes for financial data are FORBIDDEN. The service enforces
`TRANSACTION_CATEGORIES`, creates journal entries, updates cash drawer, and auto-rolls
back on failure.

### V. Client-Side Ledger Computation `CG-05`
Account statements (customer/supplier) MUST be computed entirely client-side from local
IndexedDB. No new server-side RPCs for ledger operations are permitted.
`accountStatementService.ts` is the authoritative implementation.

### VI. Branch-Level Isolation `CG-06`
Regular users MUST only see data for their assigned branch. Admins MAY access multiple
branches. All data queries MUST carry `branch_id`. RLS policies MUST enforce branch
isolation on every Supabase table.

### VII. RBAC Enforcement `CG-07`
All user-facing operations MUST check permissions via
`rolePermissionService.checkModuleAccess()` and `checkOperationLimit()`.
Routes MUST use `ProtectedRoute` for module-level access.
Navigation menus MUST filter dynamically on `user_module_access`.

### VIII. Double-Entry Accounting `CG-08`
All monetary movements MUST create journal entries via `journalService`.
Every journal entry MUST have balanced debits = credits.
Journal entries MUST be immutable after creation.

### IX. Schema Consistency `CG-09`
All new Supabase tables MUST include: `store_id`, `created_at`, `updated_at`.
All sync-enabled tables MUST additionally include: `_synced`, `_lastSyncedAt`, `_deleted`.
Schema changes MUST include **both** a Supabase SQL migration committed to
`supabase/migrations/` AND an IndexedDB version bump in `lib/db.ts`.

### X. Multilingual by Default `CG-10`
All user-facing strings MUST use `createMultilingualFromString()` /
`getTranslatedString()` from `utils/multilingual.ts`.
Supported languages are English, Arabic, and French. RTL layout MUST be handled.

### XI. Local Date Extraction via `getLocalDateString` `CG-11`
All code that derives "today's date" or a local calendar date from a timestamp MUST use
`getLocalDateString(isoString)` from `utils/dateUtils.ts` (or the zero-argument wrapper
`getTodayLocalDate()` when the intent is "right now").

`new Date().toISOString().split('T')[0]` is **FORBIDDEN** as a local-date extraction method
because it returns the UTC calendar date, not the device's local calendar date. For users in
UTC+ timezones (e.g. Lebanon UTC+2/+3) this produces the wrong day during the hours between
local midnight and UTC midnight, causing bills, inventory records, and report filters to be
bucketed on the wrong date.

**Rationale:** The correct utility already exists in `utils/dateUtils.ts`. Using it
consistently is the only code change required to close the entire class of UTC/local-date
bugs documented in `IMPROVEMENTS_ENHANCEMENTS_REPORT.md §6`.

### XII. Testing Discipline `CG-12`
Every new file under `apps/store-app/src/services/` or
`apps/store-app/src/contexts/offlineData/operations/` MUST ship with at least one Vitest
test covering the primary success path and the main failure path.

Changes that touch **any** of the following sync-critical files MUST run `pnpm parity:gate`
and ensure the golden snapshot passes before merge:
- `services/syncService.ts`
- `services/eventStreamService.ts`
- `services/eventEmissionService.ts`
- `services/crudHelperService.ts`
- `services/transactionService.ts`
- `services/journalService.ts`
- Any file under `contexts/offlineData/operations/`

**Rationale:** These files hold the financial and sync core. Silent regressions here can
corrupt ledgers or cause divergent branch state across devices — the exact class of bug
that is most expensive to recover from post-deploy. Vitest is the sole test runner (see
§8.Q) so there is no ambiguity about where tests go.

### XIII. Shared Package as the Source of Truth `CG-13`
Any utility, type, or constant that is used (or will plausibly be used) by both
`apps/store-app` and `apps/admin-app` MUST live in `packages/shared`
(`@pos-platform/shared`) and be imported from there. Duplicating the implementation across
apps is FORBIDDEN.

Known existing duplication that MUST NOT be extended: `referenceGenerator.ts`,
`multilingual.ts`. These should be consolidated into `@pos-platform/shared` the next time
either is touched.

**Rationale:** The store-app and admin-app operate on the same Supabase schema and share
domain vocabulary. Duplicated utilities drift — one app fixes a bug, the other does not,
and the resulting inconsistency surfaces as data corruption between the two surfaces
(see §8.H). The shared package already exists and is the correct deduplication boundary.

### XIV. Undo Payload Storage Boundary `CG-14`
The undo payload consumed by `undoOperations.undoLastAction()` MUST be stored in
`sessionStorage` only. Writing undo state to IndexedDB/Dexie (no `undo_history` table, no
`_deleted`-flag tricks) or to `localStorage` is FORBIDDEN.

**Rationale:** Undo is intentionally scoped to the current tab session. Persisting undo
payloads across sessions creates two hazards: (1) stale undos can replay over state that
has already been synced and superseded by events from other devices, silently rewinding
work that other users have built on top of; (2) a crash recovery path could "resurrect" an
undo that the user has already mentally discarded. `sessionStorage` auto-clears on tab
close, which matches the intended lifetime exactly. This boundary was established in the
`011-undo-system-fixes` work and is encoded here to prevent regression.

---

## 4. Key Modules Reference

### 4.1 Entry & Routing
| File | Responsibility |
|------|----------------|
| `src/main.tsx` | React tree entry; mounts `RouterProvider` |
| `src/router.tsx` | All route definitions; Electron hash vs web browser router selection |
| `src/App.tsx` | Provider composition; admin branch selection; offline bypass logic |

### 4.2 Pages
| File | Lines | Domain |
|------|-------|--------|
| `pages/POS.tsx` | 1,975 | Point-of-sale: cart/tabs, bill creation, payment, QR |
| `pages/Accounting.tsx` | 1,566 | Journal entries, transactions, received/sold bills, payments |
| `pages/Settings.tsx` | 1,503 | Store config: currency, exchange rate, receipt layout, RBAC |
| `pages/Customers.tsx` | 1,118 | Unified entity ledger, account statements |
| `pages/Employees.tsx` | 929 | Employee management, payroll |
| `pages/PublicCustomerStatement.tsx` | 793 | Tokenized, unauthenticated customer statement |
| `pages/Home.tsx` | 707 | Dashboard: KPIs, cash drawer status, activity feed, reminders |
| `pages/Inventory.tsx` | 522 | Inventory receiving, batches, stock view |
| `pages/UnsyncedItems.tsx` | 469 | Shows all local unsynced records by table |
| `pages/Reports.tsx` | 408 | P&L, weight comparisons, other reports |

### 4.3 Contexts
| File | Lines | Responsibility |
|------|-------|----------------|
| `contexts/OfflineDataContext.tsx` | 1,150 | **Central data facade.** Composes 17 domain hooks + 12 operation modules. Exposes `useOfflineData()`. |
| `contexts/SupabaseAuthContext.tsx` | 865 | Session, signIn/signOut, userProfile, offline local-auth fallback |
| `contexts/CustomerFormContext.tsx` | ~50 | Cross-page "add customer" trigger from POS |

### 4.4 OfflineData Submodule (`contexts/offlineData/`)
**Domain data layer hooks** (each owns state + CRUD for one domain):

| Hook | Domain |
|------|--------|
| `useEntityDataLayer` | Customers & suppliers (unified entities) |
| `useOfflineInitialization` | App startup: sync, local load, branch discovery |
| `useSyncStateLayer` | Sync orchestration: `performSync` (calls `syncService.uploadOnly()`), `debouncedSync`, `updateUnsyncedCount` |
| `useCashDrawerDataLayer` | Cash drawer open/close/report/status |
| `useBranchBootstrapEffects` | Admin branch sync; manager/cashier branch assignment |
| `useStoreSettingsDataLayer` | Currency, exchange rate, language, receipt settings |
| `useBillDataLayer` | Bills + bill line items state + CRUD |
| `useOfflineSyncLifecycle` | `justCameOnline` trigger; auto-sync timer |
| `useTransactionDataLayer` | Transactions state + `addTransaction` |
| `useEmployeeDataLayer` | Employees state + CRUD |
| `useProductDataLayer` | Products state + CRUD |
| `useNotificationsDataLayer` | In-app notifications |
| `useBranchDataLayer` | Branches state + `updateBranch` |
| `useInventoryDataLayer` | Inventory items + batches state |
| `useEventStreamLifecycle` | Starts/stops `eventStreamService`; calls `refreshData` on events |
| `useDerivedStockLevels` | Stock level warnings derived from products + inventory |
| `useStoreSwitchLifecycle` | Clears IndexedDB on store switch |
| `useAccountingDataLayer` | Journal entries, chart of accounts, balance snapshots |

**Operation files** (pure functions, dependency-injected, called by OfflineDataContext):

| File | Lines | Domain |
|------|-------|--------|
| `operations/billOperations.ts` | 987 | `createBill`, `updateBill`, `deleteBill`, `reactivateBill` |
| `operations/paymentOperations.ts` | 844 | `processPayment`, `processSupplierAdvance`, `processEmployeePayment` |
| `operations/cashDrawerTransactionOperations.ts` | 501 | Cash drawer atomic write operations |
| `operations/inventoryBatchOperations.ts` | 417 | `addInventoryBatch`, `updateInventoryBatch`, `applyCommissionRate` |
| `operations/inventoryItemOperations.ts` | 373 | Inventory CRUD + deduct/restore quantity |
| `operations/saleOperations.ts` | 368 | `updateSale`, `deleteSale` (`addSale` deprecated) |
| `operations/entityOperations.ts` | 299 | Customer/supplier CRUD |
| `operations/employeeBranchOperations.ts` | 139 | Employee branch assignment |
| `operations/cashDrawerSessionOperations.ts` | 132 | Session open/close |
| `operations/undoOperations.ts` | 111 | `undoLastAction` |
| `operations/transactionOperations.ts` | 97 | `addTransaction` |
| `operations/productOperations.ts` | 77 | Product CRUD |

### 4.5 Critical Services

| Service | Lines | Responsibility |
|---------|-------|----------------|
| `syncService.ts` | 1,333 | Two entry points: `uploadOnly()` (used by performSync/auto-sync — upload + deletion detection, no table-scan download) and `sync()` (full upload + download, used only for initial hydration and `fullResync()`); batch dependency ordering |
| `transactionService.ts` | 1,783 | **Financial core.** All transactions; journal entry creation; cash drawer; audit logging; atomic rollback |
| `accountStatementService.ts` | 1,410 | Client-side account statement generation from IndexedDB |
| `eventStreamService.ts` | 1,396 | Realtime WebSocket subscription to `branch_event_log`; version-based catch-up; 5-min safety interval |
| `inventoryPurchaseService.ts` | 1,333 | Inventory receive workflow: bills, items, journal entries |
| `enhancedTransactionService.ts` | 851 | Extended transaction logic |
| `dataValidationService.ts` | 790 | Schema validation before sync |
| `cashDrawerUpdateService.ts` | 769 | Cash drawer balance + session management |
| `accountBalanceService.ts` | 754 | Journal-entry-based balance calculation |
| `accessControlService.ts` | 663 | RBAC enforcement: `checkModuleAccess()`, `checkOperationLimit()` |
| `reportingService.ts` | 653 | Report data computation |
| `profitLossService.ts` | 631 | P&L calculations |
| `crudHelperService.ts` | 635 | Generic CRUD + `loadAllStoreData()` (bulk IndexedDB load on startup) |
| `comprehensiveLoggingService.ts` | 610 | Audit/activity logging |
| `missedProductsService.ts` | 610 | Out-of-stock product tracking |
| `weightManagementService.ts` | 596 | Weight-based inventory management |
| `entityQueryService.ts` | 578 | Entity lookup/queries |
| `downloadOptimizationService.ts` | 572 | Sync download deduplication and change detection |
| `reminderMonitoringService.ts` | 551 | Reminder due-date monitoring |
| `snapshotService.ts` | 547 | Balance snapshot creation |
| `auditLogService.ts` | 543 | Audit trail |
| `eventEmissionService.ts` | 536 | Called by `syncService.uploadLocalChanges()` after each batch is confirmed uploaded; emits typed events to `branch_event_log` RPC (upload-then-emit contract) |
| `journalService.ts` | 519 | Double-entry journal creation; validates debit = credit |
| `receivedItemsJournalService.ts` | 451 | Journal entries for received inventory items |
| `localAuthService.ts` | ~391 | bcrypt offline authentication; `localCredentials` table |
| `rolePermissionService.ts` | 239 | RBAC: role defaults + user overrides |
| `publicStatementService.ts` | ~64 | Isolated Supabase RPC for tokenized public statement (no db/supabase import in UI) |

### 4.6 Database Layer

**`lib/db.ts`** — `POSDatabase extends Dexie`, schema version **54**, 1,773 lines.
Key local-only tables: `sync_metadata`, `pending_syncs`, `sync_state` (tracks `last_seen_event_version` per branch), `localCredentials`, `localPasswords`.

**Supabase tables** (inferred): `stores`, `branches`, `products`, `users`, `entities`, `inventory_items`, `inventory_bills`, `transactions`, `bills`, `bill_line_items`, `bill_audit_logs`, `cash_drawer_accounts`, `cash_drawer_sessions`, `missed_products`, `journal_entries`, `balance_snapshots`, `chart_of_accounts`, `role_permissions`, `user_permissions`, `reminders`, `notifications`, `notification_preferences`, `employee_attendance`, `public_access_tokens`, `branch_event_log`.

**Only committed SQL migration:** `supabase/migrations/branch_event_log.sql` — creates the event log table, append-only RLS, indexes, and the `emit_branch_event` RPC.

---

## 5. Complete Data Flow

### 5.1 Write Path (Normal CRUD)
```
UI Component
  → useOfflineData() [OfflineDataContext]
    → operations/*.ts (pure functions, deps injected)
      → crudHelperService / transactionService / journalService
        → getDB() [Dexie / IndexedDB]  ← write, _synced: false
          → debouncedSync() / resetAutoSyncTimer()
            → syncService.uploadOnly() [upload local changes only]
              → per-batch: eventEmissionService.emit*() [AFTER confirmed upload]
                           supabase.rpc('emit_branch_event')
                → Other devices receive event via Supabase Realtime
                  → eventStreamService.catchUp() pulls affected records
```
> **Upload-then-emit rule:** Events are emitted from within `syncService.uploadLocalChanges()` only after each batch is confirmed uploaded. Events are never emitted directly from local write operations.
>
> **uploadOnly vs sync:** `performSync` / auto-sync calls `uploadOnly()` (no table-scan download). The full `sync()` method (upload + download) is used only during initial app hydration and explicit `fullResync()` calls.

### 5.2 Read Path (UI Hydration)
```
IndexedDB (Dexie)
  → crudHelperService.loadAllStoreData()
    → domain layer hooks (hydrate())
      → OfflineDataContext state
        → useOfflineData() in UI components
```

### 5.3 Real-Time Sync (Incoming Changes from Other Devices)
```
Supabase branch_event_log INSERT
  → Supabase Realtime WebSocket
    → eventStreamService (RealtimeChannel subscriber)
      → catchUpSync() [pull events WHERE version > last_seen_version]
        → fetch affected records from Supabase
          → upsert into IndexedDB
            → onEventsProcessed callback
              → useEventStreamLifecycle → refreshData()
                → hydrate() all domain layers → UI re-renders
```

### 5.4 Offline → Online Reconnect
```
navigator.onLine change / justCameOnline
  → useOfflineSyncLifecycle
    → syncService.sync() [upload unsynced]
    → eventStreamService.start() [catch-up by version]
    → refreshData()
```

### 5.5 Authentication Flow
```
SupabaseAuthContext:
  Online:  supabase.auth.signInWithPassword() → onAuthStateChange listener
           → fetch userProfile from `users` table
  Offline: localAuthService.authenticate() (bcrypt) → synthetic session
  Branch:  userProfile.branch_id used for all data filtering
```

### 5.6 Financial Transaction Write Path
```
UI action (e.g. payment, sale)
  → processPayment() / createBill() [via OfflineDataContext]
    → paymentOperations / billOperations
      → transactionService.createTransaction()
        → journalService.createJournalEntry() [double-entry]
        → cashDrawerUpdateService.update()
        → auditLogService.log()
        → IndexedDB (atomic, rollback on failure)
          → eventEmissionService.emitPaymentPosted()
```

---

## 6. Context Contract (What `useOfflineData()` Exposes)

The `OfflineDataContextType` (defined in `offlineDataContextContract.ts`) exposes:

**Data arrays:** `products`, `branches`, `suppliers`, `customers`, `employees`, `transactions`, `bills`, `billLineItems`, `inventory`, `inventoryBills`, `journalEntries`, `entities`, `chartOfAccounts`, `balanceSnapshots`, `stockLevels`, `missedProducts`, `billAuditLogs`, `notifications`

**CRUD methods:** For every domain listed above.

**Store settings:** `currency`, `exchangeRate`, `language`, `lowStockThreshold`, `receiptSettings`, `storeId`, `currentBranch`

**Sync:** `sync()`, `fullResync()`, `debouncedSync()`, `getSyncStatus()`, `unsyncedCount`

**Cash drawer:** `openCashDrawer()`, `closeCashDrawer()`, `processCashDrawerTransaction()`, `getCurrentCashDrawerBalance()`

**Payment:** `processPayment()`, `processSupplierAdvance()`, `processEmployeePayment()`

**Utilities:** `refreshData()`, `validateAndCleanData()`, `ensureDataReady()`, `getBranchById()`, `getGlobalLogos()`

**Undo:** `canUndo`, `undoLastAction()`, `pushUndo()`

---

## 7. Admin App Summary

- **Type:** Thin Supabase-only SPA. No IndexedDB, no sync layer.
- **Purpose:** Super-admin management of stores, branches, users, subscriptions, global products, global logos, analytics, role permissions.
- **Auth:** `AdminAuthContext` — simple Supabase session, no offline fallback.
- **Data:** Each page fetches independently from services on mount (no global cache).
- **Shared:** Uses `@pos-platform/shared` (the only consumer of the shared package).

---

## 8. Known Anti-Patterns & Technical Debt

### A. `any` Type Overuse — HIGH PRIORITY
`offlineDataContextContract.ts` has a file-level `eslint-disable @typescript-eslint/no-explicit-any` with **22 occurrences**. All major domain arrays (`inventory`, `bills`, `entities`, `journalEntries`, `chartOfAccounts`, etc.) are typed `any[]`. `storeId` is typed `any` instead of `string | null`. `syncService.ts` has a targeted `eslint-disable @typescript-eslint/no-explicit-any` (the previous blanket `@ts-nocheck` + `/* eslint-disable */` were removed; the targeted suppression remains because sync handles generic DB record shapes). **New code must not add `any` types. Existing `any` in the context contract should be narrowed to proper types when touching those files.**

### B. Deprecated `addSale()` Still Present — ✅ RESOLVED 2026-04-19
`addSale()` has been removed from the active code path. The correct path is `createBill()`.
The only residual occurrence is in `apps/store-app/src/lib/db_backup.ts` (see §8.R).
**Do not reintroduce `addSale()` under any circumstances.**

### C. Monolithic Service Files
- `syncService.ts` (1,333 lines — down from 2,862; internal split landed) — upload, deletion detection, hash comparison, dependency ordering still colocated.
- `transactionService.ts` (1,783 lines) — handles every transaction type plus journaling, cash drawer, and audit.
- `accountStatementService.ts` (1,410 lines) — complex client-side computation in one file.
- `eventStreamService.ts` (1,396 lines) — Realtime subscription, catch-up, version tracking, safety interval.
- `inventoryPurchaseService.ts` (1,333 lines) — inventory receive workflow.
- **Do not add more responsibility to these files. Extract into sub-services when adding new features.**

### D. Dexie Schema in One Giant File
`lib/db.ts` (1,773 lines) contains all 54 schema versions. No pruning or splitting strategy. **When adding new tables/indexes, follow the existing versioning pattern exactly. Always increment the version number.**

### E. `Home.tsx` Uses `setInterval` for Cash Drawer — ✅ RESOLVED 2026-04-19
The 60-second `setInterval` in `Home.tsx` has been removed. The page now reacts to context
state. **The no-polling principle (§III / CG-03) remains in force — do not reintroduce
`setInterval` for UI refresh.**

### F. `ensureDataReady` Polls at 100ms Internally
`OfflineDataContext` line ~658 polls `isDataReadyRef` every 100ms on startup. This is an acceptable one-time startup wait but is unusual. **Do not replicate this pattern.**

### G. `src/scripts/` Should Not Be in Source Tree — ✅ RESOLVED 2026-04-19
The `apps/store-app/src/scripts/` directory has been removed. **New migration scripts MUST
NOT be placed under `src/`. Put them under a top-level `scripts/` directory so they are
excluded from the production bundle.**

### H. Shared Package Underutilized
`packages/shared` is used only by admin-app. Store-app duplicates `referenceGenerator.ts` and `multilingual.ts` utilities, creating drift risk. **When adding shared utilities, add them to `packages/shared` and consume from there in both apps.**

### I. Dead Code: Duplicate Supabase Service Files
`supabaseService.ts` and `supabaseService.optimized.ts` (~120 lines each) exist as near-duplicates. Neither is the primary reference. **Do not import or extend these files. They should be deleted.**

### J. Dev-Only Pages in Production Router — ⚠ PARTIALLY RESOLVED 2026-04-19
`pages/TestAccounting.tsx` has been deleted. However, `pages/MigrationTest.tsx` still
exists in the pages directory with no environment-flag guard. **Do not add new dev-only
pages to the router. `MigrationTest.tsx` should be removed before production hardening.**

### K. `DevAccountingTestPanel.tsx` in Production Source — ✅ RESOLVED 2026-04-19
The component has been deleted from the source tree. **Do not reintroduce developer-only
panels without an env-flag guard.**

### L. Missing SQL Migrations for Core Schema
Only `branch_event_log.sql` is committed. The entire other Supabase schema is undocumented in the repo. **All new table definitions must be committed as SQL migrations in `supabase/migrations/`.**

### M. Multi-Tab Safety Not Handled
Multiple browser tabs on the same branch each run their own Dexie instance and `eventStreamService`. This can cause duplicate Realtime subscriptions and write races. **Be aware of this when planning features that involve concurrent sessions.**

### N. Single `netlify.toml` for Both Apps
The root `netlify.toml` attempts to handle both apps via a conditional build command. **Each new app should have its own Netlify site and per-app `netlify.toml`.**

### O. Public Statement Token Security
`/public/statement/:token` uses a URL token with unlimited lifetime and no rate limiting (documented in `docs/PUBLIC_STATEMENT_SECURITY_RECOMMENDATIONS.md`). **Any feature touching public tokens must consider token expiration and rate limiting.**

### P. `vite-react-typescript-starter` — Stale Package Name — ✅ RESOLVED 2026-04-19
`apps/store-app/package.json` now declares `"name": "@pos-platform/store-app"`.

### Q. Test Runner Duplication: Vitest + Jest Both Installed — ✅ RESOLVED 2026-04-19
Jest and its companions (`jest`, `jest-environment-jsdom`, `ts-jest`) have been removed
from `package.json`. **Vitest is the sole test runner. Do not reintroduce Jest.**

### R. `db_backup.ts` in `src/lib/`
`apps/store-app/src/lib/db_backup.ts` is a backup copy of the Dexie schema living in the
source tree. It is the last remaining carrier of the deprecated `addSale()` reference (see
§8.B). Backups belong outside `src/`. **Do not import from `db_backup.ts`. It should be
moved to an archive location or deleted once its contents are confirmed redundant with
`lib/db.ts` history.**

### S. Design-Doc Markdown Files Under `src/lib/`
`apps/store-app/src/lib/DEXIE_CONSOLIDATION_GUIDE.md` and `DEXIE_MIGRATION_HISTORY.md` sit
inside the source tree. Docs under `src/` risk bundler surprises and drift from the
canonical `docs/` folder. **New design docs MUST go in the repo-level `docs/` directory.
These two files should be moved there.**

---

## 9. Technology Stack Reference

### Store App Dependencies (Key)
| Library | Version range | Purpose |
|---------|--------------|---------|
| react | ^18 | UI framework |
| react-router-dom | ^7 | Routing |
| dexie | ^4 | IndexedDB ORM |
| @supabase/supabase-js | ^2 | Remote DB/Auth/Realtime |
| tailwindcss | ^3 | Styling |
| vite | ^7 | Build + dev server |
| electron | ^38 | Desktop runtime |
| electron-builder | latest | Desktop packaging |
| bcryptjs | latest | Offline auth |
| qrcode | latest | QR code generation |
| uuid | latest | ID generation |
| serialport / escpos / node-thermal-printer | latest | Receipt printing |

### Testing
- **Vitest** — unit tests (service layer; ~10 test files)
- **jest / ts-jest** also present (test runner duplication — should consolidate to Vitest)
- **Coverage is sparse:** services only; no tests for contexts, pages, or components

---

## 10. Code Review Checklist

When implementing any new feature, every item below must be verified:

- [ ] Data flows through offline-first pattern: `IndexedDB → OfflineDataContext → UI`
- [ ] UI imports only from `hooks/`, `services/`, `contexts/` — never `lib/db` or `lib/supabase`
- [ ] No `setInterval` for sync or UI refresh (except the one allowed in `eventStreamService`)
- [ ] Upload-then-emit contract respected: events emitted only from `syncService` after confirmed upload, never directly from local write operations
- [ ] All financial writes go through `transactionService.createTransaction()`
- [ ] Branch access controls enforced (`branch_id` in queries, RLS policies)
- [ ] RBAC checks via `rolePermissionService` for all user actions
- [ ] Client-side ledger computation only — no new server RPCs for account statements
- [ ] New Supabase tables have `store_id`, `created_at`, `updated_at`
- [ ] Sync-enabled tables have `_synced`, `_lastSyncedAt`, `_deleted`
- [ ] Schema changes include both SQL migration + IndexedDB version bump
- [ ] All user-facing text uses i18n utils (`createMultilingualFromString`, `getTranslatedString`)
- [ ] Currency handling goes through `currencyService`
- [ ] No new `any` types introduced
- [ ] All local-date extraction uses `getLocalDateString()` / `getTodayLocalDate()` — never `new Date().toISOString().split('T')[0]`
- [ ] No new migration/test scripts placed under `src/scripts/`
- [ ] No dead code (deprecated `addSale`, dev panels, duplicate service files) extended
- [ ] Utilities/types/constants used by both apps live in `@pos-platform/shared`, not duplicated (CG-13)
- [ ] New file under `services/` or `contexts/offlineData/operations/` ships with Vitest coverage (CG-12)
- [ ] Changes to sync-critical files (§3.XII list) pass `pnpm parity:gate` (CG-12)
- [ ] Undo payloads persist to `sessionStorage` only — never IndexedDB or `localStorage` (CG-14)

---

## 11. Event System Reference

### `branch_event_log` Table
Append-only. Columns: `id`, `store_id`, `branch_id`, `event_type`, `payload`, `version` (sequential per branch), `created_at`. RLS enforces branch isolation.

### Event Types (from `eventEmissionService.ts`)
`SALE_POSTED`, `PAYMENT_POSTED`, `INVENTORY_RECEIVED`, `ENTITY_UPDATED`, `PRODUCT_UPDATED`, `EMPLOYEE_UPDATED`, `SETTINGS_UPDATED`, `CASH_DRAWER_UPDATED`, `BILL_UPDATED`, `TRANSACTION_UPDATED`

### Catch-Up Mechanism
Each device tracks `last_seen_event_version` per branch in IndexedDB (`sync_state` table). On reconnect or Realtime event, `catchUpSync()` fetches all events WHERE `version > last_seen_version` and applies them.

---

## 12. spec-kit Integration

This section explains how every spec-kit command interacts with this constitution so that
AI agents produce consistent, constitution-compliant plans and tasks.

### 12.1 Command → Constitution Flow

| spec-kit command | Constitution sections consumed | Key action |
|-----------------|-------------------------------|------------|
| `/speckit.specify` | §3 (scope boundaries), §6 (context API surface) | Spec MUST NOT introduce flows that bypass §3 gates |
| `/speckit.plan` | §2.4 (Technical Context), §3 (gates), §4 (module locations), §5 (data flow), §9 (stack) | Fill Technical Context from §2.4; populate Constitution Check from §3 gates; ERROR on unjustified violations |
| `/speckit.tasks` | `plan.md` Constitution Check result; §4 (file paths), §2.2 (source tree) | Scope tasks to honour gate constraints; use exact file paths from §4 |
| `/speckit.implement` | `tasks.md` + `plan.md` | Implement without introducing new §3 violations |
| `/speckit.analyze` | All sections | Flag any inconsistencies between implementation and constitution |
| `/speckit.constitution` | This file | Amend, version, propagate to templates |

### 12.2 Constitution Check Gate Mapping

When `/speckit.plan` runs the **Constitution Check**, it MUST evaluate each feature against
these gates before proceeding past Phase 0 research:

| Gate ID | Principle | Violation condition (auto-fail) |
|---------|-----------|--------------------------------|
| CG-01 | Offline-First Data Flow | Feature reads/writes Supabase from UI, or writes Supabase before IndexedDB |
| CG-02 | UI Data Access Boundary | Feature imports `lib/db` or `lib/supabase` in `pages/`, `components/`, or `layouts/` |
| CG-03 | Event-Driven Sync | Feature adds `setInterval` for sync/refresh, OR emits events before confirmed upload, OR calls `syncService.sync()` from performSync/auto-sync instead of `uploadOnly()` |
| CG-04 | Financial Atomicity | Feature creates financial records without `transactionService.createTransaction()` |
| CG-05 | Client-Side Ledger | Feature adds a server-side RPC for account statement or balance computation |
| CG-06 | Branch Isolation | Feature exposes cross-branch data to non-admin users, or omits `branch_id` from queries |
| CG-07 | RBAC Enforcement | Feature skips `ProtectedRoute`, or omits `rolePermissionService` checks before user actions |
| CG-08 | Double-Entry Accounting | Feature creates monetary records without balanced journal entries via `journalService` |
| CG-09 | Schema Consistency | Feature adds Supabase tables missing required fields, or skips SQL migration or Dexie version bump |
| CG-10 | Multilingual | Feature hardcodes user-facing strings outside `createMultilingualFromString()` / `getTranslatedString()` |
| CG-11 | Local Date Extraction | Feature uses `new Date().toISOString().split('T')[0]` (UTC date) instead of `getLocalDateString()` / `getTodayLocalDate()` for any local-date comparison, filter default, form default, or report range |
| CG-12 | Testing Discipline | Feature adds a new file under `services/` or `contexts/offlineData/operations/` without an accompanying Vitest test, OR modifies a sync-critical file (§3.XII list) without `pnpm parity:gate` passing |
| CG-13 | Shared Package Source of Truth | Feature duplicates a utility/type/constant across `apps/store-app` and `apps/admin-app` instead of adding it to `packages/shared` |
| CG-14 | Undo Payload Storage Boundary | Feature writes undo payloads to IndexedDB/Dexie or `localStorage` instead of `sessionStorage` |

**Gate evaluation rules:**
- **PASS** — feature design does not trigger the violation condition.
- **FAIL (blocking)** — feature violates a gate. Plan MUST document justification and a
  simpler alternative rejected in the `Complexity Tracking` table. Agent MUST ERROR if no
  justification is provided.
- **N/A** — gate is genuinely inapplicable (e.g. CG-08 for a UI-only cosmetic feature);
  MUST be documented explicitly in the Constitution Check section of `plan.md`.

### 12.3 `plan.md` Section Alignment

When filling `plan.md` sections, map them to constitution sections as follows:

| `plan.md` section | Draw from constitution |
|-------------------|----------------------|
| Technical Context — Language/Version | §2.4 |
| Technical Context — Primary Dependencies | §2.4 |
| Technical Context — Storage | §2.4 + §4.6 |
| Technical Context — Testing | §2.4 + §9 |
| Technical Context — Target Platform | §2.4 |
| Technical Context — Project Type | §2.4 |
| Technical Context — Constraints | §2.4 |
| Constitution Check (14 gates) | §3 + §12.2 gate table |
| Project Structure → Source Code | §2.2 (exact paths) |
| Complexity Tracking (violations) | §8 (anti-patterns reference) |

### 12.4 `tasks.md` Phase Structure for This Project

The standard spec-kit task phases map to this codebase as follows:

| Phase | Purpose | Typical files in this project |
|-------|---------|-------------------------------|
| Phase 1: Setup | New domain files if any | `contexts/offlineData/operations/`, `services/` |
| Phase 2: Foundational | IndexedDB schema bump, Supabase migration | `lib/db.ts` (version bump), `supabase/migrations/` |
| Phase 3+: User Stories | Feature implementation per story | `pages/`, `components/`, `contexts/offlineData/` hooks |
| Final: Polish | i18n, RBAC guards, audit logging | `i18n/`, `components/rbac/`, `services/accessControlService.ts` |

**Foundational phase MUST always include (when applicable):**
- IndexedDB version bump in `lib/db.ts` (if new tables/indexes added)
- SQL migration file in `supabase/migrations/` (if new Supabase tables added)
- `offlineDataContextContract.ts` type additions (if new domain data exposed)
- `crudHelperService` SYNC_TABLES addition (if new sync-enabled table)

---

## 13. Governance

This constitution supersedes all other project documentation when conflicts arise. It is the ground truth for:
- AI planning tools (spec-kit, Cursor AI, Claude)
- Code review decisions
- Architecture debates
- New feature design

**To amend this constitution:**
1. Identify the section that needs updating
2. Document the reason for the change
3. Update the affected section
4. Bump the version and amendment date below

Any plan, spec, or task that would violate §3 (Core Architectural Principles) or §10 (Code Review Checklist) must be rejected or explicitly approved with documented justification.

---

**Version**: 1.5.0 | **Ratified**: 2026-03-22 | **Last Amended**: 2026-04-19
