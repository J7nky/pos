# Phase 1 Data Model — Shared Currency & Country Foundation

All entities below are TypeScript types and constants in `@pos-platform/shared`. No database tables, no Dexie stores, no Supabase columns — Phase 1 is purely a type-system artifact.

---

## Entity 1 — `CurrencyCode`

**Kind**: TypeScript string-literal union (type alias).
**Module**: `packages/shared/src/types/currency.ts`

**Definition (shape)**:

```ts
export type CurrencyCode =
  | 'USD' | 'LBP' | 'EUR' | 'GBP' | 'SAR' | 'AED' | 'EGP'
  | 'JOD' | 'SYP' | 'IQD' | 'TRY' | 'MAD' | 'TND' | 'DZD'
  | 'LYD' | 'SDG' | 'YER' | 'KWD' | 'BHD' | 'QAR' | 'OMR';
```

**Invariants**:
- Members are ISO 4217 codes in uppercase.
- `'USD'` and `'LBP'` are always present (backward compatibility with existing `'USD' | 'LBP'` unions).
- Extending the union requires a matching `CURRENCY_META` entry or the TypeScript compiler errors.

**Consumers** (in later phases): `StoreCore.preferred_currency`, `StoreCore.accepted_currencies`, `InventoryItem.currency`, `Transaction.currency`, `Bill.currency`, `cashDrawerAccounts.currency`, `CurrencyService.*` methods, `journal_entries.amounts` map keys, `balance_snapshots.balances` map keys, `exchange_rates` map keys.

---

## Entity 2 — `CurrencyMeta`

**Kind**: TypeScript interface.
**Module**: `packages/shared/src/types/currency.ts`

**Fields**:

| Field | Type | Description |
|---|---|---|
| `code` | `CurrencyCode` | The ISO 4217 code. Redundant with the map key but convenient for downstream iteration. |
| `name` | `string` | English display name (e.g. `'Lebanese Pound'`). Admin/debug use only. Store-facing UI wraps this with multilingual helpers at the call site. |
| `symbol` | `string` | Display symbol (e.g. `'$'`, `'ل.ل'`, `'€'`). |
| `decimals` | `number` | ISO 4217 decimal count. `0` for LBP/SYP/IQD/YER; `2` for USD/EUR/GBP/etc.; `3` for JOD/KWD/BHD/OMR/TND/LYD. |
| `locale` | `string` | BCP 47 locale hint for `Intl.NumberFormat` (e.g. `'en-US'`, `'ar-LB'`, `'fr-MA'`). |

**Validation rules**:
- `decimals` ∈ {0, 2, 3} for the currencies listed in R-3 of `research.md`.
- `locale` must be a syntactically valid BCP 47 tag (not runtime-enforced; validated by convention during review).

---

## Entity 3 — `CURRENCY_META`

**Kind**: Constant record.
**Module**: `packages/shared/src/types/currency.ts`

**Type**: `Record<CurrencyCode, CurrencyMeta>` — the compile-time exhaustiveness guarantee.

**Per-entry values** (ISO 4217 canonical, per R-3 and R-4):

| Code | Name | Symbol | Decimals | Locale |
|---|---|---|---|---|
| USD | US Dollar | `$` | 2 | `en-US` |
| LBP | Lebanese Pound | `ل.ل` | 0 | `ar-LB` |
| EUR | Euro | `€` | 2 | `en-DE` |
| GBP | British Pound | `£` | 2 | `en-GB` |
| SAR | Saudi Riyal | `﷼` | 2 | `ar-SA` |
| AED | UAE Dirham | `د.إ` | 2 | `ar-AE` |
| EGP | Egyptian Pound | `E£` | 2 | `ar-EG` |
| JOD | Jordanian Dinar | `JD` | 3 | `ar-JO` |
| SYP | Syrian Pound | `S£` | 0 | `ar-SY` |
| IQD | Iraqi Dinar | `ع.د` | 0 | `ar-IQ` |
| TRY | Turkish Lira | `₺` | 2 | `tr-TR` |
| MAD | Moroccan Dirham | `MAD` | 2 | `fr-MA` |
| TND | Tunisian Dinar | `DT` | 3 | `ar-TN` |
| DZD | Algerian Dinar | `دج` | 2 | `ar-DZ` |
| LYD | Libyan Dinar | `LD` | 3 | `ar-LY` |
| SDG | Sudanese Pound | `ج.س` | 2 | `ar-SD` |
| YER | Yemeni Rial | `﷼` | 0 | `ar-YE` |
| KWD | Kuwaiti Dinar | `KD` | 3 | `ar-KW` |
| BHD | Bahraini Dinar | `BD` | 3 | `ar-BH` |
| QAR | Qatari Riyal | `QR` | 2 | `ar-QA` |
| OMR | Omani Rial | `RO` | 3 | `ar-OM` |

**Mutability**: The constant is exported as `Record<…>` — it is a read-only reference in practice (consumers never mutate) but TypeScript does not mark it `as const` or `readonly` to keep the type ergonomic. Future hardening may switch to `as const` if needed.

