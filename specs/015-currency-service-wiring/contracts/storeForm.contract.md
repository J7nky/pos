# Contract: Admin `StoreForm` + `storeService`

**Files**:
- `apps/admin-app/src/components/stores/StoreForm.tsx`
- `apps/admin-app/src/services/storeService.ts`
- `apps/admin-app/src/types/index.ts`

**Feature**: 015-currency-service-wiring
**Status**: post-refactor target contract

## Type widening

```ts
import type { CurrencyCode } from '@pos-platform/shared';

// index.ts — widen existing interfaces

export interface CreateStoreInput {
  name: string;
  country: string;                 // NEW — required; ISO-3166-1 alpha-2
  address?: string;
  phone?: string;
  email?: string;
  preferred_currency: CurrencyCode;        // widened from 'USD' | 'LBP' → CurrencyCode
  accepted_currencies: CurrencyCode[];     // NEW — required, non-empty
  preferred_language?: 'en' | 'ar' | 'fr';
  preferred_commission_rate?: number;
  exchange_rate?: number;          // required only when preferred_currency !== 'USD'
}

export interface UpdateStoreInput {
  name?: string;
  country?: string;                // NEW
  address?: string;
  phone?: string;
  email?: string;
  logo?: string | null;
  preferred_currency?: CurrencyCode;
  accepted_currencies?: CurrencyCode[];    // NEW
  preferred_language?: 'en' | 'ar' | 'fr';
  preferred_commission_rate?: number;
  exchange_rate?: number;
  low_stock_alert?: boolean;
  status?: 'active' | 'suspended' | 'archived';
}

// `Store` already extends StoreCore from @pos-platform/shared
// (which spec 014 widened to include country + accepted_currencies),
// so no additional fields need adding here.
```

## `StoreForm` component contract

### Props

Unchanged: `{ isOpen, onClose, onSubmit, store?, isLoading? }`.

### New UI sections

1. **Country selector** (Basic Information block, after Store Name).
   - Searchable dropdown, options sorted alphabetically by `name` from `COUNTRY_CONFIGS`.
   - Each option displays `"{name} ({code})"`.
2. **Accepted currencies** (Preferences block, between Preferred Currency and Commission Rate).
   - Multi-select checkbox list, options from `CURRENCY_META` (all 22 codes), sorted alphabetically by code.
   - USD checkbox is **disabled and pre-checked** (always required).
3. **Preferred currency** (existing Select, widened).
   - Options driven by `CURRENCY_META`, alphabetical.
   - When selection changes, no auto-population of other fields.
4. **Exchange rate** (existing Input).
   - Default value: `''` (no hardcoded `89500`).
   - Hidden when `preferred_currency === 'USD'`.
   - `helperText` dynamic: `` `Rate of 1 USD expressed in ${preferred_currency}` ``.

### Handlers

```ts
const handleCountryChange = (countryCode: string) => {
  const config = COUNTRY_MAP[countryCode];
  if (!config) { setFormData(prev => ({ ...prev, country: countryCode })); return; }
  setFormData(prev => {
    // Union merge: keep existing ticks, add new country's defaults, dedupe
    const merged: CurrencyCode[] = [...prev.accepted_currencies];
    for (const c of config.defaultCurrencies) if (!merged.includes(c)) merged.push(c);
    return {
      ...prev,
      country: countryCode,
      preferred_currency: config.localCurrency,
      accepted_currencies: merged,
      exchange_rate: '', // always cleared on country change
    };
  });
};

const handleAcceptedCurrenciesChange = (currency: CurrencyCode, checked: boolean) => {
  setFormData(prev => {
    if (currency === 'USD') return prev; // USD cannot be removed
    const next = checked
      ? (prev.accepted_currencies.includes(currency) ? prev.accepted_currencies : [...prev.accepted_currencies, currency])
      : prev.accepted_currencies.filter(c => c !== currency);
    return { ...prev, accepted_currencies: next };
  });
};
```

### Validation (per data-model.md)

