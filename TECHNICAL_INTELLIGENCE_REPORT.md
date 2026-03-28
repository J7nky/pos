# Technical Intelligence Report — POS Platform

**Repository:** pos-platform (monorepo)  
**Analysis date:** 2025-02-27  
**Scope:** Full codebase analysis; no code modified.

---

## 1. Project Overview

### Purpose of the system
Wholesale produce market ERP and Point of Sale (POS): inventory, sales (bills/line items), accounting (double-entry journal, entities, chart of accounts), cash drawer, employees, customers/suppliers (unified as entities), reminders, and reporting. Branded as **Souq POS** in the Electron build.

### Core problem it solves
- **Offline-first operations** in markets with unreliable connectivity: local IndexedDB (Dexie) as source of truth, sync to Supabase when online.
- **Multi-tenant, multi-branch**: store_id/branch_id on data; branch-level isolation for managers/cashiers; admins can switch branches.
- **Unified accounting**: transactions, journal entries (debit/credit USD/LBP), entity balances derived from journal entries (no stored balance fields as source of truth).

### Target users
- **Store staff:** Cashiers, managers (single-branch), admins (all branches) — via **store-app** (Electron desktop or Vite web).
- **Super admins:** Platform-wide management (stores, users, global products, logos, subscriptions, balance migration) — via **admin-app** (Vite SPA).
- **End customers:** Public customer statement view via tokenized URL (e.g. `/public/customer-statement/:token`).

### Main execution flow
1. **Store-app:** User signs in (Supabase Auth or local fallback when offline) → branch selection (admin) or auto branch (manager/cashier) → `OfflineDataContext` loads from IndexedDB and starts `eventStreamService` (Supabase Realtime on `branch_event_log`). All UI reads/writes go through `useOfflineData()`. Writes hit Dexie, then `eventEmissionService` emits to `branch_event_log`; `eventStreamService` and/or manual sync push/pull via `syncService` to Supabase.
2. **Admin-app:** Super-admin login (Supabase; must have `role='super_admin'` and `store_id` null) → direct Supabase usage for stores, users, global products, logos, subscriptions, balance migration.

---

## 2. High-Level Architecture

### Architectural pattern
- **Store-app:** Offline-first layered flow: **UI → OfflineDataContext (state + orchestration) → services (transactionService, journalService, inventoryPurchaseService, etc.) + db (Dexie) → syncService / eventStreamService → Supabase.** Documented in `ARCHITECTURE_RULES.md`, `DEVELOPER_RULES.md`, `docs/OFFLINE_FIRST_ARCHITECTURE.md`.
- **Admin-app:** Thin SPA: React → Supabase client directly (no IndexedDB, no sync).
- **Shared:** `@pos-platform/shared` provides types, constants (e.g. payment categories), utils (referenceGenerator, multilingual). Consumed by admin-app; store-app has its own copy of some logic and heavier local types.

### Module boundaries
- **apps/store-app:** Full POS + ERP; depends on `packages/shared` only implicitly (store-app does not list it in package.json; has own `referenceGenerator`, etc.).
- **apps/admin-app:** Explicit dependency `@pos-platform/shared` (workspace:*); no dependency on store-app.
- **packages/shared:** No dependency on either app; build output `dist/` used by admin-app.

### Dependency flow (text)
- **Store-app:** `main.tsx` → `RouterProvider` → `App` (ErrorBoundary → SupabaseAuthProvider → OfflineDataProvider → I18nProvider → CustomerFormProvider → BranchAwareAppContent). BranchAwareAppContent → either BranchSelectionScreen (admin) or AppContent (Layout + routes). Data: UI → useOfflineData() → OfflineDataContext → getDB() / createId() from `lib/db.ts` and services (e.g. transactionService, journalService, InventoryPurchaseService, crudHelperService, eventEmissionHelper). Only **syncService** and **SupabaseAuthContext** (and SupabaseService for profile) use `supabase`; only **OfflineDataContext** and services invoked by it should use `getDB()` per rules.
- **Admin-app:** `main.tsx` → `App` → AdminAuthProvider → ToastProvider → AppRoutes → Layout + pages; pages call `supabase` via `lib/supabase.ts` and app-specific services (storeService, userService, branchService, subscriptionService, balanceMigrationService, rolePermissionService).

