# Contract: `OfflineDataContext` Currency Surface

**File**: `apps/store-app/src/contexts/OfflineDataContext.tsx` (+ `offlineData/` helpers)
**Feature**: 015-currency-service-wiring
**Status**: post-refactor target contract

## New exposed fields

The context's return value (its `useOfflineData()` hook) gains three currency-aware fields. Existing fields are preserved.

```ts
type OfflineDataContextValue = /* existing fields */ & {
  /**
   * Ordered list of currencies the current store accepts.
   * First entry is the preferred currency. Reflects the saved store row.
   * Reactive React state: components re-render when this changes.
   */
  acceptedCurrencies: CurrencyCode[];

  /**
   * The current store's preferred currency. Same-value alias of
   * the legacy `currency` field. Reactive.
   */
  preferredCurrency: CurrencyCode;

  /**
   * Format an amount in a given currency using CURRENCY_META-driven
   * locale/decimals/symbol. Stable callback reference.
   */
  formatAmount: (amount: number, currency: CurrencyCode) => string;

  // Existing (preserved):
  currency: CurrencyCode;          // legacy alias of preferredCurrency
  exchangeRate: number;            // legacy scalar rate
  // ... all other existing context fields unchanged
};
```

## Internal state

```ts
const [acceptedCurrencies, setAcceptedCurrencies] = useState<CurrencyCode[]>(['USD']);
const [preferredCurrency, setPreferredCurrency] = useState<CurrencyCode>('USD');

const reloadCurrencyState = useCallback(async (storeId: string) => {
  if (!storeId) return;
  await currencyService.loadFromStore(storeId);
  setPreferredCurrency(currencyService.getPreferredCurrency());
  setAcceptedCurrencies(currencyService.getAcceptedCurrencies());
  // Legacy `currency` and `exchangeRate` states, which already exist,
  // are updated alongside inside their existing setters so legacy
  // hook callers keep working:
  setCurrency(currencyService.getPreferredCurrency());
  setExchangeRate(currencyService.getExchangeRate());
}, []);

const formatAmount = useCallback(
  (amount: number, currency: CurrencyCode) => currencyService.format(amount, currency),
  [preferredCurrency] // dep only so stale renders pick up the latest service state
);
```

## Trigger points

`reloadCurrencyState(currentStoreId)` is invoked:

1. **On initial hydrate**, inside `useOfflineInitialization` (after Dexie is ready and `currentStoreId` is known). Replaces the current ad-hoc `CurrencyService.refreshExchangeRate` call at `useStoreSettingsDataLayer.ts:80`.
2. **After each successful download-sync cycle** — hook into the existing post-sync callback in `syncService`/`OfflineDataContext` that already triggers context refresh for other tables. When the sync result indicates `stores` table was touched, call `reloadCurrencyState`. If the sync layer does not report per-table touch, call it unconditionally at the end of every sync — cost is one Dexie read.
3. **After explicit local store mutation** via `useStoreSettingsDataLayer` (e.g. preferred-currency change). Existing flow calls `refreshExchangeRate`; the new flow calls `reloadCurrencyState` instead.

## Invariants

1. After the first `reloadCurrencyState`, `acceptedCurrencies.length >= 1` and contains USD.
2. `preferredCurrency === currency` (legacy alias) always.
3. `formatAmount` never throws — it falls back to `en-US` for unknown codes (see currencyService contract).
4. Consumers of `acceptedCurrencies` / `preferredCurrency` re-render exactly when the values change (React state semantics — reference equality).
5. `currentStoreId` can change (multi-store future). Each change MUST cause a fresh `reloadCurrencyState` call.

## Removed / redirected call sites in this feature

| File:Line | Before | After |
|-----------|--------|-------|
| `offlineData/useStoreSettingsDataLayer.ts:80` | `CurrencyService.getInstance().refreshExchangeRate(storeId)` | `reloadCurrencyState(storeId)` (via context, not direct service) |
| `pages/Accounting.tsx:1119` | `CurrencyService.getInstance().safeConvertForDatabase(fees.commission, currency)` | `currencyService.convert(fees.commission, currency, 'USD')` + direct write of `{ amount, currency: 'USD' }` |
| `pages/Accounting.tsx:1143` | same pattern for supplier amount | same replacement |
| `hooks/useCurrency.ts` whole file | reads `currency` + `exchangeRate` from context and does its own math | reads `acceptedCurrencies`, `preferredCurrency`, `formatAmount` from context and delegates math to `currencyService.convert` |

All 14+ downstream callers of `useCurrency().formatCurrencyWithSymbol` / `.getConvertedAmount` see **no API change** — the hook's output shape is preserved (see `currencyService.contract.md` § "Integration with `useCurrency` hook").

## Acceptance tests

- [ ] After boot on a Lebanese store, `useOfflineData().preferredCurrency === 'LBP'` and `acceptedCurrencies` is `['LBP','USD']`.
- [ ] After boot on a USD-only store, `acceptedCurrencies` is `['USD']`.
- [ ] After a sync that adds `EUR` to the store's accepted currencies in Supabase, components subscribed to `acceptedCurrencies` re-render within one tick and show the new list.
- [ ] `formatAmount(1500000, 'LBP')` returns the same Arabic-locale-formatted string before and after re-renders (reference stability).
- [ ] Calling `formatAmount` from a page with `React.memo` children does not trigger cascading re-renders across unrelated state changes.
