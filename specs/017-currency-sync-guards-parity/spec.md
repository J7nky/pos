# Feature Specification: Sync Upload Currency Guards, Admin Balance-Migration Cleanup, and Multi-Currency Parity Coverage

**Feature Branch**: `017-currency-sync-guards-parity`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "let's check the requirements for phase 8 + 9 of @specs/008-multi-currency-country/TASKS.md"

## Overview

Phases 1–7 of the 008 multi-currency rollout closed the read/write paths for inventory and the POS sell flow. What remains before the next high-risk phase (Phase 10/11 — multi-rate and accounting JSONB) are three small but load-bearing cleanups and the parity safety net.

This feature implements:

- **Phase 8a — Task 13**: a pre-upload guard in `syncUpload.ts` that refuses to push `inventory_items` and `transactions` records to Supabase when their `currency` is missing or not in the canonical registry. Today the upload path silently coerces or drops the field on its way out, so a single corrupted local row could pollute the cloud source of truth.
- **Phase 8b — Task 15 (balanceMigrationService)**: replace the hardcoded `currency: 'LBP'` default in the admin-app's opening-balance importer with the target store's `preferred_currency`, derived from the store row already loaded in the migration session. Today every non-Lebanon store importing legacy balances would post journal entries against the wrong currency.
- **Phase 8c — Task 15 (subscriptionService)**: keep `currency: 'USD'` for subscription billing (it is intentional and global) but add an inline comment so the next reviewer doesn't "fix" it the way Phase 8 fixed the lookalike bugs.
- **Phase 9 — Task 14**: extend parity-test fixtures so every fixture store carries `country` and `accepted_currencies`, and add at least one non-Lebanon (UAE / AED) parity scenario. Today the parity gate exclusively exercises Lebanese stores; nothing in the gate would catch a regression that only manifests for AED, EUR, etc.

This corresponds to **Phase 8** and **Phase 9** of `specs/008-multi-currency-country/TASKS.md`. Neither phase changes any user-facing UI; both are correctness gates for what is already shipped and a safety net for what comes next.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sync upload refuses to publish records with missing or unknown currency (Priority: P1)

A store-app instance has a corrupted local `inventory_items` row whose `currency` is `undefined` (e.g. it was inserted by an older build that predated the spec 014 type tightening). When the sync engine next runs `uploadOnly`, it encounters this row in the unsynced queue. Before this feature, the upload either silently coerced the value via `record.currency || 'USD'` in adjacent code paths or sent the row to Supabase with a missing field, polluting the cloud row. After this feature, the upload guard inspects the row, classifies it as unrecoverable (because the corruption is local — re-uploading will not fix it), and routes it to the per-table error list with a structured reason, leaving the queue unblocked for the rest of the batch.

**Why this priority**: This is the upstream gate for every other multi-currency invariant. Phases 6 and 7 trust that records on the wire carry a real `CurrencyCode`; without this guard, that trust is unenforced at the boundary. Any single bypass (RPC, import script, legacy build) can publish a poisoned row and reintroduce the very bug Phase 7 fixed.

**Independent Test**: Insert a `transactions` row directly into Dexie with `currency: undefined`, mark it `_synced=false`, trigger `syncService.uploadOnly()`. The Supabase mock receives zero rows for that record; the per-table error list contains exactly one entry; the next sync cycle does not re-attempt the same row.

**Acceptance Scenarios**:

