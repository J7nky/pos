# POS Platform

A monorepo containing a wholesale produce market ERP and Point of Sale system. The repository includes two applications and a shared package; the backend is Supabase (PostgreSQL, Auth, Realtime, Storage). There is no custom API server in this repo.

---

## 1. Project Description

**What the system does**

- **Store app (Souq POS):** Point of sale, inventory (receiving, batches, products), billing (bills and line items), accounting (double-entry journal entries, entities, chart of accounts, transactions), cash drawer, employees, customers/suppliers (unified as entities), reminders, and reports. Runs as a Vite web app or an Electron desktop app (Windows). Data is stored locally in IndexedDB (Dexie) and synced to Supabase when online; sync is event-driven via `branch_event_log` and optional manual full sync.
- **Admin app:** Super-admin dashboard for platform management: stores, branches, users, global products, global logos, subscriptions, payments, analytics, role permissions, balance migration, and settings. It is a Vite SPA that talks to Supabase only (no IndexedDB or sync).
- **Public route:** Store app exposes a public customer statement view at `/public/statement/:token` (token in URL). Security considerations for this route are documented in `docs/PUBLIC_STATEMENT_SECURITY_RECOMMENDATIONS.md`.

**Who it is for**

- Store staff (cashiers, managers, store admins) using the store app, with branch-level or store-level access.
- Super admins (platform operators) using the admin app; access is restricted to users with `role='super_admin'` and `store_id` null in the `users` table.
- End customers viewing their statement via the tokenized public URL.

**Core problem it solves**

- Offline-first operations: local IndexedDB as source of truth with sync to Supabase when online.
- Multi-tenant, multi-branch isolation: data is scoped by `store_id` and `branch_id`; managers/cashiers see one branch; store admins can switch branches.
- Unified accounting: transactions and journal entries (USD/LBP); entity and cash drawer balances are derived from journal entries, not stored as authoritative fields.

---

## 2. Architecture Overview

**High-level design**

- **Store app:** Layered, offline-first. UI uses only `useOfflineData()` from `OfflineDataContext`. The context orchestrates reads/writes to IndexedDB (via `lib/db.ts` and services such as `crudHelperService`, `transactionService`, `journalService`) and triggers event emission to Supabase (`branch_event_log`). Sync and real-time updates are handled by `syncService` (upload/download) and `eventStreamService` (Realtime subscription on `branch_event_log`, then pull by version). Only designated services and auth context use the Supabase client; UI must not import `db` or `supabase` directly (see `ARCHITECTURE_RULES.md`).
- **Admin app:** Thin SPA. React components call app-specific services (`storeService`, `userService`, `branchService`, etc.), which use the Supabase client from `lib/supabase.ts`. No local database or sync layer.

**Architectural pattern**

- Store app: Offline-first with a single orchestration context (`OfflineDataContext`) and event-driven sync (no periodic polling for data; manual sync and Realtime-driven catch-up).
- Admin app: Request/response to Supabase only.

**Major modules**

- **apps/store-app:** Full POS/ERP (router, pages, layouts, contexts, services, lib, types). Key runtime modules: `OfflineDataContext`, `SupabaseAuthContext`, `syncService`, `eventStreamService`, `eventEmissionService`, `transactionService`, `journalService`, `inventoryPurchaseService`, `lib/db.ts` (Dexie), `lib/supabase.ts`.
- **apps/admin-app:** Pages, layouts, contexts (`AdminAuthContext`), services, `lib/supabase.ts`.
- **packages/shared:** Types, constants (e.g. payment categories), utils (e.g. referenceGenerator, multilingual). Built with `tsc`; consumed by admin-app via workspace dependency; store-app does not declare a dependency on it and has its own overlapping utils.

**Dependency flow (summary)**