### Tight coupling and violations
- **Documented violations of data-access rules:**  
  - **apps/store-app/src/pages/POS.tsx** — imports `getDB` directly.  
  - **apps/store-app/src/components/accountingPage/tabs/RecentPayments.tsx** — imports `getDB` directly.  
  - **apps/store-app/src/components/DevAccountingTestPanel.tsx** — imports `getDB` directly.  
  - **apps/store-app/src/pages/PublicCustomerStatement.tsx** — imports `supabase` directly (public route; documented security concerns in `docs/PUBLIC_STATEMENT_SECURITY_RECOMMENDATIONS.md`).
- **OfflineDataContext** is a single large module (~8.4k+ lines) that owns all CRUD and sync orchestration; many services are tightly coupled to it and to Dexie schema. **syncService** is ~2.8k lines and knows all table names, dependency order, and Supabase/Dexie shapes.
- **Store-app** and **admin-app** both define their own Supabase client and types; admin-app does not use store-app’s `Database` type from `types/database.ts`.

---

## 3. Directory & Module Breakdown

### Root
- **Responsibility:** Monorepo root; pnpm workspaces (`pnpm-workspace.yaml`); root `package.json` scripts (dev:store, dev:admin, build:store, build:admin, lint). Build from root is intentionally failing with message directing Netlify to set base directory.
- **Key files:** `package.json`, `pnpm-workspace.yaml`, `README.md`, `ARCHITECTURE_RULES.md`, `DEVELOPER_RULES.md`, `netlify.toml`.
- **Interactions:** Orchestrates app builds; Netlify build command in root `netlify.toml` chooses store-app vs admin-app by site name/URL (admin/super → admin-app, else store-app).
- **Smells:** Root `netlify.toml` publish dir set to `apps/admin-app/dist` while command can build store-app and copy its dist into admin-app/dist — confusing and fragile.

### apps/store-app
- **Responsibility:** POS/ERP Electron + Vite app: auth, branch selection, POS, Inventory, Accounting (bills, received/sold, supplier advances, dashboard, recent payments), Customers (entities), Employees, Reports, Settings, UnsyncedItems, PublicCustomerStatement; thermal printing (escpos, node-thermal-printer), QR, serialport, canvas; Dexie IndexedDB; sync and event-driven real-time.
- **Key files:**  
  - Entry: `index.html` → `src/main.tsx` (RouterProvider); Electron: `electron/main.ts`, `dev-windows.js`, `dev-simple.js`.  
  - Contexts: `contexts/SupabaseAuthContext.tsx`, `contexts/OfflineDataContext.tsx`, `contexts/CustomerFormContext.tsx`.  
  - Data: `lib/db.ts` (Dexie POSDatabase, version 54), `lib/supabase.ts`, `types/database.ts`, `types/index.ts`, `types/accounting.ts`.  
  - Sync: `services/syncService.ts`, `services/eventStreamService.ts`, `services/eventEmissionService.ts`, `services/eventEmissionHelper.ts`.  
  - Business: `services/transactionService.ts`, `services/journalService.ts`, `services/inventoryPurchaseService.ts` (~1.3k lines), `services/receivedItemsJournalService.ts`, `services/accountingInitService.ts`, `services/cashDrawerUpdateService.ts`, `utils/balanceCalculation.ts`, `utils/accountMapping.ts`.  
  - Auth/local: `services/localAuthService.ts`, `services/credentialStorageService.ts`, `services/supabaseService.ts`.  
  - RBAC: `services/rolePermissionService.ts`, `components/ProtectedRoute.tsx`, `components/rbac/ModuleAccessManager.tsx`.  
  - Router: `router.tsx` (createHashRouter for Electron, createBrowserRouter for web); ProtectedRoute wraps inventory, pos, reports, accounting.