See data-model.md `AdminStoreFormState → Validation` table. Summary:

- `name`, `country` non-empty
- `accepted_currencies` non-empty, contains USD, contains `preferred_currency`
- `exchange_rate > 0` iff `preferred_currency !== 'USD'`
- Edit path only: every removed currency has zero live usage (see below)

### Usage-count guard (edit path, FR-014a)

```ts
async function checkRemovedCurrencyUsage(
  storeId: string,
  removedCurrencies: CurrencyCode[]
): Promise<Record<CurrencyCode, { inventory: number; transactions: number; openBills: number }>> {
  const result: Record<string, { inventory: number; transactions: number; openBills: number }> = {};
  await Promise.all(removedCurrencies.map(async (c) => {
    const [inv, tx, bills] = await Promise.all([
      supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('currency', c),
      supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('currency', c),
      supabase.from('bills').select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('currency', c).is('settled_at', null),
    ]);
    result[c] = { inventory: inv.count ?? 0, transactions: tx.count ?? 0, openBills: bills.count ?? 0 };
  }));
  return result;
}
```

Integrated in `handleSubmit`:

```ts
if (isEditing && store) {
  const removed = store.accepted_currencies.filter(c => !formData.accepted_currencies.includes(c));
  if (removed.length > 0) {
    const usage = await checkRemovedCurrencyUsage(store.id, removed);
    const blockers = Object.entries(usage).filter(([, u]) => u.inventory + u.transactions + u.openBills > 0);
    if (blockers.length > 0) {
      setErrors({ accepted_currencies: formatBlockingMessage(blockers) });
      return;
    }
  }
}
await onSubmit(payload);
```

The exact `bills` predicate for "open" is adjusted to match the admin-app's existing business rule (likely a `status` enum or `settled_at IS NULL`) during implementation.

### Submit payload

```ts
{
  name: formData.name.trim(),
  country: formData.country,
  address: formData.address.trim() || undefined,
  phone: formData.phone.trim() || undefined,
  email: formData.email.trim() || undefined,
  preferred_currency: formData.preferred_currency,
  accepted_currencies: formData.accepted_currencies,
  preferred_language: formData.preferred_language,
  preferred_commission_rate: parseFloat(formData.preferred_commission_rate),
  exchange_rate: formData.preferred_currency === 'USD' ? undefined : parseFloat(formData.exchange_rate),
  subscription_plan: formData.subscription_plan, // create only
}
```

## `storeService` updates

```ts
// create
async function createStore(input: CreateStoreInput): Promise<Store> {
  const { data, error } = await supabase.from('stores').insert({
    name: input.name,
    country: input.country,
    address: input.address ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    preferred_currency: input.preferred_currency,
    accepted_currencies: input.accepted_currencies,
    preferred_language: input.preferred_language ?? 'en',
    preferred_commission_rate: input.preferred_commission_rate ?? 10,
    exchange_rate: input.exchange_rate ?? 1,
  }).select('*').single();
  if (error) throw error;
  return data as Store;
}

// update
async function updateStore(id: string, patch: UpdateStoreInput): Promise<Store> { /* mirror fields */ }

// selects
// Existing select queries already fetch '*' — they automatically include
// the new country + accepted_currencies columns. Verify no `select('name, ...')`
// projections accidentally drop them.
```

## Acceptance tests

Manual (admin app dev server) — see `quickstart.md` for exact steps:

- [ ] Create store for country "UAE" → saved row has `country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`, and typed exchange rate.
- [ ] Create store for country "United States" → rate input is hidden, saved row has `accepted_currencies=['USD']`, `exchange_rate=1`.
- [ ] Edit a Lebanese store, add `EUR` → saved row has `accepted_currencies=['LBP','USD','EUR']`.
- [ ] Edit the same Lebanese store, try to remove `LBP` while `inventory_items` with LBP exist → form blocks with usage breakdown.
- [ ] Validate every error message from the FR-014 / FR-014a rule table renders the listed copy.
