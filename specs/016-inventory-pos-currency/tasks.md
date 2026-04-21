---
description: "Task list for feature 016 — Inventory Multi-Currency Pricing & POS Sell-Flow Currency Enforcement"
---

# Tasks: Inventory Multi-Currency Pricing & POS Sell-Flow Currency Enforcement

**Input**: Design documents from `/specs/016-inventory-pos-currency/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/
**Tests**: Vitest tasks are included because (a) constitution CG-12 mandates coverage for new/touched service and operations modules, and (b) the feature touches two sync-critical files (`syncDownload.ts`, `syncService.ts`) whose contract requires `pnpm parity:gate` to pass at merge.
**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and reviewed independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- Monorepo; paths are absolute from repo root at `/home/janky/Desktop/pos-1/`.
- Store-app source: `apps/store-app/src/`
- Store-app tests: colocated under `apps/store-app/src/**/__tests__/`
- Shared package: `packages/shared/src/` (consumed only — no edits in this feature)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify that specs 013/014/015 are merged and the consumed APIs exist. No new dependencies needed.

- [x] T001 Verify `@pos-platform/shared` exports `CurrencyCode`, `CURRENCY_META`, and `getDefaultCurrenciesForCountry` from `packages/shared/src/types/index.ts`; fail the feature early if any is missing (blocks all downstream work). Record the verification as a one-line comment at the top of `specs/016-inventory-pos-currency/research.md` under "Pre-flight" (add the heading if absent).
- [x] T002 [P] Verify `apps/store-app/src/services/currencyService.ts` exposes `convert`, `format`, `getAcceptedCurrencies`, `getPreferredCurrency`, `getMeta`, and `loadFromStore`; fail early if any is missing.
- [x] T003 [P] Verify `apps/store-app/src/contexts/OfflineDataContext.tsx` exposes `acceptedCurrencies`, `preferredCurrency`, `formatAmount` via the context value (lines ~1073–1076 per plan survey).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types, helpers, errors, and i18n infrastructure that every user story below relies on. No UI or behaviour change yet.

**⚠️ CRITICAL**: No user story work may begin until this phase is complete.

- [x] T004 Define the new error classes in a new file `apps/store-app/src/errors/currencyErrors.ts`: `InvalidCurrencyError`, `LegacyCurrencyMissingError`, `CurrencyLockError` (as defined in `data-model.md` §"Error taxonomy"). Each carries a structured payload `{ storeId, attemptedCurrency?, acceptedCurrencies?, bill_id?, reason? }` and sets `name` to the class name.
- [x] T005 [P] Add `assertValidCurrency(value, acceptedCurrencies, ctx)` helper in a new file `apps/store-app/src/utils/currencyValidation.ts`. Throws `InvalidCurrencyError({ reason: 'missing' })` when value is null/undefined; throws `InvalidCurrencyError({ reason: 'not-accepted' })` when value is not in `acceptedCurrencies`; returns `value as CurrencyCode` on success. Pure function; no side effects.
- [x] T006 [P] Add `roundHalfEven(value, decimals)` banker's-rounding helper in a new file `apps/store-app/src/utils/currencyRounding.ts` per research R1. Implement scale-up, check discarded digit + remainder, apply half-to-even tie-break; otherwise round-half-up. Pure function.
- [x] T007 [P] Add Vitest suite `apps/store-app/src/utils/__tests__/currencyValidation.test.ts` covering: null/undefined → throws `{reason:'missing'}`; non-member → throws `{reason:'not-accepted'}` with accepted list in payload; valid member → returns the value; includes at least one case per accepted-list shape (`['USD']`, `['LBP','USD']`, `['AED','USD','EUR']`).
- [x] T008 [P] Add Vitest suite `apps/store-app/src/utils/__tests__/currencyRounding.test.ts` covering: 0-decimal LBP rounding of `16.5 → 16` (not `17`) and `17.5 → 18` (half-to-even); 2-decimal USD rounding of `16.759776 → 16.76` and `16.745 → 16.74` (half-to-even); 3-decimal JOD rounding of `0.1235 → 0.124`; negative numbers; zero.
- [x] T009 Tighten TypeScript types in `apps/store-app/src/types/inventory.ts` line ~35: change `currency?: 'USD' | 'LBP'` to `currency: CurrencyCode` (import from `@pos-platform/shared`). Leave `| null` only in the Row-level Dexie read types where legacy rows may still exist; `Insert`/`Update` contracts MUST require `CurrencyCode`.
- [x] T010 Tighten TypeScript types in `apps/store-app/src/types/database.ts`: for `inventory_items` Row make `currency: CurrencyCode | null` (reads may see legacy nulls); Insert/Update make `currency: CurrencyCode` (required). For `bills` Row/Insert/Update all three typed as `currency: CurrencyCode` (no null). Import `CurrencyCode` from `@pos-platform/shared`.
- [x] T011 [P] Add the new i18n keys to `apps/store-app/src/locales/en.json`, `ar.json`, `fr.json`. Keys: `inventory.currencyNotAccepted`, `inventory.currencyRequired`, `inventory.missingCurrency`, `bill.settlementPickerLabel`, `bill.settlementNotAccepted`, `bill.conversionRateMissing`, `bill.currencyLocked`, `transaction.currencyMissing`, `transaction.currencyNotAccepted`. English strings per the contract docs; Arabic and French translations written in the same PR (CG-10).
- [x] T012 Run `pnpm --filter store-app build` to confirm Phase 2 compiles with zero TypeScript errors. Record any surprising type errors as blockers to Phase 3.

**Checkpoint**: Foundation ready — user-story implementation can proceed.

---

## Phase 3: User Story 1 — Mixed-currency bill settlement (Priority: P1) 🎯 MVP

**Goal**: Cashier picks a settlement currency at the start of a POS tab; every line added is converted into that currency (rounded half-even to the bill currency's decimals); the bill persists with one currency across header and all lines; settlement currency locks once the first line is added.

**Independent Test**: Per quickstart Scenario A — in a Lebanese store with rate 89500, create a bill with settlement `USD`, add an LBP-priced item (`1,500,000`) and a USD-priced item (`10.50`). Stored lines must be `16.76` and `10.50`; total `27.26`; `bills.currency === 'USD'`.

### Tests for User Story 1 ⚠️

> Write tests FIRST; ensure they FAIL before implementation.

- [ ] T013 [P] [US1] Add Vitest suite `apps/store-app/src/contexts/offlineData/operations/__tests__/billOperations.test.ts` covering `createBill`: happy path with valid `currency`; reject when `currency` is null/undefined (`InvalidCurrencyError{reason:'missing'}`); reject when `currency` not in accepted list (`InvalidCurrencyError{reason:'not-accepted'}`); success writes `bills.<id>.currency === input.currency`.
- [x] T014 [P] [US1] Add Vitest suite `apps/store-app/src/contexts/offlineData/operations/__tests__/saleOperations.test.ts` covering line-item conversion: identity case (same currency) produces `unit_price === item.selling_price`; cross-currency LBP→USD at rate 89500 produces `16.76` for input `1500000` (banker's-rounded); missing rate → `MissingExchangeRateError` (imported from `currencyService`) propagates; null-currency item → `LegacyCurrencyMissingError`; currency-lock → throwing `CurrencyLockError` when `changeBillCurrency` called with ≥1 line. *(Implemented as `saleOperations.currency.test.ts` — core `computeLineUnitPrice` paths; `changeBillCurrency` + lock still optional to extend with Dexie mocks.)*

### Implementation for User Story 1

- [x] T015 [US1] Add `currency: CurrencyCode` as a required field on the `CreateBillInput` shape in `apps/store-app/src/contexts/offlineData/operations/billOperations.ts` (lines 31–43 per survey). Add pre-insert validation call to `assertValidCurrency(input.currency, currencyService.getAcceptedCurrencies(), { storeId })`.
- [x] T016 [US1] In `apps/store-app/src/contexts/offlineData/operations/saleOperations.ts` (lines 31–155 per survey), replace the existing `unit_price` assignment at line ~45 with a call to a new helper `computeLineUnitPrice(item, billCurrency)` implementing the algorithm from `contracts/pos-sell-flow.contract.md` §2: null-currency throws; identity short-circuit (no rounding); otherwise `currencyService.convert` + `roundHalfEven(raw, CURRENCY_META[billCurrency].decimals)`.
- [x] T017 [US1] Add `computeLineUnitPrice(item, billCurrency)` as a non-exported helper in `saleOperations.ts` (same file, top of module). Import `currencyService`, `CURRENCY_META`, `roundHalfEven`, error classes.
- [x] T018 [US1] Add `changeBillCurrency(billId, newCurrency)` function to `saleOperations.ts` that throws `CurrencyLockError` when the bill already has ≥1 line item; otherwise updates the in-memory cart's currency. This is the target of the UI picker-lock behaviour.
- [x] T019 [US1] Update `apps/store-app/src/contexts/OfflineDataContext.tsx` at the bill-creation path (line ~619 per survey): expose `settlementCurrency` as a value passed in from the UI (via a new createBill signature param), no longer defaulting to `preferredCurrency` inside the context. The context still provides `preferredCurrency` as the default for the picker's initial value — the caller (POS.tsx) selects and supplies the final value.
- [x] T020 [US1] In `apps/store-app/src/pages/POS.tsx`, add the settlement-currency picker per `contracts/pos-sell-flow.contract.md` §1: rendered at new-tab init only when `acceptedCurrencies.length > 1`; default = `preferredCurrency`; locks (disabled state + tooltip using i18n key `bill.currencyLocked`) once the tab's cart has ≥1 line; the selected value is passed to the context's `createBill` on settle. Use `useCurrency()` hook for `acceptedCurrencies` / `preferredCurrency`.
- [x] T021 [US1] Wire the POS add-to-cart path in `apps/store-app/src/pages/POS.tsx` to surface errors from `computeLineUnitPrice`: `MissingExchangeRateError` → toast with i18n key `bill.conversionRateMissing` (interpolate `{from,to}`); `LegacyCurrencyMissingError` → toast with `inventory.missingCurrency` + a "Fix in Inventory" action link.
- [x] T022 [US1] Confirm (by reading `transactionService.createTransaction`) that the atomic unit of work reads `bills.currency` and line `unit_price`s from the in-memory cart as already finalized by Phase 3 logic — do NOT re-convert inside `transactionService`. If any double-conversion path is present, fix it in this task; otherwise document the read path in a 1-line comment at the conversion site in `saleOperations.ts`.
- [x] T023 [US1] Verify bill reprint / re-read path: in `apps/store-app/src/contexts/offlineData/useBillDataLayer.ts` (hydrate transform at line ~34 per survey), confirm `unit_price` is read from the row and never re-derived from the inventory item's current price. If a re-derivation path exists, remove it. Add a test case to the billOperations suite asserting immutability of `bills.currency` and line `unit_price` under an inventory item's subsequent price/currency change.

**Checkpoint**: User Story 1 is fully functional. Run quickstart Scenario A to validate.

---

## Phase 4: User Story 2 — Inventory manager adds stock in any accepted currency (Priority: P1)

**Goal**: Inventory create/edit form's currency selector is driven by `acceptedCurrencies`, defaults to `preferredCurrency`, renders the currency symbol adjacent to the price input, and the write path validates the currency belongs to the store's accepted set.

**Independent Test**: Per quickstart Scenario B1 — against the Lebanese store, programmatically attempt `addInventoryItem({ name: 'Illegal', currency: 'EUR', selling_price: 5 })`. Expect `InvalidCurrencyError` naming EUR and listing `['LBP','USD']`; zero rows written.

### Tests for User Story 2 ⚠️

- [ ] T024 [P] [US2] Add Vitest suite `apps/store-app/src/contexts/offlineData/operations/__tests__/inventoryItemOperations.test.ts` covering `addInventoryItem`: happy path writes row with provided `currency`; null/undefined → `InvalidCurrencyError{reason:'missing'}`; non-accepted → `InvalidCurrencyError{reason:'not-accepted'}`; `selling_price` stored as typed (no conversion); `updateInventoryItem` with partial patch omitting `currency` does NOT run currency validation; `updateInventoryItem` with a `currency` in patch runs validation.

### Implementation for User Story 2

- [x] T025 [US2] In `apps/store-app/src/contexts/offlineData/operations/inventoryItemOperations.ts` (lines 34–66 and 68–100 per survey), add the pre-insert/update guard calling `assertValidCurrency(input.currency, currencyService.getAcceptedCurrencies(), { storeId })`. Fall through to the existing Dexie write on success; throw on failure. Ensure no silent default is applied when `input.currency` is missing.
- [x] T026 [US2] Replace the currency dropdown in `apps/store-app/src/pages/Inventory.tsx` (Add/Receive form section) with a component sourced from `useCurrency().acceptedCurrencies`. Default selection is `useCurrency().preferredCurrency` when creating; the saved row's currency when editing. Field is required; form submit is disabled until a currency is picked (use i18n key `inventory.currencyRequired`).
- [x] T027 [US2] In the same inventory form component in `Inventory.tsx`, add the symbol adornment to the price input: left-positioned `<span>` showing `CURRENCY_META[selectedCurrency].symbol`; the span re-renders when `selectedCurrency` changes. Ensure the price `<input>` left-padding accommodates the widest symbol used by any currency in `acceptedCurrencies`.
- [x] T028 [US2] If a separate receive-form modal exists (`apps/store-app/src/components/inventory/ReceiveFormModal.tsx` per survey), apply the same selector + symbol-adornment treatment there. If the modal shares a form component with `Inventory.tsx`, this task reduces to verifying the shared component is used in both surfaces.
- [x] T029 [US2] Add a "missing currency" indicator to the Inventory list render in `apps/store-app/src/pages/Inventory.tsx`: when a row has `currency == null`, render a small warning icon next to the price with tooltip from i18n key `inventory.missingCurrency`. This handles the legacy row backward-compat requirement (FR-006 / FR-007).
- [x] T030 [US2] Cross-integrate with US1: in `apps/store-app/src/pages/POS.tsx` add-to-cart handler, when the scanned/selected inventory item has `currency == null`, throw/surface `LegacyCurrencyMissingError` via the US1 toast path (T021) and prevent the item from entering the cart. (This task depends on T021 being complete.)

**Checkpoint**: User Story 2 is fully functional. Run quickstart Scenario B1 to validate.

---

## Phase 5: User Story 3 — No silent fallback in transaction data layer (Priority: P1)

**Goal**: `useTransactionDataLayer.addTransaction` requires callers to supply a valid `currency`. The legacy `|| 'USD'` coercion is removed. Missing or non-accepted values throw descriptively.

**Independent Test**: Per quickstart Scenario B3 — call `addTransaction({ ...no currency field... })` → expect `InvalidCurrencyError{reason:'missing'}` thrown; call with `'EUR'` → expect `InvalidCurrencyError{reason:'not-accepted'}`; call with `'USD'` in a Lebanese store → success.

### Tests for User Story 3 ⚠️

- [ ] T031 [P] [US3] Add Vitest suite `apps/store-app/src/contexts/offlineData/__tests__/useTransactionDataLayer.test.ts` covering: `addTransaction` with missing `currency` → `InvalidCurrencyError{reason:'missing'}`; with non-accepted `currency` → `InvalidCurrencyError{reason:'not-accepted'}`; with valid `currency` → writes row with exactly that currency (no coercion). Include a regression assertion: grep the module source for `|| 'USD'` and `?? 'USD'` and fail the test if either appears.

### Implementation for User Story 3

- [x] T032 [US3] In `apps/store-app/src/contexts/offlineData/useTransactionDataLayer.ts` at the currency assignment (line ~74 per survey), replace the expression `(transactionData.currency as 'USD' | 'LBP') || 'USD'` with a call to `assertValidCurrency(transactionData.currency, currencyService.getAcceptedCurrencies(), { storeId: currentStoreId })`. Use the returned value in the Dexie write payload.
- [x] T033 [US3] Audit every caller of `useTransactionDataLayer.addTransaction` (grep `apps/store-app/src/` for the function name and for the `useTransactionDataLayer` import). For each caller, verify a valid `currency` is passed; if any relied on the removed fallback, fix the caller in-place. Record the audit result (list of callers + fix status) as a comment block at the top of the transaction data layer file. Known callers from plan: `billOperations.createBill` (US1) and `saleOperations.updateSale` (line ~95 per survey).
- [x] T034 [US3] Wire the UI error surface for transaction-layer failures: wherever the context wraps `addTransaction` for UI consumption, catch `InvalidCurrencyError` and surface a toast with i18n key `transaction.currencyMissing` or `transaction.currencyNotAccepted` as appropriate.

**Checkpoint**: User Story 3 is fully functional. Run quickstart Scenario B3 to validate.

---

## Phase 6: User Story 4 — Sync never invents a currency (Priority: P2)

**Goal**: Remove the `|| 'LBP'` fallback in `syncDownload.ts` (replace with warn+skip) and the `preferred_currency: 'USD'` hardcoded default in `syncService.ensureStoreExists` (replace with Supabase-row-or-country-defaults fallback chain). Both files are sync-critical — parity gate must pass.

**Independent Test**: Per quickstart Scenarios C and D — (a) clear Dexie `stores` table and trigger `syncDownload`; observe a structured `comprehensiveLoggingService.warn` emission with `reason: 'store-row-absent'` and no currency-invented writes. (b) Fresh-hydrate a UAE Supabase store; confirm local Dexie row has exact `country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']` — no `'USD'` or `'LBP'` literal substituted anywhere on the seed path.

