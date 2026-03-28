  # Tasks: Cash Drawer Sync & Balance Correctness

**Input**: Design documents from `specs/002-cash-drawer-sync-balance/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to — maps to spec.md priorities
- No tests requested — no test tasks generated

## Path Conventions

All paths are relative to `apps/store-app/src/` unless shown in full.

---

## Phase 1: Setup

> **No setup tasks required.** This feature consists entirely of targeted edits to existing files. No new files, no new dependencies, no schema migrations. All required Dexie indexes exist in schema v54. The new event type is a string value in the existing `branch_event_log.event_type` column.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Three atomic single-location fixes that unblock correctness for multiple user stories. All three are independent and can run in parallel.

**⚠️ CRITICAL**: Complete all three before beginning any user story phase — they correct the data primitives every other fix depends on.

- [x] T001 [P] Fix NaN arithmetic in `calculateBothCurrencies` and `calculateExpectedCashInSession` — add `|| 0` guards to all four currency fields (`debit_usd`, `credit_usd`, `debit_lbp`, `credit_lbp`) in `apps/store-app/src/utils/balanceCalculation.ts` (lines 44–51 and 302–303)
- [x] T002 [P] Sort open sessions deterministically — after filtering for `status === 'open'` in `getCurrentCashDrawerSession`, add `.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())` before returning `open[0]` in `apps/store-app/src/lib/db.ts` (line 531)
- [x] T003 [P] Stop seeding stale remote balance on first boot — change `current_balance: remoteAccount.current_balance || 0` to `current_balance: 0` in `ensureCashDrawerAccountsSynced` in `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` (line 130)

**Checkpoint**: Foundation ready — all balance arithmetic is NaN-safe, session selection is deterministic, and newly seeded accounts start from 0.

---

## Phase 3: User Story 1 — Live Balance After Each Transaction (Priority: P1) 🎯 MVP

**Goal**: The cash drawer balance on the primary device updates within 1 second of every transaction, without any page reload or manual refresh.

**Independent Test**: Open a session with $100. Record a $25 sale. Verify the displayed balance shows $125 within 1 second — no reload required. Open a session and immediately view the balance — it must show the opening float, not a stale value.

- [x] T004 [US1] Invalidate both balance cache keys immediately after a journal entry is written — import `CacheManager` and `CacheKeys` into `apps/store-app/src/services/journalService.ts` and call `CacheManager.invalidate(CacheKeys.balance(storeId, branchId))` and `CacheManager.invalidate(`${CacheKeys.balance(storeId, branchId)}_both`)` at the end of `createJournalEntry()`, after the entries are successfully written to IndexedDB
- [x] T005 [P] [US1] Reduce balance cache TTL from `CacheManager.TTL.LONG` (30 s) to `CacheManager.TTL.SHORT` (1 s) in both `getCurrentCashDrawerBalance` and `getCurrentCashDrawerBalances` in `apps/store-app/src/services/cashDrawerUpdateService.ts` (lines 234 and 288)
- [x] T006 [US1] Eliminate the frozen-opening-float bug — in `openCashDrawer` in `apps/store-app/src/contexts/offlineData/useCashDrawerDataLayer.ts`, after the `setCashDrawer({ currentBalance: amount, ... })` call (line ~70), immediately `await refreshCashDrawerStatus()` so the live-calculated balance replaces the opening-float placeholder before any component reads it

**Checkpoint**: User Story 1 complete. Open a session → record several transactions → balance updates live within 1 second on the same device.

---

## Phase 4: User Story 2 — Consistent Balance Across All Screens (Priority: P1)

**Goal**: Every screen (Home, POS, Accounting) shows the same balance for the same session at the same time. Achieved by replacing the all-time calculation model with the session-scoped model in all display paths.

**Independent Test**: Open a session, record a $30 transaction. Navigate between Home, POS, and Accounting screens — all must show the same total without discrepancy.

- [x] T007 [US2] Replace the all-time balance model with the session-scoped canonical model in `getCurrentCashDrawerBalance` in `apps/store-app/src/contexts/OfflineDataContext.tsx` (lines 434–444): (1) change the account query from `.where('store_id').equals(sid)` to `.where('[store_id+branch_id]').equals([sid, currentBranchId])` to fix the multi-branch isolation gap (bug 7.4), and (2) replace `calculateCashDrawerBalance(sid, currentBranchId, acctCurrency)` with a call to `cashDrawerUpdateService.getCurrentCashDrawerBalances(sid, currentBranchId)` returning the value for the account's currency — this makes the context's singular balance method use the same session-scoped formula as Home and `CurrentCashDrawerStatus`
- [x] T008 [US2] Replace the all-time balance model in `getCurrentCashDrawerStatus` in `apps/store-app/src/lib/db.ts` (line 749): replace `const currentBalance = await calculateCashDrawerBalance(storeId, branchId, currency)` with a call to `cashDrawerUpdateService.getCurrentCashDrawerBalances(storeId, branchId)`, then select `USD` or `LBP` based on `account.currency`. To avoid a circular import (`db.ts` → `cashDrawerUpdateService` → `db.ts`), inline the session-scoped query logic directly in `getCurrentCashDrawerStatus` (same logic used in `cashDrawerUpdateService.getCurrentCashDrawerBalances`) rather than importing the service

**Checkpoint**: User Story 2 complete. All screens show the same balance. `getCurrentCashDrawerBalance`, `getCurrentCashDrawerBalances`, and `getCurrentCashDrawerStatus` all produce the same session-scoped result.

---

## Phase 5: User Story 3 — Correct Balance on a Second Device (Priority: P2)

**Goal**: A second device connected to the same branch reflects the balance from the primary device within 30 seconds of each transaction — without a manual sync.

**Independent Test**: On Device A post a cash sale. On Device B (same branch, no manual sync), verify the balance widget updates within 30 seconds. Check `branch_event_log` in Supabase for a row with `event_type = 'cash_drawer_transaction_posted'`.

- [x] T009 [US3] Add `emitCashDrawerTransactionPosted` method to `apps/store-app/src/services/eventEmissionService.ts` — follow the existing pattern of `emitCashDrawerSessionOpened` (lines 194–212); the new method takes `(storeId, branchId, transactionId, category, userId?)` and calls `this.emitEvent({ event_type: 'cash_drawer_transaction_posted', entity_type: 'transaction', entity_id: transactionId, operation: 'insert', metadata: { category, branch_id: branchId }, ... })`
- [x] T010 [US3] Wire the new event into the sync upload path in `apps/store-app/src/services/syncService.ts` — in `uploadLocalChanges()`, in the `transactions` table batch upload handler (after the batch is confirmed uploaded), filter the uploaded rows for cash-drawer-affecting categories (`category.startsWith('cash_drawer_')` or known cash-impacting categories such as `supplier_payment`, `customer_payment`, `employee_payment`) and call `eventEmissionService.emitCashDrawerTransactionPosted(tx.store_id, tx.branch_id, tx.id, tx.category, tx.created_by)` for each — follow the same pattern used by `emitSalePosted` and `emitPaymentPosted` calls in the same file

**Checkpoint**: User Story 3 complete. Device B's balance widget reflects Device A's transactions within ~30 seconds via the new `cash_drawer_transaction_posted` Realtime event.

---

## Phase 6: User Story 4 — Correct Balance After Returning Online (Priority: P2)

**Goal**: After a device comes back online and syncs, the cash drawer balance reflects all offline-recorded transactions and never temporarily shows zero due to tables arriving in the wrong order.

**Independent Test**: Go offline, record 3 transactions. Come back online, trigger sync. Immediately after sync completes the balance must show the correct cumulative total — not zero.

- [x] T011 [US4] Fix sync download race — in `SYNC_DEPENDENCIES` in `apps/store-app/src/services/syncService.ts` (lines 93–102), add `'cash_drawer_sessions'` to the dependency array for `'journal_entries'`: change `'journal_entries': ['stores', 'entities', 'chart_of_accounts', 'bills']` to `'journal_entries': ['stores', 'entities', 'chart_of_accounts', 'bills', 'cash_drawer_sessions']` — this ensures sessions are downloaded before journal entries so the session window is always available when `getCurrentCashDrawerBalances` is called after sync

**Checkpoint**: User Story 4 complete. After offline→online sync, balance resolves to the correct amount without a temporary zero state.

---

## Phase 7: User Story 5 — Correct Balance Per Branch in Multi-Branch Stores (Priority: P2)

**Goal**: Each branch displays only its own cash balance. No cross-branch data contamination.

**Independent Test**: In a two-branch store, view the cash drawer for Branch A then Branch B. Each must show its own balance in its own currency with no data from the other branch.

> ✅ **Resolved by T007** — the account query fix in `OfflineDataContext.tsx` adds the `[store_id+branch_id]` filter that prevents cross-branch account lookup. No additional tasks required for this story.

**Checkpoint**: User Story 5 complete after T007. Verify by switching branches and confirming isolated balances.

---

## Phase 8: User Story 6 — Balance Never Displays as Broken (Priority: P3)

**Goal**: The balance always shows a valid number. LBP-only transactions must not produce NaN in the USD balance field.

**Independent Test**: Record a transaction with LBP amount only (no USD). Verify the USD balance shows `0.00` or its prior value — not `NaN` or blank.

> ✅ **Resolved by T001** — the `|| 0` guards added to `calculateBothCurrencies` in `balanceCalculation.ts` are the sole fix. No additional tasks required for this story.

**Checkpoint**: User Story 6 complete after T001.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: UI closed-state display, legacy polling removal, and i18n correctness.

- [x] T012 Verify and fix the "Closed" state display in `apps/store-app/src/components/CurrentCashDrawerStatus.tsx` — when `cashDrawer === null` (no active session), confirm the component renders a "Closed" status label and an "Open Cash Drawer" action button rather than a `$0.00` balance; if it already does this correctly, no code change is needed; if not, add the null-session branch with the correct UI
- [x] T013 Remove the `setInterval` cash drawer polling in `apps/store-app/src/pages/Home.tsx` — delete the `setInterval(() => loadCashDrawerStatus(), 60000)` interval (and its `clearInterval` cleanup), and replace `loadCashDrawerStatus` calls with reactive reads from `useOfflineData().cashDrawer`; the balance is already kept fresh by the cache-invalidation + post-CRUD `refreshData()` chain from T004–T006 *(already satisfied: no `setInterval` polling in current `Home.tsx`)*
- [x] T014 [P] Audit i18n locale files for any new user-facing strings introduced by T012 — if any new display strings are needed (e.g., "Cash Drawer Closed"), add matching keys to `apps/store-app/src/i18n/en.json`, `apps/store-app/src/i18n/ar.json`, and `apps/store-app/src/i18n/fr.json` using `createMultilingualFromString()` / `getTranslatedString()` per CG-10 *(added `cashDrawer.closedStatus` in `locales/en.ts`, `locales/ar.ts`, and `locales/fr.ts`)*

**Final Checkpoint**: Run the full quickstart.md manual test checklist to validate all 6 user stories end-to-end.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 2 (Foundational)   → No dependencies — start immediately
  ↓
Phase 3 (US1 - P1)       → Depends on Phase 2 (T001, T002 specifically)
  ↓
Phase 4 (US2 - P1)       → Depends on Phase 3 (T004, T005 must be complete for cache to work)
  ↓
Phase 5 (US3 - P2)  ─┐
Phase 6 (US4 - P2)  ─┤ → All depend on Phase 4 completion; can run in parallel with each other
Phase 7 (US5 - P2)  ─┘   (US5 is already done by T007 in Phase 4)
  ↓
Phase 8 (US6 - P3)       → Already done by T001 in Phase 2
  ↓
Phase 9 (Polish)          → Depends on all story phases
```

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational (T001, T002). No dependency on other stories.
- **US2 (P1)**: Depends on US1 (T004, T005 must be done so cache TTL + invalidation work when model is switched).
- **US3 (P2)**: Depends on Phase 4 completion only. Independent of US4/US5/US6.
- **US4 (P2)**: Depends on Phase 4 completion only. Independent of US3/US5/US6.
- **US5 (P2)**: Fully resolved by T007 (Phase 4). No separate implementation.
- **US6 (P3)**: Fully resolved by T001 (Phase 2). No separate implementation.

