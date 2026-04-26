# Data Model: Phase 8 + 9 of 008 Multi-Currency Rollout

**Feature**: 017-currency-sync-guards-parity
**Date**: 2026-04-26

This feature introduces **no schema changes** — no new Supabase tables, no new Dexie versions, no new columns. It consumes types and constants already merged in specs 013 (`CurrencyCode`, `CURRENCY_META`) and 014 (`country`, `accepted_currencies`, tightened `currency` columns).

What follows is the *in-process* data shape introduced by this feature: error records, helper inputs/outputs, and the migration-session currency cache. None of this is persisted across app restarts.

---

## Entities

### `UploadCurrencyValidationResult`

Pure-function return shape for `validateRecordCurrency(tableName, record)`.

```ts
type UploadCurrencyValidationResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-currency' | 'unknown-currency'; attemptedValue: unknown };
```

**Fields**:
- `ok: true` — record's `currency` is a valid `CurrencyCode` (member of `CURRENCY_META`).
- `ok: false` — record fails validation.
  - `reason: 'invalid-currency'` → `currency` is `null`/`undefined`/missing on the record.
  - `reason: 'unknown-currency'` → `currency` is present but not a key of `CURRENCY_META`.
  - `attemptedValue` → the offending raw value (kept as `unknown` so the caller and log line can render it without coercing).

**Validation rules**:
- The function MUST return `{ ok: true }` for soft-delete payloads regardless of currency, where soft-delete is detected by whichever of these the record carries: `is_deleted === true`, `_deleted === 1`, `_deleted === true`. (The exact field follows the existing `syncUpload.ts` cleaning convention.)
- The function MUST be a pure synchronous function — no I/O, no Dexie reads, no Supabase reads. It uses only the imported `CURRENCY_META` registry.

**State transitions**: N/A — this is a per-call return value, not a persisted entity.

---

### `UploadCurrencyError`

In-memory record stored in the per-cycle error list when a record fails the pre-upload currency guard.

```ts
interface UploadCurrencyError {
  table: 'inventory_items' | 'transactions';
  recordId: string;
  reason: 'invalid-currency' | 'unknown-currency';
  attemptedValue: unknown;   // raw offending currency value, or null when missing
  detectedAt: string;        // ISO timestamp via getLocalDateString-friendly path (use new Date().toISOString())
}
```

**Lifetime**: in-memory, scoped to one `uploadOnly()` invocation. Cleared when the upload pass starts. Surfaced to logs via `comprehensiveLoggingService.warn` and exposed (un-exported in production) for tests via a module-internal getter.

**Validation rules**:
- `recordId` MUST be the Dexie row's `id` (string UUID).
- `table` is the Dexie/Supabase table name and is restricted to the two tables the spec covers (`inventory_items` and `transactions`).
- The list MUST be append-only within a cycle and never mutated after entry insert.

**Relationships**: Each `UploadCurrencyError` corresponds 1:1 with a Dexie row left untouched at `_synced=false`. Fixing the row's `currency` and re-running `uploadOnly()` clears the prior error from the next cycle's list (the row passes validation and uploads).

**State transitions**: N/A — entries are not modified after insert; they expire when the next upload cycle starts.

---

### `MigrationSession.preferredCurrency` (cache field)

A new in-memory field on the existing `MigrationSession` object in `apps/admin-app/src/services/balanceMigrationService.ts`.

```ts
interface MigrationSession {
  id: string;
  storeId: string;
  branchId: string;
  // ... existing fields ...

  /** Cached store.preferred_currency, lazily populated on first row migration. */
  preferredCurrency?: CurrencyCode;
}
```

**Validation rules**:
- Populated by `resolveMigrationCurrency(session, override)` on first call when no override is passed.
- Populated by reading the store row from Supabase (`storeService.getStoreById(session.storeId)`) and reading `preferred_currency`.
- If the fetched store row has no `preferred_currency`, the helper throws — the field is *not* set to a fallback and *not* set to `undefined-as-cached`. A subsequent retry will re-attempt the fetch.

**Lifetime**: in-memory only, scoped to the one migration session. Not persisted to the in-browser session-store list (the existing `getStoredSessions()`/`saveSessions()` machinery does not write this field, and we will not add it to the persisted shape).

**State transitions**:

```
[unpopulated] --resolveMigrationCurrency() with no override-->
              fetch store --(row has preferred_currency)--> [populated: CurrencyCode]
              fetch store --(no preferred_currency)--> THROW (field stays unpopulated)
              [override supplied]--> field unchanged
```

---

### Parity fixture: `Store` row shape

Existing parity fixtures (`paritySync.scenarios.test.ts`, `paritySync.chaos.test.ts`) already construct `db.stores.put({ id, name, preferred_currency, ... })` rows. This feature widens that shape:

```ts
interface ParityStoreFixture {
  id: string;
  store_id: string;
  name: string;
  // existing fields...
  preferred_currency: CurrencyCode;
  preferred_language: 'en' | 'ar' | 'fr';
  preferred_commission_rate: number;
  exchange_rate: number;

  // ADDED in this feature:
  country: string;                       // ISO 3166-1 alpha-2 (e.g. 'LB', 'AE', 'US')
  accepted_currencies: CurrencyCode[];   // non-empty; preferred_currency MUST be a member

  // sync-control flags continue as before:
  _synced: boolean;
  // ...
}
```

**Validation rules** (enforced by the parity normalizer or by inspection in the fixture-builder helpers):
- `country` MUST be present on every fixture store row. Existing Lebanese fixtures default to `country='LB'`.
- `accepted_currencies` MUST be a non-empty array.
- `preferred_currency` MUST be a member of `accepted_currencies`.
- For the new UAE scenario fixture: `country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`.

**Relationships**: The UAE store fixture is referenced by at least one `inventory_items` row whose `currency='AED'` and one `transactions` row whose `currency='AED'`, so the round-trip exercises a non-LBP/non-USD currency end-to-end through the parity harness.

---

## Error taxonomy

This feature introduces no new error *classes* — it reuses the project's existing log/throw conventions:

- **Pre-upload validation failures** → recorded as `UploadCurrencyError` entries in the per-cycle list and emitted as structured `comprehensiveLoggingService.warn(...)` lines. **Not** thrown; control returns to the upload loop with the record skipped.
- **Migration session has no resolvable currency** → `throw new Error('balanceMigrationService: no currency available — store ${storeId} has no preferred_currency and no override was supplied')`. This is the existing throw shape for that file and matches the surrounding pattern.

Both surfaces are testable through the existing observability and assertion patterns; no new exception types are needed.

---

## Out of scope

- Persisting `UploadCurrencyError` across app restarts (would require Dexie schema bump — explicitly N/A for this feature).
- Surfacing `UploadCurrencyError` entries in any user-facing UI (deferred — when Phase 12 lands the store-app currency settings screen, the same data could be displayed there; for now logs are the only surface).
- Caching the migration store row beyond `preferred_currency` (no other fields are needed by this feature; the broader migration session redesign is out of scope).
