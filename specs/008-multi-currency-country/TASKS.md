# Feature 008 — Multi-Currency & Country-Aware Store

**Goal:** Remove the hardcoded `'USD' | 'LBP'` binary currency union from the entire platform, introduce a `country` field on the `stores` table, auto-derive the store's accepted currencies from its country (USD is always included), and enforce currency consistency through inventory insertion and the POS selling flow.

---

## Background & Current State

The codebase assumes exactly two currencies everywhere:

| Location | Hardcoded assumption |
|---|---|
| `packages/shared/src/types/supabase-core.ts` | `preferred_currency: 'USD' \| 'LBP'` |
| `apps/store-app/src/services/currencyService.ts` | `CurrencyConfig.code: 'USD' \| 'LBP'`, exchange rate hardcoded to `89500` |
| `apps/store-app/src/types/database.ts` | All `currency` columns typed as `'USD' \| 'LBP'` |
| `apps/store-app/src/types/index.ts` | `InventoryItem.currency?: 'USD' \| 'LBP'` |
| `apps/admin-app/src/components/stores/StoreForm.tsx` | Dropdown limited to two options, default exchange rate `89500` |
| `apps/store-app/src/services/syncDownload.ts` | Fallback to `'LBP'` when store row is missing |
| `apps/store-app/src/services/syncService.ts` | `ensureStoreExists` seeds `preferred_currency: 'USD'` |
| `apps/store-app/src/contexts/offlineData/useTransactionDataLayer.ts` | Currency fallback `\|\| 'USD'` |
| `apps/store-app/src/lib/db.ts` | Dexie v54 — `stores` and `inventory_items` indexes encode the old two-currency model |

Dual-ledger accounting columns (`debit_usd`, `credit_usd`, `debit_lbp`, `credit_lbp`, `balance_usd`, `balance_lbp`) in `journal_entries` and `balance_snapshots` are **out of scope** for this feature — leave them unchanged and note the limitation.

---

## Task 1 — Define a generic `CurrencyCode` type in `@pos-platform/shared`

**File:** `packages/shared/src/types/currency.ts` *(new file)*

### What to build

Create a canonical, exhaustive list of ISO 4217 currency codes that the platform will support. This replaces every `'USD' | 'LBP'` union in the shared contract.

```ts
/**
 * Supported ISO 4217 currency codes.
 * Extend this union when onboarding new countries.
 */
export type CurrencyCode =
  | 'USD'   // US Dollar (always present as base currency)
  | 'LBP'   // Lebanese Pound
  | 'EUR'   // Euro
  | 'GBP'   // British Pound
  | 'SAR'   // Saudi Riyal
  | 'AED'   // UAE Dirham
  | 'EGP'   // Egyptian Pound
  | 'JOD'   // Jordanian Dinar
  | 'SYP'   // Syrian Pound
  | 'IQD'   // Iraqi Dinar
  | 'TRY'   // Turkish Lira
  | 'MAD'   // Moroccan Dirham
  | 'TND'   // Tunisian Dinar
  | 'DZD'   // Algerian Dinar
  | 'LYD'   // Libyan Dinar
  | 'SDG'   // Sudanese Pound
  | 'YER'   // Yemeni Rial
  | 'KWD'   // Kuwaiti Dinar
  | 'BHD'   // Bahraini Dinar
  | 'QAR'   // Qatari Riyal
  | 'OMR';  // Omani Rial

export interface CurrencyMeta {
  code: CurrencyCode;
  name: string;         // English display name
  symbol: string;       // Display symbol
  decimals: number;     // Number of decimal places (0 for LBP-style)
  locale: string;       // Intl.NumberFormat locale hint
}

/** Master registry — add an entry for every CurrencyCode variant above. */
export const CURRENCY_META: Record<CurrencyCode, CurrencyMeta> = {
  USD: { code: 'USD', name: 'US Dollar',         symbol: '$',   decimals: 2, locale: 'en-US' },
  LBP: { code: 'LBP', name: 'Lebanese Pound',    symbol: 'ل.ل', decimals: 0, locale: 'ar-LB' },
  EUR: { code: 'EUR', name: 'Euro',               symbol: '€',   decimals: 2, locale: 'en-DE' },
  GBP: { code: 'GBP', name: 'British Pound',      symbol: '£',   decimals: 2, locale: 'en-GB' },
  SAR: { code: 'SAR', name: 'Saudi Riyal',         symbol: '﷼',  decimals: 2, locale: 'ar-SA' },
  AED: { code: 'AED', name: 'UAE Dirham',          symbol: 'د.إ', decimals: 2, locale: 'ar-AE' },
  EGP: { code: 'EGP', name: 'Egyptian Pound',     symbol: 'E£',  decimals: 2, locale: 'ar-EG' },
  JOD: { code: 'JOD', name: 'Jordanian Dinar',    symbol: 'JD',  decimals: 3, locale: 'ar-JO' },
  SYP: { code: 'SYP', name: 'Syrian Pound',        symbol: 'S£',  decimals: 0, locale: 'ar-SY' },
  IQD: { code: 'IQD', name: 'Iraqi Dinar',         symbol: 'ع.د', decimals: 0, locale: 'ar-IQ' },
  TRY: { code: 'TRY', name: 'Turkish Lira',        symbol: '₺',   decimals: 2, locale: 'tr-TR' },
  MAD: { code: 'MAD', name: 'Moroccan Dirham',    symbol: 'MAD', decimals: 2, locale: 'fr-MA' },
  TND: { code: 'TND', name: 'Tunisian Dinar',      symbol: 'DT',  decimals: 3, locale: 'ar-TN' },
  DZD: { code: 'DZD', name: 'Algerian Dinar',      symbol: 'دج',  decimals: 2, locale: 'ar-DZ' },
  LYD: { code: 'LYD', name: 'Libyan Dinar',        symbol: 'LD',  decimals: 3, locale: 'ar-LY' },
  SDG: { code: 'SDG', name: 'Sudanese Pound',      symbol: 'ج.س', decimals: 2, locale: 'ar-SD' },
  YER: { code: 'YER', name: 'Yemeni Rial',         symbol: '﷼',   decimals: 0, locale: 'ar-YE' },
  KWD: { code: 'KWD', name: 'Kuwaiti Dinar',       symbol: 'KD',  decimals: 3, locale: 'ar-KW' },
  BHD: { code: 'BHD', name: 'Bahraini Dinar',      symbol: 'BD',  decimals: 3, locale: 'ar-BH' },
  QAR: { code: 'QAR', name: 'Qatari Riyal',        symbol: 'QR',  decimals: 2, locale: 'ar-QA' },
  OMR: { code: 'OMR', name: 'Omani Rial',          symbol: 'RO',  decimals: 3, locale: 'ar-OM' },
};
```