### Within Each Phase

- All `[P]`-tagged tasks in the same phase touch different files and can execute in parallel.
- T004 (cache invalidation in journalService) must complete before T005 (TTL reduction) is verified — both must exist for the 1-second update to work reliably.
- T007 and T008 both touch the balance display path — T007 must complete before T008 so both display paths are aligned.
- T009 (new event method) must complete before T010 (wire into sync) can reference it.

---

## Parallel Opportunities

### Phase 2 (all three run together)

```
T001: Fix NaN guards in balanceCalculation.ts
T002: Sort sessions in db.ts
T003: Seed current_balance:0 in useOfflineInitialization.ts
```

### Phase 3 (T005 runs in parallel with T004→T006 sequence)

```
T005: Reduce cache TTL in cashDrawerUpdateService.ts     ← parallel
T004: Add cache invalidation to journalService.ts        ← then
T006: Call refreshCashDrawerStatus in useCashDrawerDataLayer.ts ← depends on T004+T005
```

### Phases 5 + 6 (after Phase 4 completes)

```
T009→T010: New event (eventEmissionService + syncService)  ← US3
T011: Sync dependency order (syncService)                  ← US4
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only — highest user impact)

1. Complete **Phase 2** (Foundational — T001, T002, T003)
2. Complete **Phase 3** (US1 — T004, T005, T006)
3. Complete **Phase 4** (US2 — T007, T008)
4. **STOP AND VALIDATE**: Balance updates live, all screens show same value, multi-branch isolated
5. This alone resolves the core reported bug ("balance doesn't reflect correct amount after transactions")

### Incremental Delivery

| Milestone | Tasks | Delivers |
|---|---|---|
| Foundation | T001–T003 | NaN-safe, deterministic session, clean seed |
| MVP Live Balance | T004–T006 | US1: updates within 1s |
| Full Screen Consistency | T007–T008 | US2+US5: same value everywhere, per-branch correct |
| Real-Time Second Device | T009–T010 | US3: 30-second cross-device updates |
| Offline Reconnect | T011 | US4: no zero-balance after sync |
| Polish | T012–T014 | Closed state UI, no polling, i18n |

### Summary

| Metric | Value |
|---|---|
| Total tasks | 14 |
| Phase 2 (Foundational) | 3 tasks |
| Phase 3 US1 (P1) | 3 tasks |
| Phase 4 US2 (P1) | 2 tasks |
| Phase 5 US3 (P2) | 2 tasks |
| Phase 6 US4 (P2) | 1 task |
| Phase 7 US5 (P2) | 0 tasks (resolved by T007) |
| Phase 8 US6 (P3) | 0 tasks (resolved by T001) |
| Phase 9 Polish | 3 tasks |
| Parallel opportunities | 6 identified |
| Files touched | 9 existing files, 0 new files |
| Schema changes | None |

---

## Notes

- `[P]` tasks touch different files — safe to run concurrently
- US5 and US6 require zero additional tasks beyond what earlier phases already deliver
- No test tasks generated (not requested in spec)
- Commit after each phase checkpoint for clean rollback points
- The biggest risk (circular import in T008) is mitigated by inlining the session-scoped query directly in `db.ts` rather than importing `cashDrawerUpdateService`
