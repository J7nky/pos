# Research: Phase 8 + 9 of 008 Multi-Currency Rollout

**Feature**: 017-currency-sync-guards-parity
**Date**: 2026-04-26

## Pre-flight

**T001 (2026-04-26):** `CurrencyCode` and `CURRENCY_META` are exported from `packages/shared/src/types/index.ts` (`export type { CurrencyCode … }` + `export { CURRENCY_META }`).

**T004 (2026-04-26):** `pnpm parity:gate` on branch `017-currency-sync-guards-parity` — exit 0 after fixture + UAE golden regeneration and US1 guard implementation (Vitest parity suite + registry + dexie-mode + coverage-matrix scripts).

Verified prerequisites for this feature on 2026-04-26: `CurrencyCode`, `CURRENCY_META`, `getDefaultCurrenciesForCountry` are exported from `packages/shared/src/types/index.ts` (specs 013/014 merged); `inventory_items.currency` and `bills.currency` are typed as `CurrencyCode` in `apps/store-app/src/types/database.ts`; `currencyService` exposes the multi-currency API (spec 015 merged).

## Open Questions Resolved

The spec deliberately left no `[NEEDS CLARIFICATION]` markers, but four design choices required research before implementation could be unambiguous. Each is resolved below with the chosen decision, the rationale, and the alternatives that were considered and rejected.

---

### R1. How should currency-invalid records be classified relative to the existing `isUnrecoverableError` path?

**Decision**: Add a *new* pre-upload validation step that runs **before** the existing `cleanedBatch.upsert` call, separate from `isUnrecoverableError`. Currency-invalid records are partitioned out of the upload batch and recorded in an in-memory error list scoped to the current upload cycle. They are **not** routed through `deleteProblematicRecord`. The local Dexie row is preserved as-is with `_synced=false`, so a subsequent edit that fixes the currency will trigger upload on the next cycle.

**Rationale**:
- The existing `isUnrecoverableError` runs *after* a Supabase round-trip — it classifies *server* error codes (PG `23503`, `23502`, etc.). For currency-invalid rows we want to short-circuit before hitting Supabase: the validation is purely local and the round-trip would just waste latency and produce a confusing PG `23502`/`22P02` error.
- The `deleteProblematicRecord` path is destructive (deletes the local row + invokes the existing undo helper to revert the action). For a row with a fixable mistake (`currency: undefined`), deletion would lose the user's data — the user might need only to assign a currency. Preservation + manual surface-up is the correct UX.
- Recording the rejection in an in-memory error list (per-cycle) avoids needing a new Dexie field or schema bump (CG-09 N/A) and matches the lifecycle the spec demands: "fixing the local row clears it; not persisted across app restarts."
- The "no retry storm" requirement is naturally satisfied because the same row is partitioned out on each cycle until it is fixed — it never enters the network-level retry counters.

**Alternatives considered**:
- *(A) Reuse `isUnrecoverableError` and let it run post-Supabase.* Rejected because (i) it forces a wasted upload attempt, and (ii) it would route the row into `deleteProblematicRecord`, destroying user data.
- *(B) Add a `_validation_error` column to Dexie persisting the failure across restarts.* Rejected because it requires a Dexie version bump for purely transient state and crosses CG-09 unnecessarily; the in-memory error list re-derives on next upload.
- *(C) Call `comprehensiveLoggingService.error` and otherwise stay silent.* Rejected because it gives no programmatic surface for tests (FR-004) or for any future "show unsynced reason" UI; the structured error list is cheap and future-proof.

**Implementation notes**:
- The pre-upload validator lives next to `isUnrecoverableError` in `syncUpload.ts` and is a pure function: `validateRecordCurrency(tableName, record, opts) → { ok: true } | { ok: false, reason, attemptedValue }`.
- It runs only for `inventory_items` and `transactions` (the two tables called out by Task 13). All other tables flow through unchanged.
- It exempts soft-deletes (`is_deleted === true` or `_deleted === 1` — whichever the table uses) per FR-006: a row being removed does not need a valid currency.
- The error list is exposed (not exported) from the module via a small accessor used only in tests; callers in production paths consume it through `comprehensiveLoggingService.warn` log entries that mirror the same fields.

---

### R2. Where does the admin-app `balanceMigrationService` get the store's `preferred_currency` from when no override is supplied?