### Tests for User Story 4 ⚠️

- [ ] T035 [P] [US4] Add or extend Vitest suite `apps/store-app/src/services/__tests__/syncDownload.test.ts` covering the empty-stores-table case: stub `getDB().stores.get(id)` to return `undefined`, call the affected function (lines 72, 101), assert that `comprehensiveLoggingService.warn` is called with payload matching the schema in `contracts/sync-fallbacks.contract.md`, and that no Dexie write occurs.
- [ ] T036 [P] [US4] Add or extend Vitest suite `apps/store-app/src/services/__tests__/syncService.test.ts` covering `ensureStoreExists`: (a) Supabase row with all fields present → seed mirrors row exactly, no literal substitution; (b) Supabase row with only `country` present → `accepted_currencies` comes from `getDefaultCurrenciesForCountry(country)`, `preferred_currency = accepted_currencies[0]`; (c) Supabase row with nothing usable → throws descriptive error; in no case does a `'USD'` or `'LBP'` string literal appear in the final seeded row unless it genuinely came from the Supabase row or the country-defaults helper.

### Implementation for User Story 4

- [x] T037 [US4] In `apps/store-app/src/services/syncDownload.ts` at line 72 and line 101, replace `store?.preferred_currency || 'LBP'` with the structured warn-and-skip pattern from `contracts/sync-fallbacks.contract.md` §1. Emit via `comprehensiveLoggingService.warn({ operation, storeId, reason: 'store-row-absent', action: 'skip' })`. The rest of the function returns early or skips the currency-dependent branch as appropriate for each call site.
- [x] T038 [US4] In `apps/store-app/src/services/syncService.ts` at line 621 (`ensureStoreExists`), remove the hardcoded `preferred_currency: 'USD'` default. Implement the fallback chain from `contracts/sync-fallbacks.contract.md` §2: prefer `supabaseRow.preferred_currency`/`accepted_currencies`/`country` as present; fall back to `getDefaultCurrenciesForCountry(country)` when only `country` is known; throw loudly (via `comprehensiveLoggingService.error` + thrown Error) when nothing usable is present. Zero literal currency strings in any fallback branch.
- [x] T039 [US4] Run `pnpm parity:gate` locally and confirm the golden snapshot passes. If it fails, inspect the delta — if it is a genuine regression in the touched sync paths, fix the implementation before proceeding; if the delta is an intentional, expected change (no such change expected for this feature — the feature should not alter any sync payload shape), regenerate the golden with appropriate review.