- Store app: `main.tsx` → Router → App (providers: SupabaseAuth, OfflineData, I18n, CustomerForm) → BranchAwareAppContent → Layout + routes. Data path: UI → `useOfflineData()` → OfflineDataContext → services + `getDB()` → Dexie; after writes, context calls event emission (Supabase RPC) and may trigger sync. Sync/Realtime: `syncService` and `eventStreamService` use Supabase and `getDB()`.
- Admin app: `main.tsx` → App → AdminAuthProvider → AppRoutes → Layout + pages; pages use services that call `supabase` from `lib/supabase.ts`.

---

## 3. Tech Stack

| Category   | Store app | Admin app |
|-----------|-----------|-----------|
| Language  | TypeScript 5.x | TypeScript 5.x |
| UI        | React 18, React Router 7 | React 18, React Router 7 |
| Build     | Vite 7 | Vite 7 |
| Desktop   | Electron 38, electron-builder (Windows NSIS) | — |
| Database (local) | Dexie (IndexedDB) | — |
| Database (remote) | Supabase (PostgreSQL, Auth, Realtime, Storage) | Supabase |
| Styling   | Tailwind CSS 3, PostCSS | Tailwind CSS 3, PostCSS |
| Icons     | Lucide React | Lucide React |
| Other     | uuid, bcryptjs, qrcode, xlsx (admin), escpos/node-thermal-printer/serialport/canvas/usb (store, native deps) | uuid, xlsx |

**Tooling**

- pnpm 10.x workspaces; Node >=18; ESLint; Vitest (store-app only).
- Root `package.json` scripts: `dev:store`, `dev:admin`, `build:store`, `build:admin`, `lint`, `clean`, `setup`. Root `build` intentionally exits with an error and instructs Netlify to set base directory to an app.

**Infrastructure assumptions**

- Supabase project (URL, anon key, optional service role key) is provisioned externally.
- Deployment: Netlify is referenced for web (root `netlify.toml`); Electron builds produce Windows installers (e.g. for distribution or auto-updates). No CI config files were found in the repo.

---

## 4. Directory Structure

```
pos-1/
├── package.json                 # Root scripts; engines Node >=18, pnpm >=8
├── pnpm-workspace.yaml          # Workspaces: apps/*, packages/*
├── netlify.toml                 # Build/publish/redirects (single config for both apps)
├── ARCHITECTURE_RULES.md        # Data access rules (UI → context only)
├── DEVELOPER_RULES.md           # Branch access, offline-first, RBAC, testing, etc.
├── docs/                        # Architecture and feature docs (no code)
│
├── apps/
│   ├── store-app/               # POS/ERP (Electron + Vite)
│   │   ├── src/
│   │   │   ├── main.tsx         # Entry (RouterProvider)
│   │   │   ├── App.tsx         # Providers + BranchAwareAppContent
│   │   │   ├── router.tsx      # Hash (Electron) or Browser router; ProtectedRoute
│   │   │   ├── contexts/       # SupabaseAuth, OfflineData, CustomerForm
│   │   │   ├── lib/            # db.ts (Dexie), supabase.ts
│   │   │   ├── services/       # sync, eventStream, eventEmission, transaction, journal, etc.
│   │   │   ├── pages/          # Home, Inventory, POS, Reports, Accounting, Customers, etc.
│   │   │   ├── components/     # UI, modals, ProtectedRoute, rbac
│   │   │   ├── types/          # database.ts (Supabase), index.ts, accounting.ts
│   │   │   ├── utils/          # balanceCalculation, accountMapping, referenceGenerator, etc.
│   │   │   ├── hooks/          # useOfflineData via context, useLocalStorage, etc.
│   │   │   └── i18n/           # Locales (en, ar, fr)
│   │   ├── electron/           # main.ts, preload
│   │   ├── index.html
│   │   ├── package.json        # Scripts: dev, build, build:netlify, test (vitest)
│   │   └── vite.config.ts
│   │
│   └── admin-app/              # Super-admin SPA
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx         # AdminAuthProvider, routes
│       │   ├── contexts/       # AdminAuthContext
│       │   ├── lib/            # supabase.ts
│       │   ├── services/       # storeService, userService, branchService, etc.
│       │   ├── pages/          # Dashboard, Stores, GlobalProducts, Login, etc.
│       │   ├── components/    # stores/, ui/
│       │   ├── layouts/        # Layout
│       │   └── types/
│       ├── package.json        # Depends on @pos-platform/shared
│       └── vite.config.ts
│
└── packages/
    └── shared/                 # @pos-platform/shared
        ├── src/
        │   ├── index.ts
        │   ├── types/
        │   ├── constants/      # paymentCategories, etc.
        │   └── utils/          # referenceGenerator, multilingual
        ├── package.json        # build: tsc
        └── tsconfig.json
```