- **Interactions:** Uses Supabase for auth and sync; Realtime on `branch_event_log`; no server other than Supabase. Reads/writes IndexedDB via `lib/db.ts`; shared package not in package.json (store-app is self-contained for types/utils it needs).
- **Smells:** OfflineDataContext and syncService are very large; multiple components bypass useOfflineData() and use getDB/supabase; PublicCustomerStatement uses supabase and is a known security surface.

### apps/admin-app
- **Responsibility:** Super-admin dashboard: Dashboard, Global Products, Global Logos, Stores (list/detail, branches, users), Subscriptions, Payments, Analytics, Role Permissions, Settings, Balance Migration, Login.
- **Key files:** `src/App.tsx`, `src/main.tsx`, `src/contexts/AdminAuthContext.tsx`, `src/lib/supabase.ts`, `src/pages/*.tsx`, `src/services/storeService.ts`, `userService.ts`, `branchService.ts`, `subscriptionService.ts`, `balanceMigrationService.ts`, `rolePermissionService.ts`, `services/index.ts`.
- **Interactions:** Depends on `@pos-platform/shared`; talks only to Supabase (same backend as store-app). No IndexedDB or sync.
- **Smells:** Duplicate Supabase client and env handling; super_admin check duplicated in AdminAuthContext (role + store_id null).

### packages/shared
- **Responsibility:** Shared types, constants, utils for reuse (e.g. admin-app); referenceGenerator, multilingual, paymentCategories.
- **Key files:** `src/index.ts`, `src/types/index.ts`, `src/constants/index.ts`, `src/utils/index.ts`, `src/utils/referenceGenerator.ts`, `src/utils/multilingual.ts`, `src/constants/paymentCategories.ts`.
- **Interactions:** Built with `tsc`; admin-app imports from `@pos-platform/shared`; store-app has its own parallel implementations in `utils/referenceGenerator.ts`, `utils/multilingual.ts`, etc., so duplication exists.
- **Smells:** store-app does not depend on shared; risk of drift between shared and store-app copies.

### docs/ and root .md files
- **Responsibility:** Architecture and feature docs: OFFLINE_FIRST_ARCHITECTURE, PUBLIC_STATEMENT_SECURITY_RECOMMENDATIONS, SECURE_QR_TOKEN_IMPLEMENTATION, SUPER_ADMIN_ARCHITECTURE, EVENT_DRIVEN_SYNC_ARCHITECTURE, BRANCH_ACCESS_*, UNIFIED_REMINDER_SYSTEM_IMPLEMENTATION, etc.
- **Interactions:** Reference only; no code imports.
- **Smells:** README references `supabase/migrations/001_initial_schema.sql` and `002_seed_data.sql` but no `*.sql` files were found in the repo — migrations may live only in Supabase dashboard or another repo.

---

## 4. Runtime & Infrastructure

### Entry points
- **Store-app web:** `index.html` → `/src/main.tsx` → RouterProvider(router) → App (providers + BranchAwareAppContent) → Layout + routes.
- **Store-app Electron:** `electron/main.ts` (built to dist-electron); loads Vite dev server URL or file:// to dist; app id `com.souqtrablous.pos`, productName "Souq POS".
- **Admin-app:** `index.html` → `src/main.tsx` → App (AdminAuthProvider, ToastProvider, AppRoutes).

### Build system
- **Tooling:** pnpm 10.20.0, Node >=18; Vite 7 (both apps); TypeScript 5.5; store-app also uses tsconfig_electron.json for Electron.
- **Commands:** Root: `pnpm dev:store` / `dev:admin` / `build:store` / `build:admin`; store-app: `vite build`, `build:netlify` (production), `build:electron` (tsc for Electron); admin-app: `tsc && vite build`; shared: `tsc`.
- **Store-app build:** Vite build + Electron build; Electron builder (nsis, win x64), asar, differential updates.

