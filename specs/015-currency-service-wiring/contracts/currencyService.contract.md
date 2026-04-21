# Contract: `CurrencyService`

**File**: `apps/store-app/src/services/currencyService.ts`
**Feature**: 015-currency-service-wiring
**Status**: post-refactor target contract

The `CurrencyService` is a singleton exposed as `currencyService`. After this feature, its public surface shrinks and generalizes.

## New public API

```ts
import type { CurrencyCode, CurrencyMeta } from '@pos-platform/shared';

class CurrencyService {
  /** Singleton accessor. Lifetime = app session. */
  static getInstance(): CurrencyService;

  /**
   * Read the given store's row from Dexie and populate
   * preferredCurrency, acceptedCurrencies, and the rate map.
   * Safe to call repeatedly; state is replaced.
   */
  loadFromStore(storeId: string): Promise<void>;

  /**
   * Convert `amount` from `from` to `to` via USD as pivot.
   * - Same-currency conversion returns `amount` unchanged with no rate lookup.
   * - Throws `Error("No exchange rate available for X → Y")`
   *   when a needed rate is missing.
   * - Throws `Error("CurrencyService not initialized")`
   *   when called before any successful loadFromStore (except USD↔USD identity).
   */
  convert(amount: number, from: CurrencyCode, to: CurrencyCode): number;

  /**
   * Render an amount for display using
   * Intl.NumberFormat(CURRENCY_META[currency].locale, ...).
   * Decimal count is CURRENCY_META[currency].decimals.
   * Falls back to en-US formatting with a console.warn if `currency`
   * is not registered.
   */
  format(amount: number, currency: CurrencyCode): string;

  /** Returns CURRENCY_META[currency]. Throws if unknown. */
  getMeta(currency: CurrencyCode): CurrencyMeta;

  /** Returns a copy of the accepted-currency list. Preferred first. */
  getAcceptedCurrencies(): CurrencyCode[];

  /** Returns the preferred currency from the loaded store. */
  getPreferredCurrency(): CurrencyCode;

  /**
   * Backward-compat shim: returns the rate of the loaded store's
   * preferred currency vs USD. Returns 1 if preferredCurrency === 'USD'.
   * Returns 0 if unloaded (rather than throwing) to avoid cascading
   * errors in legacy call sites during boot.
   */
  getExchangeRate(): number;

  /** True after the first successful loadFromStore. */
  isReady(): boolean;
}
```

## Removed methods

The following methods are **deleted** from the class (FR-007):

| Method | Replacement for callers |
|--------|------------------------|
| `getSupportedCurrencies()` | `getAcceptedCurrencies()` |
| `safeConvertForDatabase(amount, currency)` | `convert(amount, currency, 'USD')` (callers update their write path) |
| `formatCurrencyWithSymbol(amount, currency)` | `format(amount, currency)` (via `useCurrency()` hook shim) |
| `getConvertedAmount(amount, currency)` | `convert(amount, currency, 'USD')` (via hook shim) |
| `updateExchangeRate(storeId, rate)` | deferred to Phase 12 — do **not** re-add in this feature |
| `refreshExchangeRate(storeId)` | `loadFromStore(storeId)` |
| `convertCurrency(amount, from, to)` | `convert(amount, from, to)` |
| `formatCurrency(amount, currency)` | `format(amount, currency)` |
| `validateCurrencyAmount(amount, currency)` | deleted — unused outside internal scope; if needed, re-add in the phase that needs it |

## Retained internals (unexported)

- The singleton registry pattern (`getInstance()` / `instance` static).
- A private `rates: Partial<Record<CurrencyCode, number>>` field with `USD=1` always seeded.

## Removed top-level exports

- `CurrencyConfig` interface — replaced by `CurrencyMeta` from `@pos-platform/shared`.
- `CurrencyConversion` interface — unused outside legacy code paths.

## Error semantics

