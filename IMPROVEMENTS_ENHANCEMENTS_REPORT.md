# Improvements & Enhancements Report — POS Platform

**Scope:** Store-app (offline-first POS/ERP), admin-app (super-admin SPA), shared package.  
**Basis:** ARCHITECTURE_RULES.md, DEVELOPER_RULES.md, traced user flow (add product), db.ts data model, sync/event stack, auth/offline handling, admin-app routes and services.

**Heading markers (verified against repo, 2026-03-26):** `✅` = implementation matches the report’s “Implemented” claims. `⚠️` = delivered only in part or known follow-ups remain (details in section body). No marker = still open or not claimed done.

---

## Traced User Flow (Add Product) — Reference

**Route → Page → useOfflineData() → service/db → sync/event:**

1. **Route:** `router.tsx`: path `"inventory"` → `ProtectedRoute(module="inventory")` → `<Inventory />`.
2. **Page:** `pages/Inventory.tsx`: uses `useOfflineData()` for `products`, `addProduct`, `updateProduct`, etc.; on "Add Product" submits form and calls `await addProduct(data)` (line ~360).
3. **Context:** `OfflineDataContext.addProduct` (line ~3780):
  - `createId()` for product id;  
  - `crudHelperService.addEntity('products', storeId!, dataWithId)` → `db.products.add(entity)` (IndexedDB), then `triggerPostOperationCallbacks()` (refreshData, updateUnsyncedCount, resetAutoSyncTimer);  
  - `pushUndo(...)`;  
  - `resetAutoSyncTimer()`;  
  - `await emitProductEvent(productId, buildEventOptions(...))` → `eventEmissionService.emitProductUpdated(...)` → `supabase.rpc('emit_branch_event', ...)` (writes to `branch_event_log`).
4. **Sync:** Other clients subscribed to `branch_event_log` (Realtime) get a signal; `eventStreamService.catchUp()` pulls events by version and updates IndexedDB. Full sync (`syncService.sync()`) uploads unsynced rows in `SYNC_TABLES` order and downloads remote changes; triggered by refreshData/debounced timer or manual "Force Sync."

So: **UI → useOfflineData() → OfflineDataContext → crudHelperService + db → eventEmissionService (Supabase RPC)**. Event emission uses Supabase directly; upload of the product row happens in a later sync run.

---

## 1. Architecture

### 1.1 Data access rule violations (documented vs actual) ✅

- **Rules:** ARCHITECTURE_RULES.md and DEVELOPER_RULES.md state: UI must not import `db` or `supabase`; only `syncService` and authentication may use Supabase.
- **Actual violations in UI/public code:**
  - `pages/POS.tsx` — imports `getDB` (direct IndexedDB access).
  - `components/accountingPage/tabs/RecentPayments.tsx` — imports `getDB`.
  - `components/DevAccountingTestPanel.tsx` — imports `getDB`.
  - `pages/PublicCustomerStatement.tsx` — imports `supabase` (public route, no auth).
- **Observation:** The rules do not mention `eventEmissionService` or `eventStreamService`, which also use `supabase`. In practice, Supabase is used by: syncService, SupabaseAuthContext/SupabaseService, eventEmissionService, eventStreamService, employeeService (supabaseAdmin), qrCodeService, downloadOptimizationService, universalChangeDetectionService. So the documented “only syncService” is inaccurate; the real constraint is “no Supabase from **UI components**.”

**Recommendation:** (1) Update ARCHITECTURE_RULES.md and DEVELOPER_RULES.md to list allowed Supabase users (syncService, auth, eventEmissionService, eventStreamService, and the few other justified services). (2) Add an architectural test or ESLint rule that fails on `import ... from '../lib/db'` or `'../lib/supabase'` in any file under `pages/` or `components/` (with an explicit allowlist for ProtectedRoute, OfflineDataContext, SupabaseAuthContext, and public route handler if it is refactored to a dedicated service). (3) Refactor POS.tsx, RecentPayments.tsx, and DevAccountingTestPanel to use only `useOfflineData()` (or a dedicated hook that wraps context); refactor PublicCustomerStatement to use a small “public statement” service that is the only place calling Supabase for that feature.

**Implemented:** All four UI violations fixed — none of POS.tsx, RecentPayments.tsx, DevAccountingTestPanel.tsx, or PublicCustomerStatement.tsx import `getDB` or `supabase` any longer. ESLint `no-restricted-imports` rule enforces this in `eslint.config.js` covering `src/pages/`**, `src/components/**`, `src/layouts/**` — future violations are build-time errors. `@typescript-eslint/no-unused-vars` also updated with `argsIgnorePattern: '^_'` so underscore-prefixed intentional unused params are allowed.

### 1.2 Event emission vs upload ordering ✅

- **Observation:** In `addProduct`, the context (1) writes to IndexedDB via crudHelperService, (2) emits an event via `emitProductEvent` (Supabase RPC to `branch_event_log`). The actual **upload** of the product row to Supabase happens later in `syncService.uploadLocalChanges()`. So other devices can receive a “product_updated” event before the row exists in Supabase if they fetch by entity_id. eventStreamService fetches by event metadata (entity_type, entity_id) and then pulls from Supabase; if the row is not yet uploaded, the pull could miss it until the next sync or event.
- **Recommendation:** Document this “event-first, upload-later” ordering and ensure eventStreamService’s fetch logic retries or falls back to “pull by table + id” when the row is missing, or ensure upload runs immediately after emit for critical tables (e.g. queue a micro-sync for the single table after emit). Alternatively, change the contract so that events are emitted only after the record is confirmed uploaded (e.g. from syncService callback), at the cost of slightly delayed real-time signals.

**Implemented (Resolved):** The "upload-then-emit" contract is now the single authoritative pattern. Early pre-upload event emission has been removed from `productOperations.ts`, `entityOperations.ts`, and `employeeBranchOperations.ts`. Events for all tables are now emitted exclusively from `syncService.uploadLocalChanges()` after each batch is confirmed uploaded to Supabase. This guarantees that when Device B receives an event and fetches the record by entity_id, the row is already present in Supabase. The race condition (event before record exists) is eliminated.

### 1.3 OfflineDataContext as single orchestration blob ✅

