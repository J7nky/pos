# Data Model — Country & Multi-Currency Schema Widening

**Feature**: 014-country-currency-schema
**Date**: 2026-04-21

This document is the field-by-field record of every entity touched by Phase 2. For each entity it shows the **before** shape (current state on `main`), the **after** shape (post-Phase 2), and the migration / back-fill rules connecting them.

---

## Entity 1 — `stores` (Supabase + Dexie + `StoreCore`)

The `stores` table holds one row per retail location. Phase 2 widens it to carry country and accepted-currency identity.

### Supabase columns

| Column | Before | After | Migration rule |
|---|---|---|---|
| `id` | `uuid PK` | unchanged | — |
| `name` | `text NOT NULL` | unchanged | — |
| `preferred_currency` | `text` (effectively `'USD' \| 'LBP'`) | unchanged column type, but values now drawn from full `CurrencyCode` set as Phases 3+ land | — |
| `exchange_rate` | `numeric` | unchanged | — |
| `preferred_language` | `text` | unchanged | — |
| `country` | _not present_ | `text DEFAULT 'LB'` | back-fill: every existing row gets `'LB'` via the column default |
| `accepted_currencies` | _not present_ | `text[] NOT NULL DEFAULT ARRAY['LBP','USD']` | see back-fill rule below (R2) |
| `created_at`, `updated_at` | `timestamptz` | unchanged | — |

**Back-fill rule for `accepted_currencies`** (R2):

```sql
UPDATE public.stores
SET accepted_currencies = CASE
  WHEN preferred_currency = 'USD' THEN ARRAY['USD']
  ELSE ARRAY[preferred_currency::text, 'USD']
END
WHERE accepted_currencies = ARRAY['LBP','USD'];
```

The `WHERE` clause guards against overwriting any row whose `accepted_currencies` was set manually to a non-default value.

### `StoreCore` (in `@pos-platform/shared/src/types/supabase-core.ts`)

**Before**:

```ts
export interface StoreCore {
  id: string;
  name: string;
  preferred_currency: 'USD' | 'LBP';
  preferred_language: 'en' | 'ar' | 'fr';
  exchange_rate: number;
  created_at: string;
  updated_at: string;
}
```

**After**:

```ts
import type { CurrencyCode } from './currency';

export interface StoreCore {
  id: string;
  name: string;
  country: string;                       // ISO 3166-1 alpha-2; legacy rows back-filled to 'LB'
  preferred_currency: CurrencyCode;      // Primary display currency
  accepted_currencies: CurrencyCode[];   // Ordered: preferred first by convention
  preferred_language: 'en' | 'ar' | 'fr';
  exchange_rate: number;                 // Local-currency-to-USD; multi-rate map lands in Phase 10
  created_at: string;
  updated_at: string;
}
```

### `StoreCoreInsert` (new export)

```ts
export interface StoreCoreInsert {
  id?: string;
  name: string;
  country?: string;
  preferred_currency?: CurrencyCode;
  accepted_currencies?: CurrencyCode[];
  preferred_language?: 'en' | 'ar' | 'fr';
  exchange_rate?: number;
}
```

`name` is the only required field; everything else has a server-side default or is server-managed.

### Dexie `stores` (store-app)

**Before** (v54 index string):

```text
stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at'
```

**After** (v55 index string):

```text
stores: 'id, name, country, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at'
```

`accepted_currencies` is **not** added to the index string (Dexie v4 does not support array-typed indexes via the comma-string form; see R4). It is persisted on the row payload and retrieved with the rest of the row.

**v55 `.upgrade()` hook** (back-fill, runs once per local DB):

```ts
this.version(55).stores({
  stores: 'id, name, country, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
}).upgrade(async (tx) => {
  await tx.table('stores').toCollection().modify((store) => {
    if (!store.country) {
      store.country = store.preferred_currency === 'LBP' ? 'LB' : 'LB';
    }
    if (!store.accepted_currencies || store.accepted_currencies.length === 0) {
      store.accepted_currencies = store.preferred_currency === 'USD'
        ? ['USD']
        : [store.preferred_currency, 'USD'];
    }
  });
  // inventory_items back-fill — see Entity 2
  // ...
});
```

`Collection.modify` mutates the row in place without flipping `_synced` to `false` (R5).

---

## Entity 2 — `inventory_items` (Supabase + Dexie + store-app types)

`inventory_items` holds per-branch SKU rows. Phase 2 tightens its `currency` field to required `CurrencyCode`.

### Supabase column

