# Tasks: Currency Service & Context Wiring

**Feature**: 015-currency-service-wiring
**Branch**: `015-currency-service-wiring`
**Input docs**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts), [quickstart.md](./quickstart.md)

**Legend**: `[P]` = parallelizable (different files, no dependency on incomplete tasks). `[US1]`…`[US4]` = user-story binding.

---

## Phase 1: Setup

- [x] T001 Verify spec 014 prerequisites are in place by running `pnpm --filter @pos-platform/shared build` then `pnpm --filter store-app typecheck` and `pnpm --filter admin-app typecheck`. All three must exit 0. If the store-app typecheck complains about missing `country` or `accepted_currencies` fields on the `stores` table type, spec 014 has not merged into this branch yet — stop and rebase. *(Shared build + `tsc -b` on apps; store-app has no `typecheck` script — full `tsc` still reports unrelated pre-existing contract gaps.)*
- [x] T002 [P] Confirm the shared package exports `CurrencyCode`, `CURRENCY_META`, `COUNTRY_CONFIGS`, `COUNTRY_MAP`, and `getDefaultCurrenciesForCountry` from `packages/shared/src/types/index.ts`. If any is missing, re-check the 013/014 merges before proceeding.

---

## Phase 2: Foundational — CurrencyService rewrite + compat shim

**Purpose**: Replace the two-currency `CurrencyService` with the multi-currency surface defined in `contracts/currencyService.contract.md`, and rewrite `useCurrency` as a backward-compat shim so the 14+ downstream UI callers keep compiling. This phase blocks every user story.