### Environment configuration
- **Store-app:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY` (optional; for admin client); `VITE_PUBLIC_URL` (QR/public links). Missing URL/anon key triggers offline placeholder client and bypass of login in App.
- **Admin-app:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_API_URL`, `VITE_APP_TITLE` (vite-env.d.ts).
- **Assumption:** No `.env` files committed; deployment supplies env (e.g. Netlify, DOMAIN_DEPLOYMENT_GUIDE.md).

### Deployment assumptions
- **Netlify:** Base directory set per site (apps/store-app or apps/admin-app); root netlify.toml uses site name/URL to decide which app to build; NODE_VERSION=20, PNPM_VERSION=10.20.0; SPA redirects and security headers (X-Frame-Options, X-XSS-Protection, etc.).
- **Electron:** Windows NSIS installer; optional auto-updater (electron-updater, publish provider github).

### External services
- **Supabase:** PostgreSQL, Auth, Realtime, Storage (e.g. global logos). Single project for both apps; RLS for multi-tenant and branch isolation.
- **No other mandatory external APIs** in code (exchange rates, etc., could be configurable elsewhere).

### CI/CD
- No GitHub Actions or other CI config files found. Lint/test scripts exist (store-app: vitest, eslint); CI not detected in repo.

---

## 5. Data Layer

### Database type
- **Remote:** PostgreSQL (Supabase).
- **Local (store-app):** IndexedDB via Dexie (POSDatabase in `lib/db.ts`).

### Schema structure (summary)
- **Supabase (typed in store-app `types/database.ts`):** Tables include stores, branches, users, products, inventory_items, inventory_bills, transactions, bills, bill_line_items, bill_audit_logs, cash_drawer_accounts, cash_drawer_sessions, entities (unified customer/supplier/employee), chart_of_accounts, journal_entries, balance_snapshots, reminders, role_permissions, user_permissions, missed_products, etc. Row/Insert/Update types exported per table. Cash drawer account balance fields are deprecated (computed from journal entries). Many tables have store_id, branch_id, _synced, _deleted, created_at, updated_at.
- **Dexie (lib/db.ts):** Version 54; same logical tables with compound indexes (e.g. store_id+branch_id, entity_id); local-only tables: localCredentials, localPasswords, sync_metadata, pending_syncs, sync_state, subscriptions, license_validations. Schema is additive across versions (migrations in constructor).

### ORM usage
- No ORM. Supabase: client from `@supabase/supabase-js` with typed `Database`; table access via `.from('table')`. Dexie: Table API (`get`, `add`, `put`, `where`, `bulkPut`, etc.) with TypeScript types from `types/index.ts` and `types/accounting.ts`.

### Data flow from API to storage
- **Writes (store-app):** UI → OfflineDataContext method → service (e.g. transactionService, journalService) or crudHelperService → getDB().table.add/put → eventEmissionHelper / eventEmissionService → branch_event_log (Supabase). syncService uploads unsynced rows to Supabase (batch, with retries and validation).
- **Reads (store-app):** OfflineDataContext loads tables from Dexie on init and on eventStreamService/sync callbacks; UI reads from context state (products, transactions, etc.). No direct Supabase reads from UI except PublicCustomerStatement.
- **Admin-app:** All reads/writes via Supabase client in services.

### Transactions and consistency
- **Dexie:** Uses Dexie transactions where multiple tables are updated (e.g. in transactionService, journalService, addInventoryBatch). No cross-Dexie/Supabase distributed transactions.
- **Supabase:** Inserts/updates are per-request; syncService uploads in table order (SYNC_TABLES and SYNC_DEPENDENCIES) and handles unrecoverable errors (e.g. FK, not null) with classification. Balance consistency: balances are derived from journal entries (balanceCalculation.ts, balanceVerificationService); no stored balance as source of truth for entities/cash drawer (deprecated fields in types).

---

## 6. State Management (Frontend)

### Global vs local state
- **Store-app:** Global: SupabaseAuthContext (user, userProfile), OfflineDataContext (storeId, currentBranchId, all entity arrays, loading flags, CRUD methods), CustomerFormProvider, I18nProvider. Local: component useState for UI (modals, filters, form fields).
- **Admin-app:** Global: AdminAuthContext (user, isAuthenticated); ToastProvider. Local: page-level state; no global data cache.

