# Quickstart: Verifying Inventory Multi-Currency & POS Sell-Flow Enforcement

**Feature**: 016-inventory-pos-currency
**Audience**: the developer implementing this feature, reviewers, and QA.

This walkthrough exercises the three highest-value behaviours end-to-end after the feature has landed. Run each scenario on a local dev build with `pnpm dev:store`.

---

## Prerequisites

1. Repo at branch `016-inventory-pos-currency`.
2. `pnpm install` complete.
3. Supabase env vars set (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. A Supabase test project with a seed store that has:
   - `country = 'LB'`
   - `preferred_currency = 'LBP'`
   - `accepted_currencies = ARRAY['LBP','USD']`
   - `exchange_rate = 89500`
5. (Optional, for Scenario C) a second seed store with `country = 'AE'`, `preferred_currency = 'AED'`, `accepted_currencies = ARRAY['AED','USD']`, `exchange_rate = 3.67`.

---

## Scenario A — Mixed-currency bill on a Lebanese store

Exercises: FR-001, FR-002, FR-004, FR-005, FR-008, FR-009, FR-011, FR-012, FR-013, FR-021.

1. Sign in to the seed Lebanese store. Wait for initial hydration to complete (Home screen shows cash-drawer widget).
2. Navigate to **Inventory → Add Item**. Verify:
   - The currency selector offers exactly two options: `LBP (ل.ل)` and `USD ($)`.
   - Default selection is `LBP` (the store's preferred currency).
   - The price input shows the `ل.ل` symbol adjacent to the number field.
3. Create two items:
   - **Item A**: name `"Bag of Rice"`, currency `LBP`, `selling_price = 1,500,000`.
   - **Item B**: name `"Imported Jam"`, currency `USD`, `selling_price = 10.50`. Confirm the symbol adornment updates to `$` when you switch the currency picker.
4. Navigate to **POS**. Start a new tab (new bill). Verify:
   - A settlement-currency picker is rendered.
   - Default selection is `LBP`.
   - Change the settlement currency to `USD`.
5. Add **Item A** to the cart. Verify:
   - The stored line `unit_price` is `1,500,000 / 89,500 = 16.759776…`, rounded half-even to 2 decimals → **`16.76`**.
   - The line renders as `$16.76 × 1`.
6. Add **Item B** to the cart. Verify:
   - The line renders as `$10.50 × 1` with **no conversion arithmetic** applied (item currency equals bill currency).
7. Confirm the settlement picker is now locked (disabled). Hover to see the "Void the bill to change currency" tooltip.
8. Settle the bill (cash tender). Open IndexedDB via devtools (or the "Unsynced Items" screen) and verify:
   - `bills.<newId>.currency === 'USD'`
   - `bill_line_items.<lineA>.unit_price === 16.76`
   - `bill_line_items.<lineB>.unit_price === 10.50`
   - `bills.<newId>.total === 27.26` (sum of rounded line totals, in USD).

**Pass criteria**: all of the above hold. Receipt preview shows `$` prefix and two-decimal rendering throughout.

---

## Scenario B — Rejection of invalid currency at the data layer

Exercises: FR-002, FR-010, FR-014, FR-015.

### B1 — Inventory: reject non-accepted currency

From the browser devtools console, against the Lebanese store:

```js
// access the offline-data context via the existing hook
const ctx = window.__OFFLINE_DATA__;   // (if exposed in dev; otherwise use React devtools)
await ctx.addInventoryItem({
  name: 'Illegal',
  currency: 'EUR',          // NOT in accepted_currencies
  selling_price: 5.0,
});
```

**Expected**: `InvalidCurrencyError` thrown, with message naming `EUR` and listing `['LBP','USD']`. No row written to Dexie (verify via `await getDB().inventory_items.where({ name: 'Illegal' }).count()` → `0`).

### B2 — Bill: reject missing settlement currency

Attempt a programmatic bill creation:

```js
await ctx.createBill({ /* ...no currency field... */ });
```

**Expected**: `InvalidCurrencyError` thrown, `{ reason: 'missing' }`. No bill row written.

### B3 — Transaction data layer: no `|| 'USD'` fallback

Attempt:

```js
await ctx.addTransaction({ /* ...currency omitted... */ });
```

**Expected**: `InvalidCurrencyError` thrown immediately — **NOT** a successful write with `currency = 'USD'`. This is the regression gate for the defect the feature closes.

---

## Scenario C — UAE store end-to-end (non-Lebanon path)

Exercises: FR-017 (ensureStoreExists seed path) + the general multi-currency path for a non-LBP country.

1. Sign out. Switch to the UAE seed store.
2. Clear local IndexedDB (devtools → Application → IndexedDB → delete `POSDatabase`). This forces `ensureStoreExists` to re-seed from Supabase.
3. Sign in. Wait for initial hydration.
4. Verify in devtools:
   ```js
   const store = await getDB().stores.toArray().then(r => r[0]);
   store.country;               // 'AE'
   store.preferred_currency;    // 'AED'
   store.accepted_currencies;   // ['AED', 'USD']
   ```
   None of these should be `'USD'` by default — they must match the Supabase row exactly.
5. Create an AED-priced inventory item and settle a bill in AED. The receipt should render with the dirham symbol `د.إ` and two decimals.

**Pass criteria**: no `'USD'` or `'LBP'` literal appears in the seeded local row; receipts render with AED locale formatting.

---

## Scenario D — Sync-download skip-and-warn on empty stores table

Exercises: FR-016.

1. In the running dev app, clear only the `stores` table in Dexie (leave others intact):
   ```js
   await getDB().stores.clear();
   ```
2. Trigger a sync cycle (from the Home screen's sync button, or call `ctx.performSync()` from the console).
3. Open the devtools console. Expect to see a structured log entry (via `comprehensiveLoggingService.warn`) with payload:
   ```json
   {
     "operation": "syncDownload.<fn>",
     "storeId": "<expected-id>",
     "reason": "store-row-absent",
     "action": "skip"
   }
   ```
4. Confirm no inventory or bill row was modified during this cycle by the currency-dependent path. Confirm that the sync cycle as a whole did NOT throw — only the currency-dependent branch was skipped.

**Pass criteria**: exactly one warning logged, no currency-invented writes, no fatal error.

---

## Scenario E — Parity gate

Exercises: CG-12.

From the repo root:

```bash
pnpm parity:gate
```

**Pass criteria**: golden snapshot passes. If it fails on a drift in any of the three sync/selling files this feature touches, inspect the delta and either accept (by regenerating the golden) or fix the regression.

---

## Verification checklist (roll-up)

| Scenario | Spec FR(s) verified | Pass? |
|---|---|---|
| A | FR-001, FR-002, FR-004, FR-005, FR-008, FR-009, FR-011, FR-012, FR-013, FR-021 | ☐ |
| B1 | FR-002 | ☐ |
| B2 | FR-010 | ☐ |
| B3 | FR-015, FR-018 | ☐ |
| C | FR-017 | ☐ |
| D | FR-016 | ☐ |
| E | CG-12 (parity) | ☐ |

Once every box is ticked, the feature is ready for review.