- **Observation (historical):** OfflineDataContext was one very large file that owned store/branch state, all entity arrays, CRUD, sync, undo, and initialization. It was the natural place to wire `crudHelperService` callbacks.
- **Recommendation:** Split by domain into hooks under `contexts/offlineData/`; keep `OfflineDataContext` as a **composer** that calls those hooks and exposes a single `useOfflineData()` union API. `crudHelperService` remains one shared service (not split per domain).
- **1.3a — Domain layers + ops (done):** Twelve domain hooks are **composed in the provider** (not only present as files): `useProductDataLayer`, `useEntityDataLayer`, `useTransactionDataLayer`, `useBillDataLayer`, `useSyncStateLayer`, `useEmployeeDataLayer`, `useBranchDataLayer`, `useInventoryDataLayer`, `useAccountingDataLayer`, `useCashDrawerDataLayer`, `useStoreSettingsDataLayer`, `useNotificationsDataLayer`. **Store settings** (currency, language, receipt, low-stock, commission, etc.) and **bill read helpers** (`getBills`, …) live in the settings/bill layers, not as ad-hoc context-only state. Heavy CRUD lives in `contexts/offlineData/operations/*` (bills, payments, sales, inventory, undo, cash drawer atomics, etc.).
- **Ref / cycle-breaking pattern:** Sync UI state (`unsyncedCount`, `isSyncing`, `lastSync`, `isAutoSyncing`, debounced timeout) stays in the composer and is passed into `useSyncStateLayer` as an adapter. `**pushUndoRef`, `refreshDataRef`, `performSyncRef`, etc.** are assigned **after** `refreshData` / `pushUndo` / `useSyncStateLayer` are defined; **stable `useCallback` forwarders** (`stablePushUndo`, `stableRefreshData`, …) are passed into domain layers so hooks can be ordered without circular initialization. `useSyncStateLayer` wires `crudHelperService.setCallbacks`.
- **1.3b — Orchestration hooks (done):** Cross-cutting lifecycle that is not “one domain” is extracted into `contexts/offlineData/` orchestration hooks (imported by the composer only, not re-exported from `index.ts`): `useStoreSwitchLifecycle` (store switch → clear IndexedDB + reload), `useBranchBootstrapEffects` (admin/cashier/manager branch sync + `initializeBranch` + delayed switch to synced branch), `useOfflineInitialization` (`loadStoreData`, `ensureCashDrawerAccountsSynced`, `initializeData`, and the effect when both `storeId` and `currentBranchId` exist), `useOfflineSyncLifecycle` (connection restored, focus/visibility debounced sync, periodic auto-sync timer reset, debounced-sync timeout cleanup), `useEventStreamLifecycle` (start/stop `eventStreamService` + refresh callback), `useDerivedStockLevels` (derived stock levels from products + inventory + entities + settings).
- **Still in the composer:** `refreshData` (orchestrates all layer `hydrate` calls + small arrays `billAuditLogs` / `missedProducts`), **orchestration state** (`currentBranchId`, `branchSyncStatus`, readiness flags, `loading`, sync counters), **stable refs + context value assembly**, and **thin delegates** to ops modules. The context contract type lives in `offlineData/offlineDataContextContract.ts`.
- **Scale (approximate):** `OfflineDataContext.tsx` ~**1.07k** lines (composer + ops delegates + `refreshData`); `contexts/offlineData/` (layers + orchestration hooks + operations + context contract) is the bulk of the former monolith. Historical reference ~8.4k+ in one file. Line counts drift; use `wc -l` when updating this note.
- **1.3 status:** **Complete** for the intended split (12 domain layers + ops modules + orchestration hooks + thin composer + unchanged `useOfflineData()` API).

### 1.4 Admin-app vs store-app backend contract ✅

- **Observation:** Admin-app uses its own `lib/supabase.ts` (no shared generated `Database` type) and talks to Supabase only. It uses tables such as `stores`, `users`, `branches`, `store_subscriptions`; it does not use IndexedDB or sync. Store-app’s `types/database.ts` is the canonical **Supabase-oriented** typing for the POS app (not every remote table is declared; POS tables dominate).
- **Optional / future:** Generate a full shared `Database` from Supabase into `@pos-platform/shared` if you ever want **one** generated mirror of **all** tables — that is separate from the overlap contract below and not required for a sound v1.

**Strategy (why v1 is enough for now):** The overlap-first contract delivers **semantic alignment** between admin and store on shared columns, **avoids tight coupling** between apps and a giant generated blob, and keeps **IndexedDB / Dexie and POS-only concerns in store-app** — a sensible split for this codebase stage.

**Implemented:**

- `**@pos-platform/shared` = contract layer only:** Normative overlap types live in `packages/shared/src/types/supabase-core.ts` (`StoreCore`, `BranchCore`, `UserCore`, `StoreSubscriptionCore`). Other historical shapes (e.g. a legacy fat `Store` interface) were **removed from shared** — persistence-oriented store rows belong in **store-app** (`types/index.ts` for Dexie, `types/database.ts` for remote `Row` shapes), not in the shared package.
- **Admin-app:** `apps/admin-app/src/types/index.ts` — `Store`, `Branch`, `StoreUser` extend the shared cores; subscription types compose `StoreSubscriptionCore` where applicable (service layer maps UI vs DB field names when needed).
- **Store-app:** `types/database.ts` composes `**StoreCore`** / `**UserCore**` / `**BranchCore**` on the relevant `public.Tables` rows; full Dexie store record shape stays in store-app types (not re-exported from shared).
- **Subscriptions:** `**store_subscriptions` is admin-only** in practice — the POS app does not model that table in `database.ts`; `StoreSubscriptionCore` still documents overlap for admin and any future consumer.
- **Docs / process:** [specs/005-admin-store-backend-contract/](specs/005-admin-store-backend-contract/) (spec, plan, tasks, research audit, `data-model.md`, **quickstart** with release triage + `tsc`). `supabase-core.ts` documents an **extension matrix** (sync vs admin-only vs store-only).

**Handoff:** [spec.md](specs/005-admin-store-backend-contract/spec.md) · [plan.md](specs/005-admin-store-backend-contract/plan.md) · [tasks.md](specs/005-admin-store-backend-contract/tasks.md) · [quickstart.md](specs/005-admin-store-backend-contract/quickstart.md)

### 1.5 `Home.tsx` uses `setInterval` for cash drawer refresh (polling violation) ✅

- **Observation (historical):** `pages/Home.tsx` previously called `setInterval(() => loadCashDrawerStatus(), 60000)`.
- **Recommendation:** Remove the interval; rely on `cashDrawer` / `refreshData` and event-driven updates.

**Implemented:** The 60s `setInterval` is removed. Cash drawer status is loaded on relevant dependency changes and user actions (`loadCashDrawerStatus` in effects and handlers), not on a polling timer.

---

## 2. Code Quality

### 2.1 syncService.ts ✅

- **Observation (historical):** The file was very large (~2.8k+ lines), once carried `@ts-nocheck` / blanket ESLint disables, and had a config typo `largeTablPaginationSize`. Table order, dependency map, and upload/download/deletion logic lived in one module.
- **Recommendation:** Keep behavior stable; remove `@ts-nocheck` and file-wide ESLint blanket; fix naming and dead config; optionally split into `syncConfig.ts`, `syncUpload.ts`, `syncDownload.ts`, `syncDeletionDetection.ts`, and a thin orchestrator `syncService.ts`.

**Implemented (latest pass, 2026-03-27):**

- **No `@ts-nocheck`** in `syncService.ts`. **No file-level `eslint-disable`.** `apps/store-app/eslint.config.js` now scopes **`@typescript-eslint/no-explicit-any: 'off'`** to the sync module set only: `syncService.ts`, `syncConfig.ts`, `syncUpload.ts`, `syncDownload.ts`, `syncDeletionDetection.ts`.
- **Config:** Key is **`largeTablePaginationSize`** (correct spelling). Remote ID paging in deletion detection uses **`SYNC_CONFIG.largeTablePaginationSize`**. Removed unused **`SYNC_CONFIG`** entries: duplicate **`deletionBatchSize`**, **`incrementalSyncThreshold`**, **`validationCacheExpiry`**, **`debounceDelay`**, **`maxConcurrentBatches`**, **`connectionTimeout`**, **`retryDelay`** (nothing referenced them).
- **Dead code:** Removed unused private **`queryWithTimeout`** (never called).
- **`getTimestampField`:** Uses `(TABLES_WITH_UPDATED_AT as readonly string[]).includes(tableName)` instead of casting `tableName` with `any`.
- **`syncTable` download:** Dropped unreachable conditionals (e.g. `bills` normalization inside the stores/branches transaction branch; redundant branches/stores branches in the non-transaction path where `tableName` cannot be those tables).
- **Types:** **`PendingSync`** in `types/index.ts` includes optional **`payload`** and **`last_error`**, matching `db.addPendingSync` / `processPendingSyncs` usage.
- **Modular split completed:** `syncService.ts` is now a thin orchestrator with module extraction into:
  - `src/services/syncConfig.ts` (`SYNC_CONFIG`, `SYNC_TABLES`, `SYNC_DEPENDENCIES`, `SyncTable`, `SyncResult`, `DeletionState`, dependency validator)
  - `src/services/syncUpload.ts` (upload path + upload-only helpers + upload-then-emit event calls)
  - `src/services/syncDownload.ts` (download path + timestamp/store filter + conflict helpers)
  - `src/services/syncDeletionDetection.ts` (remote deletion detection + pagination/hash logic)