### Side effect handling
- **Store-app:** useEffect in OfflineDataContext for initial load, branch change, eventStreamService start/stop, sync triggers; SupabaseAuthContext for session and profile load (with timeout and cache). No formal side-effect library (e.g. no Redux saga); async in context and services.
- **Admin-app:** useEffect in pages for fetching on mount/params; auth state listener in AdminAuthContext.

### Async flow management
- **Store-app:** Async CRUD returns Promises; context methods await services; refreshData() and eventStreamService callbacks trigger re-reads from Dexie and setState. Profile load uses a shared promise map to dedupe concurrent loads (SupabaseAuthContext). Sync uses isRunning guard and lastSyncAttempt.
- **Admin-app:** Straightforward async/await in services and pages.

### Potential race conditions
- **Concurrent sync vs event processing:** OfflineDataContext waits for eventStreamService to finish processing before calling performSync (wait loop with maxWait). Multiple rapid refreshData() calls could still overlap with event processing.
- **Profile load:** Deduplication by userId reduces but does not eliminate risk if session changes during load.
- **Balance calculation:** Balances computed from journal entries on read; concurrent writes that add journal entries are serialized by Dexie transaction and event emission, but two tabs could see different snapshots until sync.
- **Documented:** syncService.performance.test.ts tests "concurrent refresh prevention" (single refresh for 5 calls).

---

## 7. Security Model

### Authentication mechanism
- **Store-app:** Supabase Auth (email/password); session persisted; optional local auth when offline (localAuthService, credentialStorageService, localCredentials in Dexie). App can bypass login when VITE_SUPABASE_URL/anon key missing or placeholder (offline mode).
- **Admin-app:** Supabase Auth; AdminAuthContext enforces role === 'super_admin' and store_id === null from `users` table; others are signed out.

### Authorization logic
- **Store-app:** Branch: admin can choose branch; manager/cashier get single branch from profile (branch_id). RBAC: rolePermissionService, user_module_access / user_permissions; ProtectedRoute(module) and ModuleAccessManager; checkModuleAccess, checkOperationLimit. Data filtered by store_id/branch_id in queries and RLS.
- **Admin-app:** Only super_admin can access; no per-resource RBAC beyond that.

### Token handling
- **Supabase:** JWT in session; autoRefreshToken when online; custom fetch in supabase.ts blocks all requests when offline (throws). Service role key used only for supabaseAdmin (e.g. user creation); anon key for normal client.
- **Public statement:** Token in URL path (`/public/customer-statement/:token`); decoded and used to fetch statement; docs recommend server-side time-limited tokens and RLS (not fully implemented per PUBLIC_STATEMENT_SECURITY_RECOMMENDATIONS.md).

### Input validation strategy
- **Services:** transactionService, journalService, accountingInitService validate params (e.g. category, amounts, entityId, branchId); transactionValidationService; weightValidationService; dataValidationService in sync. No single shared validation layer; validation scattered in services and sometimes in UI.
- **Sync:** syncService rounds numeric fields and clamps; dataValidationService and universalChangeDetectionService used for change detection and validation.

### Sensitive data exposure risks
- **Public customer statement:** Documented: RLS with USING (true) or client-side-only filtering allows broad read access; URL token could be guessed; no expiration or server-side token table in repo.
- **Service role key:** Required in store-app for supabaseAdmin; if leaked (e.g. in client bundle), full DB bypass. Env must be server-only in production; store-app is client/Electron so risk exists if used in Electron with env injection.
- **Local credentials:** credentialStorageService stores encrypted password hash (iv, salt) in Dexie; key derivation and encryption in client — acceptable for offline unlock but not equivalent to server-side secrets.

---

## 8. Business Logic Invariants

