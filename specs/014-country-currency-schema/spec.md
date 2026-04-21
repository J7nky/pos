# Feature Specification: Country & Multi-Currency Schema Widening

**Feature Branch**: `014-country-currency-schema`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "start collecting the requirements for @specs/008-multi-currency-country/TASKS.md next phase"

## Context

This is **Phase 2** of the multi-currency / country-aware store initiative defined in `specs/008-multi-currency-country/TASKS.md`. Phase 1 (`013-shared-currency-foundation`) introduced the `CurrencyCode` union, `CURRENCY_META`, and the `COUNTRY_CONFIGS` map in `@pos-platform/shared`. Those types currently exist but no application surface consumes them — every transactional, store, and inventory record is still typed with the legacy `'USD' | 'LBP'` union, and the database has no `country` or `accepted_currencies` columns on `stores`.

Phase 2 is the **schema widening** step: it propagates the new shared types into the database, the cross-app contracts, the store-app TypeScript types, and the local Dexie schema. It deliberately introduces **no behavior changes** — every existing flow keeps working, every existing record stays valid, and both apps continue to compile and run identically. Its only purpose is to remove the structural blockers that prevent later phases (CurrencyService refactor, admin form, POS sell flow, accounting columns) from being shipped.

This phase corresponds to Tasks 3, 4, 5, and 6 in `specs/008-multi-currency-country/TASKS.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Existing Lebanon stores keep working unchanged (Priority: P1)

After the database migration runs and the apps are rebuilt against the widened types, an existing Lebanon-based store with `preferred_currency = 'LBP'` and a mix of LBP/USD inventory items must continue to operate exactly as it did before. Cashiers can ring sales, accept payments, sync to Supabase, and reload the app with no visible difference and no data loss.

**Why this priority**: Phase 2 is a no-behavior-change foundation. If existing stores break, the whole multi-currency initiative is blocked. Backward compatibility is the single most important success criterion.

**Independent Test**: Take a snapshot of a populated store-app instance (Dexie + Supabase). Apply the migration and rebuild the apps. Reopen the app — every existing screen renders the same data, every existing record retains its original `currency` value, and a sync round-trip produces no diffs against the snapshot.

**Acceptance Scenarios**:

1. **Given** a Lebanon store with rows in `stores`, `inventory_items`, and `transactions` written under the old schema, **When** the new migration runs and the app is reloaded, **Then** the store row gains `country = 'LB'` and `accepted_currencies = ['LBP', 'USD']` (back-filled), every inventory item retains its existing `currency`, and no transaction is altered.
2. **Given** a US store with `preferred_currency = 'USD'`, **When** the migration runs, **Then** its `country` is back-filled to a non-Lebanon value (or left empty if it cannot be inferred) and `accepted_currencies` is back-filled to `['USD']`.
3. **Given** the apps are rebuilt against the new shared types, **When** TypeScript compilation runs (`pnpm --filter store-app build`, `pnpm --filter admin-app build`), **Then** the build passes with zero new currency-related type errors.

---

### User Story 2 — Downstream phases can read country and accepted_currencies (Priority: P1)

A downstream phase (e.g. Phase 3 CurrencyService refactor, Phase 4 admin StoreForm) can read `store.country` and `store.accepted_currencies` from both the Supabase row and the Dexie row using the new typed contracts, without falling back to derivation logic and without casting.

**Why this priority**: The whole point of Phase 2 is to unblock Phases 3–12. If the new fields are not first-class, type-safe, and present everywhere a store row is read, the downstream phases cannot proceed.

**Independent Test**: Open a TypeScript scratch file in either app, import `StoreCore` from `@pos-platform/shared`, and access `.country` and `.accepted_currencies` directly. The compiler must accept it; the runtime value must be populated for every store row in Dexie and Supabase after migration.

**Acceptance Scenarios**:

1. **Given** the widened `StoreCore` type, **When** a developer types `store.accepted_currencies[0]`, **Then** the inferred type is `CurrencyCode` (not `string`).
2. **Given** a Dexie `stores.get(id)` call after the v55 upgrade, **When** the returned row is inspected, **Then** `country` and `accepted_currencies` are present and populated for every row.
3. **Given** a `select * from stores` Supabase query after the migration, **When** the response is mapped to `StoreCore`, **Then** all rows include the two new columns with non-null values.

---

### User Story 3 — Inventory item currency is explicit and required (Priority: P2)

The store-app `inventory_items.currency` field becomes a required `CurrencyCode` in TypeScript, matching the existing Dexie index. Any code path that previously relied on `currency` being optional and silently defaulting must surface its missing value as a type error, so downstream phases (Phase 6) can enforce that every inventory item carries a real currency.

**Why this priority**: Without this, Phase 6 (inventory multi-currency) has to do runtime archaeology to figure out which items have a currency and which don't. Tightening the type now is a one-line change with high payoff later.

**Independent Test**: Search the store-app for any literal `currency?:` or `currency: undefined` on an inventory item. After this phase, none should remain in code; the only optional usage should be in legacy transient types.

**Acceptance Scenarios**:

1. **Given** the widened `inventory_items` Row type, **When** a developer omits `currency` from an insert payload, **Then** TypeScript reports a compilation error.
2. **Given** an existing inventory item in Dexie that was written before this phase with no `currency`, **When** the v55 upgrade runs, **Then** the item's `currency` is back-filled to a sensible default (the store's `preferred_currency`).

### Edge Cases

- **Stores with no `preferred_currency` set**: Back-fill `accepted_currencies` to `['USD']` and `country` to a configured default (Lebanon, matching the historical platform default), to preserve continuity.
- **Stores in Dexie that have never synced**: The v55 upgrade hook must run identically on local-only rows — it cannot depend on a Supabase round-trip having happened.
- **A Supabase row that already has non-default `accepted_currencies` from a manual seed**: The migration must not overwrite values that differ from the default `ARRAY['LBP','USD']`.
- **A store row that exists in Supabase but not yet in Dexie at the time of upgrade**: The next sync down must populate the new fields without triggering a Dexie schema mismatch.
- **An inventory item with a `currency` value not in the store's eventual `accepted_currencies`**: Phase 2 does **not** validate this — it only widens the type. The validation lands in Phase 6. The type must accept any `CurrencyCode` regardless of the parent store's accepted set.
- **Apps mid-flight when migration deploys**: A user with the old client open at the moment the SQL migration runs must not see broken queries. New columns are additive with defaults, so existing `SELECT` and `INSERT` statements from the old client must continue to succeed.

## Requirements *(mandatory)*

### Functional Requirements

#### Database schema (Supabase)

- **FR-001**: The `public.stores` table MUST gain a `country` column of type `TEXT`, holding an ISO 3166-1 alpha-2 code, with a default of `'LB'` so existing rows remain valid.
- **FR-002**: The `public.stores` table MUST gain an `accepted_currencies` column of type `TEXT[]` (array of ISO 4217 codes), declared `NOT NULL` with a default of `ARRAY['LBP','USD']`.
- **FR-003**: The migration MUST back-fill `accepted_currencies` for existing rows so that:
  - rows with `preferred_currency = 'USD'` get `['USD']`,
  - all other rows get `[preferred_currency, 'USD']`.
- **FR-004**: The migration MUST NOT remove, rename, or alter the existing `preferred_currency` or `exchange_rate` columns.
- **FR-005**: The migration MUST be idempotent (`ADD COLUMN IF NOT EXISTS`, guarded `UPDATE`) so re-running it on an already-migrated database is a no-op.

#### Cross-app shared types (`@pos-platform/shared`)

- **FR-006**: `StoreCore` MUST add a `country: string` field and an `accepted_currencies: CurrencyCode[]` field, and MUST change `preferred_currency` from the literal `'USD' | 'LBP'` union to `CurrencyCode`.
- **FR-007**: A `StoreCoreInsert` type MUST be exported from the shared package, mirroring `StoreCore` but with all fields except `name` declared optional, so insert payloads can be typed without requiring every column.
- **FR-008**: The shared package MUST keep `'USD'` and `'LBP'` as valid `preferred_currency` values (they are members of `CurrencyCode`) so no caller needs to be updated to compile.
- **FR-009**: The shared package MUST continue to export every type and constant it exported before this phase; no public symbol is renamed or removed.

#### Store-app TypeScript types

- **FR-010**: `apps/store-app/src/types/database.ts` MUST replace every `'USD' | 'LBP'` union appearing on a currency column with `CurrencyCode`, in `Row`, `Insert`, and `Update` shapes, for the tables `stores`, `inventory_items`, `transactions`, and `cash_drawer_accounts`.
- **FR-011**: The `stores` Row/Insert/Update shapes MUST add `country: string | null` and `accepted_currencies: CurrencyCode[]` (Insert/Update may declare them optional).
- **FR-012**: The `inventory_items.Row.currency` field MUST become a required `CurrencyCode` (no longer optional in the `Row` shape). `Insert` and `Update` MAY keep `currency` optional, but defaults must be applied at the write boundary.
- **FR-013**: The local `InventoryItem` interface in `apps/store-app/src/types/index.ts` MUST replace its `currency?: 'USD' | 'LBP'` field with `currency?: CurrencyCode`.
- **FR-014**: The store-app `Transaction` type's `currency` field MUST be migrated from `'USD' | 'LBP'` to `CurrencyCode` so downstream phases can write transactions in any supported currency.

#### Local Dexie schema (store-app)

- **FR-015**: The Dexie schema MUST be bumped to version 55. The `stores` index string MUST add `country` and `accepted_currencies` (the latter only if Dexie's array indexing constraints permit; otherwise drop it from the index but persist it on the row).
- **FR-016**: The v55 `.upgrade()` hook MUST iterate every existing local `stores` row and back-fill:
  - `country` — from a best-effort mapping (e.g. `preferred_currency === 'LBP'` → `'LB'`; `'USD'` → empty string or a configured default), preserving any value already set;
  - `accepted_currencies` — using the same logic as the SQL back-fill (FR-003), preserving any non-empty array already set.
- **FR-017**: The v55 `.upgrade()` hook MUST iterate every existing `inventory_items` row that has no `currency` value and assign it the parent store's `preferred_currency` so the field is uniformly populated.
- **FR-018**: The Dexie upgrade MUST NOT throw on rows that already conform to v55, so a re-run after a partial upgrade is safe.

#### Build, sync, and runtime contracts

- **FR-019**: After this phase, both `pnpm --filter store-app build` and `pnpm --filter admin-app build` MUST pass with zero currency-type-related TypeScript errors.
- **FR-020**: The store-app MUST boot against an existing populated IndexedDB without triggering a Dexie version mismatch dialog or any user-visible upgrade error.
- **FR-021**: A sync round-trip (download → upload) immediately after the upgrade MUST NOT mark every existing row as dirty — only rows whose new fields were back-filled to match the Supabase value should be considered in sync.
- **FR-022**: No runtime behavior changes are introduced in this phase: the POS sell flow, inventory creation flow, syncService, currencyService, and admin StoreForm all behave identically to their pre-phase implementations.

#### Out of scope (explicitly deferred to later phases)

- Any change to `apps/store-app/src/services/currencyService.ts` beyond what is required to keep it compiling. Multi-currency awareness lands in Phase 3.
- Any change to `apps/admin-app/src/components/stores/StoreForm.tsx`. The country selector and accepted-currencies multi-select land in Phase 4.
- Any validation that an inventory item's `currency` is in the parent store's `accepted_currencies`. That guard lands in Phase 6.
- Any change to `journal_entries`, `balance_snapshots`, or the dual-ledger accounting columns. Those land in Phase 11.
- Any change to the scalar `exchange_rate` or addition of an `exchange_rates` map. That lands in Phase 10.

### Key Entities

- **Store (`stores` table / `StoreCore`)**: A physical or logical retail location. Phase 2 widens it with `country` (ISO 3166-1 alpha-2) and `accepted_currencies` (ordered array of `CurrencyCode`, preferred currency first by convention). The legacy `preferred_currency` and `exchange_rate` fields remain unchanged.
- **Inventory Item (`inventory_items` table)**: A SKU stocked at a branch. Its `currency` field is tightened from "optional, USD or LBP" to "required, any `CurrencyCode`" so downstream phases can rely on it being present.
- **Transaction (`transactions` table)**: A financial movement. Its `currency` field is widened from `'USD' | 'LBP'` to `CurrencyCode` so non-Lebanon stores can write transactions in their local currency in later phases.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the SQL migration runs against a database with at least one existing Lebanon store and one existing US store, both rows have non-null `country` and `accepted_currencies` values that match the back-fill rules in FR-003. Verifiable via a single `SELECT id, country, accepted_currencies FROM stores` query.
- **SC-002**: After the Dexie v55 upgrade runs against a pre-populated IndexedDB containing at least one store and ten inventory items, every store row carries a populated `country` and `accepted_currencies`, and every inventory item carries a non-null `currency`. Verifiable in the browser DevTools Application tab.
- **SC-003**: The full monorepo build (`pnpm build:all`) completes with zero currency-type-related compilation errors.
- **SC-004**: An end-to-end smoke run of the existing core flows (login, view inventory, ring a sale in LBP, accept payment, sync) on a Lebanon store completes with no user-visible regressions and no new console errors compared to a baseline run captured before the phase.
- **SC-005**: The sync parity gate (`pnpm parity:gate`) passes with no new diffs introduced by the type widening.
- **SC-006**: A reviewer can confirm in under five minutes that no behavior changed in this phase by inspecting the diff: only `*.sql`, `packages/shared/src/types/*`, `apps/store-app/src/types/*`, and `apps/store-app/src/lib/db.ts` should be touched. No service files, no components, no hooks.

## Assumptions

- Lebanon (`'LB'`) is the appropriate default `country` for legacy rows whose country cannot be determined from `preferred_currency`. This matches the historical platform default; any subsequent re-classification is a manual data fix, not a Phase 2 concern.
- The `accepted_currencies` column does not need to be indexed for query performance in Phase 2; it is read whole-row, never range-queried.
- The Dexie array indexing limitation (no full-text array index) is acceptable; `accepted_currencies` lives on the row but does not appear in the Dexie index string if it causes problems.
- No client mid-flight at migration time will break, because the migration is purely additive with defaults.
- Phase 1 (`013-shared-currency-foundation`) is already merged: `CurrencyCode`, `CURRENCY_META`, `COUNTRY_CONFIGS`, and `getDefaultCurrenciesForCountry` are available from `@pos-platform/shared`.
- The dual-ledger accounting tables (`journal_entries`, `balance_snapshots`) and their hardcoded `_usd` / `_lbp` columns are out of scope and untouched, as called out in `008-multi-currency-country/TASKS.md`.

## Dependencies

- **Phase 1** (`013-shared-currency-foundation`) must be merged. Phase 2 imports `CurrencyCode` from `@pos-platform/shared`.
- **Supabase access**: Migrations are applied via `supabase db push`. A staging database is required to verify back-fill behavior before production rollout.
- **No new third-party dependencies** are introduced.