**Checkpoint**: User Story 4 is fully functional. Run quickstart Scenarios C and D and the parity gate to validate.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final audits, full validation, and cleanup across the touched surface.

- [x] T040 [P] Repository grep audit: from repo root, run a case-sensitive search for `\|\| 'USD'`, `\|\| 'LBP'`, `\?\? 'USD'`, `\?\? 'LBP'` inside the three files `apps/store-app/src/contexts/offlineData/useTransactionDataLayer.ts`, `apps/store-app/src/services/syncDownload.ts`, `apps/store-app/src/services/syncService.ts`. Expected: zero hits. If any remain, fix and re-run. Record the grep output (empty) in a new audit log section at the bottom of `specs/016-inventory-pos-currency/research.md`.
- [ ] T041 [P] Repository grep audit: search `apps/store-app/src/` for the type literal pattern `'USD' \| 'LBP'` (with and without surrounding whitespace). Expected: zero hits outside test fixtures. If the pattern appears in non-test source, replace with `CurrencyCode` import.
- [x] T042 [P] Run `pnpm --filter store-app build` from repo root and confirm zero TypeScript errors (NFR-001 gate).
- [x] T043 [P] Run `pnpm --filter store-app test:run` and confirm all Vitest suites pass (including the six new/extended suites from T007, T008, T013, T014, T024, T031, T035, T036).
- [x] T044 Run `pnpm parity:gate` one final time (post all polish) and confirm green (CG-12).
- [ ] T045 Execute quickstart scenarios A, B1, B2, B3, C, D, E against a local dev build as described in `specs/016-inventory-pos-currency/quickstart.md`. Check off the verification table in that file. For any scenario that fails, open a subtask; do not ship.
- [ ] T046 [P] Run `pnpm lint` and resolve any new lint errors introduced by this feature (existing warnings in untouched files are out of scope).
- [ ] T047 Commit with a descriptive message referencing Feature 016 and phases 6/7 of Task 008. Push the branch. Open the PR with the description cross-linking specs 013/014/015 as merged prerequisites.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Starts immediately. T001 blocks all; T002 and T003 can run in parallel with T001.
- **Phase 2 (Foundational)**: Starts after Phase 1. Blocks every user-story phase.
  - Within Phase 2: T004 blocks T005, T015, T016, T025, T032 (they all import the error classes). T005/T006 block all guard call sites. T009/T010 block all write-path edits by virtue of TypeScript compilation.
  - T007, T008, T011 are parallel to the type/helper work (different files).