### Core domain rules
- **Transactions:** All financial transaction creation through TransactionService; TRANSACTION_CATEGORIES and getTransactionType; context (userId, storeId, branchId, module) required; balance and cash drawer updates via service.
- **Double-entry:** Every financial movement as journal entries (debit/credit, USD/LBP); journalService.createJournalEntry; entity and cash drawer balances derived from journal entries only (balanceCalculation.ts, balanceVerificationService).
- **Bills:** Bills have line items; audit log (bill_audit_logs); createBill/updateBill/deleteBill in context with optional customer balance update.
- **Inventory:** Receiving via inventory_bills + inventory_items; InventoryPurchaseService for cash/credit/commission; receivedItemsJournalService for journal entries on receive; stock from inventory_items (and deduct/restore helpers).
- **Sync:** Writes go to Dexie first; events to branch_event_log; syncService uploads in SYNC_TABLES order; no periodic polling (event-driven + manual sync).

### Financial or numerical precision rules
- **Currency:** USD and LBP; amounts stored as numbers; syncService rounds to 2 decimals for numeric fields (Math.round(clamped*100)/100). balanceCalculation uses raw journal entry amounts (debit_usd, credit_usd, debit_lbp, credit_lbp).
- **Exchange rate:** Store-level exchange_rate; currencyService; no centralized decimal type (e.g. no dedicated money type).

### Idempotency guarantees
- **Entity code migration:** ENTITY_CODE_MIGRATION.md suggests ON CONFLICT (store_id, entity_code) for idempotency; not verified in sync upload path. Sync uses last_synced_at and _synced flags; duplicate uploads could cause unique constraint errors unless Supabase uses upsert/on conflict.
- **Transaction creation:** No explicit idempotency key in createTransaction; duplicate calls create duplicate transactions.

### Critical constraints that must never break
- **Journal balance:** For each transaction_id, sum of debits = sum of credits per currency (enforced by journalService creating paired entries). Balance verification (balanceVerificationService) can detect drift.
- **Branch/store isolation:** All data keyed by store_id; branch_id where applicable; RLS and local queries must filter by branch for non-admins.
- **No direct Supabase/db in UI:** Enforced by convention and ARCHITECTURE_RULES; currently violated in POS.tsx, RecentPayments.tsx, DevAccountingTestPanel.tsx, PublicCustomerStatement.tsx.

---

## 9. Testing Strategy

### Unit vs integration coverage
- **Store-app:** Vitest (package.json: test, test:run, test:coverage); tests under `services/__tests__/`: balanceVerificationService.test.ts, transactionService.refactored.test.ts, atomicTransactions.test.ts, syncService.optimizations.test.ts, syncService.performance.test.ts, downloadOptimization.test.ts; constants/__tests__/transactionCategories.test.ts. No app-wide coverage metric observed.
- **Admin-app:** No test script or test files found.
- **Shared:** No tests found.

### Mocking approach
- **Tests:** Mock getDB, Supabase, or lower-level deps where needed (e.g. syncService tests); test/setup.ts for Vitest. No single mock pattern documented repo-wide.

### Gaps in testing
- **OfflineDataContext:** No unit tests; large and critical.
- **journalService / transactionService integration:** Only refactored unit tests; no full flow tests with real Dexie.
- **Admin-app:** No automated tests.
- **PublicCustomerStatement:** No tests; security-sensitive.
- **Sync conflict and deletion detection:** Partially covered by syncService tests; real Supabase not exercised in CI.
- **E2E:** No Playwright/Cypress or E2E config found.

---

## 10. Technical Debt & Risk Assessment

### Architectural weaknesses
- **Single mega-context:** OfflineDataContext owns all CRUD and sync coordination; hard to test and refactor; any new entity requires context changes.
- **Duplicate data-access patterns:** Four places import db or supabase from UI/public route despite ARCHITECTURE_RULES.
- **Two apps, two Supabase clients:** Types and auth logic duplicated; admin-app does not use store-app’s Database type.
- **No SQL migrations in repo:** Schema lives in Supabase and in TypeScript (database.ts, db.ts); migrations referenced in README not present — drift risk.

