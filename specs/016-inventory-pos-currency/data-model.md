# Phase 1 Data Model: Inventory Multi-Currency & POS Sell-Flow Enforcement

**Feature**: 016-inventory-pos-currency
**Date**: 2026-04-21

This feature introduces **no new entities and no schema changes**. What follows is a record of the **tightened runtime shapes** and the **invariants** that this feature newly enforces on top of existing entities. The underlying Supabase / Dexie columns already exist (spec 014); this feature only changes their TypeScript typing and their write-path validation.

---

## Entity: `InventoryItem` (tightened)

Represents one priced SKU-or-batch in a store's inventory.

### Shape (post-feature)

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | No | — |
| `store_id` | `string` | No | — |
| `branch_id` | `string` | No | — |
| `currency` | `CurrencyCode` | **No** (was `'USD' \| 'LBP' \| null`) | **Tightened by this feature.** Required on insert; must be a member of `store.accepted_currencies` at write time. |
| `selling_price` | `number` | No | Denominated in `currency`. Never converted at insert time. |
| `is_archived` | `boolean` | No | Unchanged. |
| (other existing fields) | — | — | Unchanged. |

### Invariants (post-feature)

1. **I-INV-01**: On insert and update, `currency` MUST be non-null and MUST be a member of the currently loaded store's `accepted_currencies`. Violation ⇒ write rejected with `InvalidCurrencyError` before the Dexie `put()`.
2. **I-INV-02**: `selling_price` is stored in `currency`. No reading code may assume it is in USD or LBP.
3. **I-INV-03**: Rows with `currency == null` may exist (legacy pre-feature data). On read they render with the "missing currency" indicator (R7 in research). On POS add-to-cart they raise `LegacyCurrencyMissingError`.

### State transitions

No state machine. Normal CRUD. Archiving/un-archiving does not interact with currency.

### Validation rules (applied by operations layer)

- Pre-write check: `assertAcceptedCurrency(currency, store.accepted_currencies)`
- `selling_price` ≥ 0 (existing rule — unchanged by this feature)

---

## Entity: `Bill` (tightened)

Represents one POS sale header with one settlement currency.

### Shape (post-feature)

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | No | — |
| `store_id` | `string` | No | — |
| `branch_id` | `string` | No | — |
| `currency` | `CurrencyCode` | **No** (previously loosely typed) | **Tightened by this feature.** Set at bill creation from the cashier's settlement-currency picker; must be in `store.accepted_currencies` at write time. |
| `entity_id` | `string \| null` | Yes | Customer (unchanged). |
| `bill_number` | `string` | No | Unchanged. |
| `payment_method` | `string` | No | Unchanged. |
| `payment_status` | `string` | No | Unchanged. |
| `total` | `number` | No | Denominated in `currency`. Computed as the sum of rounded line totals (I-BILL-04). |
| (other existing fields) | — | — | Unchanged. |

### Invariants (post-feature)

1. **I-BILL-01**: `currency` MUST be non-null at creation. Set from the cashier's settlement-currency picker (or the sole accepted currency when `acceptedCurrencies.length === 1`).
2. **I-BILL-02**: `currency` MUST be a member of `store.accepted_currencies` at creation time. Violation ⇒ bill creation rejected.
3. **I-BILL-03**: Every attached `BillLineItem` shares this currency (see I-LINE-01). The bill currency and the line-items' implicit currency are equal by construction.
4. **I-BILL-04**: `total` = sum of (line `unit_price` × line `quantity`) where each `unit_price` is already rounded to `CURRENCY_META[currency].decimals`. No re-computation from source-currency prices.
5. **I-BILL-05**: `currency` is immutable after the bill has at least one line item. Changing it requires voiding the bill and starting a new one (FR-019).
6. **I-BILL-06**: Legacy bills written before this feature lands retain whatever `currency` the old fallback wrote; no migration rewrites them (research R4).

### State transitions

