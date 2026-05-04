# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Souq POS** — an offline-first, multilingual wholesale produce market POS/ERP system. Two apps in a pnpm monorepo:

- **`apps/store-app`**: Full POS (web + Electron desktop). Offline-first: IndexedDB (Dexie v4) is the source of truth, synced to Supabase when online.
- **`apps/admin-app`**: Super-admin SPA (Supabase-only, no offline layer).
- **`packages/shared`**: Shared constants, utils, and types.

---

## Commands

Run from repo root (requires `pnpm`):

```bash
pnpm dev:store        # Store app dev server
pnpm dev:admin        # Admin app dev server
pnpm dev:all          # Both concurrently
pnpm build:store
pnpm build:admin
pnpm build:all
pnpm lint             # ESLint across all packages
pnpm clean            # Remove dist/node_modules
pnpm setup            # Install + initial setup
```

Store-app specific (from `apps/store-app/`):

```bash
pnpm dev:electron     # Electron dev mode
pnpm build:electron   # Build Windows NSIS installer
pnpm test             # Vitest (watch mode)
pnpm test:run         # Vitest (single run)
pnpm test:ui          # Vitest UI
pnpm test:coverage
pnpm parity:gate      # Sync parity golden snapshot verification
```

---

## Architecture

### The Offline-First Data Flow (store-app)

```
UI Components
    ↓ (hooks only)
OfflineDataContext  (contexts/OfflineDataContext.tsx — 1100+ lines)
    ↓
Domain Data Layers  (12 layers: Product, Entity, Transaction, Bill, etc.)
    ↓
Dexie (IndexedDB)  ←→  syncService  ←→  Supabase
```

**The single most important rule**: UI must never import `db`, `supabase`, or service modules directly. All data access goes through `OfflineDataContext`. See `ARCHITECTURE_RULES.md`.

### Sync Architecture (Event-Driven)

- Supabase `branch_event_log` table is an append-only event log. One event per completed business action (not per row changed).
- Realtime subscription via `eventStreamService` receives a wake-up signal; the client then pulls events by sequential version number.
- On reconnect, clients catch up deterministically by fetching all missed events.
- Tables are split into two categories:
  - **Event-driven** (high-frequency writes): `bills`, `transactions`, `inventory_items`, `journal_entries`
  - **Periodic sync** (configuration data): `stores`, `branches`, `products`, `entities`, `users`, RBAC tables

**Tiered incremental sync** (current branch `009-tiered-incremental-sync`):
- Tier 1 (hydrate first — UI critical): `stores`, `branches`, `products`, `users`, `cash_drawer_accounts`, `chart_of_accounts`, `entities`, `cash_drawer_sessions`, role/user permissions
- Tier 2 (business data): `inventory_bills`, `inventory_items`, `transactions`, `bills`, `journal_entries`, `balance_snapshots`, etc.
- Per-table delta checkpoints in `sync_metadata` for resumable sync.

See `EVENT_DRIVEN_SYNC_ARCHITECTURE.md` for the full design.

### Dexie Schema

`apps/store-app/src/lib/db.ts` — 27+ tables, currently at **version 54**. Every table carries `_synced`, `_deleted`, `_lastSyncedAt` metadata. Schema changes **require** a version bump and migration logic.

### Accounting

All financial operations must go through `transactionService.createTransaction()` for atomic double-entry journal entries. Never write to `transactions` or `journal_entries` directly. See `ATOMIC_TRANSACTIONS_NEW_ARCHITECTURE.md`.

### RBAC

Permission checks via `rolePermissionService`. Route-level enforcement via `<ProtectedRoute>`. Data is scoped by `store_id` + `branch_id` in both Dexie queries and Supabase RLS.

### Admin App

Thin SPA — reads/writes Supabase directly (no IndexedDB). Access restricted to `role='super_admin'` users with `store_id = null`.

---

## Key Source Files

| File | Purpose |
|---|---|
| `apps/store-app/src/contexts/OfflineDataContext.tsx` | Central state orchestration |
| `apps/store-app/src/lib/db.ts` | Dexie schema (all 27+ tables) |
| `apps/store-app/src/services/syncService.ts` | Sync orchestration (upload/download/deletion) |
| `apps/store-app/src/services/transactionService.ts` | Atomic financial transactions |
| `apps/store-app/src/services/eventEmissionService.ts` | Emit events to `branch_event_log` |
| `apps/store-app/src/services/eventStreamService.ts` | Realtime subscription + version tracking |
| `apps/store-app/src/types/database.ts` | Supabase-generated types (do not edit manually) |
| `DEVELOPER_RULES.md` | 14 mandatory dev rules |
| `ARCHITECTURE_RULES.md` | Data access layer rules |

---

## Environment Variables

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_SERVICE_ROLE_KEY  # optional, admin tasks only
```

---

## Deployment

- **Web**: Netlify. Build target determined by `SITE_NAME` env var (routes to store-app or admin-app build).
- **Desktop**: Electron with `electron-builder` → Windows NSIS installer with auto-updater.

---

## Multilingual Support

Strings are stored as `{ en: string, ar: string }` objects. Use `createMultilingualFromString()` and `getTranslatedString()` — never store plain strings in multilingual fields.

## Active Technologies
- TypeScript 5.x, React 18, Node.js ≥18 + Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38 (010-incremental-sync-redesign)
- Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary) (010-incremental-sync-redesign)
- Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary). Undo payload lives in browser storage (sessionStorage after this change). (011-undo-system-fixes)
- Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary). No schema changes in this feature — consumes columns introduced by spec 014. (016-inventory-pos-currency)
- Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary, schema bump 54 → 55) (018-balance-sheet)

## Recent Changes
- 010-incremental-sync-redesign: Added TypeScript 5.x, React 18, Node.js ≥18 + Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38