### Code smells
- **syncService:** @ts-nocheck and large size; table list and dependency map hardcoded; typo `largeTablPaginationSize` in config.
- **OfflineDataContext:** Thousands of lines; mix of state, CRUD, sync, and helpers.
- **inventoryPurchaseService:** ~1.3k lines; multiple purchase types and fees in one class.
- **Console override:** supabase.ts overrides console.error to suppress CORS when offline — global side effect.

### Scalability risks
- **Dexie:** All data for store/branch loaded into context state; very large product/transaction sets could stress memory and re-renders (no virtualization at context level).
- **Sync:** Single sync at a time; large tables use pagination (largeTablPaginationSize 500) but full table scan for deletion detection; event stream processes all events for branch.
- **Realtime:** One subscription per branch; many branches/sites could stress Supabase Realtime connections.

### Concurrency risks
- **Sync vs event processing:** Mitigated by wait loop; still possible to trigger sync while events are processing in another code path.
- **Multiple tabs:** Two store-app tabs same branch: two Dexie DBs, two Realtime subscriptions; no cross-tab coordination; last write wins on sync.
- **Balance reads:** No locking; balance computed from journal entries at read time; concurrent writes can produce transient inconsistencies until next read.

### Maintainability issues
- **Scattered validation and error handling:** No single validation layer; different services throw different shapes.
- **Reference generation:** Shared and store-app both have referenceGenerator; risk of divergence.
- **Deprecated fields:** database.ts and docs mark cash_drawer balance and entity balance fields as deprecated; code still may reference them in places.

### Areas likely to cause production incidents
- **Public customer statement:** Weak RLS or client-only filtering could expose other customers’ data; token abuse or no expiry.
- **Sync failures:** Network or Supabase errors during sync; partial upload leaving _synced inconsistent; deletion detection timeout or bug could remove valid rows.
- **Offline/online transition:** Token refresh blocked when offline; if app goes online with stale session, profile or sync could fail in subtle ways.
- **Electron + native deps:** serialport, canvas, usb, escpos in store-app; rebuild and platform issues (ignoredBuiltDependencies in pnpm-workspace).
- **Netlify build:** Root toml builds one app but publish dir and copy logic are easy to misconfigure per site.

---

## 11. Suggested Refactor Priorities

Ranked by risk reduction, maintainability, performance, and security.

1. **Public customer statement security (risk + security)**  
   Implement server-side time-limited tokens and RLS per docs/PUBLIC_STATEMENT_SECURITY_RECOMMENDATIONS.md; remove or reduce client-side-only filtering and USING (true) for anon.

2. **Enforce data-access rules (maintainability + risk)**  
   Remove direct getDB/supabase from POS.tsx, RecentPayments.tsx, DevAccountingTestPanel.tsx; route PublicCustomerStatement through a dedicated service that uses a constrained Supabase client or serverless function; add lint rule or arch test to block `from '../lib/db'` / `from '../lib/supabase'` in UI and public routes.

3. **Extract OfflineDataContext into smaller units (maintainability)**  
   Split by domain (e.g. products, entities, transactions, bills, sync state) into sub-contexts or hooks + one coordinator; keep single source of truth but reduce file size and test surface.

4. **Single source of truth for Supabase types (maintainability)**  
   Move Database and related types to shared or a small types package; consume from both store-app and admin-app; generate from Supabase if possible.

5. **Sync idempotency and conflict handling (risk)**  
   Document and implement upsert/ON CONFLICT for sync uploads where applicable; add idempotency keys for critical operations (e.g. transaction creation) if duplicate submission is possible.

6. **Add tests for OfflineDataContext and critical flows (risk)**  
   Unit tests with mocked db and sync; at least one integration-style test for createTransaction → journal entries → balance calculation.

7. **Centralize validation and error shapes (maintainability)**  
   Single validation layer for API/context boundaries; consistent error type (e.g. code + message) and handling in UI.

8. **Netlify and build clarity (risk)**  
   Separate Netlify sites with explicit base directory and publish dir per app; remove root netlify.toml conditional copy logic or document it clearly.

