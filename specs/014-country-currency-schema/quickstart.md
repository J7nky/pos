# Quickstart — Country & Multi-Currency Schema Widening

**Feature**: 014-country-currency-schema
**Date**: 2026-04-21

A reviewer or implementer-agent can use this guide to apply Phase 2, verify it locally, and roll it back if needed.

---

## 1. What you are about to change

Five files (plus one new SQL migration):

```text
supabase/migrations/<timestamp>_add_country_accepted_currencies_to_stores.sql   # NEW
packages/shared/src/types/supabase-core.ts                                       # MODIFY
packages/shared/src/types/index.ts                                               # MODIFY (Transaction.currency widening + StoreCoreInsert re-export)
apps/store-app/src/types/database.ts                                             # MODIFY (4 tables × 3 shapes = ~12 currency unions)
apps/store-app/src/types/index.ts                                                # MODIFY (local InventoryItem.currency)
apps/store-app/src/lib/db.ts                                                     # MODIFY (Dexie v55 + .upgrade hook)
```

No service files. No components. No hooks. No admin-app source files. If your diff touches anything else, you have left the Phase 2 boundary.

---

## 2. Apply

### 2.1 Update the shared package

1. Edit `packages/shared/src/types/supabase-core.ts` — widen `StoreCore` per the contract in `contracts/shared-types.md` and add `StoreCoreInsert`.
2. Edit `packages/shared/src/types/index.ts` — re-export `StoreCoreInsert` and widen `Transaction.currency` to `CurrencyCode`.
3. Build the shared package:

   ```bash
   pnpm --filter @pos-platform/shared build
   ```

### 2.2 Update the store-app types

1. Edit `apps/store-app/src/types/database.ts` — for each of `stores`, `inventory_items`, `transactions`, `cash_drawer_accounts`, replace `'USD' | 'LBP'` with `CurrencyCode` in `Row`, `Insert`, and `Update`. On `stores`, add `country` (string) and `accepted_currencies` (`CurrencyCode[]`) to all three shapes (required on `Row`, optional on `Insert`/`Update`). On `inventory_items.Row`, make `currency` required.
2. Edit `apps/store-app/src/types/index.ts` — change the local `InventoryItem.currency` to `CurrencyCode` (still optional on this transient shape).

### 2.3 Bump the Dexie schema

1. Edit `apps/store-app/src/lib/db.ts` — add a `this.version(55).stores({...}).upgrade(async (tx) => { ... })` block. The `stores` index string adds `country` (after `name`). The `.upgrade` callback back-fills `country` and `accepted_currencies` on every `stores` row, then back-fills `currency` on every `inventory_items` row using the parent store's `preferred_currency` as the default. See `data-model.md` Entity 1 / Entity 2 for the exact callbacks.

### 2.4 Write the SQL migration

Create `supabase/migrations/<timestamp>_add_country_accepted_currencies_to_stores.sql` containing:

```sql
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'LB';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS accepted_currencies TEXT[] NOT NULL DEFAULT ARRAY['LBP','USD'];

UPDATE public.stores
SET accepted_currencies = CASE
  WHEN preferred_currency = 'USD' THEN ARRAY['USD']
  ELSE ARRAY[preferred_currency::text, 'USD']
END
WHERE accepted_currencies = ARRAY['LBP','USD'];
```

### 2.5 Apply the migration

```bash
# Local Supabase (if used)
supabase db push

# Or, if applied via your usual migration runner, run that.
```

---

## 3. Verify

Run all of these. Every one must be green.

```bash
# 1. Shared types compile and existing tests pass
pnpm --filter @pos-platform/shared build
pnpm --filter @pos-platform/shared test

# 2. Both apps compile
pnpm --filter store-app build
pnpm --filter admin-app build

# 3. Lint
pnpm lint

# 4. Sync parity gate (must show no new diffs)
pnpm --filter store-app parity:gate
```

Then a manual smoke run on the store-app:

1. `pnpm dev:store`
2. Open the app against an existing populated IndexedDB. The Dexie upgrade prompt must complete silently with no error in the console.
3. In DevTools → Application → IndexedDB, open the `stores` object store. Confirm every row has `country` and `accepted_currencies` populated. Open `inventory_items` — every row has a `currency` value.
4. Walk the golden path: log in → view inventory → ring an LBP sale → accept payment → verify the transaction appears in history. Compare against a baseline screenshot taken before the upgrade if available.
5. Trigger a sync. Watch the console for upload activity — only rows that were genuinely modified during the smoke walk should be uploaded. The `stores` and pre-existing `inventory_items` rows should **not** be re-uploaded.

Confirm against the SQL side:

```sql
SELECT id, name, preferred_currency, country, accepted_currencies
FROM public.stores
LIMIT 5;
```

Every row must show non-null `country` and `accepted_currencies` matching the back-fill rules.

---

## 4. Roll back (if needed)

The phase is designed to be safely reversible:

### 4.1 Revert the code

```bash
git checkout main -- packages/shared/src/types/supabase-core.ts \
                     packages/shared/src/types/index.ts \
                     apps/store-app/src/types/database.ts \
                     apps/store-app/src/types/index.ts \
                     apps/store-app/src/lib/db.ts
git rm supabase/migrations/<timestamp>_add_country_accepted_currencies_to_stores.sql
```

### 4.2 Database rollback

```sql
ALTER TABLE public.stores DROP COLUMN IF EXISTS accepted_currencies;
ALTER TABLE public.stores DROP COLUMN IF EXISTS country;
```

The two new columns are additive with defaults; dropping them does not affect any existing data outside those columns. No data loss occurs because no Phase 2 code reads from or writes to fields that exist *only* in the post-migration schema.

### 4.3 Dexie rollback

Bumping back from v55 to v54 is **not** safe in Dexie — the user would need to clear IndexedDB. In practice, rollback at the Dexie level is by **rolling forward to v56** in a follow-up phase that drops the new fields, not by reverting the version. For Phase 2's purposes, the v55 schema is forward-compatible: a v55 client running against a database where the SQL migration has been rolled back will still work, because it does not depend on the new columns existing on the Supabase side (sync-down will simply not return them, and the local back-filled values remain).

---

## 5. Downstream phase previews (informational)

What unlocks once Phase 2 is merged:

- **Phase 3 — CurrencyService refactor**: Reads `store.accepted_currencies` to populate its in-memory `acceptedCurrencies` array and rate map. Replaces `getSupportedCurrencies()`'s hardcoded two-element output.
- **Phase 4 — Admin StoreForm**: Renders a country `<Select>` populated from `COUNTRY_CONFIGS`, auto-populates `preferred_currency` and `accepted_currencies` from `COUNTRY_MAP[country]`. Submits the new fields in the `INSERT`/`UPDATE` payload.
- **Phase 5 — Store-app context surface**: Exposes `acceptedCurrencies`, `preferredCurrency`, and `formatAmount` from `OfflineDataContext` so UI components don't import `currencyService` directly.
- **Phase 6 — Inventory multi-currency**: Adds an insert-time guard that throws if `inventory_item.currency` is not in `store.accepted_currencies`. Inventory form UI lists currencies from `acceptedCurrencies`, defaulted to `preferredCurrency`.
- **Phase 7 — POS sell flow**: Bills carry an explicit settlement currency; line items convert from inventory item currency via `currencyService.convert`. Removes every `|| 'USD'` and `|| 'LBP'` fallback from the transaction data layer and sync paths.

None of those are in scope for this phase. If you find yourself reaching for them, stop and merge Phase 2 first.