---

## Entity 4 — `CountryConfig`

**Kind**: TypeScript interface.
**Module**: `packages/shared/src/types/countries.ts`

**Fields**:

| Field | Type | Description |
|---|---|---|
| `code` | `string` | ISO 3166-1 alpha-2 code (e.g. `'LB'`, `'US'`). Kept as `string` — not a constrained union — so Phase 1 doesn't pin down the eventual country union type (that is a later-phase decision). |
| `name` | `string` | English display name (e.g. `'Lebanon'`). Admin use; same caveats as `CurrencyMeta.name`. |
| `localCurrency` | `CurrencyCode` | The country's primary local currency. |
| `defaultCurrencies` | `CurrencyCode[]` | Currencies auto-enabled for a new store in this country. Always contains `'USD'`. Deduplicated when `localCurrency === 'USD'`. |

**Invariants**:
- `defaultCurrencies.includes('USD') === true` for every entry (verified by test).
- `defaultCurrencies[0] === localCurrency` as a convention (the primary local currency comes first). For `US` where local is USD, the array is just `['USD']`.
- No duplicate entries within `defaultCurrencies`.

---

## Entity 5 — `COUNTRY_CONFIGS`

**Kind**: Array of `CountryConfig`.
**Module**: `packages/shared/src/types/countries.ts`

**Entries** (per R-2):

| Code | Name | Local | Default currencies |
|---|---|---|---|
| LB | Lebanon | LBP | `['LBP', 'USD']` |
| US | United States | USD | `['USD']` |
| GB | United Kingdom | GBP | `['GBP', 'USD']` |
| DE | Germany | EUR | `['EUR', 'USD']` |
| FR | France | EUR | `['EUR', 'USD']` |
| SA | Saudi Arabia | SAR | `['SAR', 'USD']` |
| AE | UAE | AED | `['AED', 'USD']` |
| EG | Egypt | EGP | `['EGP', 'USD']` |
| JO | Jordan | JOD | `['JOD', 'USD']` |
| SY | Syria | SYP | `['SYP', 'USD']` |
| IQ | Iraq | IQD | `['IQD', 'USD']` |
| TR | Turkey | TRY | `['TRY', 'USD']` |
| MA | Morocco | MAD | `['MAD', 'USD']` |
| TN | Tunisia | TND | `['TND', 'USD']` |
| DZ | Algeria | DZD | `['DZD', 'USD']` |
| LY | Libya | LYD | `['LYD', 'USD']` |
| SD | Sudan | SDG | `['SDG', 'USD']` |
| YE | Yemen | YER | `['YER', 'USD']` |
| KW | Kuwait | KWD | `['KWD', 'USD']` |
| BH | Bahrain | BHD | `['BHD', 'USD']` |
| QA | Qatar | QAR | `['QAR', 'USD']` |
| OM | Oman | OMR | `['OMR', 'USD']` |

---

## Entity 6 — `COUNTRY_MAP`

**Kind**: Constant record, derived from `COUNTRY_CONFIGS`.
**Module**: `packages/shared/src/types/countries.ts`

**Type**: `Record<string, CountryConfig>`.

**Construction**: `Object.fromEntries(COUNTRY_CONFIGS.map((c) => [c.code, c]))`.

**Purpose**: O(1) lookup by ISO 3166-1 alpha-2 code. Used by `getDefaultCurrenciesForCountry` and (in Phase 4) by `StoreForm`'s country change handler.

---

## Entity 7 — `getDefaultCurrenciesForCountry(countryCode: string): CurrencyCode[]`

**Kind**: Pure function.
**Module**: `packages/shared/src/types/countries.ts`

**Signature**: `(countryCode: string) => CurrencyCode[]`

**Behavior**:
1. Return `COUNTRY_MAP[countryCode].defaultCurrencies` when present.
2. Return `['USD']` when `countryCode` is unknown.
3. Never throws.

**Complexity**: O(1) object lookup + conditional return.

**Purity**: No side effects. Deterministic. Safe to call during SSR or tests.

---

## Export surface (barrel)

`packages/shared/src/types/index.ts` gains these re-exports:

```ts
export type { CurrencyCode, CurrencyMeta } from './currency';
export { CURRENCY_META } from './currency';

export type { CountryConfig } from './countries';
export {
  COUNTRY_CONFIGS,
  COUNTRY_MAP,
  getDefaultCurrenciesForCountry,
} from './countries';
```

No existing exports are removed, renamed, or altered.

---

## State transitions

None. All entities are immutable constants or pure types.

---

## Relationship diagram

```
CurrencyCode  ──┬──► CurrencyMeta.code
                ├──► CURRENCY_META[key]  (exhaustive record)
                ├──► CountryConfig.localCurrency
                └──► CountryConfig.defaultCurrencies[i]

CountryConfig ──► COUNTRY_CONFIGS[i]
              ──► COUNTRY_MAP[code]
              ──► getDefaultCurrenciesForCountry() return
```