9. **Balance and currency precision (risk)**  
   Standardize on a decimal/money type or fixed-point for money; use one rounding strategy (e.g. 2 decimals) in balanceCalculation and journal creation; add balance verification in CI or post-sync.

10. **Reduce syncService size and remove @ts-nocheck (maintainability)**  
    Split into upload, download, deletion detection, and config modules; type all paths and remove @ts-nocheck; fix largeTablPaginationSize typo.

---

## 12. Context Memory Summary

**pos-platform** is a pnpm monorepo containing **store-app** (Souq POS: Electron + Vite, offline-first ERP/POS) and **admin-app** (Vite SPA for super_admin), plus **packages/shared** (types, utils, constants). Backend is **Supabase** (PostgreSQL, Auth, Realtime, Storage). No SQL migration files in repo; schema is reflected in **apps/store-app/src/types/database.ts** (Supabase) and **apps/store-app/src/lib/db.ts** (Dexie v54).

**Store-app** is offline-first: UI must use **useOfflineData()** only; data lives in **IndexedDB (Dexie)** and syncs to Supabase via **syncService** and **eventStreamService** (Realtime on **branch_event_log**). Writes go to Dexie first; **eventEmissionService** writes to branch_event_log; sync uploads in dependency order. Only **syncService** and auth-related code may use **supabase**; only **OfflineDataContext** and services it calls may use **getDB()**. This is documented in ARCHITECTURE_RULES.md and DEVELOPER_RULES.md but violated in **POS.tsx**, **RecentPayments.tsx**, **DevAccountingTestPanel.tsx**, and **PublicCustomerStatement.tsx** (which uses supabase and is a known security concern).

**Provider tree (store-app):** ErrorBoundary → SupabaseAuthProvider → OfflineDataProvider → I18nProvider → CustomerFormProvider → BranchAwareAppContent (branch selection for admin, then AppContent with Layout and routes). **Admin-app:** AdminAuthProvider (super_admin only) → ToastProvider → AppRoutes.

**Accounting:** **TransactionService** is the single entry point for creating transactions; **journalService** creates double-entry journal entries (debit/credit USD and LBP). Balances are **derived only from journal entries** (utils/balanceCalculation.ts); stored balance fields on cash_drawer_accounts and entities are deprecated. **InventoryPurchaseService** handles cash/credit/commission purchases and integrates with transactionService and journalService.

**Auth:** Store-app: Supabase Auth with optional local auth when offline (localAuthService, credentialStorageService). Admin-app: Supabase Auth; only users with role `super_admin` and `store_id` null can access. **RBAC** in store-app: rolePermissionService, ProtectedRoute(module), checkModuleAccess, checkOperationLimit.

**Key files:** Store-app — **lib/db.ts** (Dexie schema), **lib/supabase.ts** (createClient, offline request blocking), **contexts/OfflineDataContext.tsx** (state + CRUD + sync), **services/syncService.ts**, **services/eventStreamService.ts**, **services/transactionService.ts**, **services/journalService.ts**, **services/inventoryPurchaseService.ts**, **utils/balanceCalculation.ts**, **router.tsx** (hash for Electron, browser for web). Admin-app — **contexts/AdminAuthContext.tsx**, **lib/supabase.ts**, **services/storeService.ts**, **userService.ts**, **branchService.ts**.

**Environment:** VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (required for real auth); optional VITE_SUPABASE_SERVICE_ROLE_KEY (store-app admin client); VITE_PUBLIC_URL (store-app public links). **Deploy:** Netlify (root toml picks store vs admin by site name); Electron builder for Windows NSIS.

**Testing:** Store-app has Vitest and tests for balanceVerification, transactionService, atomic transactions, sync optimizations/performance, download optimization, transactionCategories. No tests for OfflineDataContext, admin-app, or PublicCustomerStatement. **Risks:** Public statement RLS and token design; service role key in client bundle; large context and sync service; duplicate db/supabase imports in UI; no SQL migrations in repo; multi-tab and sync/event concurrency.

Use this summary as the persistent reference for answering future questions about this repository.
