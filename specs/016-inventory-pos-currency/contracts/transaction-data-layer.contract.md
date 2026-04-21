# Contract: Transaction Data Layer (hardened `currency` input)

**Feature**: 016-inventory-pos-currency
**Module**: `apps/store-app/src/contexts/offlineData/useTransactionDataLayer.ts`
**Spec refs**: FR-015, FR-018

## Scope

Tightens the `addTransaction` entry point's currency handling. Removes the silent `|| 'USD'` coercion at the existing line ~74.

---

## Before / after

### Before (removed by this feature)

```ts
currency: (transactionData.currency as 'USD' | 'LBP') || 'USD',
```

The expression above has two defects:

1. It casts through a narrowed union, masking any caller that passed a non-LBP-non-USD currency.
2. It silently coerces missing/empty values to `'USD'` — which, in a store whose ledger is denominated in a different currency, writes an incorrect row.

### After (introduced by this feature)

```ts
const currency = assertValidCurrency(
  transactionData.currency,
  currencyService.getAcceptedCurrencies(),
  { storeId: currentStoreId }
);
// ...then use `currency` directly in the Dexie write
```

Where `assertValidCurrency(value, acceptedCurrencies, ctx)`:

- Throws `InvalidCurrencyError({ reason: 'missing', storeId })` when `value == null`.
- Throws `InvalidCurrencyError({ reason: 'not-accepted', attemptedCurrency: value, acceptedCurrencies, storeId })` when `value ∉ acceptedCurrencies`.
- Returns `value as CurrencyCode` on success.

---

## Input contract

```ts
interface AddTransactionInput {
  // ...existing fields unchanged...
  currency: CurrencyCode;      // REQUIRED, no fallback — callers must supply
  // ...
}
```

## Post-conditions

- `transactions.<newId>.currency === input.currency` — no coercion, no fallback.
- No `transactions` row is ever written with a currency outside the store's accepted set.

## Error surface

Errors propagate from the data layer up through the context and are caught by the calling UI layer, which renders a toast using the `transaction.currencyMissing` or `transaction.currencyNotAccepted` i18n keys.

---

## Caller audit requirement

Before merge, every call site of `useTransactionDataLayer.addTransaction` in the store-app is grep-audited to confirm a valid `currency` is passed. The audit is captured in the task list (Phase 2) and must show zero callers that rely on the removed fallback.

Current known call sites (from Bucket B survey):

- `billOperations.createBill` → already receives `currency` from the caller (POS picker); safe.
- `saleOperations.updateSale` at line ~95 → confirmed to pass `currency` through the deps contract; safe.
- Any other caller discovered during audit must be fixed in this feature, not deferred.

---

## i18n keys (new)

| Key | English (example) |
|---|---|
| `transaction.currencyMissing` | `This operation could not be saved: no currency was provided.` |
| `transaction.currencyNotAccepted` | `This operation could not be saved: currency {attempted} is not in this store's accepted list ({acceptedList}).` |

Arabic and French ship alongside (CG-10).