Export `CurrencyCode`, `CurrencyMeta`, and `CURRENCY_META` from `packages/shared/src/types/index.ts`.

### Acceptance criteria
- `CurrencyCode` compiles; all existing `'USD' | 'LBP'` literals remain valid subtypes of it (no breakage yet — migration is done in later tasks).
- No runtime logic in this file — pure types + constants.

---

## Task 2 — Build the country-to-currency map in `@pos-platform/shared`

**File:** `packages/shared/src/types/countries.ts` *(new file)*

### What to build

A data structure mapping ISO 3166-1 alpha-2 country codes to:
- `name` — display name in English
- `localCurrency` — the country's primary local currency (`CurrencyCode`)
- `defaultCurrencies` — array `[localCurrency, 'USD']` deduplicated (if `localCurrency === 'USD'` just `['USD']`)

```ts
import type { CurrencyCode } from './currency';

export interface CountryConfig {
  code: string;          // ISO 3166-1 alpha-2
  name: string;
  localCurrency: CurrencyCode;
  /** The set of currencies auto-enabled for a new store in this country. Always includes USD. */
  defaultCurrencies: CurrencyCode[];
}

export const COUNTRY_CONFIGS: CountryConfig[] = [
  { code: 'LB', name: 'Lebanon',       localCurrency: 'LBP', defaultCurrencies: ['LBP', 'USD'] },
  { code: 'US', name: 'United States', localCurrency: 'USD', defaultCurrencies: ['USD'] },
  { code: 'GB', name: 'United Kingdom',localCurrency: 'GBP', defaultCurrencies: ['GBP', 'USD'] },
  { code: 'DE', name: 'Germany',       localCurrency: 'EUR', defaultCurrencies: ['EUR', 'USD'] },
  { code: 'FR', name: 'France',        localCurrency: 'EUR', defaultCurrencies: ['EUR', 'USD'] },
  { code: 'SA', name: 'Saudi Arabia',  localCurrency: 'SAR', defaultCurrencies: ['SAR', 'USD'] },
  { code: 'AE', name: 'UAE',           localCurrency: 'AED', defaultCurrencies: ['AED', 'USD'] },
  { code: 'EG', name: 'Egypt',         localCurrency: 'EGP', defaultCurrencies: ['EGP', 'USD'] },
  { code: 'JO', name: 'Jordan',        localCurrency: 'JOD', defaultCurrencies: ['JOD', 'USD'] },
  { code: 'SY', name: 'Syria',         localCurrency: 'SYP', defaultCurrencies: ['SYP', 'USD'] },
  { code: 'IQ', name: 'Iraq',          localCurrency: 'IQD', defaultCurrencies: ['IQD', 'USD'] },
  { code: 'TR', name: 'Turkey',        localCurrency: 'TRY', defaultCurrencies: ['TRY', 'USD'] },
  { code: 'MA', name: 'Morocco',       localCurrency: 'MAD', defaultCurrencies: ['MAD', 'USD'] },
  { code: 'TN', name: 'Tunisia',       localCurrency: 'TND', defaultCurrencies: ['TND', 'USD'] },
  { code: 'DZ', name: 'Algeria',       localCurrency: 'DZD', defaultCurrencies: ['DZD', 'USD'] },
  { code: 'LY', name: 'Libya',         localCurrency: 'LYD', defaultCurrencies: ['LYD', 'USD'] },
  { code: 'SD', name: 'Sudan',         localCurrency: 'SDG', defaultCurrencies: ['SDG', 'USD'] },
  { code: 'YE', name: 'Yemen',         localCurrency: 'YER', defaultCurrencies: ['YER', 'USD'] },
  { code: 'KW', name: 'Kuwait',        localCurrency: 'KWD', defaultCurrencies: ['KWD', 'USD'] },
  { code: 'BH', name: 'Bahrain',       localCurrency: 'BHD', defaultCurrencies: ['BHD', 'USD'] },
  { code: 'QA', name: 'Qatar',         localCurrency: 'QAR', defaultCurrencies: ['QAR', 'USD'] },
  { code: 'OM', name: 'Oman',          localCurrency: 'OMR', defaultCurrencies: ['OMR', 'USD'] },
];

/** Keyed access by ISO country code. */
export const COUNTRY_MAP: Record<string, CountryConfig> = Object.fromEntries(
  COUNTRY_CONFIGS.map((c) => [c.code, c])
);

/** Returns the defaultCurrencies for a country, falling back to ['USD'] if unknown. */
export function getDefaultCurrenciesForCountry(countryCode: string): CurrencyCode[] {
  return COUNTRY_MAP[countryCode]?.defaultCurrencies ?? ['USD'];
}
```

Export both from `packages/shared/src/types/index.ts`.