- **Contract stability preserved:** `syncService.ts` still exports `syncService`, `syncWithSupabase`, `getLastSyncedAt`, `setLastSyncedAt`, `SYNC_TABLES`, and `SyncResult` via re-export from `syncConfig.ts`.
- **Strict TS / dynamic access:** Targeted **`(supabase as any).from(...)`** and dynamic Dexie access **`(db as any)[tableName]`** remain only where table-name indirection requires it.
- **Boundary validation:** UI import boundary check confirms no `pages/` or `components/` imports from `syncUpload`, `syncDownload`, `syncDeletionDetection`.
- **Runtime verification:** `pnpm --filter ./apps/store-app run parity:gate` passes after modular split; focused eslint on touched sync files passes.

**Verification:** `eslint` on `syncService.ts` and extracted sync modules is clean; parity gate remains green after extraction.

**Still open / future:** Continue narrowing **`any`** in sync modules where practical without regressing dynamic table flows.

### 2.2 Global side effect in lib/supabase.ts ✅

- **Observation:** The file overrides `console.error` globally (lines 111–145) to suppress CORS/network errors when offline. This affects all code in the app that uses `console.error`.
- **Recommendation:** Avoid mutating global console. Options: (1) Use a small logger wrapper that checks `navigator.onLine` and the message and only then calls the original `console.error`; (2) Or suppress only inside the Supabase client’s `fetch` error path by catching and not rethrowing a custom “OfflineRequestBlocked” so callers can handle it without relying on console.

**Implemented:** The global `console.error` intercept block (original lines 111–145) has been removed from `lib/supabase.ts`. The file no longer patches or suppresses the global console; the two remaining `console.error` calls in the file are normal, scoped error logging (invalid URL format and a Supabase error helper).

### 2.3 createBaseEntity and crudHelperService ✅

- **Observation:** `crudHelperService.addEntity` uses `createBaseEntity(storeId)` from `lib/db.ts` to get default `id`, `created_at`, `updated_at`, `_synced`, `_deleted`; then merges with cleaned entity data. The `Database` type is used for table names and Insert shapes, but the actual entity is built with a generic "base" that may not match every table (e.g. not all tables have `updated_at`). Tables with different required fields are handled by the same generic path. The `updateEntity` method also had a hardcoded 5-table list instead of using the canonical `TABLES_WITH_UPDATED_AT` constant — meaning `updateEntity('entities', ...)` silently skipped setting `updated_at`, risking incremental sync misses.
- **Recommendation:** Either (1) narrow `addEntity` so that per-table required fields are enforced (e.g. overloads or a map of table → base factory), or (2) document that callers must pass a full Insert-compatible object and createBaseEntity only fills in id and sync/timestamps; then add runtime checks for required fields before `db[tableName].add(entity)`.

**Implemented:** Applied option (2) using `TABLES_WITH_UPDATED_AT` (from `universalChangeDetectionService.ts`) as the single source of truth across all three write paths in `crudHelperService`:
- `addEntity`: strips `updated_at` from the merged entity when the target table is not in `TABLES_WITH_UPDATED_AT` (guards tables like `transactions` and `journal_entries` that have no `updated_at` column).
- `updateEntity`: replaced hardcoded 5-table list with `TABLES_WITH_UPDATED_AT` — fixes the silent miss where `updateEntity('entities', ...)` was not stamping `updated_at` even though `entities` is an incremental-sync table.
- `bulkAddEntities`: conditionally includes `updated_at: now` based on `TABLES_WITH_UPDATED_AT` instead of always stamping it.

### 2.4 Error handling and validation ✅ Implemented (007-error-handling-validation)

- **Observation:** Services throw strings or `new Error(...)` with varying messages; no shared error code or type. Validation is spread across transactionService, journalService, crudHelperService, and UI. PUBLIC_STATEMENT_SECURITY_RECOMMENDATIONS.md describes security improvements but the public statement page still uses supabase directly and token handling is client-side.
- **Recommendation:** Introduce a small `AppError` type (e.g. `{ code: string; message: string; details?: unknown }`) and use it in services; handle in a single place in UI (e.g. toast or error boundary). Consolidate validation for critical paths (e.g. transaction creation, journal entry creation) in one module. Harden public statement per the security doc (server-side tokens, RLS, no client-only filtering).
- **Implementation notes (branch `007-error-handling-validation`):**
  - `apps/store-app/src/types/errors.ts` — zero-dependency leaf module: `ErrorCategory`, `AppErrorCode` (22 codes), `AppError`, `FieldViolation`, `ValidationResult<T>`, `ErrorNotification`.
  - `apps/store-app/src/services/businessValidationService.ts` — `toAppError()` converts any thrown value to a typed `AppError`; `makeAppError()` creates structured errors from code; `validateTransactionCreation()`, `validateJournalEntryCreation()`, `validateBillCreation()` consolidate all pre-write rules.
  - `apps/store-app/src/contexts/ErrorNotificationContext.tsx` + `src/hooks/useErrorHandler.ts` — centralized React notification channel; `handleError(e)` replaces all `console.error()` calls across 9 page files.
  - `apps/store-app/src/components/common/ErrorToastContainer.tsx` — toast UI with three visual variants by `ErrorCategory`; Tailwind + RTL-safe; i18n-resolved messages.
  - i18n keys added to all three locale files (`en.ts`, `ar.ts`, `fr.ts`) under `errors.*` namespace.
  - `supabase/migrations/add_expires_at_to_public_access_tokens.sql` — adds `expires_at` column and updates `get_customer_by_token` RPC to reject expired tokens server-side.
  - `apps/store-app/src/services/publicStatementService.ts` — returns typed `TokenResult` union; maps expired tokens to `STATEMENT_TOKEN_EXPIRED` AppError.
  - 51 Vitest unit tests: `useErrorHandler.test.ts` (33 tests) + `businessValidationService.test.ts` (18 tests). All pass. Parity gate green.

### 2.5 `offlineDataContextContract.ts` — pervasive `any[]` types ✅

