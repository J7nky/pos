# Contract: POS Sell Flow (bill creation, line-item conversion, bill persistence)

**Feature**: 016-inventory-pos-currency
**Modules**:
- `apps/store-app/src/pages/POS.tsx` (UI orchestration)
- `apps/store-app/src/contexts/offlineData/operations/billOperations.ts` (`createBill`)
- `apps/store-app/src/contexts/offlineData/operations/saleOperations.ts` (`addLineItem`, `updateSale`)

**Spec refs**: FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-019, FR-020, FR-021

## Scope

Three concerns:

1. **Settlement-currency picker** — UI contract for the new per-bill picker.
2. **Cart line-item conversion** — arithmetic contract that produces the stored `unit_price`.
3. **Bill persistence** — write-time validation + immutability guarantees.

---

## 1. Settlement-currency picker (UI)

### When rendered

- On new-bill / new-tab creation in `POS.tsx`, BEFORE any line item is added.
- NOT rendered when `acceptedCurrencies.length === 1` (deterministic selection is applied silently — the sole accepted currency is used).

### Element contract

- **Type**: segmented button group (preferred) or dropdown.
- **Options**: `useCurrency().acceptedCurrencies` — in the order the store lists them (preferred first).
- **Default selection**: `useCurrency().preferredCurrency`.
- **Locks after**: the first line item is added to the bill's cart. Once locked, the picker is rendered in a disabled state with tooltip "Void the bill to change currency." (FR-019)

### State flow

```text
POS new-bill init
   │
   ▼
settlementCurrency ← preferredCurrency
   │
   ├── acceptedCurrencies.length === 1  →  picker hidden
   │
   └── acceptedCurrencies.length > 1    →  picker rendered, cashier may change
          │
          ▼
   first line added  →  picker locked
          │
          ▼
   bill save (createBill)  ←  settlementCurrency
```

### Error surfaces

- User attempts to add a line before `currencyService` is initialized → add-to-cart disabled with tooltip "Loading…"; no error shown.
- Settlement currency somehow falls out of `acceptedCurrencies` (store config changed mid-bill via another device's sync): creation fails with `InvalidCurrencyError`; cashier is shown toast `bill.settlementNotAccepted` and the bill is voided.

---

## 2. Cart line-item conversion (arithmetic)

### Inputs

- `item` — the `InventoryItem` being added. Has `currency: CurrencyCode`, `selling_price: number`.
- `quantity` — positive number.
- `billCurrency` — the bill's settlement currency.

### Algorithm

```
function computeLineUnitPrice(item, billCurrency):
    if item.currency == null:
        throw LegacyCurrencyMissingError(item.id)

    if item.currency === billCurrency:
        return item.selling_price                          // identity — no rounding

    raw = currencyService.convert(
              item.selling_price,
              item.currency,
              billCurrency
          )                                                // may throw MissingExchangeRateError

    return roundHalfEven(raw, CURRENCY_META[billCurrency].decimals)
```

### Post-conditions

- Line row's `unit_price` is always denominated in `billCurrency`.
- Rounding precision matches the target (bill) currency's decimals — NOT the source item's.
- Identity case (`item.currency === billCurrency`) bypasses the rounding step entirely so that a USD-priced item at $10.50 shows `10.50` exactly, not `10.50` after a round-trip through `roundHalfEven`.

### Bill total

- `bill.total = Σ (line.unit_price × line.quantity)` over all lines.
- Sum is computed after each line's rounding; no re-computation from source prices.
- `total` is NOT re-rounded — it is already the sum of rounded line totals.

### Error modes

| Condition | Thrown | UI surface |
|---|---|---|
| `item.currency == null` | `LegacyCurrencyMissingError` | Toast: `inventory.missingCurrency` + suggestion to edit the item |
| `currencyService.convert` raises | `MissingExchangeRateError` | Toast: `bill.conversionRateMissing` naming both currencies |
| `billCurrency ∉ store.acceptedCurrencies` (race with config change) | `InvalidCurrencyError` | Toast + bill voided |

---

## 3. Bill persistence (`billOperations.createBill`)

### Input contract

```ts
interface CreateBillInput {
  // ...existing fields unchanged...
  currency: CurrencyCode;       // REQUIRED — no fallback
  // ...
}
```

### Validation rules (at createBill time)

1. `currency` non-null. Violation → `InvalidCurrencyError({ reason: 'missing' })`.
2. `currency ∈ currencyService.getAcceptedCurrencies()`. Violation → `InvalidCurrencyError({ reason: 'not-accepted' })`.

### Post-conditions

- `bills.<newBill>.currency === input.currency`
- Every attached line's `unit_price` is in `input.currency` by construction (enforced upstream at add-to-cart time, re-verified at save).

### Immutability

- `bills.<id>.currency` is not writable via `updateBill` after lines exist.
- `saleOperations.changeBillCurrency` throws `CurrencyLockError` when called on a bill with ≥ 1 line.
- Re-reads / reprints read `bills.currency` and line `unit_price` directly — never re-derive from inventory state (FR-020).

---

## Atomicity with `transactionService`

- The per-line conversion runs inside the context's cart-mutation path BEFORE `transactionService.createTransaction` is invoked at bill settlement.
- `transactionService` receives a bill whose `currency` and line `unit_price`s are already finalized; its own atomic unit (journal entry creation + cash drawer update + bill flag flip) is unchanged.
- CG-04 compliance: conversion is a pure-function pre-step, not a second DB transaction.

---

## Error-key registry (i18n — to add)

| Key | English (example) |
|---|---|
| `bill.settlementPickerLabel` | `Settlement currency` |
| `bill.settlementNotAccepted` | `{attempted} is no longer an accepted currency for this store. The bill has been voided.` |
| `bill.conversionRateMissing` | `Cannot price this item: no exchange rate available from {from} to {to}.` |
| `bill.currencyLocked` | `Void the bill to change its currency.` |