| Column | Before | After | Migration rule |
|---|---|---|---|
| `currency` | `text` (TS-typed `'USD' \| 'LBP'`, optional) | `text` (TS-typed `CurrencyCode`, **required** in `Row`) | no SQL change; type tightening only. Existing rows must already have a value (Dexie back-fill ensures this for the local DB; the SQL side has no `NULL` rows in production today). |

### Dexie row shape

The Dexie index already includes `currency` in v54; no index-string change is needed in v55. The v55 `.upgrade()` hook back-fills any `inventory_items` row whose `currency` is missing, using the parent store's `preferred_currency` as the default:

```ts
const stores = await tx.table('stores').toArray();
const storesById = new Map(stores.map((s) => [s.id, s]));

await tx.table('inventory_items').toCollection().modify((item) => {
  if (!item.currency) {
    const parent = storesById.get(item.store_id);
    item.currency = parent?.preferred_currency ?? 'USD';
  }
});
```

### `apps/store-app/src/types/database.ts`

| Shape | Before | After |
|---|---|---|
| `inventory_items.Row.currency` | `'USD' \| 'LBP' \| undefined` | `CurrencyCode` (required) |
| `inventory_items.Insert.currency` | `'USD' \| 'LBP' \| undefined` | `CurrencyCode \| undefined` (callers without an explicit value must rely on a write-boundary default; the strict-required form lives on `Row`) |
| `inventory_items.Update.currency` | `'USD' \| 'LBP' \| undefined` | `CurrencyCode \| undefined` |

### `apps/store-app/src/types/index.ts` — local `InventoryItem`

```ts
// Before
currency?: 'USD' | 'LBP';

// After
currency?: CurrencyCode;  // Optional only on the legacy transient interface; the persisted Row is required
```

---

## Entity 3 — `transactions`

| Shape | Before | After |
|---|---|---|
| `transactions.Row.currency` (database.ts) | `'USD' \| 'LBP'` | `CurrencyCode` |
| `transactions.Insert.currency` | `'USD' \| 'LBP'` | `CurrencyCode` |
| `transactions.Update.currency` | `'USD' \| 'LBP'` | `CurrencyCode` |
| Shared `Transaction` interface (`packages/shared/src/types/index.ts`) | `currency: 'USD' \| 'LBP'` | `currency: CurrencyCode` |

No SQL migration. Existing rows already hold `'USD'` or `'LBP'` strings, both of which are valid `CurrencyCode` members. Phase 7 is when non-Lebanon currencies actually start being written; Phase 2 only opens the type so Phase 7 doesn't have to.

---

## Entity 4 — `cash_drawer_accounts`

| Shape | Before | After |
|---|---|---|
| `cash_drawer_accounts.Row.currency` | `'USD' \| 'LBP'` | `CurrencyCode` |
| `cash_drawer_accounts.Insert.currency` | `'USD' \| 'LBP'` | `CurrencyCode` |
| `cash_drawer_accounts.Update.currency` | `'USD' \| 'LBP'` | `CurrencyCode` |

No SQL migration; type widening only.

---

## Entities explicitly **not** modified

To make the no-behavior-change boundary explicit, the following entities are touched by other phases of the multi-currency rollout but are **out of scope here**:

| Entity | Phase that owns it |
|---|---|
| `journal_entries` (`debit_usd`, `credit_usd`, `debit_lbp`, `credit_lbp` → `amounts` JSONB) | Phase 11a–11d |
| `balance_snapshots` (`balance_usd`, `balance_lbp` → `balances` JSONB) | Phase 11a–11d |
| `stores.exchange_rates` (per-currency rate map) | Phase 10 |
| `bills` / `bill_line_items` currency enforcement | Phase 7 |

Touching any of these in Phase 2 would violate SC-006 (the "5-minute review" success criterion).

---

## Validation rules introduced (all type-level only)

| Rule | Enforcement | Surface |
|---|---|---|
| `StoreCore.country` is a string | TypeScript | shared package |
| `StoreCore.accepted_currencies` is an array of `CurrencyCode` (no other strings allowed) | TypeScript | shared package |
| `inventory_items.Row.currency` is a `CurrencyCode` (no `undefined`) | TypeScript | store-app database.ts |
| `transactions.Row.currency` is a `CurrencyCode` | TypeScript | shared + store-app |
| `cash_drawer_accounts.Row.currency` is a `CurrencyCode` | TypeScript | store-app database.ts |
| `accepted_currencies` `NOT NULL` | Postgres column constraint | Supabase migration |

No runtime validators, no triggers, no service-layer guards added in this phase — those land in Phases 6, 7, and 8.

---

## State transitions

None. All changes are structural (schema + types). No state machine is introduced or modified.