- [x] T003 [P] Create the Vitest suite skeleton at `apps/store-app/src/services/__tests__/currencyService.test.ts` with all 14 test cases from `contracts/currencyService.contract.md § "Unit test checklist"` marked `it.todo`. Use the existing Dexie-mocking patterns from `apps/store-app/src/services/__tests__/legacy/transactionService.refactored.test.ts` as a reference for how to seed a fake `stores.get()` return.
- [x] T004 Rewrite `apps/store-app/src/services/currencyService.ts` per `contracts/currencyService.contract.md § "New public API"`. Implement `loadFromStore`, `convert`, `format`, `getMeta`, `getAcceptedCurrencies`, `getPreferredCurrency`, `getExchangeRate`, `isReady`. Seed `rates` with `{ USD: 1 }`. Derive legacy fallback `[preferredCurrency, 'USD']` when the loaded store row is missing `accepted_currencies`.
- [x] T005 In the same `apps/store-app/src/services/currencyService.ts`, delete the legacy methods (`getSupportedCurrencies`, `safeConvertForDatabase`, `formatCurrencyWithSymbol`, `getConvertedAmount`, `updateExchangeRate`, `refreshExchangeRate`, `convertCurrency`, `formatCurrency`, `validateCurrencyAmount`) and the exported `CurrencyConfig` / `CurrencyConversion` interfaces. Keep the singleton `getInstance()` pattern and the default `currencyService` export.
- [x] T006 Replace the `t.todo` Vitest cases in `apps/store-app/src/services/__tests__/currencyService.test.ts` with real assertions matching every row of the contract's unit-test checklist. Run `pnpm --filter store-app test:run -- currencyService.test.ts`; all 14 cases must pass.
- [x] T007 Rewrite `apps/store-app/src/hooks/useCurrency.ts` as a backward-compat shim per `contracts/currencyService.contract.md § "Integration with useCurrency hook"`. Pull `acceptedCurrencies`, `preferredCurrency`, `formatAmount`, `exchangeRate`, `currency` from `useOfflineData()` (fields are added in Phase 4, but the hook can import them from the context's type even if they're not yet wired — the Phase 2 build should still compile because `OfflineDataContext` is edited in T013 before Phase 4's manual tests). Keep every exported function name unchanged so the 14+ existing callers compile without edits.
- [x] T008 Patch `apps/store-app/src/pages/Accounting.tsx` lines 1119 and 1143: replace each `CurrencyService.getInstance().safeConvertForDatabase(amount, currency as 'USD' | 'LBP')` call with `{ amount: currencyService.convert(amount, currency as CurrencyCode, 'USD'), currency: 'USD' as CurrencyCode, wasConverted: currency !== 'USD' }`. Import `currencyService` and `CurrencyCode` at the top of the file. Delete the `as 'USD' | 'LBP'` casts.
- [x] T009 Patch `apps/store-app/src/contexts/offlineData/useStoreSettingsDataLayer.ts` around line 80: replace `CurrencyService.getInstance().refreshExchangeRate(storeId)` with `currencyService.loadFromStore(storeId)`. Update the import to use the default `currencyService` singleton instead of `CurrencyService.getInstance()`.
- [x] T010 Run `pnpm --filter store-app typecheck` — must exit 0. If any file still references the removed legacy methods, fix each one by routing through `currencyService.convert` / `.format` / `.getAcceptedCurrencies` per the removed-methods table in the contract. *(Legacy `currencyService.*` call sites migrated; monorepo `tsc -b` for store-app still fails on unrelated `OfflineDataContextType` gaps.)*

**Phase 2 exit gate**: `pnpm --filter store-app test:run -- currencyService.test.ts` green + `pnpm --filter store-app typecheck` clean.

---

## Phase 3: User Story 1 — Super-admin onboards a store in a non-Lebanon country (Priority: P1)

**Story goal**: A super-admin picks a country, the form auto-wires the currency fields correctly, and the saved Supabase row reflects the selection. Implements FR-009 through FR-016 and FR-014a.

**Independent test criteria**: Create a store with country "UAE" from the admin-app dev server → Supabase `stores` row has `country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`, and the admin-typed `exchange_rate`. The 89500 hardcode is gone.

Runs in parallel with Phases 4/5/6 — touches only the admin-app package.

### Type + service layer

- [x] T011 [P] [US1] Widen `apps/admin-app/src/types/index.ts` per `contracts/storeForm.contract.md § "Type widening"`: import `CurrencyCode` from `@pos-platform/shared`; add `country: string` and `accepted_currencies: CurrencyCode[]` as required fields to `CreateStoreInput`; add `country?` and `accepted_currencies?` as optional to `UpdateStoreInput`; widen `preferred_currency` on both from `'USD' | 'LBP'` to `CurrencyCode`.
- [x] T012 [P] [US1] Add a `checkCurrencyUsage(storeId, currencies)` helper to `apps/admin-app/src/services/storeService.ts` per `contracts/storeForm.contract.md § "Usage-count guard"`. Query `inventory_items`, `transactions`, and `bills` (filtered by `settled_at IS NULL` or the admin-app's existing open-bill predicate — verify which by reading the file) with `count: 'exact', head: true` in parallel via `Promise.all`. Return `Record<CurrencyCode, { inventory: number; transactions: number; openBills: number }>`.
- [x] T013 [US1] Update `createStore` and `updateStore` in `apps/admin-app/src/services/storeService.ts` to include `country` and `accepted_currencies` in the insert and update payloads. Verify existing SELECT queries use `*` (they do per current file) so the new columns come back on read without extra changes.

### Form component

- [x] T014 [US1] Rewrite `apps/admin-app/src/components/stores/StoreForm.tsx` per `contracts/storeForm.contract.md § "StoreForm component contract"`:
  - Import `CurrencyCode`, `CURRENCY_META`, `COUNTRY_CONFIGS`, `COUNTRY_MAP` from `@pos-platform/shared`.
  - Add `country` and `accepted_currencies` to `formData` initial state (see `data-model.md § "AdminStoreFormState"` for create vs edit initial values).
  - Render a searchable country selector after Store Name, options sorted alphabetically from `COUNTRY_CONFIGS`.
  - Render an accepted-currencies multi-select (checkbox list) sorted alphabetically from `CURRENCY_META`. USD checkbox is pre-checked and disabled.
  - Replace the two-option `preferred_currency` Select with one whose options come from `CURRENCY_META`.
  - Remove the `'89500'` hardcoded default from `exchange_rate`; default to `''`.
  - Hide or disable the `exchange_rate` input when `preferred_currency === 'USD'`.
  - Use dynamic helperText `` `Rate of 1 USD expressed in ${preferred_currency}` ``.
- [x] T015 [US1] Add the `handleCountryChange` handler to the same component per `contracts/storeForm.contract.md § "Handlers"` and `research.md § R-3`: union-merge previous `accepted_currencies` with the new country's `defaultCurrencies`, set `preferred_currency` to the new country's `localCurrency`, clear the `exchange_rate` input.
- [x] T016 [US1] Add the `handleAcceptedCurrenciesChange` handler that rejects any attempt to untick USD.
- [x] T017 [US1] Extend `validate()` in the same component with the full rule table from `data-model.md § "Validation"`: require non-empty `country`; require `accepted_currencies.length ≥ 1`; require `preferred_currency ∈ accepted_currencies`; require `'USD' ∈ accepted_currencies`; require `exchange_rate > 0` only when `preferred_currency !== 'USD'`.
- [x] T018 [US1] Add the edit-path usage-count check to `handleSubmit`: diff `store.accepted_currencies` vs `formData.accepted_currencies`, call `checkCurrencyUsage` from T012 for every removed code, hard-block submission with a per-currency breakdown error when any count is non-zero. Apply this only on the edit path (when `isEditing` is true).
- [x] T019 [US1] Update `handleSubmit`'s payload assembly to include `country` and `accepted_currencies` and to pass `exchange_rate: undefined` when `preferred_currency === 'USD'`.

### Acceptance

- [ ] T020 [US1] Start `pnpm dev:admin` and walk through quickstart.md § 2 and § 3 end-to-end: create a UAE store, create a US store (rate hidden), edit a Lebanese store to add EUR, then try to remove LBP and confirm the usage-count block fires.

---

## Phase 4: User Story 2 — Cashier sees currency amounts formatted in their store's locale (Priority: P1)

**Story goal**: Any store-app component can call `formatAmount(value, currency)` via the context and get a locale-correct string for any currency in `CURRENCY_META`. Implements FR-017 (init path), FR-018, FR-020, and the format half of FR-004.

**Independent test criteria**: Load the store-app against a store configured with `preferred_currency='SAR'` → home/bills/inventory screens render amounts with `ar-SA` locale, `﷼` symbol, two decimals. No regressions on a Lebanese store.

Runs in parallel with Phase 3 (different package).

- [x] T021 [US2] In `apps/store-app/src/contexts/OfflineDataContext.tsx`, add two React state declarations: `const [acceptedCurrencies, setAcceptedCurrencies] = useState<CurrencyCode[]>(['USD'])` and `const [preferredCurrency, setPreferredCurrency] = useState<CurrencyCode>('USD')`. Import `CurrencyCode` from `@pos-platform/shared`.
- [x] T022 [US2] In the same file, add `const reloadCurrencyState = useCallback(async (storeId: string) => { ... })` per `contracts/offlineDataContext.contract.md § "Internal state"`. The body calls `await currencyService.loadFromStore(storeId)` then invokes `setPreferredCurrency`, `setAcceptedCurrencies`, plus the existing `setCurrency` and `setExchangeRate` so legacy consumers keep seeing consistent values.
- [x] T023 [US2] In the same file, define `const formatAmount = useCallback((amount, currency) => currencyService.format(amount, currency), [preferredCurrency])`. Expose `acceptedCurrencies`, `preferredCurrency`, and `formatAmount` on the context's return value. Update the context type / `offlineDataContextContract.ts` to include the three new fields.
- [x] T024 [US2] In `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` (or wherever the boot-time store load happens, currently near line 126), add a call to `reloadCurrencyState(sid)` right after `await getDB().stores.get(sid)` resolves with a row. This replaces the implicit currency init that the legacy `refreshExchangeRate` used to do.
- [ ] T025 [US2] Start `pnpm dev:store`, log into a Lebanese test store, and confirm via DevTools React devtools that `useOfflineData()` now exposes `acceptedCurrencies=['LBP','USD']`, `preferredCurrency='LBP'`, and that `formatAmount(1500000, 'LBP')` from a console test renders the Arabic locale string with zero decimals. Repeat for a USD-only store to confirm `acceptedCurrencies=['USD']`.

---

## Phase 5: User Story 3 — Any component converts between accepted currencies (Priority: P2)

**Story goal**: `currencyService.convert(amount, from, to)` works for any pair of currencies in the loaded store's rate map, using USD as the pivot, and throws descriptive errors when a rate is missing. Implements the convert half of FR-003.

**Independent test criteria**: From a Vitest-loaded Lebanese store fixture, `convert(100, 'USD', 'LBP')` equals `100 * 89500`; `convert(100, 'USD', 'EUR')` throws with message naming `USD → EUR`.

Most of the implementation landed in Phase 2 (T004). This phase adds US3-specific verification and covers the ACCOUNTING integration path.

- [x] T026 [US3] Verify the US3-specific subset of the Vitest suite added in T006 is green: `convert(100, 'USD', 'LBP')`, `convert(8950000, 'LBP', 'USD')`, `convert(100, 'USD', 'USD')`, `convert` throws on missing rate, `convert` throws on uninitialized service. Re-run `pnpm --filter store-app test:run -- currencyService.test.ts` to confirm.
- [ ] T027 [US3] Manually confirm the two patched call sites from T008 in `apps/store-app/src/pages/Accounting.tsx` still produce the same numeric results for a Lebanese-store sale flow: open the Accounting page in dev, run an expense record with a mix of USD and LBP line items, compare the recorded amount vs. the legacy behavior on `main`. Any drift > 0.01 units indicates a math bug in the replacement and must be fixed before merge.

---

## Phase 6: User Story 4 — Currency state stays consistent across the app lifecycle (Priority: P2)

**Story goal**: Sync cycles and store-settings writes invalidate the context's currency state so consumers see fresh values without restart. Implements FR-017 (post-sync path) and FR-019.

**Independent test criteria**: Open the store-app on a Lebanese store. Via the admin app, add EUR to `accepted_currencies`. Trigger a store-app sync. Confirm a component subscribed to `acceptedCurrencies` re-renders with `['LBP', 'USD', 'EUR']` without a page reload.

- [x] T028 [US4] In `apps/store-app/src/contexts/OfflineDataContext.tsx`, hook `reloadCurrencyState(currentStoreId)` into the post-sync callback. Find the existing callback that fires after `syncService.downloadUpdates()` (grep for `downloadUpdates` or `onSyncComplete` within the file); invoke `reloadCurrencyState` unconditionally at the end. If a per-table touch signal is available, gate on `stores`; otherwise accept the unconditional cost (single Dexie read). *(Implemented via `refreshData` → `reloadCurrencyState`, which `performSync` already invokes after each successful sync.)*
- [x] T029 [US4] Update `apps/store-app/src/contexts/offlineData/useStoreSettingsDataLayer.ts` so that after a successful local rate/currency update (Dexie write), it invokes `reloadCurrencyState` via the context rather than calling `currencyService.loadFromStore` directly. This keeps the reactive state + service state in lock-step.
- [ ] T030 [US4] Run the quickstart.md § 5 live-sync test manually: keep the store-app open, edit the store in admin-app to add EUR, wait for sync, confirm the React devtools show the updated `acceptedCurrencies` without manual reload. Document any sync latency over 5 seconds as a regression risk to investigate post-merge.

---

## Phase 7: Polish & Cross-Cutting

- [x] T031 [P] Run `pnpm parity:gate` from repo root. Must pass without golden-snapshot updates. If it fails, inspect the diff — the refactor was expected to be payload-shape-neutral. *(Passed via `pnpm --filter @pos-platform/store-app run parity:gate`.)*
- [ ] T032 [P] Run `pnpm lint` from repo root. Zero new violations; in particular, no new `no-restricted-imports` violations (CG-02 gate).
- [ ] T033 [P] Run `pnpm build:store` and `pnpm build:admin`. Both must succeed with zero errors.
- [x] T034 [P] Grep gate: `rg "89500" apps/admin-app/src` must return zero hits (SC-003).
- [x] T035 [P] Grep gate: `rg "'USD' \| 'LBP'|'USD'\s*\|\s*'LBP'" apps/store-app/src/services/currencyService.ts apps/store-app/src/hooks/useCurrency.ts apps/admin-app/src/components/stores/StoreForm.tsx` must return zero hits (SC-004).
- [ ] T036 [P] Grep gate: `rg "safeConvertForDatabase|getSupportedCurrencies|formatCurrencyWithSymbol|getConvertedAmount|refreshExchangeRate" apps/store-app/src --ignore-dir __tests__/legacy` must return zero hits outside the `useCurrency.ts` hook shim where some names are preserved as backward-compat exports (FR-008).
- [ ] T037 Execute every step of [quickstart.md](./quickstart.md) end-to-end as the final acceptance gate. Report any step that does not match the documented behavior.

---

## Dependencies

```
Phase 1 (Setup)  ─▶  Phase 2 (Foundational)  ─▶  ┬─▶  Phase 3 (US1 — admin)
                                                 ├─▶  Phase 4 (US2 — context formatAmount)  ─▶  Phase 6 (US4 — sync reactivity)
                                                 └─▶  Phase 5 (US3 — convert verification)
                                                                                                          │
                                                                                                          ▼
                                                                                                   Phase 7 (Polish)
```

- Phases 3, 4, and 5 are independent of each other once Phase 2 is green.
- Phase 6 depends on Phase 4 (reloadCurrencyState callback is defined there).
- Phase 7 depends on all earlier phases.

## Parallel opportunities

- **Across packages**: T011 + T012 + T014 (admin-app, US1) can run in parallel with T021–T024 (store-app, US2).
- **Within Phase 2**: T003 (test skeleton) and T004 (service rewrite) run in parallel since the test file is initially `it.todo`.
- **Within Phase 7**: T031–T036 are all independent read-only gates.

## MVP scope

**Suggested MVP = Phase 1 + Phase 2 + Phase 3 (US1)**. This lands the admin onboarding experience for non-Lebanese stores, which is the single highest-value, externally visible change. Phases 4–6 can ship as a follow-up slice once US1 has been validated in staging.

## Summary

- **Total tasks**: 37
- **Per user story**: US1 = 10 tasks (T011–T020), US2 = 5 tasks (T021–T025), US3 = 2 tasks (T026–T027), US4 = 3 tasks (T028–T030)
- **Foundational**: 8 tasks (T003–T010)
- **Setup**: 2 tasks (T001–T002)
- **Polish**: 7 tasks (T031–T037)
- **Parallelizable**: 11 tasks marked `[P]`