---

## 5. Setup Instructions

**Prerequisites**

- Node.js >= 18
- pnpm >= 8 (packageManager in repo: pnpm@10.20.0)
- A Supabase project (URL, anon key; optional service role key for admin/user creation flows)

**Environment variables**

Create `.env` or `.env.local` in the app directory (or as required by your tooling) so that Vite can expose them via `import.meta.env`. See section 7 for the list.

**Installation**

```bash
pnpm install
```

From repo root. This installs dependencies for all workspaces. Native dependencies (e.g. serialport, canvas, usb) may require a supported OS and build tools; some are in `ignoredBuiltDependencies` in `pnpm-workspace.yaml`.

**Running locally**

- Store app (web): from root, `pnpm dev:store` (or from `apps/store-app`, `pnpm dev`). Vite dev server (e.g. port 5178 for Electron script).
- Store app (Electron): from `apps/store-app`, use the scripts in package.json (e.g. `dev` which runs `dev-windows.js`, or the advanced script with Vite + Electron).
- Admin app: from root, `pnpm dev:admin` (or from `apps/admin-app`, `pnpm dev`).

**Build commands**

- From root:
  - `pnpm build:store` — build store-app (Vite + Electron).
  - `pnpm build:admin` — build admin-app (tsc + Vite).
  - `pnpm build:all` — build all apps.
- Store-app only: `build` (Vite + Electron), `build:netlify` (Vite production only), `build:electron` (Electron main/preload).
- Admin-app only: `build` (tsc && vite build).
- Shared package must be built before admin-app if using shared types/utils; typically `pnpm --filter @pos-platform/shared build` or built as part of a top-level build that respects workspace order.

---

## 6. Environment Configuration

**Store app**

| Variable | Required | Purpose |
|----------|----------|--------|
| `VITE_SUPABASE_URL` | Yes (for online auth/sync) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes (for online auth/sync) | Supabase anon key |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | No | Used for admin client (e.g. user creation); must not be exposed to end users |
| `VITE_PUBLIC_URL` | No | Base URL for public links (e.g. QR customer statement); defaults in vite.config for prod/dev |

If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are missing or placeholder, the store app can run in offline mode (placeholder Supabase client; login can be bypassed in App.tsx).

**Admin app**

| Variable | Required | Purpose |
|----------|----------|--------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | Optional | For operations that need elevated privileges |
| `VITE_API_URL` | Optional | Declared in vite-env.d.ts; usage in app may vary |
| `VITE_APP_TITLE` | Optional | Declared in vite-env.d.ts |

**Secrets**

- Do not commit `.env` or `.env.local` with real keys. The service role key bypasses RLS and must be used only where necessary (e.g. server-side or in a controlled build); exposing it in a client bundle is a security risk.
- No `.env.example` is present in the repo; consider adding one listing variable names and placeholder values.

---

## 7. Database & Migrations

**Remote (Supabase)**

- PostgreSQL. Schema is reflected in TypeScript in `apps/store-app/src/types/database.ts` (table/row types). Row Level Security (RLS) is used for multi-tenant and branch isolation. The README in the repo previously referenced `supabase/migrations/001_initial_schema.sql` and `002_seed_data.sql`; no SQL migration files were found in the repository. Schema and migrations may be maintained in the Supabase dashboard or in another repository.