- **Observation:** `contexts/offlineData/offlineDataContextContract.ts` has a file-level `/* eslint-disable @typescript-eslint/no-explicit-any */` and contains **22 `any[]` / `any;`** occurrences. The entire public surface of `useOfflineData()` is loosely typed: `inventory: any[]`, `bills: any[]`, `entities: any[]`, `journalEntries: any[]`, `chartOfAccounts: any[]`, `balanceSnapshots: any[]`, `storeId: any` (should be `string | null`), etc. This means IDE autocompletion and TypeScript's compiler offer no safety checks for any consumer of the context.
- **Impact:** Any component or hook that destructures from `useOfflineData()` gets untyped values. Bugs (misspelled field names, wrong shape assumptions) are silently accepted at compile time. This is the largest type-safety gap in the codebase.
- **Recommendation:** Replace each `any[]` with the corresponding strongly-typed array imported from `types/database.ts` or `types/index.ts` (e.g. `Product[]`, `Entity[]`, `Bill[]`, `JournalEntry[]`, `Transaction[]`). Replace `storeId: any` with `storeId: string | null`. Remove the file-level eslint-disable once all `any` usages are gone. Do this incrementally: start with the most-used arrays (`products`, `entities`, `bills`), then the financial arrays. Each change will surface any type mismatches in consumer components which should be fixed.

**Implemented (this pass):**

- Tightened `storeId` to `string | null`.
- Replaced the contract’s public `any`/`any[]` fields with existing domain types from `types/database.ts` / `types/index.ts` (and small local helper shapes for derived/computed view models).
- Removed the file-level eslint disable by eliminating all explicit `any` usages in the contract.
- Kept the contract methods in place for compatibility, using `unknown` where the underlying code still accepts flexible JSON payloads.

### 2.6 Deprecated `addSale()` API surface still present ✅

- **Observation:** `addSale()` is marked `@deprecated` inside `OfflineDataContext` and is still exported in `offlineDataContextContract.ts`. The correct replacement path is `createBill()`. There is no mechanism (eslint rule or TS deprecation) that prevents new callers from using it.
- **Recommendation:** (1) Add `/** @deprecated Use createBill() instead. */` JSDoc on the contract definition so IDEs surface the deprecation at call sites. (2) Audit all call sites of `addSale()` and migrate them to `createBill()`. (3) Once no callers remain, remove `addSale()` from the context contract and from `saleOperations.ts`.

**Implemented:**

- `addSale()` had zero UI callers — all sales flow through `createBill()` already.
- Removed `addSale` function from `saleOperations.ts` (143 lines of dead code).
- Removed the context wrapper, fallback stub, and context-value wire-up from `OfflineDataContext.tsx`.
- Removed the `addSale` entry from `offlineDataContextContract.ts`.
- `updateSale` and `deleteSale` are actively used (Accounting page, SoldBills component) and remain unchanged.

### 2.7 Test runner duplication: Vitest + Jest both installed ✅

- **Observation:** `apps/store-app/package.json` lists both `vitest` (in devDependencies) and `jest`, `jest-environment-jsdom`, `ts-jest` (also in devDependencies). Two test runners serving the same function increases install time, creates configuration ambiguity, and risks test output inconsistencies across CI vs local.
- **Recommendation:** Consolidate on **Vitest** (already integrated in `vite.config.ts`). Remove `jest`, `jest-environment-jsdom`, and `ts-jest` from `package.json`. Migrate any Jest-specific test syntax to Vitest equivalents (mostly a drop-in for `describe`/`it`/`expect`; `vi.mock` replaces `jest.mock`). Verify `src/test/setup.ts` is sufficient as the Vitest setup file.

**Implemented (this pass):**

- Removed Jest-related devDependencies from `apps/store-app/package.json`.
- Deleted the leftover `apps/store-app/package-lock.json` that still contained Jest entries (project continues to run tests via `pnpm`/Vitest).

**Follow-up risk:** `apps/store-app/netlify.toml` still uses `npm install --include=dev`, so Netlify builds may reintroduce a lockfile unless the deployment workflow is aligned to `pnpm` + `--frozen-lockfile`.

### 2.8 Stale `package.json` `name` field in store-app ✅

- **Observation:** `apps/store-app/package.json` has `"name": "vite-react-typescript-starter"` — the default scaffolded name from the Vite template. This is misleading and can cause issues with tooling that uses the package name for identification (e.g. `pnpm` workspace resolution, electron-builder `appId` derivation).
- **Recommendation:** Rename to `"name": "souq-pos"` (or `"@pos-platform/store-app"` to align with the monorepo naming convention used by `@pos-platform/shared`).

**Implemented:** Renamed to `"@pos-platform/store-app"` — consistent with the `@pos-platform/shared` workspace package naming convention.

---

## 3. Modularity & Coupling

### 3.1 OfflineDataContext ↔ crudHelperService

- **Observation:** crudHelperService is a singleton that receives callbacks via `setCallbacks()`. Only OfflineDataContext sets these (on mount). The callbacks are: onRefreshData, onUpdateUnsyncedCount, onDebouncedSync, onResetAutoSyncTimer. So crudHelperService is tightly coupled to the context’s refresh and sync behavior; no other consumer can use it with different behavior.
- **Recommendation:** Prefer dependency injection: pass a “store writer” interface into crudHelperService (e.g. `{ afterWrite(): Promise<void> }`) so that the same helper can be used from tests or from a different orchestrator. Alternatively, keep the callback pattern but document it and ensure only OfflineDataContext (or a single “data coordinator”) sets callbacks.

### 3.2 Sync and event dependencies

- **Observation:** syncService imports getDB, supabase, dataValidationService, universalChangeDetectionService, eventEmissionService. eventStreamService imports supabase and getDB. eventEmissionService imports only supabase. OfflineDataContext imports syncService, eventStreamService, crudHelperService, eventEmissionHelper, and many other services. The dependency graph is deep and mostly implicit (no DI container).
- **Recommendation:** Draw an explicit dependency diagram (e.g. in docs): “UI → OfflineDataContext → [crudHelper, transactionService, journalService, …]; OfflineDataContext → eventEmissionHelper → eventEmissionService → supabase; syncService ↔ getDB, supabase; eventStreamService ↔ supabase, getDB.” Then isolate “sync + event” behind a single facade (e.g. `SyncOrchestrator`) that OfflineDataContext and eventStreamService use, so that the rest of the app does not depend on syncService/eventStreamService directly except for “trigger sync” and “on events processed.”

### 3.3 Duplication between store-app and shared ✅

- **Observation:** packages/shared exports referenceGenerator, multilingual, paymentCategories. Store-app may still duplicate some utilities locally.
- **Recommendation:** Prefer imports from `@pos-platform/shared` for shared modules; delete or narrow local duplicates.

**Implemented:** `apps/store-app/package.json` lists `"@pos-platform/shared": "workspace:*"`. The local `apps/store-app/src/utils/referenceGenerator.ts` duplicate has been removed; only `packages/shared/src/utils/referenceGenerator.ts` remains. A future file-by-file audit can confirm no other duplicates exist.

---

## 4. Infrastructure

### 4.1 Netlify build and publish directory

- **Observation:** Root `netlify.toml` uses a single command that builds either admin-app or store-app based on site name/URL; publish is set to `apps/admin-app/dist`. The command copies store-app’s dist into `apps/admin-app/dist` when building store-app, so the publish dir is reused for both. This is brittle and confusing.
- **Recommendation:** Use two Netlify sites (e.g. “pos-store” and “pos-admin”) with explicit base directory and publish dir per app: store-app → base `apps/store-app`, publish `apps/store-app/dist`; admin-app → base `apps/admin-app`, publish `apps/admin-app/dist`. Remove the conditional copy from the root command so each site’s config is self-contained.