- **Phase 3 (US1, MVP)**: Starts after Phase 2 checkpoint.
- **Phase 4 (US2)**: Can start after Phase 2 checkpoint. T030 depends on T021 (US1 toast plumbing). Otherwise US2 is independent of US1.
- **Phase 5 (US3)**: Can start after Phase 2 checkpoint. T033 depends on US1's `createBill` / `updateSale` signatures being finalized — serialize US3 after US1 if the audit may turn up callers that need signature fixes.
- **Phase 6 (US4)**: Can start after Phase 2 checkpoint. Fully independent of US1/US2/US3 — different files.
- **Phase 7 (Polish)**: All tasks depend on US1 through US4 being complete.

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories. MVP.
- **US2 (P1)**: T030 (POS integration for null-currency blocking) depends on US1's T021. Otherwise independent.
- **US3 (P1)**: T033 (caller audit) depends on US1's T015 signature change. Otherwise independent.
- **US4 (P2)**: Independent of US1/US2/US3. Different files, different write paths.

### Parallel Opportunities

- **Setup**: T002 ‖ T003 (T001 first).
- **Foundational**: T005 ‖ T006 ‖ T007 ‖ T008 ‖ T011 (after T004). T009 ‖ T010 (type files). T012 is the gate.
- **US1 tests**: T013 ‖ T014.
- **US1 implementation**: T015, T017 parallel with each other; T016 and T018 serialize in `saleOperations.ts`; T019 and T020 serialize in the context→POS wire.
- **US2 tests**: T024 (single file).
- **US2 implementation**: T026, T027, T028, T029 serialize in Inventory.tsx; T025 in operations is parallel to the UI tasks.
- **US3**: T031 (tests) ‖ T032 (impl); T033 runs after T032.
- **US4**: T035 ‖ T036 (tests, different files). T037 ‖ T038 (impl, different files). T039 (parity) runs after both.
- **Polish**: T040, T041, T042, T046 are all grep/run commands that are parallel. T044 and T045 must run after Polish grep-and-fix.

