# Contract: Sync Fallback Removals

**Feature**: 016-inventory-pos-currency
**Modules**:
- `apps/store-app/src/services/syncDownload.ts`
- `apps/store-app/src/services/syncService.ts`

**Spec refs**: FR-016, FR-017, FR-018

## Scope

Removes the last two silent currency fallbacks in the sync path and replaces them with deterministic, observable behaviour. Both files are on the sync-critical list (CG-12) — this feature's CI run MUST include `pnpm parity:gate`.

---

## 1. `syncDownload.ts` (store-row-absent path)

### Before (lines 72 and 101 — removed)

```ts
const storePreferredCurrency = store?.preferred_currency || 'LBP';
```

### After (introduced)

```ts
if (!store) {
  comprehensiveLoggingService.warn({
    operation: 'syncDownload.<fn-name>',
    storeId: expectedStoreId,
    reason: 'store-row-absent',
    action: 'skip',
  });
  return SKIP_RESULT;   // skip the currency-dependent operation for this cycle
}
const storePreferredCurrency = store.preferred_currency;   // now guaranteed non-null
```

### Post-conditions

- No row is written whose currency was invented by the deleted fallback.
- A structured warning is emitted to `comprehensiveLoggingService` at `WARN` level with the payload above.
- The downloader continues with subsequent operations; only the currency-dependent branch is skipped.

### Error mode

None. The absent-store case is a boundary condition, not an error. It self-heals on the next sync cycle once the store row lands.

---

## 2. `syncService.ts::ensureStoreExists` (seed-store path)

### Before (line 621 — removed hardcoded default)

```ts
preferred_currency: 'USD',   // default to USD — removed
```

### After (introduced)

```ts
if (!supabaseRow) {
  throw new Error(`ensureStoreExists: cannot seed store ${storeId} — no remote row and no local row to merge`);
}

const country           = supabaseRow.country           ?? deriveCountryFromLocal(storeId) ?? '';
const acceptedCurrencies =
  supabaseRow.accepted_currencies
    ?? (country ? getDefaultCurrenciesForCountry(country) : undefined)
    ?? throwLoudly('ensureStoreExists: cannot determine accepted_currencies');
const preferredCurrency =
  supabaseRow.preferred_currency
    ?? acceptedCurrencies[0];     // first accepted is preferred — matches the COUNTRY_CONFIGS convention

// NB: no `'USD'` or `'LBP'` literal appears anywhere in this path.
```

### Post-conditions

- The seeded local row has `country`, `preferred_currency`, and `accepted_currencies` matching the Supabase source exactly when all are present.
- When `supabaseRow.accepted_currencies` is absent but `country` is present, `getDefaultCurrenciesForCountry(country)` from `@pos-platform/shared` supplies the list.
- When neither the Supabase row's `accepted_currencies` nor `country` are usable, `ensureStoreExists` throws loudly via `comprehensiveLoggingService.error` + a thrown error, surfaced by the sync orchestrator.

### Fallback order (explicit)

1. `supabaseRow.accepted_currencies` if non-empty → use directly.
2. `getDefaultCurrenciesForCountry(supabaseRow.country)` if `country` is known → use derived list.
3. Otherwise → throw. No hardcoded currency literal.

### Error mode

- Thrown error propagates to the sync orchestrator, which displays a user-facing "Cannot hydrate store — contact admin" message and halts the hydration cycle.

---

## Invariant: zero literal-currency fallbacks in the sync/selling path

### Check

After the feature lands, a repository grep MUST return zero hits for the following patterns inside the three files under this feature's control:

- `|| 'USD'`
- `|| 'LBP'`
- `?? 'USD'`  (a quieter form of the same defect)
- `?? 'LBP'`

Files audited by this grep:

- `apps/store-app/src/contexts/offlineData/useTransactionDataLayer.ts`
- `apps/store-app/src/services/syncDownload.ts`
- `apps/store-app/src/services/syncService.ts`

The check is part of the test plan (Phase 2 / `/speckit.tasks`).

### Exemption

Literal `'USD'` MAY still appear in:

- the admin-app's `subscriptionService.ts` (subscription billing is always USD — see Phase 8 / Task 15). This file is out of scope for this feature.
- test fixtures that explicitly set currency values.

---

## Logging payload schema

Used by the warning emitted from `syncDownload`:

```ts
interface SyncCurrencyWarningPayload {
  operation: string;            // e.g. 'syncDownload.ensureInventoryItem'
  storeId: string;              // the expected store id
  reason: 'store-row-absent';   // closed enum — extensible if new skip reasons arise
  action: 'skip';               // closed enum — always 'skip' for this class
}
```

`comprehensiveLoggingService.warn(payload)` is the sole emission sink. No `console.warn` fallback.