| Condition | Behaviour |
|-----------|-----------|
| `convert(a, X, X)` before `loadFromStore` | Returns `a` (identity; no rate needed). |
| `convert(a, 'USD', 'USD')` ever | Returns `a`. |
| `convert(a, 'LBP', 'USD')` before `loadFromStore` | Throws `CurrencyService not initialized`. |
| `convert(a, 'LBP', 'EUR')` with only LBP rate loaded | Throws `No exchange rate available for LBP → EUR`. |
| `format(a, 'XYZ')` where `'XYZ' ∉ CURRENCY_META` | Returns `Intl.NumberFormat('en-US', ...).format(a)` and `console.warn`s once per unknown code. |
| `getMeta('XYZ')` where `'XYZ' ∉ CURRENCY_META` | Throws `Unknown currency: XYZ`. |

## Unit test checklist

Tests in `apps/store-app/src/services/__tests__/currencyService.test.ts` (Vitest):

- [ ] `loadFromStore` populates state from a Lebanese store fixture (`preferred_currency='LBP'`, `accepted_currencies=['LBP','USD']`, `exchange_rate=89500`).
- [ ] `loadFromStore` populates state from a USD-only store (`preferred_currency='USD'`, `accepted_currencies=['USD']`). `rates` map contains only `{ USD: 1 }`.
- [ ] `loadFromStore` with a legacy row missing `accepted_currencies` derives fallback `[preferred_currency, 'USD']`.
- [ ] `convert(100, 'USD', 'LBP')` returns `100 * 89500` after loading a Lebanese store.
- [ ] `convert(8950000, 'LBP', 'USD')` returns `100` after loading a Lebanese store.
- [ ] `convert(100, 'USD', 'USD')` returns `100`.
- [ ] `convert(100, 'USD', 'EUR')` throws with message naming `USD → EUR` when EUR rate not loaded.
- [ ] `convert(100, 'USD', 'LBP')` before any `loadFromStore` throws "not initialized".
- [ ] `format(10.5, 'USD')` returns `$10.50`.
- [ ] `format(1500000, 'LBP')` returns the Arabic-locale Lebanese-pound string with zero decimals.
- [ ] `format(500, 'JOD')` returns a 3-decimal Jordanian dinar string.
- [ ] `getAcceptedCurrencies()` returns `['LBP','USD']` (preferred first) after Lebanese-store load.
- [ ] `getExchangeRate()` returns `89500` for a Lebanese store, `1` for a USD store, `0` before load.
- [ ] Removed methods are **not** present on the class (TypeScript compile check).

## Integration with `useCurrency` hook

The hook wrapper (`apps/store-app/src/hooks/useCurrency.ts`) is rewritten to delegate to the service and context:

```ts
export function useCurrency() {
  const { acceptedCurrencies, preferredCurrency, formatAmount, exchangeRate, currency } = useOfflineData();

  // Backward-compat aliases (same signatures as before; different internals)
  const formatCurrency = (amount, fromCurrency = 'LBP') =>
    formatAmount(currencyService.convert(amount, fromCurrency, preferredCurrency), preferredCurrency);
  const formatCurrencyWithSymbol = (amount, curr) => formatAmount(amount, curr);
  const convertCurrency = (amount, from, to) => currencyService.convert(amount, from, to);
  const getConvertedAmount = (amount, originalCurrency) =>
    currencyService.convert(amount, originalCurrency, preferredCurrency);
  const getCurrencySymbol = () => currencyService.getMeta(preferredCurrency).symbol;

  return {
    currency,              // legacy alias of preferredCurrency
    preferredCurrency,
    acceptedCurrencies,    // NEW — expose to consumers that want the full list
    formatCurrency,
    formatCurrencyWithSymbol,
    formatAmount,          // NEW
    convertCurrency,
    getConvertedAmount,
    getCurrencySymbol,
    exchangeRate,
  };
}
```

All 14+ downstream callers continue working without modification thanks to the preserved shape.
