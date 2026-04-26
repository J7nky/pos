# Quickstart: Verifying Phase 8 + 9 Behaviour

**Feature**: 017-currency-sync-guards-parity
**Date**: 2026-04-26

This document is the manual verification script for the implementer and reviewer. Each scenario is paired with the `[FR-###]` it covers. Execute each one against a local dev build before merging. Tick the table at the bottom as you go.

---

## Prerequisites

- Branch `017-currency-sync-guards-parity` checked out, all changes applied.
- `pnpm install` has run cleanly.
- Local Supabase instance running (or a stubbed Supabase mock if running against the parity harness only).
- A test super-admin account in the admin-app (for Scenarios D and E).

---

## Scenario A — Pre-upload guard rejects an `inventory_items` row with missing currency

**Covers**: FR-001, FR-004, FR-005, FR-006, US1 acceptance scenarios 1, 3.

1. Open the store-app dev console.
2. Insert a corrupted row directly into Dexie (bypassing the data layer that would otherwise enforce the type):

   ```js
   const db = window.__db__ || await import('/src/lib/db.ts').then(m => m.getDB());
   await db.inventory_items.put({
     id: 'corrupt-1',
     store_id: '<store-id>',
     branch_id: '<branch-id>',
     product_id: '<product-id>',
     selling_price: 10,
     // currency: undefined  ← deliberately omitted
     _synced: false,
     _deleted: 0,
     created_at: new Date().toISOString(),
     updated_at: new Date().toISOString(),
   });
   ```
3. Insert a valid sibling row (`id: 'good-1'`, `currency: 'USD'`, `_synced: false`).
4. Trigger a sync (`window.__forceUpload?.()` or click the sync button).
5. Open the network tab. Confirm exactly one Supabase upsert request for `inventory_items` was sent, containing only `good-1`. The corrupt row was filtered out.
6. Inspect Dexie: `corrupt-1` is still present with `_synced: false`. `good-1` now has `_synced: true`.
7. Inspect the console: a `comprehensiveLoggingService.warn` line names `corrupt-1`, `table='inventory_items'`, `reason='invalid-currency'`, `attemptedValue=undefined` (or the test-only error list accessor returns one entry with this shape).

**Expected**: corrupt row is preserved locally, never uploaded; sibling uploads cleanly.

---

## Scenario B — Pre-upload guard rejects a `transactions` row with unknown currency

**Covers**: FR-002, FR-003, FR-004.

1. Insert directly into Dexie:

   ```js
   await db.transactions.put({
     id: 'tx-bogus-1',
     store_id: '<store-id>',
     branch_id: '<branch-id>',
     amount: 100,
     currency: 'XYZ',  // not in CURRENCY_META
     payment_method: 'cash',
     category: 'sale',
     _synced: false,
     created_at: new Date().toISOString(),
   });
   ```
2. Trigger sync.
3. Confirm no Supabase upsert request for `tx-bogus-1`.
4. Confirm one warn log line with `reason='unknown-currency'`, `attemptedValue='XYZ'`.
5. The Dexie row remains `_synced: false`.

**Expected**: rejection reason is `unknown-currency`, the offending value is named in the log.

---

## Scenario C — Stability across repeated sync cycles + recovery on fix

**Covers**: FR-005, FR-006 (no retry storm), US1 acceptance scenarios 4 + 5.

1. With the corrupt row from Scenario A still in Dexie, trigger sync three more times (separated by a few seconds).
2. Inspect the network tab: zero Supabase upserts for `corrupt-1` across all three additional cycles.
3. Inspect the warn log: each cycle emitted exactly one warn line for `corrupt-1`. No exponential-backoff spam, no duplicate emissions within a single cycle.
4. Now correct the row in Dexie:

   ```js
   await db.inventory_items.update('corrupt-1', { currency: 'USD' });
   ```
5. Trigger sync once more.
6. Confirm `corrupt-1` is now uploaded successfully (one upsert request) and Dexie shows `_synced: true` for it.

**Expected**: stable rejection across cycles; clean recovery as soon as the local row is fixed.

---

## Scenario D — Admin opening-balance migration uses store's `preferred_currency`

**Covers**: FR-008, FR-011, US3 acceptance scenarios 1, 3.

