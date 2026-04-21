# Contract — `@pos-platform/shared` new public export surface

This is the full public API added by Phase 1. Consumers (store-app, admin-app) import from `@pos-platform/shared` (package root) or from `@pos-platform/shared/types` (subpath export defined in `packages/shared/package.json`).

No existing export is modified.

---

## Types

### `CurrencyCode`

```ts
export type CurrencyCode =
  | 'USD' | 'LBP' | 'EUR' | 'GBP' | 'SAR' | 'AED' | 'EGP'
  | 'JOD' | 'SYP' | 'IQD' | 'TRY' | 'MAD' | 'TND' | 'DZD'
  | 'LYD' | 'SDG' | 'YER' | 'KWD' | 'BHD' | 'QAR' | 'OMR';
```

**Contract**:
- Members MUST NOT be removed across patch/minor versions (breaking change).
- Members MAY be added; additions MUST come with a `CURRENCY_META` entry in the same change.
- `'USD'` and `'LBP'` are load-bearing for Phase 2 backward compatibility and MUST remain.

### `CurrencyMeta`

```ts
export interface CurrencyMeta {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimals: number;
  locale: string;
}
```

**Contract**:
- Field set MUST NOT shrink. Adding fields is allowed but MUST be optional for backward compatibility unless a major version bump is coordinated.
- `decimals` uses ISO 4217 standard values.
- `locale` is a BCP 47 tag; consumers pass it to `Intl.NumberFormat`.

### `CountryConfig`

```ts
export interface CountryConfig {
  code: string;          // ISO 3166-1 alpha-2
  name: string;
  localCurrency: CurrencyCode;
  defaultCurrencies: CurrencyCode[];
}
```

**Contract**:
- `defaultCurrencies` always contains `'USD'`.
- `defaultCurrencies[0] === localCurrency` when `localCurrency !== 'USD'`.
- `defaultCurrencies` is deduplicated (when `localCurrency === 'USD'`, the array is `['USD']`).

---

## Constants

### `CURRENCY_META`

```ts
export const CURRENCY_META: Record<CurrencyCode, CurrencyMeta>;
```

**Contract**:
- Every `CurrencyCode` variant has exactly one entry. Compile-time enforced.
- The object reference is intended as read-only; consumers MUST NOT mutate entries.
- Entry values are stable across patch versions. Field additions (new optional fields) follow the `CurrencyMeta` contract above.

### `COUNTRY_CONFIGS`

```ts
export const COUNTRY_CONFIGS: CountryConfig[];
```

**Contract**:
- Array length ≥ 22 (the initial Phase 1 list).
- Entries MUST NOT be removed without a major version bump (consumers may hard-code country codes).
- Order is not semantically meaningful but is preserved for deterministic UI rendering.

### `COUNTRY_MAP`

```ts
export const COUNTRY_MAP: Record<string, CountryConfig>;
```

**Contract**:
- Keyed by `CountryConfig.code`.
- Exactly one entry per `COUNTRY_CONFIGS` item.
- Read-only usage; consumers MUST NOT mutate.

---

## Functions

### `getDefaultCurrenciesForCountry`

```ts
export function getDefaultCurrenciesForCountry(countryCode: string): CurrencyCode[];
```

**Contract**:
- Pure and deterministic.
- Returns `COUNTRY_MAP[countryCode].defaultCurrencies` for known codes.
- Returns `['USD']` for unknown codes. MUST NOT throw.
- Complexity: O(1).

---

## Barrel re-exports

From `@pos-platform/shared` (root) and `@pos-platform/shared/types`:

```ts
export type { CurrencyCode, CurrencyMeta, CountryConfig };
export { CURRENCY_META, COUNTRY_CONFIGS, COUNTRY_MAP, getDefaultCurrenciesForCountry };
```

No runtime dependency added to the shared package. No `peerDependencies` change.

---

## Negative-space contracts (things Phase 1 deliberately does NOT export)

- **No `CurrencyService`** — that's Phase 3.
- **No `format(amount, currency)` helper** — that's Phase 3 (`CurrencyService.format`).
- **No `convert(amount, from, to)` helper** — that's Phase 3 (`CurrencyService.convert`).
- **No exchange-rate type or default rate** — that's Phase 10.
- **No `JournalEntryAmounts` / `BalanceSnapshot` types** — those are Phase 11.
- **No widening of `StoreCore` to use `CurrencyCode`** — that's Phase 2 (Task 4).

Consumers of Phase 1 see only: 3 types, 3 constants, 1 function. Everything else stays behind.
