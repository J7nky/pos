# Contract: Upload Currency Guard

**Module**: `apps/store-app/src/services/syncUpload.ts`
**Feature**: 017-currency-sync-guards-parity, Story US1

This contract specifies the behaviour of the new pre-upload currency validation step. It is the binding contract between the sync engine and the rest of the store-app: any caller who relies on `uploadOnly()` can assume these properties.

---

## §1. Validator shape

A pure function colocated with `isUnrecoverableError` in `syncUpload.ts`:

```ts
function validateRecordCurrency(
  tableName: string,
  record: Record<string, unknown>
): { ok: true } | {
  ok: false;
  reason: 'invalid-currency' | 'unknown-currency';
  attemptedValue: unknown;
};
```

**Inputs**:
- `tableName` — Dexie/Supabase table name. The function is a no-op (always `{ ok: true }`) for any `tableName` outside the set `{ 'inventory_items', 'transactions' }`.
- `record` — the cleaned record about to be uploaded. The function reads `record.currency`, `record.is_deleted`, `record._deleted`. It MUST NOT mutate the record.

**Outputs**:
- `{ ok: true }` if (a) `tableName` is not currency-guarded, OR (b) the record is a soft-delete payload, OR (c) `record.currency` is a key of `CURRENCY_META`.
- `{ ok: false, reason: 'invalid-currency', attemptedValue }` if `record.currency` is `null`, `undefined`, or absent and the record is not a soft-delete.
- `{ ok: false, reason: 'unknown-currency', attemptedValue }` if `record.currency` is present but not a key of `CURRENCY_META`. `attemptedValue` is the raw value.

**Purity**: synchronous; no I/O; no exceptions thrown for valid inputs. The only `throw` permissible inside this function is for caller misuse (e.g. `record === null`), and even that should be rare.

## §2. Wiring into the upload pass

For every batch processed by the upload pipeline (the `cleanedBatch` / `originalBatch` pair already prepared by existing logic):

1. Partition the batch into `validForUpload` and `currencyInvalid` by calling `validateRecordCurrency(tableName, record)` per record.
2. For each `currencyInvalid` entry:
   - Append an `UploadCurrencyError` to the per-cycle error list.
   - Emit one `comprehensiveLoggingService.warn(...)` line with `{ table, recordId, reason, attemptedValue }`.
   - Do **NOT** call `deleteProblematicRecord`.
   - Do **NOT** call `getDB().addPendingSync` (that would re-enqueue and create a retry loop).
   - Leave the local Dexie row untouched (`_synced` stays `false`).
3. Continue the existing upload pipeline with `validForUpload` only.
4. The downstream event-emission block at line ~783 reads `record.currency` directly without any `|| 'USD'` / `?? 'USD'` fallback.

**Soft-delete bypass**: a record where `record.is_deleted === true` OR `record._deleted === 1` OR `record._deleted === true` MUST be treated as `{ ok: true }` regardless of `currency` value, so that a row missing currency can still be removed.

## §3. Error list surface

The per-cycle `UploadCurrencyError[]` is a module-level mutable array reset at the top of `uploadOnly()`. It is not exported in production code. A test-only accessor (`getCurrencyErrorListForTesting()`, named such that any production import is a code-smell visible in code review) returns a defensive copy.

## §4. Return value behaviour

The existing `uploadOnly()` return shape is preserved. `currencyInvalid` records do **not** count as "failed uploads" in the unsynced-counter sense — they count as "deferred until fixed". The unsynced count after `uploadOnly()` reflects: `(prior unsynced) - (validForUpload that succeeded)`. Currency-invalid rows remain in the unsynced count because they are still `_synced=false` in Dexie.

## §5. Stability under repeated invocation

If `uploadOnly()` is invoked N consecutive times without the underlying record being fixed:
- The same record is partitioned into `currencyInvalid` each time.
- The Supabase client receives zero requests for that record across all N invocations.
- The error list contains exactly one entry per invocation (cleared and rebuilt each cycle).
- No `setTimeout`, no exponential backoff, no retry queue is involved (matches the spec's "no retry storm" requirement).

## §6. Forbidden patterns

In the upload code path inside `syncUpload.ts`, the following literal patterns MUST NOT appear (FR-017):

- `record.currency || 'USD'`
- `record.currency || 'LBP'`
- `record.currency ?? 'USD'`
- `record.currency ?? 'LBP'`
- `(record.currency as 'USD' | 'LBP')`

A repository grep across the file for these patterns MUST return zero hits in non-test, non-comment code after this feature lands.

## §7. Test surface

The contract is testable end-to-end via the existing parity harness (which exercises `uploadOnly()` against the Supabase mock) plus a colocated Vitest suite at `apps/store-app/src/services/__tests__/syncUpload.currency.test.ts` covering:

1. `validateRecordCurrency` per-cell behaviour (valid currency → ok; missing → `invalid-currency`; unknown literal → `unknown-currency`; non-guarded table → ok; soft-delete bypass).
2. End-to-end batch behaviour: a queue containing one valid + one missing-currency `inventory_items` row uploads exactly one Supabase write; the error list has exactly one entry; the Dexie rows are still `_synced=false` and `_synced=true` respectively.
3. Stability: invoking `uploadOnly()` three times against the same poisoned row triggers exactly zero Supabase writes for that row and stable per-cycle error entries.
4. Recovery: fixing the row's `currency` between cycles results in successful upload on the next cycle without manual intervention.