1. **Given** an `inventory_items` row in the upload queue with `currency=undefined`, **When** the sync engine begins the upload pass, **Then** the row is rejected by the pre-upload guard, marked unrecoverable, recorded in the per-record error list with reason `invalid-currency`, and never reaches the Supabase client.
2. **Given** a `transactions` row in the upload queue with `currency='XYZ'` (not in `CURRENCY_META`), **When** the sync engine begins the upload pass, **Then** the row is rejected with reason `unknown-currency`, the error names the offending value, and the sync continues with the rest of the batch.
3. **Given** a queue with one valid and one invalid record of the same table, **When** the sync engine runs, **Then** the valid record uploads successfully and the invalid record lands in the error list — they do not block each other.
4. **Given** the same invalid record is encountered on a subsequent sync cycle, **When** the upload pass runs again, **Then** the record is skipped (still unrecoverable) and is **not** re-attempted in a tight retry loop — it stays in the error list until corrected at the source.
5. **Given** a previously-failing record is corrected locally (`currency` set to a valid `CurrencyCode`), **When** the sync engine runs, **Then** the record uploads on the next cycle without manual intervention.

---

### User Story 2 — QA gate covers non-Lebanon stores (Priority: P1)

A QA engineer (or CI) runs `pnpm parity:gate` to verify the sync layer's golden snapshot. Before this feature, every fixture store in `tests/sync-parity/` is implicitly Lebanese (`preferred_currency: 'USD'` or `'LBP'`, no `country` field, no `accepted_currencies` array) — so the gate has never exercised, for instance, an AED store with three accepted currencies. After this feature, every fixture carries `country` and `accepted_currencies`, and at least one scenario fixture is for a UAE store with `accepted_currencies = ['AED', 'USD']`. The golden snapshot reflects this multi-currency reality.

**Why this priority**: The 008 rollout is actively introducing multi-currency code paths that will reach production. The parity gate is the only fully automated check that catches sync regressions before merge. If the gate has no AED fixture, no AED regression can be caught by it — making the gate green meaningless for any non-Lebanon store. This story ships at P1 alongside US1 because Phase 7 already shipped without parity coverage for non-Lebanon stores; this is closing that backstop.

**Independent Test**: Run `pnpm parity:gate` from `apps/store-app/`. The gate passes. Inspect the new UAE fixture in `tests/sync-parity/paritySync.scenarios.test.ts`: it has `country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`, and writes at least one `inventory_items` and one `transactions` row in AED. The committed golden snapshot for that scenario contains AED literals, not LBP/USD only.

**Acceptance Scenarios**:

1. **Given** the parity test suite, **When** every fixture store row is inspected, **Then** each one carries `country` (ISO 3166-1 alpha-2) and `accepted_currencies` (non-empty `CurrencyCode[]`).
2. **Given** the parity scenarios file, **When** the suite is run, **Then** at least one scenario exercises a UAE store (`country='AE'`) with at least one inventory item and one transaction priced in AED.
3. **Given** all fixture updates are committed, **When** `pnpm parity:gate` runs, **Then** it exits 0 — either against the previous golden (if no real upload-payload shape changed) or against a freshly regenerated golden whose diff was reviewed and committed alongside the fixtures.
4. **Given** a hypothetical regression where a sync code path silently coerces AED to USD, **When** the parity gate runs, **Then** the gate fails because the AED scenario's snapshot no longer matches.

---

### User Story 3 — Admin opening-balance migration uses the target store's currency (Priority: P2)

A super-admin imports a legacy CSV of opening balances for a UAE store. The migration session is already aware of which store it is migrating into (the store row has been loaded). Before this feature, every imported row was hardcoded to `currency: 'LBP'` because the function defaulted that way; the resulting `journal_entries` for the UAE store were posted under LBP and required a manual cleanup pass. After this feature, the migration uses the store's `preferred_currency` (or an explicit override passed by the admin, if the UI later supports per-row override), so AED entries land as AED.

**Why this priority**: This is admin-app-only and gated behind super-admin access, so blast radius is limited. But it is a real correctness bug today — any admin onboarding a non-Lebanon store via the bulk opening-balance importer is silently corrupting their ledger. Ships at P2 because (a) the workaround is to fix the data manually post-import, and (b) the admin UI for selecting target currency is out of scope for this feature.

**Independent Test**: Call `balanceMigrationService.migrateOpeningBalances(session, rows)` for a session whose store has `preferred_currency='AED'`, with no explicit `currency` in `options`. Inspect the inserted `journal_entries` rows: every row's `currency` (or its replacement under Phase 11) is `'AED'`, not `'LBP'`.

