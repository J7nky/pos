# Contract — `@pos-platform/shared` Public Surface (Phase 2)

**Feature**: 014-country-currency-schema
**Date**: 2026-04-21
**Package**: `@pos-platform/shared`

This document is the authoritative cross-app contract for what Phase 2 adds, modifies, and preserves on the public surface of `@pos-platform/shared`. Both `apps/store-app` and `apps/admin-app` consume from this contract.

## 1. Symbols added in this phase

| Symbol | Kind | Source file |
|---|---|---|
| `StoreCoreInsert` | `interface` | `packages/shared/src/types/supabase-core.ts` |

## 2. Symbols modified in this phase

| Symbol | Kind | Source file | Change |
|---|---|---|---|
| `StoreCore` | `interface` | `packages/shared/src/types/supabase-core.ts` | Adds `country: string` and `accepted_currencies: CurrencyCode[]`; widens `preferred_currency` from `'USD' \| 'LBP'` to `CurrencyCode` |
| `Transaction` | `interface` | `packages/shared/src/types/index.ts` | Widens `currency` from `'USD' \| 'LBP'` to `CurrencyCode` |

## 3. Symbols preserved unchanged (compatibility commitments)

Every symbol exported by the shared package on `main` continues to be exported with the same name and the same — or strictly wider — type:

| Symbol | Compatibility commitment |
|---|---|
| `MultilingualString`, `SupportedLanguage`, `createMultilingualFromString`, `getTranslatedString`, every other multilingual export | unchanged |
| `CurrencyCode`, `CurrencyMeta`, `CURRENCY_META` (Phase 1) | unchanged |
| `CountryConfig`, `COUNTRY_CONFIGS`, `COUNTRY_MAP`, `getDefaultCurrenciesForCountry` (Phase 1) | unchanged |
| `BranchCore`, `UserCore`, `StoreSubscriptionCore` | unchanged |
| `Product`, `User` | unchanged |

**Backward-compatibility rule**: Any value valid on `main` against the old `StoreCore` or `Transaction` is still valid against the widened versions, because `'USD' | 'LBP'` is a subtype of `CurrencyCode`. No caller needs to be updated to compile.

## 4. Final contract — interface definitions

```ts
// packages/shared/src/types/supabase-core.ts
import type { CurrencyCode } from './currency';

export interface StoreCore {
  id: string;
  name: string;
  country: string;                       // ISO 3166-1 alpha-2; '' or 'LB' as legacy fallback
  preferred_currency: CurrencyCode;
  accepted_currencies: CurrencyCode[];
  preferred_language: 'en' | 'ar' | 'fr';
  exchange_rate: number;                 // Local currency to USD; multi-rate map deferred to Phase 10
  created_at: string;
  updated_at: string;
}

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

```ts
// packages/shared/src/types/index.ts (delta)
export type {
  StoreCore,
  StoreCoreInsert,        // NEW
  BranchCore,
  UserCore,
  StoreSubscriptionCore,
} from './supabase-core';

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'sale' | 'payment' | 'credit_sale';
  category: string;
  amount: number;
  currency: CurrencyCode; // CHANGED: was 'USD' | 'LBP'
  description: MultilingualString;
  reference: string | null;
  store_id: string;
  created_by: string;
  created_at: string;
  supplier_id: string | null;
  customer_id: string | null;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}
```

## 5. Consumer impact

| Consumer | Impact |
|---|---|
| `apps/store-app` | Must edit `src/types/database.ts` and `src/types/index.ts` to align local types with the widened shared contract (FR-010 through FR-014). |
| `apps/admin-app` | Zero source-file edits required. Compiles against the wider contract automatically; the new fields surface in subsequent phases (Phase 4 admin StoreForm). |
| Future packages | None. |

## 6. Versioning

The shared package does **not** publish a semver bump in this phase — it is internally versioned via the workspace and consumed by source. The only contract requirement is that no consumer is broken; that requirement is satisfied by every existing `'USD' | 'LBP'` value remaining valid.

## 7. Test surface

No new contract tests are added. The existing Phase 1 vitest suite (`packages/shared/tests/currency-country.test.ts`) continues to pass. The widened `StoreCore` is verified indirectly via:

- `pnpm --filter store-app build` — must pass (FR-019).
- `pnpm --filter admin-app build` — must pass (FR-019).
- `pnpm parity:gate` — must pass with no new diffs (SC-005).