### 4.2 Environment variables ✅

- **Observation:** Store-app expects VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, optional VITE_SUPABASE_SERVICE_ROLE_KEY, VITE_PUBLIC_URL. Admin-app expects VITE_SUPABASE_*, VITE_API_URL, VITE_APP_TITLE. No `.env.example` or `.env.sample` in the repo; DOMAIN_DEPLOYMENT_GUIDE.md mentions env vars.
- **Recommendation:** Add `.env.example` at repo root (and/or per app) listing every variable with a short comment and a placeholder value (no secrets). Document which vars are required for store vs admin.

**Implemented:** Both `apps/store-app/.env.example` and `apps/admin-app/.env.example` are present, listing each required variable with placeholder values and short comments.

### 4.3 Database migrations ⚠️

- **Observation:** README may still reference migration filenames that are not all present. Schema remains primarily reflected in TypeScript (store-app’s `types/database.ts` and `lib/db.ts` Dexie versioning).
- **Recommendation:** Commit authoritative SQL migrations or document where they live externally.

**Implemented (partial):** The repo contains `supabase/migrations/branch_event_log.sql` (and related feature work). A full historical `001_initial_schema.sql` / seed set may still be missing — treat this as incremental progress, not complete migration coverage.

### 4.4 `src/scripts/` — migration artifacts inside the production source tree ✅

- **Observation (historical):** `apps/store-app/src/scripts/` contained 11 browser-runnable TypeScript scripts (migration and verification utilities).
- **Recommendation:** Move all scripts to a top-level `scripts/` directory (at the monorepo root or per-app root), outside `src/`. Add an exclusion in `tsconfig.app.json` (`exclude: ["src/scripts"]`) so the build does not process them. Once migrations are confirmed complete in all environments, delete the scripts from the repo entirely.

**Implemented:** The `apps/store-app/src/scripts/` directory has been removed entirely. No migration scripts remain in the production source tree.

### 4.5 `supabaseService.ts` vs `lib/supabase.ts` ✅

- **Observation:** `SupabaseService` in `services/supabaseService.ts` is imported by `SupabaseAuthContext` (auth/session helpers), while sync and events use the client from `lib/supabase.ts`. A second file `supabaseService.optimized.ts` may still exist or have been removed — verify with `rg`.
- **Recommendation:** Consolidate on one client surface if the split causes confusion; do not duplicate auth logic.

**Status:** Not “dead code” for `supabaseService.ts` while `SupabaseAuthContext` imports it. Any truly unused `*.optimized` variant should be deleted after confirming zero imports.

### 4.6 Dev-only pages and panels in production router/source ⚠️

- **Observation (historical):** Three development-only artifacts existed: `pages/TestAccounting.tsx`, `pages/MigrationTest.tsx`, and `components/DevAccountingTestPanel.tsx`.
- **Recommendation:** (1) Remove `TestAccounting` and `MigrationTest` from `router.tsx` and delete the page files. (2) Either delete `DevAccountingTestPanel.tsx` or gate it behind `import.meta.env.DEV` so it tree-shakes out of production builds. (3) Add a `VITE_ENABLE_DEV_TOOLS=true` pattern for any future dev-only UI so it is consistently excluded from production.

**Implemented (partial):** `TestAccounting.tsx` and `DevAccountingTestPanel.tsx` have been deleted; `router.tsx` no longer registers `/test-accounting`. `pages/MigrationTest.tsx` remains as an orphan file — its contents are fully commented out and no module imports it, so it is not bundled, but the file should still be removed to keep the source tree clean.

---

## 5. Scalability Constraints

### 5.1 In-memory state in OfflineDataContext

- **Observation:** The context holds full arrays for products, entities, transactions, bills, billLineItems, journalEntries, etc., and re-reads them from Dexie on refreshData() or when eventStreamService processes events. For a store/branch with very large tables (e.g. tens of thousands of transactions or journal entries), loading everything into React state can cause slow first load and heavy re-renders.
- **Recommendation:** For large tables, avoid holding the full list in context state. Options: (1) Expose “query” APIs from context (e.g. `getTransactions(filters, pagination)` that read from Dexie on demand and return a slice); (2) Or keep context state as “refs + version” and let pages use a hook that subscribes to a slice (e.g. “transactions for this month”) so only that slice is in state. Keep small reference data (products, entities, branches) in context as today.

### 5.2 Sync and event throughput

- **Observation:** syncService runs one sync at a time (isRunning guard); upload iterates SYNC_TABLES and for each table fetches all unsynced/deleted rows and uploads in batches. eventStreamService processes events sequentially per branch and fetches affected records from Supabase. For a burst of many local changes (e.g. bulk import), upload can take a long time and event emission can call Supabase RPC many times (one event per product in addProduct flow).
- **Recommendation:** (1) For bulk operations, use the existing bulk event emitters (e.g. emitProductsBulkUpdated) and ensure all bulk paths use them. (2) Consider batching event emission (e.g. queue events and flush every N ms or M events) to reduce RPC calls when many entities change in a short window. (3) Document or add a “sync queue” so that rapid CRUD does not trigger too many debounced syncs; one sync after a burst may be enough.

### 5.3 Dexie schema versioning

- **Observation:** db.ts uses a single linear version (54) with one big `.stores({ ... })` and upgrade. Future schema changes require bumping the version and adding migration logic; the file is already large and any new table or index touches the same constructor.
- **Recommendation:** Keep a single version number but extract the schema definition to a separate module (e.g. `dbSchema.ts`) that exports the version and the store definitions, so the POSDatabase constructor stays short. For complex migrations, use Dexie’s upgrade to run data migrations in a separate function rather than in the same block as the schema.

### 5.4 Multi-tab and concurrency

- **Observation:** Two tabs of store-app on the same branch each have their own Dexie instance and their own eventStreamService subscription. There is no cross-tab coordination (e.g. BroadcastChannel or shared worker). Last-write-wins when both upload the same entity; sync and event processing are per-tab.
- **Recommendation:** Document that multi-tab is “best effort” and not guaranteed consistent. If stronger guarantees are needed, consider a single “worker” tab that owns sync and broadcasts state to other tabs, or use a shared worker for Dexie/sync so only one process handles writes and sync.

---

## 6. Time & Timezone Handling

> **Root cause:** The codebase has a single correct date utility (`getLocalDateString` in
> `utils/dateUtils.ts`) but it is used inconsistently. Wherever `new Date().toISOString().split('T')[0]`
> is used to produce "today's date" for filtering or defaulting form fields, it produces the
> **UTC date**, not the local calendar date. For users in UTC+ timezones (Lebanon/Middle East
> is UTC+2/+3), this means the "day boundary" is wrong from midnight until 2–3 AM local,
> causing bills, sales, and inventory records created in those hours to appear on the wrong day
> or be excluded from "today's" dashboard metrics and reports.

### 6.1 Bill creation timestamp — UTC date boundary (reported bug) ✅

