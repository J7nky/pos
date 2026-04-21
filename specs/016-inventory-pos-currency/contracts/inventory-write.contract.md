# Contract: Inventory Write Path

**Feature**: 016-inventory-pos-currency
**Module**: `apps/store-app/src/contexts/offlineData/operations/inventoryItemOperations.ts`
**Spec refs**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007

## Scope

This contract covers the inputs, validation, outputs, and error modes of the two write operations on `inventory_items`:

- `addInventoryItem(input)`
- `updateInventoryItem(id, patch)`

And the UI-side currency selector in the Inventory "Receive / Add" form (`pages/Inventory.tsx` + `components/inventory/ReceiveFormModal.tsx`).

---

## Operation: `addInventoryItem`

### Pre-conditions

- `currencyService` has been initialized via `loadFromStore(storeId)` — guaranteed by the boot sequence (spec 015).
- Caller's `input` provides `currency: CurrencyCode` (required; no default).

### Input contract

```ts
interface AddInventoryItemInput {
  // ...existing fields unchanged...
  currency: CurrencyCode;      // REQUIRED — removed optionality
  selling_price: number;        // denominated in `currency`
}
```

### Validation rules (order of evaluation)

1. `currency` present (non-null, non-undefined). Violation → `InvalidCurrencyError({ reason: 'missing', storeId })`.
2. `currency ∈ currencyService.getAcceptedCurrencies()`. Violation → `InvalidCurrencyError({ reason: 'not-accepted', attemptedCurrency, acceptedCurrencies, storeId })`.
3. `selling_price >= 0`. (Existing rule — unchanged.)

### Side effects on success

- Writes one row to Dexie `inventory_items` with `currency`, `selling_price`, and existing fields as provided.
- Marks `_synced = false` for sync pickup.
- Emits the existing inventory-update event through the normal offline-data pipeline.

### Post-conditions

- `getDB().inventory_items.get(newId).currency === input.currency`
- `getDB().inventory_items.get(newId).selling_price === input.selling_price` — no conversion applied.

### Error modes

| Condition | Thrown | UI surface |
|---|---|---|
| `currency` missing | `InvalidCurrencyError` | Form-level validation error (inline under currency picker) |
| `currency` not accepted | `InvalidCurrencyError` | Toast: `inventory.currencyNotAccepted` key |
| Dexie write fails | (existing Dexie error) | Existing error toast |

---

## Operation: `updateInventoryItem`

Same validation as `addInventoryItem` when `patch.currency` is present.

- If `patch.currency` is absent in the patch, no currency validation runs (preserving the existing "partial update" semantics).
- If `patch.currency` changes the currency, `patch.selling_price` SHOULD also be supplied in the new currency — the operation does NOT attempt to auto-convert on currency change. The UI form enforces this by re-prompting the price input when currency is changed.

---

## UI contract: Inventory form

### Element: Currency selector

- **Type**: single-select dropdown (searchable if > 5 options).
- **Options**: `useCurrency().acceptedCurrencies` from the offline-data context. Never a hardcoded list.
- **Default**: `useCurrency().preferredCurrency` when creating a new item; the item's saved `currency` when editing.
- **Required**: yes. Form submit is disabled until a currency is selected.

### Element: Price input

- **Symbol adornment**: left-adjacent to the input, sourced from `CURRENCY_META[selectedCurrency].symbol`. Updates live when the currency selector changes.
- **Numeric input**: accepts decimals to `CURRENCY_META[selectedCurrency].decimals` precision. Non-decimal currencies (LBP, SYP, IQD, YER) clamp to integer entry.

### Element: Legacy-null-currency row indicator (read side)

- Rendered by the Inventory list view (not the form) whenever an existing row has `currency == null`.
- Visual: small warning icon adjacent to the price column; tooltip text from i18n key `inventory.missingCurrency`.
- Clicking "Edit" on such a row opens the form with the currency selector unset and a banner explaining the row must be updated before it can be sold.

---

## Error-key registry (i18n — to add in `locales/*.json`)

| Key | English (example) |
|---|---|
| `inventory.currencyNotAccepted` | `Cannot save: currency {attempted} is not accepted by this store. Accepted currencies: {acceptedList}.` |
| `inventory.currencyRequired` | `Please pick a currency before saving.` |
| `inventory.missingCurrency` | `This item is missing its currency and cannot be sold until you edit it.` |

Arabic and French equivalents ship in the same PR (CG-10).