**Acceptance Scenarios**:

1. **Given** a migration session for a store with `preferred_currency='AED'`, **When** `migrateOpeningBalances` is called without an explicit `currency` override, **Then** every inserted journal entry uses `'AED'`.
2. **Given** the same session, **When** the call site explicitly passes `currency: 'USD'` in `options`, **Then** that explicit value wins (the override path still works).
3. **Given** the type signature of every public method on `balanceMigrationService`, **When** read by the TypeScript compiler, **Then** the `currency` parameter is typed as `CurrencyCode` (imported from `@pos-platform/shared`), not the legacy `'USD' | 'LBP'` literal union.
4. **Given** a migration session whose store row has no `preferred_currency` populated (corrupt or partial row), **When** `migrateOpeningBalances` is called without an override, **Then** the call fails fast with a descriptive error (rather than silently defaulting to anything) — there is no fallback literal.

---

### User Story 4 — Subscription-billing literal is documented as intentional (Priority: P3)

A future code reviewer scans the admin-app for the lookalike `currency: 'USD'` pattern that Phase 8 is supposed to be eliminating. They land on `subscriptionService.ts` line 117 and are about to "fix" it. Before this feature, nothing in the file says this literal is different from the bugs Phase 8 removed. After this feature, an inline comment immediately above the literal states that subscription billing is always in USD globally, regardless of the operating store's local currency, and is intentional — pointing the reviewer to spec 008 §Task 15.

**Why this priority**: Pure documentation; no behavior change. P3 because it costs nothing and prevents one specific class of regression (a future PR "cleaning up" an intentional global choice). Bundled with US3 because they touch the same neighborhood.

**Independent Test**: Open `apps/admin-app/src/services/subscriptionService.ts`. The line containing `currency: 'USD'` is preceded by a comment naming "subscription billing", "always USD", and "intentional". Lint and tests pass unchanged.

**Acceptance Scenarios**:

1. **Given** `subscriptionService.ts`, **When** read at the line containing `currency: 'USD'`, **Then** an immediately-adjacent comment explains why this literal is global and intentional and references this feature or spec 008 Task 15.
2. **Given** the same file, **When** unit tests run, **Then** behavior is identical to before the comment was added (no functional change).

---

### Edge Cases