**Local (store app)**

- IndexedDB via Dexie. Schema is defined in `apps/store-app/src/lib/db.ts` (POSDatabase, version 54). Tables mirror the Supabase domain (stores, branches, products, users, entities, inventory_items, inventory_bills, transactions, bills, bill_line_items, journal_entries, chart_of_accounts, balance_snapshots, cash_drawer_*, reminders, role_permissions, user_permissions, etc.) plus local-only tables (e.g. sync_metadata, pending_syncs, sync_state, localCredentials). Sync metadata (`_synced`, `_deleted`, `_lastSyncedAt`) is used for upload/download. Schema changes require a Dexie version bump and upgrade logic in the same file.

---

## 8. API Overview

There is no custom backend in this repository. All server-side behavior is provided by Supabase:

- **REST:** Table access via Supabase client `.from('table')` with RLS.
- **Auth:** Supabase Auth (email/password); session persistence; store app can fall back to local auth when offline.
- **Realtime:** Subscription to `branch_event_log` (INSERT) for event-driven sync in the store app.
- **RPC:** `emit_branch_event` is used by the store app to append events to `branch_event_log` after local writes.
- **Storage:** Used (e.g. global logos in admin app).

Auth model: JWT from Supabase Auth; anon key for normal client; service role key only in specific flows (e.g. admin app user creation). Store app blocks all Supabase requests when `navigator.onLine` is false (custom fetch in `lib/supabase.ts`).

---

## 9. Frontend Overview

**Store app**

- **State:** Global state is in React context: `SupabaseAuthContext` (user, userProfile), `OfflineDataContext` (storeId, branchId, products, entities, transactions, bills, etc., and CRUD methods), `CustomerFormContext`, `I18nProvider`. UI is expected to use only `useOfflineData()` (and auth/i18n hooks) for data; direct imports of `db` or `supabase` in UI violate the documented architecture (and exist in a few places: POS.tsx, RecentPayments.tsx, DevAccountingTestPanel, PublicCustomerStatement).
- **Key flow:** User signs in → branch selection (admin) or single branch (manager/cashier) → OfflineDataContext loads from IndexedDB and starts eventStreamService. CRUD goes through context → services + Dexie → then event emission (Supabase RPC). Sync runs on a debounced timer or manual trigger and uploads unsynced rows then downloads remote changes; Realtime events trigger a catch-up that pulls by version and updates IndexedDB, then context refreshes from DB.
- **Routing:** Hash router for Electron, browser router for web. Routes include `/`, `/inventory`, `/pos`, `/reports`, `/accounting`, `/accounts`, `/settings`, `/employees`, `/unsynced`, `/public/statement/:token`. Protected routes are wrapped with `ProtectedRoute(module)` which checks RBAC (rolePermissionService / user_module_access).

**Admin app**

- **State:** `AdminAuthContext` (user, isAuthenticated); no global data cache; pages fetch via services on mount or route change.
- **Routes:** `/`, `/login`, `/global-products`, `/global-logos`, `/stores`, `/stores/:storeId`, `/balance-migration`, `/subscriptions`, `/payments`, `/analytics`, `/role-permissions`, `/settings`. Unauthenticated users are redirected to `/login`; only users with `role='super_admin'` and `store_id` null are allowed.

---

## 10. Testing

**Store app**

- Vitest. Scripts: `test`, `test:run`, `test:ui`, `test:coverage` (from `apps/store-app/package.json`).
- Tests live under `src/services/__tests__/` and `src/constants/__tests__/` (e.g. balanceVerificationService, transactionService, syncService optimizations/performance, downloadOptimization, transactionCategories). `src/test/setup.ts` is used for test setup.
- Run from store-app: `pnpm test` or `pnpm test:run`. No root-level test script that runs all apps.

