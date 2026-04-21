# Research — Currency Service & Context Wiring

**Feature**: 015-currency-service-wiring
**Date**: 2026-04-21
**Purpose**: Resolve design unknowns before Phase 1.

This document records the five design decisions that shape the implementation.
Each follows the `Decision / Rationale / Alternatives considered` format.

---

## R-1: Exchange rate storage model inside `CurrencyService`

**Decision**: Hold rates as `Partial<Record<CurrencyCode, number>>` internally, seeded with `{ USD: 1 }` and populated from the loaded store's scalar `exchange_rate` keyed under the store's `preferred_currency` when that currency is not USD. Converting between any two currencies uses USD as pivot (`from → USD → to`).

**Rationale**:
- Works with the current `stores.exchange_rate` (scalar) without introducing the `exchange_rates` JSONB column from Phase 10 (Task 17). Forward-compatible: when Phase 10 lands, `loadFromStore` just merges `store.exchange_rates` into the map.
- USD-as-pivot covers every conversion a Lebanese, Saudi, or UAE store can perform today with exactly one rate loaded per store.
- Keeping the map typed `Partial<...>` signals clearly that absence is a legal state (e.g. for a USD-only store only `{ USD: 1 }` is present).

**Alternatives considered**:
- **Full pairwise rate matrix** (e.g. `{ LBP_USD: 89500, USD_LBP: 1/89500 }`) — rejected; O(n²) storage for no behavioral benefit given pivot model is mathematically equivalent and aligns with how FX rates are quoted in practice.
- **Keep a single `rate: number` field** — rejected; violates FR-003's cross-currency convert requirement and blocks User Story 3.

---

## R-2: Context reactivity — React state vs. imperative service ref

**Decision**: Hold `acceptedCurrencies` and `preferredCurrency` in `useState` inside `OfflineDataContext`. Provide `formatAmount` as a `useCallback` whose dependency list includes the service instance. Post-sync, call `setAcceptedCurrencies` + `setPreferredCurrency` after `currencyService.loadFromStore(currentStoreId)` resolves; all subscribers re-render automatically.

**Rationale**:
- Matches the established `OfflineDataContext` pattern (products, entities, stores already held as reactive state).
- Satisfies User Story 4 ("updates without restart") without a per-component subscription shim.
- `useCallback` keeps the `formatAmount` reference stable between renders when dependencies are unchanged — avoids needless re-renders of memoized children.

**Alternatives considered**:
- **Imperative ref + event bus** — rejected; adds a second reactivity mechanism alongside React state, confusing for maintainers and requiring manual un-subscribe in every consumer.
- **Read from service at call time only** (no state) — rejected; components would not re-render when accepted currencies change after sync, breaking User Story 4.

Resolves spec clarification Q3 (Option A).

---

## R-3: Country change merge rule for `accepted_currencies`

**Decision**: When the admin picks or changes the country in `StoreForm`:
1. Set `preferred_currency` to `COUNTRY_MAP[newCountry].localCurrency`.
2. Build the new `accepted_currencies` as the union of (a) the previous `accepted_currencies` list and (b) `COUNTRY_MAP[newCountry].defaultCurrencies`. Order = previous-list order first, then any new items appended in `defaultCurrencies` order.
3. Clear the `exchange_rate` input.
4. On first country pick (where previous list is empty/unset), use `defaultCurrencies` directly.

**Rationale**:
- Matches spec clarification #1 (Option A): preserve manual additions, swap local currency.
- Union semantics are predictable and commutative enough to test.
- Ordering rule keeps the admin's curation visible on re-open and keeps `preferred_currency` first-displayed in dropdowns.

**Alternatives considered**:
- **Strict overwrite** — rejected by user (spec clarification #1 option B).
- **Prompt/confirm on change** — rejected (spec clarification #1 option C); adds modal friction to a routine form flow.

Resolves spec clarification Q1 (Option A).

---

## R-4: Usage-count guard when removing a currency in edit mode

**Decision**: At submit time, for each currency present in the currently-saved store row but missing from the new `accepted_currencies` list, issue three parallel Supabase `count()` queries against `inventory_items`, `transactions`, and `bills` (the latter filtered by open/unsettled state, i.e. `settled_at IS NULL` or the equivalent business predicate) filtered by `store_id` and `currency`. If any count is non-zero, hard-block submission and render a per-currency breakdown; do not persist any field of the form.

**Rationale**:
- Spec clarification #2 (Option A): hard-block is the chosen behaviour.
- All three tables are indexed by `store_id` and carry a `currency` column today (see `apps/store-app/src/types/database.ts`), so the queries are cheap and RLS-safe.
- Running queries in parallel via `Promise.all` keeps submit latency low even when multiple currencies are being removed.
- The guard runs only for the edit path (diff between saved and submitted lists) — create path never triggers it because there's no prior data.

**Alternatives considered**:
- **Warn-and-confirm dialog** (spec clarification #2 Option B) — rejected by user.
- **Server-side RPC** to do the count — rejected; no existing pattern for this in admin-app, and three direct `.select('id', { count: 'exact', head: true })` calls are simpler.
- **Client-side check against a synced store snapshot** — impossible; admin-app has no offline layer.

Resolves spec clarification Q2 (Option A).

---

## R-5: Removing legacy `CurrencyService` methods without breaking 14+ call sites

**Decision**: Keep the UI-facing hook `useCurrency()` stable as the compatibility layer. Its exported functions (`formatCurrencyWithSymbol`, `getConvertedAmount`, etc.) remain but their implementations are rewritten to delegate to `currencyService.format(...)` and `currencyService.convert(...)`. Delete `CurrencyService.formatCurrencyWithSymbol`, `getConvertedAmount`, `getSupportedCurrencies`, `safeConvertForDatabase`, and `updateExchangeRate` from the class itself. Direct callers of those class methods (identified in Phase 1 as `Accounting.tsx:1119` / `Accounting.tsx:1143` for `safeConvertForDatabase`, and `useStoreSettingsDataLayer.ts:80` for `refreshExchangeRate`) are migrated individually in this feature's scope.

**Rationale**:
- FR-007 requires the class to shed legacy methods, but the spec does not require every UI component to be refactored — just the service API.
- The hook-as-compat-layer pattern contains blast radius: the 14+ consumers see the same hook shape and don't need to be modified in this feature.
- The three direct-to-class call sites in non-UI code are explicit exceptions and are rewritten as part of this feature.

**Alternatives considered**:
- **Mass-refactor every UI caller to `formatAmount`** — rejected; doubles feature size, high merge-conflict risk with parallel work, adds no net value since the hook already abstracts the shape.
- **Leave legacy methods on the class and mark `@deprecated`** — rejected; violates FR-007 and FR-008's zero-reference check, and keeps dead code around.

Resolves spec clarification Q4 (Option B, which also dropped `updateExchangeRate` from this feature's scope).

---

## Additional notes

- **No Dexie migration in this feature**: spec 014 (currently on the parent branch) ships v55 with `country` and `accepted_currencies` columns on `stores`. This feature depends on that merge landing first.
- **Parity-gate impact**: because the golden snapshots in `apps/store-app/tests/sync-parity/` include currency-shaped data, a re-run of `pnpm parity:gate` is required after the refactor to confirm no accidental payload shape drift.
- **Admin-app usage-count queries bypass RLS concerns**: super-admin role already has full read access to `inventory_items`, `transactions`, and `bills` per existing policy. No new RLS policy is added by this feature.
