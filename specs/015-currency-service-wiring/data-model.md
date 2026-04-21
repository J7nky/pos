# Data Model — Currency Service & Context Wiring

**Feature**: 015-currency-service-wiring
**Date**: 2026-04-21

This feature introduces **no new persisted entities**. All storage-level changes (the `country` and `accepted_currencies` columns on `stores`, the supporting Dexie v55 schema, and the widened `StoreCore` type) were delivered by specs 013 and 014. What this document defines is the **runtime shape** of currency state held in memory by the `CurrencyService` singleton and surfaced through `OfflineDataContext`.

---

## Runtime Entity 1: `CurrencyServiceState`

Internal state of the `CurrencyService` singleton after `loadFromStore(storeId)` resolves.

| Field | Type | Notes |
|-------|------|-------|
| `storeId` | `string` | The currently-loaded store. Empty string when uninitialized. |
| `preferredCurrency` | `CurrencyCode` | From `store.preferred_currency`. Always present after load; `USD` as safe fallback if somehow missing. |
| `acceptedCurrencies` | `CurrencyCode[]` | From `store.accepted_currencies`. Ordered: preferred first. Fallback rule: if missing/empty on the store row, derive as `['USD']` when `preferredCurrency === 'USD'`, else `[preferredCurrency, 'USD']`. |
| `rates` | `Partial<Record<CurrencyCode, number>>` | `USD=1` always seeded. If `preferredCurrency !== 'USD'` and `store.exchange_rate > 0`, sets `rates[preferredCurrency] = store.exchange_rate`. |
| `isInitialized` | `boolean` | `true` after the first successful `loadFromStore`. `convert`/`format` throw a descriptive error when false (except for USD-to-USD identity conversions). |
| `lastLoadedAt` | `string` | ISO timestamp of last `loadFromStore` completion. Informational only. |

### State transitions

```text
unloaded ─────── loadFromStore(storeId)       ────► loaded
                                                       │
loaded   ─────── loadFromStore(sameStoreId)   ────► loaded (replaced)
                                                       │
loaded   ─────── loadFromStore(otherStoreId)  ────► loaded (replaced, storeId updated)
```

No partial-load state. If Dexie read fails, service stays `unloaded` (or retains previous `loaded` state) and the error surfaces to the caller.

### Invariants

1. `USD` is always in `rates` with value `1`.
2. `USD` is always in `acceptedCurrencies` (enforced at the admin form; service trusts this post-load).
3. `preferredCurrency` is always in `acceptedCurrencies`.
4. `rates[preferredCurrency]` is either defined and positive, or `preferredCurrency === 'USD'`.
5. Every code in `acceptedCurrencies` is also a key in the shared `CURRENCY_META` registry.

---

## Runtime Entity 2: `CurrencyContextState`

Shape exposed by `OfflineDataContext` to UI consumers (new fields only — other context fields unchanged).

| Field | Type | Reactive? | Source |
|-------|------|-----------|--------|
| `acceptedCurrencies` | `CurrencyCode[]` | **Yes** (`useState`) | Mirrors `CurrencyServiceState.acceptedCurrencies` after each `loadFromStore`. |
| `preferredCurrency` | `CurrencyCode` | **Yes** (`useState`) | Mirrors `CurrencyServiceState.preferredCurrency`. |
| `formatAmount` | `(amount: number, currency: CurrencyCode) => string` | Stable ref (`useCallback`) | Delegates to `currencyService.format`. |
| `exchangeRate` | `number` (legacy) | **Yes** (existing) | Unchanged — continues to mirror `store.exchange_rate`. Retained for backward compat with `useCurrency`. |
| `currency` | `CurrencyCode` (legacy) | **Yes** (existing) | Aliased to `preferredCurrency`. Retained for backward compat. |

### Update triggers

The context calls `currencyService.loadFromStore(currentStoreId)` and then reflects the result into state in three situations:

1. **Initial mount**: after `OfflineDataProvider` determines `currentStoreId` from Dexie.
2. **Post-sync hook**: after `syncService.downloadUpdates()` resolves, if any change touched the `stores` table.
3. **Explicit rate save** (via `useStoreSettingsDataLayer.updateExchangeRateLocal`): after the Dexie write, the context re-pulls.