### Acceptance criteria
- Function `getDefaultCurrenciesForCountry('LB')` returns `['LBP', 'USD']`.
- Function `getDefaultCurrenciesForCountry('US')` returns `['USD']`.
- Unknown country codes fall back to `['USD']`.

---

## Task 3 — Database migration: add `country` and `accepted_currencies` to `stores`

**File:** `supabase/migrations/<timestamp>_add_country_accepted_currencies_to_stores.sql` *(new file)*

### What to build

```sql
-- Add country field (ISO 3166-1 alpha-2)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'LB';

-- Add accepted_currencies as a text array (ISO 4217 codes)
-- Example: ARRAY['LBP','USD']
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS accepted_currencies TEXT[] NOT NULL DEFAULT ARRAY['LBP','USD'];

-- Back-fill existing rows: derive accepted_currencies from preferred_currency
UPDATE public.stores
SET accepted_currencies = CASE
  WHEN preferred_currency = 'USD' THEN ARRAY['USD']
  ELSE ARRAY[preferred_currency::TEXT, 'USD']
END
WHERE accepted_currencies = ARRAY['LBP','USD'];
```

**Notes:**
- `country` is nullable-tolerant via `DEFAULT 'LB'` to avoid breaking existing rows. The default will be revisited when all stores have been assigned a real country.
- `accepted_currencies` stores the array of enabled currencies for a store. The store admin can override this after auto-population from `country`.
- Do **not** remove or rename `preferred_currency` — it still represents the store's primary display currency.

### Acceptance criteria
- Migration runs without error on a fresh `supabase db push`.
- Existing `stores` rows have `accepted_currencies` back-filled correctly.
- `country` defaults to `'LB'` for legacy rows.

---

## Task 4 — Update shared types: `StoreCore` and `StoreCoreInsert`

**File:** `packages/shared/src/types/supabase-core.ts`

### What to change

```ts
// Before
export interface StoreCore {
  id: string;
  name: string;
  preferred_currency: 'USD' | 'LBP';
  preferred_language: 'en' | 'ar' | 'fr';
  exchange_rate: number;
  created_at: string;
  updated_at: string;
}

// After
import type { CurrencyCode } from './currency';

export interface StoreCore {
  id: string;
  name: string;
  country: string;                          // ISO 3166-1 alpha-2; '' or 'LB' as legacy fallback
  preferred_currency: CurrencyCode;         // Primary display currency
  accepted_currencies: CurrencyCode[];      // All currencies this store operates in
  preferred_language: 'en' | 'ar' | 'fr';
  exchange_rate: number;                    // Local-currency-to-USD rate (kept for backward compat)
  created_at: string;
  updated_at: string;
}
```