- **Root cause:** `createBill` in `billOperations.ts` (line ~431) sets `bill_date: new Date().toISOString()` and `created_at: new Date().toISOString()`. Supabase and IndexedDB store the UTC ISO-8601 string — e.g. `"2026-03-21T22:00:00.000Z"` — which is correct for storage. The problem is **downstream filtering and display defaults** that extract the date portion using `.toISOString().split('T')[0]` (UTC date) rather than `getLocalDateString()` (local date).
- **Concrete scenario:** A Lebanese cashier (UTC+2) creates a bill at 11:00 PM local (= 21:00 UTC). During the 10 PM–11:59 PM local window (UTC+2), `new Date().toISOString().split('T')[0]` already returns the **next** UTC day, so the bill's displayed date in dashboard metrics and report filters shows as **tomorrow** even though it was just created. A UTC+3 user has a 3-hour affected window (9 PM–11:59 PM local).
- **Fix:** Replace every instance of `new Date().toISOString().split('T')[0]` that is used as a "local today" date with `getLocalDateString(new Date().toISOString())` from `utils/dateUtils.ts`. The utility already exists and is correct.

**Implemented:** `createBill` / bill posting paths use `getLocalDateString(...)` for calendar-day fields where applicable (`billOperations.ts`).

### 6.2 Home dashboard "Today" metrics use UTC date boundary ✅

- **Location:** `pages/Home.tsx` lines 94, 98, 104, 110, 562, 570.
- **Observation:** `const today = useMemo(() => new Date().toISOString().split('T')[0], [])` computes the UTC date. "Today's Sales" and "Today's Expenses" cards filter transactions by comparing `createdAt.split('T')[0] === today` — both sides use UTC, so they are internally consistent but both wrong for users east of UTC. Any transaction from midnight to 2–3 AM local appears on the **previous** UTC day in the dashboard.
- **Recommendation:** `const today = useMemo(() => getLocalDateString(new Date().toISOString()), [])`. Apply the same fix to every filter that derives a "current day" comparison string.

**Implemented:** `Home.tsx` uses `getTodayLocalDate()` and `getLocalDateString(...)` for transaction/sale day filters.

### 6.3 Report date range defaults produce UTC dates ✅

- **Locations:**
  - `components/reports/ProfitLossReport.tsx` lines 35–36 (`startDate`, `endDate` defaults)
  - `pages/PublicCustomerStatement.tsx` lines 52–53 (`start`, `end` defaults)
  - `components/ActivityFeed.tsx` lines 60–61 (`start`, `end` defaults)
- **Observation:** All three components initialise their date range inputs with `new Date().toISOString().split('T')[0]` as "today". This creates a **mixed-timezone comparison bug**: `useBillDataLayer` uses `getLocalDateString()` to extract the local date from stored timestamps, then compares against these UTC-derived strings. A bill created at 1 AM local on March 22 has `getLocalDateString(bill_date) = "2026-03-22"` but the report's default `endDate = "2026-03-21"` — so the bill is **silently excluded** from the current day's report even though it exists in the database and displays as "March 22" in the bill list.
- **Recommendation:** Replace all report/filter default date initialisations with `getLocalDateString(new Date().toISOString())`. Consider extracting a `getTodayLocalDate()` helper for clarity.

**Implemented:** `ProfitLossReport.tsx`, `PublicCustomerStatement.tsx`, and `ActivityFeed.tsx` use `getTodayLocalDate()` / `getLocalDateString()` for defaults and exports.

### 6.4 Form field defaults store the wrong date for inventory and payments ✅

- **Locations:**
  - `hooks/useInventoryForms.ts` lines 92, 177 — `received_at` default (comment even says "Today's date in YYYY-MM-DD format" but uses UTC)
  - `components/accountingPage/tabs/SupplierAdvances.tsx` lines 71, 223, 268 — `date` form field default
  - `components/accountingPage/tabs/ReceivedBills.tsx` line 192 — fallback `received_at` value
- **Observation:** When a user opens an inventory receive form or a supplier advance form after midnight local time (but still the same UTC day), the pre-filled "today's date" field shows the **previous local day**. If the user does not notice and submits, the record is permanently stored with the wrong date, causing discrepancies in inventory reports and payment ledgers.
- **Recommendation:** Replace `new Date().toISOString().split('T')[0]` with `getLocalDateString(new Date().toISOString())` in all form field default initialisations.

**Implemented:** `useInventoryForms.ts` (defaults), `SupplierAdvances.tsx`, and `ReceivedBills.tsx` use `getTodayLocalDate()` / `getLocalDateString()` as appropriate.

### 6.5 Balance snapshot scheduler tags snapshots with UTC date ✅

- **Location:** `services/snapshotSchedulerService.ts` lines 104, 124.
- **Observation:** The scheduler computes `currentTime` using `now.getHours()` / `now.getMinutes()` (local timezone — correct for triggering at the right time) but then computes `currentDate = now.toISOString().split('T')[0]` (UTC date — wrong). Snapshots taken at midnight–2:59 AM local (UTC+2) are tagged with the **previous** UTC day, causing a one-day mismatch when `snapshotService.ts` looks up a snapshot by date using `getLocalDateString`.
- **Recommendation:** Replace `currentDate = now.toISOString().split('T')[0]` with `currentDate = getLocalDateString(now.toISOString())`.

**Implemented:** `snapshotSchedulerService.ts` uses `getLocalDateString` / `getTodayLocalDate()` for tagging and target dates.

### 6.6 No centralised `getTodayLocalDate()` helper ✅

- **Observation:** `getLocalDateString` in `utils/dateUtils.ts` is the correct building block, but callers must pass an ISO string to it. The anti-pattern `new Date().toISOString().split('T')[0]` appears in **at least 9 distinct locations** because there is no zero-argument convenience function to make the correct path as easy as the broken one.
- **Recommendation:** Add to `utils/dateUtils.ts`:
  ```ts
  export function getTodayLocalDate(): string {
    return getLocalDateString(new Date().toISOString());
  }
  ```
  Then do a codebase-wide replacement of `new Date().toISOString().split('T')[0]` with `getTodayLocalDate()` everywhere the intent is "today in the user's local timezone." This single change fixes §6.1 through §6.5 in one pass.

**Implemented:** `getTodayLocalDate()` exists in `utils/dateUtils.ts` and is used across the app for “today” defaults. The anti-pattern remains only in non-bundled `apps/store-app/src/scripts/`* utilities (demos/benchmarks), not in production pages/components.

---

## 7. Cash Drawer Sync & Balance Correctness

> **Reported bug:** Cash drawer balance does not reflect the correct amount after transactions
> are recorded, after coming back online, or when viewed from a second device.
>
> **Root cause summary:** There is no single canonical balance model. Two calculation paths
> (`getCurrentCashDrawerBalance` vs `getCurrentCashDrawerBalances`) use different math, the
> result is cached without invalidation, and `cashDrawer.currentBalance` in React context is
> frozen at the opening float and never updated during the session.

### 7.1 Balance cache not invalidated after transactions — 30-second stale window ✅

- **Location:** `services/cashDrawerUpdateService.ts:234–258`; `utils/cacheManager.ts` TTL.LONG = 30,000 ms.
- **Observation:** `getCurrentCashDrawerBalance` and `getCurrentCashDrawerBalances` both use `CacheManager.withCache(key, TTL.LONG, ...)` with a 30-second TTL. Neither `journalService` (which writes the journal entries that back the balance) nor any transaction operation calls `CacheManager.invalidate` on the balance cache key after writing. The balance shown in the UI can lag up to **30 seconds** behind reality after any sale, payment, or cash adjustment.
- **Recommendation:** Call `CacheManager.invalidate` for the relevant balance cache keys inside `journalService.createJournalEntry()` (or the transaction service commit path). Alternatively reduce the TTL for balance keys to 0 since the calculation is a fast IndexedDB aggregate.