**Decision**: The migration session already carries `storeId`. When no `currency` is supplied in `options`, fetch the store row from Supabase via the existing `storeService` (admin-app has no Dexie). Cache the resolved `preferred_currency` on the in-memory `MigrationSession` object for the duration of the call so per-row migrations don't refetch. Throw a descriptive error if the fetched row's `preferred_currency` is also missing.

**Rationale**:
- Admin-app deliberately has no offline layer (constitution §1, §7). Reading from Supabase is the correct shape for any data the admin needs.
- The session is constructed once per migration; caching `preferred_currency` on it is a one-line addition with zero retention concerns (the session is in-memory only).
- Throwing instead of falling back to a literal preserves the spec's "no fallback literals" invariant (FR-010) and surfaces the underlying data-quality problem (a store row without a currency) to the admin instead of silently corrupting the import.

**Alternatives considered**:
- *(A) Require every caller to pass `currency` explicitly.* Rejected because it shifts the bug rather than fixing it — a forgetful caller would be the next source of incorrect entries, and the type system can't force the call site to pass it without a breaking signature change to every caller in admin-app.
- *(B) Default to `'USD'` instead of `'LBP'`.* Rejected for exactly the reason the spec calls out: it is the same shape of bug, just shifted from one literal to another.
- *(C) Embed the store row in the session at session-creation time.* Rejected as out of scope; the existing session creation flow doesn't need restructuring for this feature, and the lazy-fetch-and-cache pattern is one extra line.

**Implementation notes**:
- A small helper `resolveMigrationCurrency(session, override): Promise<CurrencyCode>` encapsulates: `if override → return override; else if session.preferredCurrency → return it; else fetch and cache; else throw`.
- The fetched row's `preferred_currency` field already comes back as `CurrencyCode` (Supabase types updated in spec 014).
- All four public methods that currently take `currency: 'USD' | 'LBP'` (`executeMigration`, `migrateOpeningBalance`, `executeBulkMigration`, plus any internal helpers) retype to `CurrencyCode`. The `'USD' | 'LBP'` literal union is removed entirely from this file.

**T003 — US3 store fetch import:** `getStore` from `apps/admin-app/src/services/storeService.ts` (returns `StoreWithStats | null`, includes `preferred_currency`).

---

### R3. How should the parity golden snapshot be regenerated, and is there a risk that fixture-only changes mask a real sync regression?