### Invariants

1. `currency === preferredCurrency` at all times (legacy alias).
2. `acceptedCurrencies[0] === preferredCurrency` when `acceptedCurrencies` is non-empty.
3. `formatAmount` never throws for a currency in `CURRENCY_META`; it falls back to `en-US` formatting for an out-of-registry code and logs a warning.

---

## Runtime Entity 3: `AdminStoreFormState`

Transient React state of the admin-app `StoreForm` component.

| Field | Type | Required | Initial (create) | Initial (edit) |
|-------|------|----------|------------------|----------------|
| `name` | `string` | Yes | `''` | `store.name` |
| `country` | `string` (ISO-3166-1 alpha-2) | Yes | `''` | `store.country ?? ''` |
| `address` | `string` | No | `''` | `store.address ?? ''` |
| `phone` | `string` | No | `''` | `store.phone ?? ''` |
| `email` | `string` | No (but format-validated) | `''` | `store.email ?? ''` |
| `preferred_currency` | `CurrencyCode` | Yes | `'USD'` (placeholder until country pick) | `store.preferred_currency` |
| `accepted_currencies` | `CurrencyCode[]` | Yes, ≥1 entry | `[]` | `store.accepted_currencies ?? [store.preferred_currency, 'USD']` |
| `preferred_language` | `'en' \| 'ar' \| 'fr'` | Yes | `'en'` | `store.preferred_language` |
| `preferred_commission_rate` | `string` (parsed to number) | Yes | `'10'` | `String(store.preferred_commission_rate)` |
| `exchange_rate` | `string` (parsed to number) | Conditional | `''` | `String(store.exchange_rate ?? '')` |
| `subscription_plan` | `SubscriptionPlan` | Yes (create only) | `'premium'` | n/a |

### Validation (FR-014 + FR-014a)

| Rule | Applies to | Message |
|------|-----------|---------|
| `name` non-empty | both paths | "Store name is required" |
| `email` valid format if non-empty | both paths | "Invalid email address" |
| `preferred_commission_rate ∈ [0, 100]` | both paths | "Commission rate must be between 0 and 100" |
| `country` non-empty | both paths | "Country is required" |
| `accepted_currencies.length ≥ 1` | both paths | "Select at least one accepted currency" |
| `preferred_currency ∈ accepted_currencies` | both paths | "Preferred currency must be in accepted currencies" |
| `'USD' ∈ accepted_currencies` | both paths | "USD must be among accepted currencies" |
| `exchange_rate > 0` when `preferred_currency !== 'USD'` | both paths | "Exchange rate must be a positive number for non-USD stores" |
| Zero usage for every removed currency | edit path only | "Cannot remove [CODE]: X inventory items, Y transactions, Z open bills still use it" |

### State transitions on country change

```text
user picks country C:
  preferred_currency ← COUNTRY_MAP[C].localCurrency
  accepted_currencies ← union(prev_accepted_currencies, COUNTRY_MAP[C].defaultCurrencies)
  exchange_rate ← '' (always cleared)
```

Union is order-preserving: previous entries keep their positions, new entries append in `defaultCurrencies` order.

---

## Relationship to persisted schema

All three runtime entities above are **materialized from, and written back to, the persisted `stores` table** whose canonical shape is defined in spec 014. This feature does not add or remove any column. The mapping is:

| Persisted column | Runtime reflection |
|------------------|-------------------|
| `stores.country` | `AdminStoreFormState.country` (form-only; store-app does not use it at runtime beyond display) |
| `stores.preferred_currency` | `CurrencyServiceState.preferredCurrency` → `CurrencyContextState.preferredCurrency` |
| `stores.accepted_currencies` | `CurrencyServiceState.acceptedCurrencies` → `CurrencyContextState.acceptedCurrencies` |
| `stores.exchange_rate` | `CurrencyServiceState.rates[preferredCurrency]` (when non-USD) and legacy `CurrencyContextState.exchangeRate` |