**Implemented:** `journalService` calls `CacheManager.invalidate` on balance cache keys after journal writes.

### 7.2 Two inconsistent balance calculation models used in different places ⚠️

- **Observation:** The codebase uses two separate functions that produce different numbers for "current balance":
  1. `calculateCashDrawerBalance` (`utils/balanceCalculation.ts:203`) — sums **all posted journal entries** for account `1100` across all time, ignoring session boundaries and the opening float.
  2. `getCurrentCashDrawerBalances` (`services/cashDrawerUpdateService.ts:319`) — sums journals **within the current session window** and **adds the opening float**. This is what Home shows.
- `refreshCashDrawerStatus` in `lib/db.ts:749` uses model (1). `getCurrentCashDrawerBalance` in `OfflineDataContext.tsx:434` also uses model (1). Undo operations and payment atomics read `account.current_balance` (a stale field on the `cash_drawer_accounts` row) as the rollback baseline — a third model.
- **Impact:** Components reading `raw.cashDrawer.currentBalance` see a different number than Home. Rollback math uses a stale persisted field.
- **Recommendation:** Standardise on the session-scoped model (2) as the single canonical balance. Replace all model (1) references in display and atomics paths with calls to `getCurrentCashDrawerBalances`. Delete or clearly rename the non-canonical helper.

**Implemented (primary paths):** `cashDrawerUpdateService.getCurrentCashDrawerBalance` delegates to `getCurrentCashDrawerBalances` (session + opening float). `lib/db.ts` `getCurrentCashDrawerStatus` inlines the same session-scoped formula. `OfflineDataContext` exposes balance via `getCurrentCashDrawerBalances` for the active branch.

**Open (residual):** `calculateCashDrawerBalance` in `balanceCalculation.ts` still sums **all-time** 1100 journals for a branch (no session window) and is imported by some services (`inventoryPurchaseService`, `paymentOperations`, `useCashDrawerDataLayer`, etc.). Prefer session-scoped helpers for anything user-visible; audit remaining call sites if numbers must match Home.

### 7.3 `cashDrawer.currentBalance` in React context frozen at opening amount ✅

- **Location:** `contexts/offlineData/useCashDrawerDataLayer.ts:69–76`.
- **Observation:** On session open, context state is set to `{ currentBalance: amount, ... }` (the opening float) and is **never updated** as transactions happen. Any component reading `useOfflineData().cashDrawer.currentBalance` directly always shows the opening float, not the live balance.
- **Recommendation:** Either remove `currentBalance` from the context shape and force all consumers to call `getCurrentCashDrawerBalances`, or refresh it in the post-CRUD callbacks after every transaction that touches the cash drawer.

**Implemented:** `useCashDrawerDataLayer`’s `refreshCashDrawerStatus` loads `currentBalance` from `getDB().getCurrentCashDrawerStatus` (live session-scoped balance), not the opening float only. `openCashDrawer` still sets an initial state then calls `refreshCashDrawerStatus()`.

### 7.4 Wrong account used for balance currency in multi-branch stores ✅

- **Location:** `contexts/OfflineDataContext.tsx:437–441`.
- **Observation:** The account lookup is:
  ```ts
  .where('store_id').equals(sid).and(account => account.is_active).first()
  ```
  This fetches the first active account for the **store** without filtering on `branch_id`. In a multi-branch store, it returns the wrong branch's account and therefore uses the wrong **currency** for the balance calculation, even though `currentBranchId` is passed correctly to `calculateCashDrawerBalance`.
- **Recommendation:** Add `.and(a => a.branch_id === currentBranchId)` to the account query.

**Implemented:** `getCashDrawerAccount` / `getCurrentCashDrawerStatus` query by `[store_id+branch_id]` (and session helpers filter by branch).

### 7.5 No real-time event emitted for intra-session cash transactions ✅

- **Location:** `services/eventEmissionService.ts:194–231`.
- **Observation:** Only session open/close events exist (`emitCashDrawerSessionOpened`, `emitCashDrawerSessionClosed`). There is no event for individual sales, payments, or cash adjustments that affect balance **within** a session. Other devices receive no real-time signal when the balance changes — they learn about it only through the 5-minute catch-up or the next manual sync.
- **Recommendation:** Add `emitCashDrawerTransactionPosted` or include balance-affecting context in existing `PAYMENT_POSTED` / `SALE_POSTED` event payloads so all devices update in near-real-time.

**Implemented:** `eventEmissionService.emitCashDrawerTransactionPosted` exists (alongside session-open/close).

### 7.6 `NaN` balance risk: missing `|| 0` guards on currency arithmetic ✅

- **Location:** `utils/balanceCalculation.ts:44–51`.
- **Observation:** Balance calculation does bare subtraction — `e.debit_usd - e.credit_usd` — without guarding against `undefined`. A journal entry created for an LBP-only transaction may have no `debit_usd` / `credit_usd` fields, producing `NaN` that propagates silently through the sum and renders as `NaN` in the UI.
- **Recommendation:** Replace with `(e.debit_usd || 0) - (e.credit_usd || 0)` and apply the same guard to all four currency fields (`debit_usd`, `credit_usd`, `debit_lbp`, `credit_lbp`).

**Implemented:** `calculateBalance`, `calculateBothCurrencies`, `calculateBothCurrenciesLiability`, and employee balance helpers all use `|| 0` guards on USD/LBP fields (`balanceCalculation.ts:27,30,47-48,68-69`). No unguarded currency arithmetic remains in the main balance paths.

### 7.7 `getLocalCurrentSession` non-deterministic with duplicate open sessions ✅

- **Location:** `lib/db.ts:529–531`.
- **Observation:** `const open = all.filter(...); return open[0] || null;` returns the first open session in iteration order. If two `cash_drawer_sessions` rows have `status === 'open'` (sync conflict, failed close), the wrong session window is used for balance calculation.
- **Recommendation:** Sort by `opened_at` descending before taking `[0]`. Add a data integrity check during sync download to log and deduplicate multiple-open-session anomalies.

**Implemented:** Open sessions are sorted by `opened_at` descending before selecting the current session (`lib/db.ts`).

### 7.8 Sync download race: journal entries arrive before session row ✅

- **Observation:** In `SYNC_TABLES`, `journal_entries` and `transactions` appear **before** `cash_drawer_sessions` in download order. When a client syncs a second device's activity, it receives journal entries before the session row. `getCurrentCashDrawerBalances` finds no open session and returns `{ USD: 0, LBP: 0 }`, so balance appears zero until the next full `refreshData()` cycle after the session row downloads.
- **Recommendation:** Add `cash_drawer_sessions` as a dependency of `journal_entries` in `SYNC_DEPENDENCIES`, or ensure `refreshData` fires **after** all tables in a sync batch complete rather than per-table.

**Implemented:** `SYNC_DEPENDENCIES['journal_entries']` includes `'cash_drawer_sessions'` so sessions download before dependent journal rows (`syncService.ts`).

### 7.9 `ensureCashDrawerAccountsSynced` seeds stale `current_balance` from Supabase ✅