**Admin app**

- No test script or test runner configuration was found in the admin-app package.

**Philosophy**

- Developer rules require unit tests for services (mocked deps), integration tests for critical flows, and mocking of Supabase/IndexedDB where appropriate. Coverage is not enforced in the repo; tests focus on services and sync/transaction logic.

---

## 11. Deployment Notes

**Build artifacts**

- Store app (web): Vite build output in `apps/store-app/dist` (e.g. for Netlify or static hosting). Electron build produces Windows NSIS installer and artifacts under `apps/store-app/dist-electron` and builder output directory.
- Admin app: `tsc && vite build` → `apps/admin-app/dist` (or configured output dir).
- Shared: `packages/shared/dist` (TypeScript build); consumed by admin-app.

**CI/CD**

- No GitHub Actions or other CI configuration files were found. Netlify is used for web deployment; root `netlify.toml` defines a single build command that selects store-app or admin-app based on site name/URL, with publish directory set to `apps/admin-app/dist`. For clarity, it is recommended to use separate Netlify sites with explicit base directory and publish dir per app.

**Production assumptions**

- Supabase project is provisioned and env vars are set in the deployment environment.
- Node 20 and pnpm 10.20.0 are specified in root netlify.toml for Netlify.
- Electron builds target Windows x64 (nsis); auto-updater is configured (e.g. GitHub release provider) in store-app package.json.

---

## 12. Known Limitations

- **Architecture violations:** A few store-app UI components import `getDB` or `supabase` directly (POS.tsx, RecentPayments.tsx, DevAccountingTestPanel, PublicCustomerStatement), contrary to ARCHITECTURE_RULES.md.
- **Public customer statement:** The tokenized public route is documented as a security concern (client-side filtering, token lifetime, RLS). See `docs/PUBLIC_STATEMENT_SECURITY_RECOMMENDATIONS.md`.
- **Large modules:** OfflineDataContext and syncService are very large (~8k+ and ~2.8k lines respectively), with broad responsibilities and tight coupling.
- **Schema and migrations:** No SQL migrations in the repo; Supabase schema may be managed elsewhere. Dexie schema is in a single file with a single version number.
- **Multi-tab:** Multiple tabs of the store app on the same branch are not coordinated; each has its own Dexie and sync/Realtime state.
- **Type duplication:** Admin-app does not use store-app’s Supabase `Database` type; shared package is used by admin-app but not by store-app for some utils, leading to possible drift.

---

## 13. Contribution Guidelines

**Coding standards**

- Follow ARCHITECTURE_RULES.md and DEVELOPER_RULES.md. In particular:
  - UI must not import `db.ts` or `supabase`; use `useOfflineData()` (and auth/i18n as needed).
  - All financial transactions must go through `transactionService`; use TRANSACTION_CATEGORIES and proper context.
  - RBAC: use rolePermissionService, ProtectedRoute, and checkModuleAccess/checkOperationLimit.
  - Offline-first: writes go to IndexedDB first; sync and event emission are triggered by the context or designated services.
  - No periodic polling for sync; use event emission and eventStreamService.
- ESLint is used (lint script per app); TypeScript strictness is defined in each app’s tsconfig.

**Architectural constraints**

- New data access must go through OfflineDataContext (store app) or existing services (admin app).
- New Supabase tables require RLS and alignment with Dexie schema (and a version bump in db.ts) if used by the store app.
- Schema and migration patterns are described in DEVELOPER_RULES.md (store_id, branch_id, _synced, _deleted, etc.).

**Review expectations**

- Code review should verify data flow (offline-first, no direct db/supabase in UI), branch/store isolation, use of TransactionService for money flows, and RBAC where applicable. See the checklists in DEVELOPER_RULES.md and ARCHITECTURE_RULES.md.

---

## 14. License

No license file was found in the repository. Assume all rights reserved unless otherwise stated by the project owner.