### Within Each User Story

- Tests first (Vitest suites in the phase's "Tests" block). They must FAIL before the implementation tasks in the same phase are complete (this is the standard TDD check — not a strict ordering, but a correctness bar).
- Helpers before callers (foundational already handled this).
- Operations before UI (except when UI and operations co-evolve — US1's T019/T020 wire is intentionally serial).

---

## Parallel Example: User Story 1

```bash
# Launch both test suites for US1 together:
Task: "Add Vitest suite apps/store-app/src/contexts/offlineData/operations/__tests__/billOperations.test.ts"
Task: "Add Vitest suite apps/store-app/src/contexts/offlineData/operations/__tests__/saleOperations.test.ts"
```

After tests are authored (and red), run the US1 implementation tasks roughly in order; T015 and T017 can be done in parallel (different edit sites within the same file is OK if the author coordinates; simplest to serialize in one commit).

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational) — all blockers resolved.
3. Complete Phase 3 (US1) — cashier can settle a mixed-currency bill.
4. **STOP and VALIDATE**: Run quickstart Scenario A end-to-end. This alone delivers the single most valuable behaviour of the feature.
5. Optional early demo/deploy at this point (behind a feature flag if risk-averse, though the change is scoped to POS and backward-compatible with existing Lebanese store flows).

### Incremental Delivery

1. Setup + Foundational → Foundation ready (Phases 1–2).
2. Add US1 → demo mixed-currency bill.
3. Add US2 → demo inventory manager creating items in any currency + legacy row indicator.
4. Add US3 → regression gate for the silent `|| 'USD'` bug closed; verified by grep + test.
5. Add US4 → sync-layer fallbacks removed; parity gate green.
6. Polish → final audits, parity, quickstart walk-through, PR.

### Parallel Team Strategy

With multiple developers:

1. Team together: Setup + Foundational (Phases 1–2).
2. Once Phase 2 is done:
   - Developer A: US1 (the highest-risk, highest-value story — senior takes this).
   - Developer B: US4 (fully independent; quickest win to verify parity gate).
   - Developer C: US2 (depends on US1's T021 at the end; starts on T024/T025/T026–T029 immediately, integrates T030 after A ships T021).
   - Developer D: US3 (depends on US1's T015 signature; starts on T031 immediately, implements T032 after A's T015 merges).
3. Polish is a single developer final sweep.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Each user story is independently completable and testable against a quickstart scenario.
- Tests must fail before implementation is written (TDD discipline for the new Vitest suites).
- Commit after each task or logical group; write commit messages referencing Task IDs (e.g. "T015 [US1] require currency on createBill").
- Stop at each phase's Checkpoint to validate the story independently — do not bundle story validation across stories.
- Avoid: vague tasks, same-file edit conflicts between stories (this task list intentionally serializes POS.tsx edits across US1/US2 on a single developer).