- **Pre-existing corrupt records in the local upload queue**: a store-app upgrading to this build may already have unsynced rows with missing/invalid currencies. They must surface as user-actionable sync errors (per-record entries in the error list with a recognizable reason), not silently retry forever and not block the rest of the queue.
- **Records corrected locally between sync cycles**: a record that previously failed the guard must be retried automatically once the local data is fixed — the unrecoverable classification is per-call, not a persistent flag on the row.
- **Parity golden snapshot diff after fixture additions**: adding `country` and `accepted_currencies` to fixtures and a new UAE scenario will change the golden snapshot. The diff must be reviewed and committed intentionally; it is not a regression.
- **Migration session whose store row lacks `preferred_currency`**: the admin migration must throw loudly rather than fall back to any literal — the original `'LBP'` default was the bug; replacing it with `'USD'` would just shift the bug.
- **Non-Lebanon parity fixture with `accepted_currencies` not including USD**: every country config shipped today auto-includes USD, but the fixture should not assume this implicitly — the parity helpers must accept any non-empty `accepted_currencies` array.
- **Upload guard interaction with deletion sync**: the guard validates `currency` only on insert/update payloads. Soft-deletes (`is_deleted=true`) without a valid currency must still be allowed to upload (the row is being removed, currency is irrelevant).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The sync upload path MUST reject `inventory_items` records whose `currency` is null, undefined, or absent before sending to Supabase. The rejection MUST be classified as unrecoverable (no retry storm).
- **FR-002**: The sync upload path MUST reject `inventory_items` records whose `currency` is not a key of the canonical `CURRENCY_META` registry from `@pos-platform/shared`. The rejection MUST cite the offending value.
- **FR-003**: FR-001 and FR-002 MUST also apply to `transactions` records.
- **FR-004**: Rejected records MUST be recorded in the per-table error list with a structured reason (`invalid-currency` for missing, `unknown-currency` for not-in-registry) and the offending value, so an operator can diagnose without digging through logs.
- **FR-005**: The pre-upload guard MUST NOT block the rest of the batch — sibling records in the same table that pass validation MUST upload successfully in the same cycle.
- **FR-006**: Soft-delete payloads (`is_deleted=true`, `_deleted=1`, etc.) MUST bypass the currency guard so a row missing currency can still be removed.
- **FR-007**: The pre-upload guard MUST live in or be invoked from the existing `isUnrecoverableError` / pre-upload validation hook in `syncUpload.ts`, not in a parallel pathway, so all upload sites pick it up uniformly.
- **FR-008**: The admin-app `balanceMigrationService` MUST default the `currency` of each migrated opening-balance entry to the target store's `preferred_currency`, NOT to a hardcoded literal.
- **FR-009**: When the migration call site explicitly passes a `currency` in `options`, that explicit value MUST override the store-default.
- **FR-010**: When neither an explicit override nor a populated `preferred_currency` is available, `balanceMigrationService` MUST throw a descriptive error rather than substitute any literal default.
- **FR-011**: Every public method on `balanceMigrationService` whose signature currently uses the literal union `'USD' | 'LBP'` MUST instead use the `CurrencyCode` type from `@pos-platform/shared`.
- **FR-012**: `subscriptionService.ts` MUST keep `currency: 'USD'` for subscription billing AND MUST carry an inline comment immediately adjacent to the literal explaining that this is global, intentional, and unrelated to a store's local currency, with a reference back to feature 017 or task 008/15.
- **FR-013**: Every fixture store row in `apps/store-app/tests/sync-parity/` MUST carry `country` (ISO 3166-1 alpha-2) and `accepted_currencies` (non-empty `CurrencyCode[]`).
- **FR-014**: The parity test suite MUST include at least one scenario exercising a non-Lebanon store; the canonical example is UAE (`country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`) with at least one `inventory_items` row and one `transactions` row priced in AED.
- **FR-015**: After the fixture changes, `pnpm parity:gate` MUST pass green (either against the existing golden if no payload-shape change occurred, or against a regenerated golden whose diff was reviewed and committed in the same change).
- **FR-016**: A regression that silently coerces AED → USD (or any non-USD non-LBP currency to a hardcoded value) anywhere in the sync layer MUST cause the parity gate to fail visibly.
- **FR-017**: `apps/store-app/src/services/syncUpload.ts` MUST contain zero `|| 'USD'`, `|| 'LBP'`, `?? 'USD'`, `?? 'LBP'` literal fallbacks in the upload code path. (Comments and tests are exempt; the existing `record.currency || 'USD'` in the event-emission block at the upload site is in scope.)
- **FR-018**: `apps/admin-app/src/services/balanceMigrationService.ts` MUST contain zero hardcoded `'LBP'` or `'USD'` literal fallbacks for the journal-entry currency in production code paths.

### Key Entities *(include if feature involves data)*