1. In Supabase, ensure a UAE store exists with `country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`.
2. Log into the admin-app as super-admin.
3. Start an opening-balance migration session targeting that UAE store.
4. Upload a CSV with two entity rows. Do **not** specify a currency override in the form (the form may not even surface this control — that's fine).
5. Run the migration.
6. Inspect the resulting `journal_entries` rows in Supabase: every row's `currency` (or its replacement under Phase 11 if shipped later) is `'AED'`. None say `'LBP'`.
7. Inspect the migration log: no warnings or errors about currency.

**Expected**: the migration auto-defaults to AED for the UAE store.

---

## Scenario E — Admin migration throws when no currency source is available

**Covers**: FR-010, US3 acceptance scenario 4.

1. In Supabase, manually corrupt a test store's row so `preferred_currency IS NULL`.
2. Log into admin-app, start a migration session for that store.
3. Trigger the migration with no override.
4. Confirm the migration aborts before any RPC call. The admin sees a descriptive error mentioning the missing `preferred_currency` and the affected store ID.
5. Confirm no `journal_entries` rows were inserted for that session.

**Expected**: loud failure, no partial migration, no fallback to any currency literal.

---

## Scenario F — Subscription billing literal carries the intentional-USD comment

**Covers**: FR-012, US4 acceptance scenarios 1, 2.

1. Open `apps/admin-app/src/services/subscriptionService.ts`.
2. Locate the `currency: 'USD',` line (search for the literal).
3. Confirm the 1–3 lines immediately above it contain a comment naming "subscription"/"subscriptions", "always USD" or "global"/"intentional", and a reference to spec 008 Task 15 or feature 017.
4. Run `pnpm test --filter admin-app` (or the project's admin-app test command) — confirm all subscription-related tests pass unchanged.

**Expected**: the comment is present; behaviour unchanged.

---

## Scenario G — Parity gate green with UAE scenario

**Covers**: FR-013, FR-014, FR-015, FR-016, US2 all acceptance scenarios.

1. From `apps/store-app/`, run `pnpm parity:gate`.
2. Confirm exit code 0.
3. Inspect the parity scenarios test output: a "UAE store with AED" scenario is present and passing.
4. Open `tests/sync-parity/paritySync.scenarios.test.ts` and verify:
   - Every `db.stores.put({...})` call sets `country` and `accepted_currencies`.
   - The UAE scenario writes at least one inventory item and one transaction in AED.
5. Open the parity golden snapshot file and confirm:
   - `country` and `accepted_currencies` are present on every store entry.
   - The UAE store entry has `currency: 'AED'` on its inventory and transaction rows.
6. (Sanity regression check) Temporarily inject a fault: edit `syncUpload.ts` to coerce `record.currency = 'USD'` for any `inventory_items` row. Re-run `pnpm parity:gate`. The gate MUST fail with a snapshot mismatch on the UAE scenario.
7. Revert the injected fault.

**Expected**: gate green normally; gate fails loudly when AED is silently coerced.

---

## Scenario H — Repository-grep audit (FR-017, FR-018, SC-006)

1. From repo root, run:

   ```bash
   grep -nE "\\|\\| 'USD'|\\|\\| 'LBP'|\\?\\? 'USD'|\\?\\? 'LBP'" apps/store-app/src/services/syncUpload.ts apps/admin-app/src/services/balanceMigrationService.ts
   ```
2. Expected output: empty.
3. Run:

   ```bash
   grep -nE "'USD' \\| 'LBP'" apps/admin-app/src/services/balanceMigrationService.ts
   ```
4. Expected output: empty.

**Expected**: zero literal-fallback hits in the two production files this feature targets.

---

## Verification table

Tick each cell as you complete the scenario. Do not merge until every cell is `✅`.

| Scenario | Covered by | Status |
|---|---|---|
| A — invalid-currency rejection | FR-001, FR-004, FR-005, FR-006 | ☐ |
| B — unknown-currency rejection | FR-002, FR-003, FR-004 | ☐ |
| C — stable across cycles + recovery | FR-005, FR-006 | ☐ |
| D — admin migration uses store currency | FR-008, FR-011 | ☐ |
| E — admin migration throws on missing source | FR-010 | ☐ |
| F — subscription comment present | FR-012 | ✅ (verified in source) |
| G — parity gate green incl. UAE | FR-013, FR-014, FR-015, FR-016 | ✅ (`pnpm parity:gate` exit 0) |
| H — grep audit clean | FR-017, FR-018 | ✅ (no `||/??` USD/LBP fallbacks in target files) |

If any cell fails, file a sub-task and do not advance to merge. The contract files in `contracts/` are the source of truth for what "passing" means in each case.