**Important:** The `exchange_rate` field remains but is now understood as the rate for the **local currency** (the first non-USD entry in `accepted_currencies`, or the `localCurrency` of the store's country). For stores with multiple non-USD currencies in the future, a multi-rate map would be needed — that is explicitly out of scope for this feature; add a `// TODO(009-multi-rate)` comment.

Also add `StoreCoreInsert` for convenience:

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

### Acceptance criteria
- Both apps compile after this change.
- `StoreCore.preferred_currency` still accepts `'USD'` and `'LBP'` (both are valid `CurrencyCode` members).

---

## Task 5 — Update `apps/store-app/src/types/database.ts`

**File:** `apps/store-app/src/types/database.ts`

Replace every `'USD' | 'LBP'` currency union with `CurrencyCode` from `@pos-platform/shared`. Key locations:

| Column | Table | Action |
|---|---|---|
| `preferred_currency` | `stores` Row/Insert/Update | → `CurrencyCode` |
| `accepted_currencies` | `stores` Row/Insert/Update | Add `CurrencyCode[]` |
| `country` | `stores` Row/Insert/Update | Add `string \| null` |
| `currency` | `inventory_items` Row/Insert/Update | → `CurrencyCode` (make non-optional in Row) |
| `currency` | `transactions` Row/Insert/Update | → `CurrencyCode` |
| `currency` | `cash_drawer_accounts` Row/Insert/Update | → `CurrencyCode` |

Also update the local `InventoryItem` interface in `apps/store-app/src/types/index.ts`:

```ts
// Before
currency?: 'USD' | 'LBP';

// After
currency?: CurrencyCode;  // The currency in which selling_price is denominated
```

### Acceptance criteria
- `pnpm --filter store-app build` passes with zero type errors related to currency types.

---

## Task 6 — Bump Dexie schema for `stores` and `inventory_items`

**File:** `apps/store-app/src/lib/db.ts`

### What to change

Add a new Dexie version (e.g. version 55) that:

1. Adds `country` and `accepted_currencies` to the `stores` index string.
2. Makes `currency` a required indexed field on `inventory_items` (it was already indexed but optional in the TypeScript type — align both).

```ts
this.version(55).stores({
  stores: 'id, name, country, preferred_currency, accepted_currencies, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
  // inventory_items: keep existing index string; currency is already indexed in v54
}).upgrade(async (tx) => {
  // Back-fill country from preferred_currency for existing local store rows
  await tx.table('stores').toCollection().modify((store) => {
    if (!store.country) {
      // Best-effort: if preferred_currency is LBP, assume Lebanon
      store.country = store.preferred_currency === 'LBP' ? 'LB' : '';
    }
    if (!store.accepted_currencies || store.accepted_currencies.length === 0) {
      store.accepted_currencies =
        store.preferred_currency === 'USD'
          ? ['USD']
          : [store.preferred_currency, 'USD'];
    }
  });
});
```

> Note: `accepted_currencies` is an array; Dexie does not support array full-text index. Remove it from the index string if it causes issues — it is only needed for reading, not range queries.

### Acceptance criteria
- App boots without Dexie version errors.
- Existing stores in IndexedDB have `country` and `accepted_currencies` populated after upgrade.

---

## Task 7 — Refactor `CurrencyService` to be multi-currency aware

**File:** `apps/store-app/src/services/currencyService.ts`

### What to build

The service currently holds a single `exchangeRate: number` and works only with USD/LBP. Expand it to hold a map of rates and derive all information from the store's `accepted_currencies`.

**Key changes:**

```ts
import type { CurrencyCode, CurrencyMeta, CURRENCY_META } from '@pos-platform/shared';

export class CurrencyService {
  private storeId: string = '';
  private preferredCurrency: CurrencyCode = 'USD';
  private acceptedCurrencies: CurrencyCode[] = ['USD'];
  /**
   * Exchange rates relative to USD. Key = CurrencyCode, value = units-per-USD.
   * USD itself is always 1. Populated from the store's exchange_rate for the local currency.
   * TODO(009-multi-rate): replace with a proper per-currency rate table.
   */
  private rates: Partial<Record<CurrencyCode, number>> = { USD: 1 };

  /** Load store preferences from Dexie. Call once on app boot and after sync. */
  public async loadFromStore(storeId: string): Promise<void> { ... }

  /** Convert an amount between any two accepted currencies via USD as pivot. */
  public convert(amount: number, from: CurrencyCode, to: CurrencyCode): number { ... }

  /** Format using Intl.NumberFormat driven by CURRENCY_META[code].locale and .decimals. */
  public format(amount: number, currency: CurrencyCode): string { ... }

  /** Returns the CurrencyMeta for a given code, or undefined if not in CURRENCY_META. */
  public getMeta(currency: CurrencyCode): CurrencyMeta { ... }

  /** Returns the store's accepted currencies in order (preferred first). */
  public getAcceptedCurrencies(): CurrencyCode[] { ... }

  public getPreferredCurrency(): CurrencyCode { ... }

  /** Update the exchange rate for the local currency and persist to Dexie. */
  public async updateExchangeRate(storeId: string, rate: number): Promise<void> { ... }

  public getExchangeRate(): number { ... }  // legacy shim — returns rate for local currency
}
```

**Remove:**
- `getSupportedCurrencies()` returning the hardcoded two-element array — replace with `getAcceptedCurrencies()`.
- The `safeConvertForDatabase` method that hard-converts to LBP — delete it and update call sites.
- `formatCurrencyWithSymbol` — merge into `format`.
- `getConvertedAmount` — replace with `convert(amount, currency, 'USD')`.

**Update all call sites** in the store-app that use the removed methods.

### Acceptance criteria
- `currencyService.format(1500000, 'LBP')` renders correctly in Arabic locale.
- `currencyService.format(10.5, 'USD')` renders `$10.50`.
- `currencyService.convert(100, 'USD', 'LBP')` returns `100 * exchangeRate`.
- `currencyService.getAcceptedCurrencies()` returns `['LBP', 'USD']` for a Lebanese store after `loadFromStore`.

---

## Task 8 — Admin app: add `country` field and auto-populate currencies in `StoreForm`

**File:** `apps/admin-app/src/components/stores/StoreForm.tsx`

### What to build

1. **Add a Country selector** (searchable `<Select>` or combobox) populated from `COUNTRY_CONFIGS` sorted alphabetically.
2. **When country changes**, auto-populate:
   - `preferred_currency` → `COUNTRY_MAP[country].localCurrency`
   - `accepted_currencies` → `COUNTRY_MAP[country].defaultCurrencies`
   - `exchange_rate` → clear/reset to empty (admin must fill in the actual rate; remove the hardcoded `89500` default)
3. **Replace the `preferred_currency` selector** options: instead of a hardcoded two-item list, render options from `CURRENCY_META` for the full `CurrencyCode` union. The admin should be able to override the auto-populated value.
4. **Add an `accepted_currencies` multi-select** field so the admin can add/remove currencies beyond the country defaults. The list of options should come from `CURRENCY_META`. Use checkboxes or a multi-select component.
5. **Remove the hardcoded exchange rate default** `'89500'` and replace with `''` (empty). Add helper text: `"Rate of 1 USD expressed in [preferred_currency]"`.

**Form state shape:**
```ts
const [formData, setFormData] = useState({
  name: store?.name || '',
  country: store?.country || '',
  address: store?.address || '',
  phone: store?.phone || '',
  email: store?.email || '',
  preferred_currency: store?.preferred_currency || 'USD',
  accepted_currencies: store?.accepted_currencies || ['USD'],
  preferred_language: store?.preferred_language || 'en',
  preferred_commission_rate: store?.preferred_commission_rate?.toString() || '10',
  exchange_rate: store?.exchange_rate?.toString() || '',
  subscription_plan: 'premium' as SubscriptionPlan,
});
```

**Country-change handler:**
```ts
const handleCountryChange = (countryCode: string) => {
  const config = COUNTRY_MAP[countryCode];
  if (!config) return;
  setFormData((prev) => ({
    ...prev,
    country: countryCode,
    preferred_currency: config.localCurrency,
    accepted_currencies: config.defaultCurrencies,
    exchange_rate: '',  // force admin to enter the current rate
  }));
};
```

6. Update `validate()` to:
   - Require `country` to be non-empty.
   - Require `exchange_rate` to be > 0 **only if** `preferred_currency !== 'USD'` (USD stores have no local exchange rate).
   - Require `accepted_currencies` to have at least one element.

7. Update `handleSubmit` to pass `country` and `accepted_currencies` in the submitted payload.

### Acceptance criteria
- Selecting country "Lebanon" auto-sets `preferred_currency = 'LBP'`, `accepted_currencies = ['LBP', 'USD']`.
- Selecting country "United States" auto-sets `preferred_currency = 'USD'`, `accepted_currencies = ['USD']`, and hides or disables the exchange rate field.
- Admin can override `accepted_currencies` to add, say, EUR to a Lebanon store.
- Form submits `country` and `accepted_currencies` to the backend.

---

## Task 9 — Update admin-app `Store` type and service layer

**File:** `apps/admin-app/src/types/index.ts` (or wherever `Store`, `CreateStoreInput`, `UpdateStoreInput` are defined)

Add `country` and `accepted_currencies` to all three interfaces, importing `CurrencyCode` from `@pos-platform/shared`.

**File:** `apps/admin-app/src/services/storeService.ts` (or the relevant service)

Ensure `country` and `accepted_currencies` are included in:
- The `INSERT` payload when creating a store.
- The `UPDATE` payload when editing a store.
- The `SELECT` query / mapping from Supabase response back to the `Store` type.

### Acceptance criteria
- Creating a store via the admin app persists `country` and `accepted_currencies` in Supabase.
- Fetching stores returns `country` and `accepted_currencies` correctly.

---

## Task 10 — Store-app: surface accepted currencies in context / settings

**File:** `apps/store-app/src/contexts/` (whichever context exposes the current store)

1. After sync (or on `loadFromStore`), call `currencyService.loadFromStore(storeId)` so the service is aware of `accepted_currencies`.
2. Expose `acceptedCurrencies: CurrencyCode[]` and `preferredCurrency: CurrencyCode` from the context so UI components can read them without importing the service directly.
3. Expose a `formatAmount(amount: number, currency: CurrencyCode): string` helper from the context, backed by `currencyService.format`.

### Acceptance criteria
- Any component that previously imported `currencyService` directly for formatting can now consume the context helper.
- The context re-exports `acceptedCurrencies` from the current store row, not a hardcoded list.

---

## Task 11 — Inventory: multi-currency pricing on `inventory_items`

### Sub-task 11a — Ensure `currency` is required on the Supabase row

**File:** `apps/store-app/src/types/database.ts`

Change `inventory_items.Row.currency` from optional to required `CurrencyCode`. This was already indexed in Dexie but was `currency?` in TypeScript — fix the mismatch.

### Sub-task 11b — Enforce currency on insert

**File:** wherever `inventory_items` records are created (search for `inventory_items` inserts in the store-app — likely in an inventory service or data layer)

When inserting a new `inventory_item`:
- `currency` must be set explicitly by the caller.
- It must be one of the store's `accepted_currencies`. Validate this before writing to Dexie:

```ts
function assertAcceptedCurrency(currency: CurrencyCode, acceptedCurrencies: CurrencyCode[]): void {
  if (!acceptedCurrencies.includes(currency)) {
    throw new Error(
      `Currency "${currency}" is not accepted by this store. Accepted: ${acceptedCurrencies.join(', ')}`
    );
  }
}
```

- The `selling_price` is stored in the item's own `currency`. There is no conversion at insert time — prices are stored as-is in their original currency.

### Sub-task 11c — Update inventory item UI (receive/add inventory form)

**File:** the inventory item creation/edit form in store-app

Replace any hardcoded `'USD' | 'LBP'` dropdown with a selector built from `acceptedCurrencies` (from context). Default the selection to `preferredCurrency`.

Display the currency symbol next to the price input:

```tsx
<div className="relative">
  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
    {currencyService.getMeta(selectedCurrency).symbol}
  </span>
  <input type="number" className="pl-8 ..." ... />
</div>
```

### Acceptance criteria
- Cannot insert an inventory item with a currency not in `store.accepted_currencies`.
- The price input shows the correct symbol for the selected currency.
- Existing LBP/USD inventory items continue to load correctly (backward compat).

---

## Task 12 — POS selling flow: enforce currency consistency

This is the most critical task. When a cashier creates a sale (bill):

### Sub-task 12a — Bill currency

A bill has one settlement currency. The cashier selects it at the start of a transaction (or it defaults to `preferredCurrency`). This selection must be validated against `acceptedCurrencies`.

Locate the bill creation / POS checkout flow (look for bill insert logic and `bill_line_items`). Ensure:
- `bills.currency` (or the equivalent column) is typed as `CurrencyCode`.
- When a bill is created, `currency` is set to the cashier's selected settlement currency.

### Sub-task 12b — Line item price in bill currency

When adding a product to the cart:
1. Look up the `inventory_item` for the product.
2. If the item's `currency` matches the bill's settlement currency → use `selling_price` directly.
3. If the item's `currency` differs → convert using `currencyService.convert(selling_price, item.currency, billCurrency)`.
4. Store the **converted** unit price (in bill currency) on the `bill_line_item`, not the original.

This ensures every line item on a bill is in the same currency.

### Sub-task 12c — Remove fallback `|| 'USD'` in transaction data layer

**File:** `apps/store-app/src/contexts/offlineData/useTransactionDataLayer.ts`

Replace the loose fallback:
```ts
// Before
currency: (transactionData.currency as 'USD' | 'LBP') || 'USD',

// After
currency: transactionData.currency as CurrencyCode,  // caller must supply a valid currency
```

Add runtime validation: if `currency` is missing or not in `acceptedCurrencies`, throw a descriptive error rather than silently defaulting.

### Sub-task 12d — Fix `syncDownload.ts` fallback

**File:** `apps/store-app/src/services/syncDownload.ts`

```ts
// Before
store?.preferred_currency || 'LBP'

// After
store?.preferred_currency ?? 'USD'  // if store row is truly absent, USD is a safer default than LBP
```

Better yet, if the store row is absent during sync, log a warning and skip currency-dependent operations rather than guessing.

### Sub-task 12e — Fix `syncService.ts` `ensureStoreExists`

**File:** `apps/store-app/src/services/syncService.ts`

When seeding a new store row locally via `ensureStoreExists`, also seed `country` and `accepted_currencies` from the downloaded Supabase row (they should now be present). Remove the hardcoded `preferred_currency: 'USD'` fallback.

### Acceptance criteria
- A sale cannot be created with a currency outside `store.accepted_currencies`.
- All line items on a single bill share the same currency.
- No `|| 'USD'` or `|| 'LBP'` fallbacks remain in the selling/transaction path.

---

## Task 13 — Update `syncUpload.ts`: validate `currency` before upload

**File:** `apps/store-app/src/services/syncUpload.ts`

In the upload path for `inventory_items` and `transactions`, add a guard that rejects records with an unrecognized or missing `currency` via `isUnrecoverableError`-style logic, rather than uploading invalid data to Supabase.

```ts
// Inside the pre-upload validation block for inventory_items:
if (!record.currency || !CURRENCY_META[record.currency as CurrencyCode]) {
  throw new ValidationError(`inventory_item ${record.id} has invalid currency: "${record.currency}"`);
}
```

### Acceptance criteria
- An inventory item with `currency: undefined` is flagged as unrecoverable and moved to the error list, not uploaded.

---

## Task 14 — Update parity tests

**File:** `apps/store-app/tests/sync-parity/`

Update all fixture data that uses `preferred_currency: 'USD' | 'LBP'` to also include `country` and `accepted_currencies`. Add at least one parity test for a non-Lebanon store (e.g., UAE with AED).

---

## Task 15 — Update admin-app `balanceMigrationService` and `subscriptionService`

### `balanceMigrationService.ts`
Replace the hardcoded `currency: 'LBP'` default with the actual store's `preferred_currency` (available after Task 9 makes it available through the store query).

### `subscriptionService.ts`
The `currency: 'USD'` used for billing is correct (subscriptions are billed in USD). Add a comment to make this intent explicit so it is not confused with store operational currencies:

```ts
// Subscriptions are always billed in USD regardless of store's local currency.
currency: 'USD',
```

---

## Task 16 — Migrate dual-ledger accounting columns away from hardcoded USD/LBP

The `journal_entries` and `balance_snapshots` tables currently have columns named `debit_usd`, `credit_usd`, `debit_lbp`, `credit_lbp`, `balance_usd`, `balance_lbp`. These names hard-bake two specific currencies into the schema and will break any store operating in a third currency (e.g. AED, EGP).

### Architectural decision: why not "primary/secondary" slots?

A two-slot positional model (`debit_primary`, `debit_secondary`) would seem like a simple rename, but it has a critical flaw: **the slot labels carry no currency identity of their own**. If a store ever changes its `preferred_currency` after rows have already been written, all historical "primary" entries become ambiguous — you no longer know which currency "primary" referred to at write time without joining back to the store row as it existed then. The model also breaks the moment a store accepts three currencies.

**The correct model is: each row carries its own explicit currency code per amount.** Amounts are stored in a JSONB map keyed by `CurrencyCode`, so every row is fully self-describing and immutable regardless of future store configuration changes.

### Sub-task 16a — DB migration: replace fixed columns with a JSONB amounts map

**File:** `supabase/migrations/<timestamp>_generalize_journal_entries_accounting_columns.sql`

```sql
-- journal_entries: replace fixed currency columns with a self-describing JSONB map.
-- Schema: { "<CurrencyCode>": { "debit": <number>, "credit": <number> }, ... }
-- Example: { "LBP": { "debit": 150000, "credit": 0 }, "USD": { "debit": 0, "credit": 1.67 } }
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS amounts JSONB NOT NULL DEFAULT '{}';

-- Back-fill from the old hardcoded columns.
-- Rows that already have a non-empty amounts map are skipped.
UPDATE public.journal_entries
SET amounts = jsonb_build_object(
  'LBP', jsonb_build_object('debit', debit_lbp, 'credit', credit_lbp),
  'USD', jsonb_build_object('debit', debit_usd, 'credit', credit_usd)
)
WHERE amounts = '{}';

-- balance_snapshots: replace balance_usd / balance_lbp with a JSONB map.
-- Schema: { "<CurrencyCode>": <balance_number>, ... }
-- Example: { "LBP": 750000, "USD": 8.37 }
ALTER TABLE public.balance_snapshots
  ADD COLUMN IF NOT EXISTS balances JSONB NOT NULL DEFAULT '{}';

UPDATE public.balance_snapshots
SET balances = jsonb_build_object(
  'LBP', balance_lbp,
  'USD', balance_usd
)
WHERE balances = '{}';
```

> **Do not drop the old columns in this migration.** Keep `debit_usd`, `credit_usd`, etc. as deprecated columns and continue writing them in parallel until all read paths are migrated (Task 16d). Drop them in the follow-up migration in Task 16e.

### Sub-task 16b — Update TypeScript types

**File:** `apps/store-app/src/types/database.ts`

```ts
import type { CurrencyCode } from '@pos-platform/shared';

/** Per-currency debit/credit amounts stored on a single journal entry line. */
export type JournalEntryAmounts = Partial<Record<CurrencyCode, { debit: number; credit: number }>>;

/** Per-currency running balances stored on a balance snapshot. */
export type BalanceSnapshot = Partial<Record<CurrencyCode, number>>;

journal_entries: {
  Row: {
    // ...existing fields...
    /** @deprecated - use `amounts` map */  debit_usd: number;
    /** @deprecated - use `amounts` map */  credit_usd: number;
    /** @deprecated - use `amounts` map */  debit_lbp: number;
    /** @deprecated - use `amounts` map */  credit_lbp: number;
    /** Self-describing map: currency code → { debit, credit }. Immutable once written. */
    amounts: JournalEntryAmounts;
  };
};

balance_snapshots: {
  Row: {
    // ...existing fields...
    /** @deprecated - use `balances` map */  balance_usd: number;
    /** @deprecated - use `balances` map */  balance_lbp: number;
    /** Self-describing map: currency code → running balance. */
    balances: BalanceSnapshot;
  };
};
```

### Sub-task 16c — Helper utilities for reading/writing the amounts map

**File:** `apps/store-app/src/services/accountingCurrencyHelpers.ts` *(new file)*

```ts
import type { CurrencyCode, JournalEntryAmounts, BalanceSnapshot } from '../types';

/** Build a JournalEntryAmounts map for a new entry. */
export function buildEntryAmounts(
  lines: Array<{ currency: CurrencyCode; debit: number; credit: number }>
): JournalEntryAmounts {
  const map: JournalEntryAmounts = {};
  for (const line of lines) {
    map[line.currency] = { debit: line.debit, credit: line.credit };
  }
  return map;
}

/** Read the debit for a specific currency from a journal entry amounts map. */
export function getDebit(amounts: JournalEntryAmounts, currency: CurrencyCode): number {
  return amounts[currency]?.debit ?? 0;
}

/** Read the credit for a specific currency from a journal entry amounts map. */
export function getCredit(amounts: JournalEntryAmounts, currency: CurrencyCode): number {
  return amounts[currency]?.credit ?? 0;
}

/** Return every currency present in a JournalEntryAmounts map. */
export function amountCurrencies(amounts: JournalEntryAmounts): CurrencyCode[] {
  return Object.keys(amounts) as CurrencyCode[];
}
```

### Sub-task 16d — Update all write paths

Search for every place in both apps that writes to `debit_usd`, `credit_usd`, `debit_lbp`, `credit_lbp`, `balance_usd`, `balance_lbp`. For each write site:

1. Replace the fixed-column writes with `buildEntryAmounts(...)` to produce the `amounts` map.
2. Keep writing to the deprecated columns in parallel **only during the transition period** so existing read paths do not break immediately.
3. The `amounts` map is **immutable once written** — never update individual currency entries after the fact. If a correction is needed, create a reversal entry (the existing reversal pattern already applies).

### Sub-task 16e — Update all read paths

Search for every query or selector that reads `debit_usd`, `credit_usd`, `debit_lbp`, `credit_lbp`, `balance_usd`, `balance_lbp`. Migrate each one to iterate over the `amounts` / `balances` map instead. The UI must render currency labels dynamically from the map's keys:

```tsx
// Before — hardcoded currency labels
<span>LBP Balance: {formatLBP(snapshot.balance_lbp)}</span>
<span>USD Balance: {formatUSD(snapshot.balance_usd)}</span>

// After — self-describing from the stored map
{Object.entries(snapshot.balances).map(([currency, balance]) => (
  <span key={currency}>
    {currency} Balance: {currencyService.format(balance, currency as CurrencyCode)}
  </span>
))}
```

This pattern is immune to store configuration changes: the currency codes embedded in the map at write time are the ground truth, regardless of what the store's `preferred_currency` is today.

### Sub-task 16f — Drop old columns (follow-up migration, after all code is migrated)

Once Tasks 16d and 16e are complete and verified in staging, add a final migration:

```sql
ALTER TABLE public.journal_entries
  DROP COLUMN IF EXISTS debit_usd,
  DROP COLUMN IF EXISTS credit_usd,
  DROP COLUMN IF EXISTS debit_lbp,
  DROP COLUMN IF EXISTS credit_lbp;

ALTER TABLE public.balance_snapshots
  DROP COLUMN IF EXISTS balance_usd,
  DROP COLUMN IF EXISTS balance_lbp;
```

### Sub-task 16g — Update Dexie schema for local journal_entries / balance_snapshots

**File:** `apps/store-app/src/lib/db.ts`

Add a Dexie version bump (e.g. version 56). The `amounts` and `balances` JSONB fields are stored as plain JS objects in IndexedDB — no special indexing needed. Run a `.upgrade()` that back-fills them from the old indexed columns, identical logic to the SQL migration in 16a.

### Acceptance criteria
- A journal entry written for an AED store contains `amounts: { "AED": { "debit": 500, "credit": 0 }, "USD": { "debit": 0, "credit": 136.6 } }`. No `debit_usd` or `debit_lbp` values are relied upon in any read path.
- Changing a store's `preferred_currency` does not retroactively alter what currency code is displayed against historical journal entries — the stored map is the authority.
- A store with three accepted currencies (e.g. `['TRY', 'EUR', 'USD']`) correctly stores three currency entries in the `amounts` map.
- No TypeScript references to `debit_usd`, `credit_usd`, `debit_lbp`, `credit_lbp`, `balance_usd`, `balance_lbp` remain outside `@deprecated`-marked type fields.

---

## Task 17 — Multi-rate support: per-currency exchange rates

Currently `exchange_rate` is a single `number` on the `stores` table representing one local-currency-to-USD rate. For stores that accept multiple non-USD currencies (e.g. a Lebanese store that also accepts EUR), there is no way to store the EUR/USD rate.

### Sub-task 17a — DB migration: add `exchange_rates` JSONB column

**File:** `supabase/migrations/<timestamp>_add_exchange_rates_map_to_stores.sql`

```sql
-- Stores a JSON object mapping CurrencyCode → rate-vs-USD.
-- Example: {"LBP": 89500, "EUR": 0.92}
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS exchange_rates JSONB NOT NULL DEFAULT '{}';

-- Back-fill from the existing scalar exchange_rate for legacy stores
UPDATE public.stores
SET exchange_rates = jsonb_build_object(preferred_currency::text, exchange_rate)
WHERE preferred_currency <> 'USD'
  AND (exchange_rates = '{}' OR exchange_rates IS NULL);
```

Keep the scalar `exchange_rate` column as a read-compatible fallback — sync it with the primary local currency's entry in `exchange_rates` on every update.

### Sub-task 17b — Update `StoreCore` in shared types

```ts
export interface StoreCore {
  // ...existing fields...
  /** @deprecated use exchange_rates map; kept for backward compat */
  exchange_rate: number;
  /** Map of CurrencyCode → units-per-USD. USD itself is omitted (always 1). */
  exchange_rates: Partial<Record<CurrencyCode, number>>;
}
```

### Sub-task 17c — Update `CurrencyService` to use the rates map

**File:** `apps/store-app/src/services/currencyService.ts`

Extend `loadFromStore` to read `exchange_rates` from the store row and populate the internal `rates` map:

```ts
public async loadFromStore(storeId: string): Promise<void> {
  const store = await getDB().stores.get(storeId);
  if (!store) return;
  this.preferredCurrency = store.preferred_currency;
  this.acceptedCurrencies = store.accepted_currencies ?? [store.preferred_currency, 'USD'];
  // Populate rates from the new map, falling back to scalar exchange_rate
  this.rates = { USD: 1, ...store.exchange_rates };
  if (!this.rates[store.preferred_currency] && store.exchange_rate) {
    this.rates[store.preferred_currency] = store.exchange_rate;
  }
}
```

Update `convert(amount, from, to)` to use `this.rates` via USD as a pivot:

```ts
public convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const rateFrom = from === 'USD' ? 1 : (this.rates[from] ?? null);
  const rateTo   = to   === 'USD' ? 1 : (this.rates[to]   ?? null);
  if (rateFrom === null || rateTo === null) {
    throw new Error(`No exchange rate available for ${from} → ${to}`);
  }
  // Convert to USD first, then to target currency
  const inUSD = from === 'USD' ? amount : amount / rateFrom;
  return to === 'USD' ? inUSD : inUSD * rateTo;
}
```

### Sub-task 17d — Update Dexie schema and upgrade

Add `exchange_rates` to the Dexie `stores` store definition (not indexed; JSON blob). Back-fill from `exchange_rate` in the upgrade function.

### Sub-task 17e — Update admin `StoreForm` to edit rates per accepted currency

When the admin selects multiple `accepted_currencies`, display one exchange rate input per non-USD currency:

```
Accepted currencies: [LBP ✓] [EUR ✓] [USD ✓]

LBP / USD rate: [89500   ]
EUR / USD rate: [0.92    ]
```

Submit these as `exchange_rates: { LBP: 89500, EUR: 0.92 }` and keep `exchange_rate` in sync with the primary local currency's value.

### Acceptance criteria
- A store with `accepted_currencies = ['AED', 'USD', 'EUR']` stores three rates in `exchange_rates`.
- `currencyService.convert(100, 'AED', 'EUR')` returns the correct cross-rate via USD pivot.
- The old scalar `exchange_rate` value is always kept in sync with the primary local currency's rate.

---

## Task 18 — Store-app settings: let the store user manage their accepted currencies

Currently the admin-app is the only surface for editing `accepted_currencies`. For a SaaS model where store operators onboard themselves, the store-app's Settings screen must also expose this.

### What to build

**File:** `apps/store-app/src/` (wherever the Settings/Preferences screen lives)

Add a **"Currencies" section** to the settings screen:

1. **Display** the current `accepted_currencies` and `preferred_currency` fetched from the local Dexie store row.
2. **Allow the user to add a currency** from the remaining `CurrencyCode` options not already in their list. When adding, prompt for the exchange rate vs USD.
3. **Allow the user to remove a currency** — only if it has no inventory items priced in it and no open bills using it. Show a clear error if items exist with that currency.
4. **Allow changing `preferred_currency`** to any currency already in `accepted_currencies`.
5. **Allow updating exchange rates** per currency inline.

All changes must:
- Write to the local Dexie `stores` row with `_synced = false`.
- Update `currencyService` in memory immediately.
- Sync to Supabase on the next sync cycle.

### Acceptance criteria
- A cashier/manager with settings access can add EUR to their store without admin intervention.
- Removing a currency that has active inventory items is blocked with a user-facing validation message.
- Rate updates are reflected immediately in the POS without requiring a restart.

---

## Non-Goals / Out of Scope

- Real-time exchange rate fetching from an external API — tag with `// TODO(010-live-rates)`. The rates are always manually entered by the store operator or admin.
- Currency conversion history / audit trail beyond what is already captured in `journal_entries`.

---

## Suggested Implementation Order

```
Task 1  → Task 2   (shared types, no app changes)
Task 3              (DB migration: country + accepted_currencies)
Task 4  → Task 5   (type propagation; builds on Task 1)
Task 6              (Dexie v55 schema; builds on Tasks 4-5)
Task 7              (CurrencyService refactor; builds on Tasks 1, 5-6)
Task 8  → Task 9   (admin-app form + service; builds on Tasks 2, 4)
Task 10             (store context; builds on Tasks 5-7)
Task 11             (inventory; builds on Tasks 5-7, 10)
Task 12             (POS sell flow; builds on Tasks 5-7, 10-11)
Task 13             (sync upload guard; builds on Task 1)
Task 14             (parity tests; builds on all above)
Task 15             (misc cleanup; can run in parallel after Task 9)
Task 17a-17d        (multi-rate map; builds on Tasks 3-7)
Task 17e            (admin rate UI; builds on Task 8)
Task 16a-16d        (generalize accounting columns; builds on Tasks 16 types + Task 7)
Task 16e            (drop old columns; after 16c-16d verified in staging)
Task 16f            (Dexie v56 for accounting; alongside 16a-16d)
Task 18             (store-app settings currencies UI; builds on Tasks 10, 17)
```