- **Pre-upload upload-error record**: a per-record entry that the sync engine writes to its in-memory error list when a row fails the currency guard. Fields: `table`, `recordId`, `reason` (`'invalid-currency' | 'unknown-currency'`), `attemptedValue` (the offending currency literal, or `null` for missing). Visible to the existing `comprehensiveLoggingService` and per-table error-collection paths; not persisted across app restarts (fixing the local row clears it).
- **Parity fixture store row**: the store-shaped object seeded into the parity test's fake Dexie at scenario start. Adds `country: string` (ISO alpha-2) and `accepted_currencies: CurrencyCode[]` to the fields it already carries (`preferred_currency`, `exchange_rate`, etc.).
- **Migration session currency context**: the implicit currency a `balanceMigrationService` call uses when no explicit override is supplied. Sourced from `session.store.preferred_currency`. If absent, the migration aborts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero `inventory_items` or `transactions` rows reach Supabase with a missing or non-registry `currency` value, measured by a dedicated unit test that injects a poisoned row and asserts the Supabase mock receives nothing for that record.
- **SC-002**: A poisoned record does not block sibling records in the same upload batch (measured by a unit test that mixes one poisoned and one valid record and asserts exactly one valid Supabase write).
- **SC-003**: The same poisoned record encountered across N≥3 consecutive upload cycles is attempted at most N times (i.e., does not enter a retry storm) and remains in the error list with a stable reason.
- **SC-004**: The parity test suite contains at least one scenario where the fixture store's `country` is not `'LB'` and at least one priced row uses a non-LBP, non-USD currency.
- **SC-005**: `pnpm parity:gate` exits 0 from a clean checkout of this branch.
- **SC-006**: A repository grep across `apps/store-app/src/services/syncUpload.ts` and `apps/admin-app/src/services/balanceMigrationService.ts` for the patterns `\|\| 'USD'`, `\|\| 'LBP'`, `\?\? 'USD'`, `\?\? 'LBP'` returns zero hits in non-test, non-comment lines.
- **SC-007**: The admin-app opening-balance importer, when run against a UAE store fixture in a unit test, produces journal entries whose currency is `'AED'` for every row that did not specify an override.
- **SC-008**: `subscriptionService.ts` still bills in USD AND has an inline comment within 3 lines of the literal that names the intent ("global", "always USD", "intentional", or equivalent) and references this feature or spec 008.
- **SC-009**: TypeScript compilation (`pnpm --filter store-app build` and `pnpm --filter admin-app build`) passes with zero new errors after this feature.

## Assumptions

- **Phases 1–7 are merged**: this feature consumes the `CurrencyCode` type, `CURRENCY_META`, and the `country`/`accepted_currencies` columns introduced earlier in the 008 rollout. If any prerequisite is missing on the branch, the work blocks at the first compile error.
- **Existing parity infrastructure is sound**: `paritySupabaseMock`, `paritySync.scenarios.test.ts`, etc. already exercise upload/download round-trips. We are extending fixtures and adding one scenario, not redesigning the harness.
- **`isUnrecoverableError` pattern is the right hook for the upload guard**: the existing `syncUpload.ts` already routes per-record failures through this classification, and adding a currency-validity check fits the existing contract. If the surrounding code instead requires a parallel guard, the work shifts but the user-visible behavior is identical.
- **Subscription billing remains USD-only**: this is a stated product decision (see TASKS.md Task 15). If product decides subscriptions need to follow the operating store's currency, that is a separate feature, not a scope expansion of this one.
- **The admin opening-balance importer's call sites are reachable from the migration session**: this feature does not redesign the importer's caller signatures; it changes the default and tightens the type. If a caller relied on the `'LBP'` default in a way the type system did not capture, it will surface as a thrown error at runtime per FR-010 — that is the desired behavior.
- **No new live exchange rate work**: per the 008 non-goals, manual rates only. This feature does not interact with multi-rate (Phase 10) or accounting JSONB (Phase 11) — both of those build on top of what this feature ships.

## Out of Scope

- Multi-rate `exchange_rates` JSONB column work (covered by Phase 10 / Task 17).
- Accounting columns generalization (`amounts`/`balances` JSONB) (covered by Phase 11 / Task 16).
- Store-app self-serve currency settings UI (covered by Phase 12 / Task 18).
- Any new admin UI for selecting per-row currency override during opening-balance import — only the *default* is tightened in this feature.
- Live currency-rate API integration (`TODO(010-live-rates)`).
- Adding parity coverage for *every* country in `COUNTRY_CONFIGS`. One non-Lebanon scenario (UAE) is the minimum; more can be added later without spec churn.