**Decision**: Regenerate the golden by running `pnpm parity:gate -- --update-snapshots` (or the project's equivalent flag — confirmed at implementation time by reading the `parity-check-*.mjs` scripts) on a clean branch *after* the fixture changes are made and *before* any production code in this feature is changed. Commit the regenerated golden as its own commit. Then layer the syncUpload guard work on top. This isolates the snapshot diff to "fixture additions" only and makes any subsequent diff in `pnpm parity:gate` attributable to actual sync-payload changes.

**Rationale**:
- The parity gate's value is its golden snapshot. If the same PR mixes fixture-shape changes with production-code changes, any unexpected diff has two suspects and reviewers cannot easily isolate.
- Splitting into two commits — first "Phase 9 fixtures + golden", then "Phase 8 sync guard" — keeps each diff small and auditable. If a CI run detects a sync-payload divergence after Phase 8, it is a real regression (not a fixture artefact) and must be investigated.
- The UAE scenario itself adds *new* rows to the snapshot but should not change *existing* rows. If existing rows shift after fixture changes, that itself is a signal worth investigating before continuing.

**Alternatives considered**:
- *(A) Regenerate the golden once at the end, after all changes.* Rejected for the reason above — mixed diffs hide regressions.
- *(B) Skip the golden regeneration and pin existing snapshots.* Rejected because the new UAE scenario adds new fixture data that the harness expects to roundtrip; the snapshot must include it.
- *(C) Add a separate parity scenario file rather than extending the existing `paritySync.scenarios.test.ts`.* Considered but deferred — the existing file already contains scenarios in the same shape, and splitting prematurely is the kind of abstraction-for-its-own-sake the project avoids. Revisit if this file grows past ~500 lines.

**Implementation notes**:
- Phase order during implementation: (1) extend existing fixtures with `country` + `accepted_currencies` (US store-fixture default `country='LB'`, `accepted_currencies=['LBP','USD']` to match the historic implicit assumption, OR `country='US'`, `accepted_currencies=['USD']` if `preferred_currency='USD'` — pick the value that matches the rest of each fixture's shape); (2) add the new UAE scenario; (3) regenerate the golden; (4) commit. (5) Implement Phase 8 guard. (6) Run `pnpm parity:gate` again — must still pass without snapshot churn.
- If the parity harness's `parityFieldRegistry.ts` enumerates allowed fields for `stores`, add `country` and `accepted_currencies` there before regenerating, otherwise the new fields may be stripped by the normalizer.

### Phase 2 inspection (T005–T006)

- **T005:** `parityFieldRegistry.ts` only defines `PARITY_VOLATILE_ROW_KEYS` (timestamps / sync markers). `country` and `accepted_currencies` are **not** volatile; `PARITY_STORES_PARITY_FIELDS` documents them for reviewers. The normalizer does not strip arbitrary store keys.
- **T006:** `parityNormalizer.ts` only rewrites keys in `PARITY_VOLATILE_ROW_KEYS` plus ISO date normalization — it does **not** remove `country` or `accepted_currencies`. `paritySupabaseMock` upserts full row objects via spread; no stripping.
- **T018 — Golden update command:** `UPDATE_PARITY_GOLDENS=1 pnpm run test:parity` from `apps/store-app` (same env var as existing parity scenarios; not `pnpm parity:gate -- -u`).

---

### R4. Where exactly does the `record.currency || 'USD'` event-emission fallback at `syncUpload.ts:783` fit into Phase 8?

**Decision**: The fallback is removed by the same guard. After the pre-upload currency guard partitions invalid records out of the batch, the surviving records *all* have a valid `currency` (otherwise they would have been rejected). The event-emission block at line 783 then reads `record.currency` directly with no fallback. If a future code path skips the guard, the event-emission would propagate an `undefined` currency into the event log, which is itself a structured anomaly worth surfacing rather than masking with `'USD'`.

**Rationale**:
- The fallback exists today because pre-guard, `record.currency` was sometimes undefined and the emission block had no way to know whether to `?? 'USD'` or fail. Once the guard upstream eliminates undefined-currency records, the fallback is dead code that masks the very class of bug Phase 8 is removing (FR-017).
- Leaving the fallback would technically not regress anything (the guard runs first), but it would make the file look like it still supports the bad pattern, and the next reviewer might extend that pattern elsewhere.

**Alternatives considered**:
- *(A) Leave the fallback in place as defence-in-depth.* Rejected because the spec's FR-017 explicitly forbids it in the upload code path, and the guard already provides defence-in-depth.
- *(B) Replace with `?? 'USD'` instead of removing.* Rejected for the same reason as (A) and as the spec generally — same bug-shape, just shifted.

**Implementation notes**:
- After removing the fallback, `record.currency` should be typed as `CurrencyCode` (not `CurrencyCode | undefined`) at the emission site. This may require a narrow type assertion if the surrounding TypeScript can't prove the narrowing through the partition-and-iterate pattern; if so, prefer a runtime assert that throws (which will never fire in practice but gives the type-checker the narrowing) over a silent `as`.

---

## Summary of Decisions

| # | Decision | Files affected |
|---|---|---|
| R1 | New pre-upload currency validator separate from `isUnrecoverableError`; preserves local Dexie row; in-memory error list per cycle | `apps/store-app/src/services/syncUpload.ts` |
| R2 | Lazy-fetch + cache `preferred_currency` on `MigrationSession`; throw if no source available | `apps/admin-app/src/services/balanceMigrationService.ts` |
| R3 | Regenerate parity golden in a separate commit, fixtures-first; UAE scenario in same file | `apps/store-app/tests/sync-parity/*.test.ts` + golden snapshot |
| R4 | Remove the `record.currency || 'USD'` event-emission fallback; let the guard upstream eliminate the only case it covered | `apps/store-app/src/services/syncUpload.ts` (emission block ~line 783) |

## Audit log

(populated as Phase 8/9 implementation runs)

- _2026-04-26 — research.md authored. No contradictions with the implementation plan; no new clarifications surfaced._
- **T031 / T032 (2026-04-26):** `rg` on `syncUpload.ts` and `balanceMigrationService.ts` — no `|| 'USD'`, `|| 'LBP'`, `?? 'USD'`, `?? 'LBP'` in those paths; no `'USD' | 'LBP'` union remains in `balanceMigrationService.ts`.