Existing states unchanged (`open → settled`, `open → void`). This feature adds an implicit rule that transitioning through `open` with at least one line locks the currency; no new state is introduced.

---

## Entity: `BillLineItem` (clarified, not tightened)

Represents one product line on a bill.

### Shape (post-feature)

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | No | — |
| `bill_id` | `string` | No | Parent bill. |
| `inventory_item_id` | `string` | No | Source item. |
| `quantity` | `number` | No | Unchanged. |
| `unit_price` | `number` | No | **Always denominated in the parent bill's `currency`.** Converted at add-to-cart time using the current rate map if the source item's currency differs. |
| (other existing fields) | — | — | Unchanged. No per-line `currency` column exists or is added. |

### Invariants (post-feature)

1. **I-LINE-01**: `unit_price` is denominated in the parent `Bill.currency`. No `currency` column on this row — the currency is implicit via the bill foreign key.
2. **I-LINE-02**: `unit_price` is rounded to `CURRENCY_META[bill.currency].decimals` using banker's rounding (R1 in research) before the line is persisted.
3. **I-LINE-03**: If the source inventory item's `currency === bill.currency`, `unit_price === item.selling_price` with no arithmetic applied (identity short-circuit).
4. **I-LINE-04**: If conversion requires a rate that is not in `currencyService.rates`, `currencyService.convert` throws and the line is NOT persisted. The cashier sees a toast and the line is discarded.

### Derived values

- **Line total** = `unit_price × quantity`. Computed, not stored separately.

---

## Entity: `Transaction` (tightened pass-through)

This feature tightens how the transaction data layer (`useTransactionDataLayer.ts`) handles its `currency` parameter, but introduces no new fields on the row.

### Invariants (post-feature)

1. **I-TXN-01**: `useTransactionDataLayer.addTransaction(data)` MUST receive a non-null, valid-`CurrencyCode` `currency` field on `data`. The legacy `|| 'USD'` coercion is removed.
2. **I-TXN-02**: The layer validates `currency ∈ store.accepted_currencies` before the Dexie write; violation ⇒ throw `InvalidCurrencyError`.

---

## Entity: `Store` (consumed, not modified)

Consumed read-only by this feature. Relevant fields (introduced/populated by specs 014 + 015):

- `country` — ISO-3166-1 alpha-2
- `preferred_currency` — `CurrencyCode`
- `accepted_currencies` — `CurrencyCode[]`
- `exchange_rate` — `number` (the single scalar rate for the local currency; still used until Phase 10)

This feature reads these via `currencyService.getAcceptedCurrencies()`, `getPreferredCurrency()`, and the conversion rate map populated by `loadFromStore()`.

---

## Error taxonomy (new, thrown by the operations layer)

| Error | Thrown by | Triggered when |
|---|---|---|
| `InvalidCurrencyError` | `inventoryItemOperations.addInventoryItem`, `inventoryItemOperations.updateInventoryItem`, `billOperations.createBill`, `useTransactionDataLayer.addTransaction` | Supplied `currency` is not a member of `store.accepted_currencies`, or is null/undefined. |
| `LegacyCurrencyMissingError` | `saleOperations.addLineItem` (or equivalent cart-add path) | Attempt to add an inventory item whose `currency == null` to a bill. |
| `MissingExchangeRateError` | `currencyService.convert` (already defined in spec 015) | Conversion requested between two currencies with no loaded rate for one of them. Propagated to the cashier by `saleOperations` as a toast. |
| `CurrencyLockError` | `saleOperations.changeBillCurrency` | Attempt to change `bill.currency` when at least one line already exists (I-BILL-05 / FR-019). |

All errors carry structured payloads: `{ storeId, attemptedCurrency?, acceptedCurrencies?, bill_id? }` so that logs are correlatable and user-facing translations can interpolate meaningful values.

---

## Schema migration summary

**None.** Neither Supabase nor Dexie schema changes in this feature. All tightening is TypeScript-type + write-path validation only.