- **Location:** `contexts/offlineData/useOfflineInitialization.ts:124–137`.
- **Observation:** On branch init, if no local account row exists the code seeds `current_balance: remoteAccount.current_balance || 0` from Supabase. The remote field is the stale value last uploaded during a previous sync — not the live journal-derived balance. Undo atomics and rollback math that read `account.current_balance` operate from this stale seed.
- **Recommendation:** Seed `current_balance: 0` (or omit it entirely). Treat `current_balance` as a deprecated legacy column; all balance reads must go through `calculateCashDrawerBalance` / `getCurrentCashDrawerBalances`.

**Implemented:** `useOfflineInitialization.ts` seeds new local accounts with `current_balance: 0` when syncing from Supabase.

---

## Summary Table


| Area           | Issue                                                  | Location / Evidence                                                                                    | Status                                                             |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Architecture   | UI imports db/supabase                                 | POS.tsx, RecentPayments.tsx, DevAccountingTestPanel.tsx, PublicCustomerStatement.tsx                   | ✅ Implemented                                                      |
| Architecture   | Event before upload                                    | addProduct emitted event before sync uploaded row                                                      | ✅ Implemented                                                      |
| Architecture   | Single giant context                                   | OfflineDataContext.tsx ~8.4k lines                                                                     | ✅ Implemented                                                      |
| Architecture   | Shared core Supabase-aligned types                     | `packages/shared/src/types/supabase-core.ts`; admin extends `StoreCore` / `BranchCore` / etc.          | ⚠️ Partial (no shared full `Database` type)                        |
| Architecture   | Home.tsx setInterval polling                           | Was `setInterval(loadCashDrawerStatus, 60000)`                                                         | ✅ Implemented (removed)                                            |
| Code quality   | syncService hygiene (eslint, config, types, modular split) | `syncService.ts` + `syncConfig.ts` + `syncUpload.ts` + `syncDownload.ts` + `syncDeletionDetection.ts` | ✅ Implemented                                                      |
| Code quality   | Global console override                                | lib/supabase.ts                                                                                        | ✅ Implemented (removed)                                            |
| Code quality   | `createBaseEntity` / `crudHelperService` updated_at inconsistency | `crudHelperService.ts` — hardcoded table list replaced with `TABLES_WITH_UPDATED_AT` | ✅ Implemented                                                      |
| Code quality   | Scattered validation                                   | Multiple services, no AppError type                                                                    | ✅ Implemented (007-error-handling-validation)                      |
| Code quality   | `any[]` throughout context contract                    | offlineDataContextContract.ts — file-level eslint-disable + many `any[]`                               | ✅ Implemented                                                      |
| Code quality   | Deprecated `addSale()` in API surface                  | saleOperations.ts / offlineDataContextContract.ts                                                      | ✅ Implemented                                                      |
| Code quality   | Vitest + Jest both installed                           | apps/store-app/package.json devDependencies                                                            | ✅ Implemented (⚠️ Netlify pnpm/lockfile follow-up)                 |
| Code quality   | Stale package name                                     | apps/store-app/package.json `name: "vite-react-typescript-starter"`                                    | ✅ Implemented                                                      |
| Modularity     | crudHelperService callbacks                            | Only OfflineDataContext sets them                                                                      | Open                                                               |
| Modularity     | Deep sync/event deps                                   | syncService, eventStreamService, eventEmissionService, OfflineDataContext                              | Open                                                               |
| Modularity     | shared vs store-app utils                              | Local `utils/referenceGenerator.ts` removed; shared package used                                       | ✅ Implemented                                                      |
| Infrastructure | Netlify publish dir                                    | Root toml publish = apps/admin-app/dist for both apps                                                  | Open                                                               |
| Infrastructure | No .env.example                                        | `apps/store-app/.env.example` + `apps/admin-app/.env.example` present                                  | ✅ Implemented                                                      |
| Infrastructure | SQL migrations in repo                                 | `supabase/migrations/branch_event_log.sql` present; full schema history may be incomplete              | ⚠️ Partial                                                         |
| Infrastructure | src/scripts/ in source tree                            | `apps/store-app/src/scripts/` directory removed                                                        | ✅ Implemented                                                      |
| Infrastructure | supabaseService vs sync client                         | `SupabaseAuthContext` imports `supabaseService.ts`                                                     | Clarified (not unused)                                             |
| Infrastructure | Dev pages in production router                         | `TestAccounting` + `DevAccountingTestPanel` deleted; orphan commented-out `MigrationTest.tsx` remains  | ⚠️ Partial                                                         |
| Scalability    | Full tables in context state                           | products, transactions, journalEntries, etc. in memory                                                 | Open                                                               |
| Scalability    | Single sync, sequential events                         | isRunning; event processing per branch sequential                                                      | Open                                                               |
| Scalability    | Multi-tab undefined                                    | No cross-tab coordination                                                                              | Open                                                               |
| Time/Timezone  | Bill / posted date local calendar day                  | `billOperations.ts` uses `getLocalDateString` for posted dates                                         | ✅ Implemented                                                      |
| Time/Timezone  | Home dashboard "Today" local boundary                  | `Home.tsx` — `getTodayLocalDate()` + `getLocalDateString` on timestamps                                | ✅ Implemented                                                      |
| Time/Timezone  | Report / activity / public statement defaults          | ProfitLossReport, PublicCustomerStatement, ActivityFeed                                                | ✅ Implemented                                                      |
| Time/Timezone  | Inventory/payment form defaults                        | useInventoryForms, SupplierAdvances, ReceivedBills                                                     | ✅ Implemented                                                      |
| Time/Timezone  | Snapshot scheduler calendar date                       | snapshotSchedulerService                                                                               | ✅ Implemented                                                      |
| Time/Timezone  | `getTodayLocalDate()` helper                           | `utils/dateUtils.ts`                                                                                   | ✅ Implemented (scripts under `src/scripts/` may still use UTC day) |
| Cash Drawer    | Balance cache invalidation after journals              | journalService → CacheManager.invalidate                                                               | ✅ Implemented                                                      |
| Cash Drawer    | Canonical session-scoped balance (UI)                  | cashDrawerUpdateService + db `getCurrentCashDrawerStatus`; context uses `getCurrentCashDrawerBalances` | ✅ Implemented                                                      |
| Cash Drawer    | All-time `calculateCashDrawerBalance` vs session model | Some services still call all-time 1100 sum                                                             | ⚠️ Partial / audit                                                 |
| Cash Drawer    | `cashDrawer.currentBalance` live                       | refreshCashDrawerStatus from session-scoped status                                                     | ✅ Implemented                                                      |
| Cash Drawer    | Branch-scoped cash drawer account                      | `[store_id+branch_id]` queries                                                                         | ✅ Implemented                                                      |
| Cash Drawer    | Intra-session real-time event                          | `emitCashDrawerTransactionPosted`                                                                      | ✅ Implemented                                                      |
| Cash Drawer    | NaN guards on USD/LBP                                  | `calculateBalance` / `calculateBothCurrencies` use `|| 0`                                              | ✅ Implemented (minor: liability helper may still need guards)      |
| Cash Drawer    | Deterministic open session                             | sort by `opened_at` desc                                                                               | ✅ Implemented                                                      |
| Cash Drawer    | Sync: sessions before journal_entries                  | `SYNC_DEPENDENCIES['journal_entries']` includes `cash_drawer_sessions`                                 | ✅ Implemented                                                      |
| Cash Drawer    | Seed `current_balance` from remote                     | useOfflineInitialization uses `0`                                                                      | ✅ Implemented                                                      |


---

*End of report. All observations are tied to the current codebase and file paths above.*