# Tasks: Inventory Loss & Shrinkage

**Input**: Design documents from `/specs/019-inventory-loss-shrinkage/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/loss-operations.md, quickstart.md

**Tests**: INCLUDED — constitution CG-12 mandates Vitest coverage for every new file under `services/` and `contexts/offlineData/operations/`, and `pnpm parity:gate` for sync-critical touches. Tests here are constitutional, not optional.

**Organization**: Tasks grouped by user story (US1–US5 from spec.md) after a Foundational phase that carries the schema/accounting/sync plumbing all stories share.

All paths are relative to repo root. Store-app paths abbreviated: `SA = apps/store-app/src`.

## Phase 1: Setup

*(Existing monorepo — no project scaffolding needed. Only investigation tasks that de-risk everything downstream; these are the three "open items" from plan.md.)*

- [X] T001 Verify COGS posting timing: read `SA/services/profitLossService.ts` and `SA/services/receivedItemsJournalService.ts` to determine whether Dr 5100/Cr 1300 posts per-sale or only at bill close; document the finding + its impact on the "lot 1300 residual = 0" invariant at the top of `specs/019-inventory-loss-shrinkage/research.md` (amend R5) — FINDING: COGS never journal-posted; 1300 debited at receiving only; invariant is P&L-level
- [X] T002 [P] Pin the sale-creation inventory deduction call site: trace `SA/pages/POS.tsx` → `SA/contexts/offlineData/operations/billOperations.ts` to find where a new sale decrements inventory (NOT the edit path in saleOperations.ts:115); record file:line in research.md (amend R4) — FINDING: inline in billOperations.ts:505-527; POS weight input exists (optional) at POS.tsx:1936-1943
- [X] T003 [P] Confirm `syncService` table→event emission mechanism: read `SA/services/syncService.ts` `uploadLocalChanges()` to identify how per-table events are emitted after upload confirmation; record the registration pattern in research.md (amend R7) — FINDING: per-table if-else in syncUpload.ts:856-1019; lists in syncConfig.ts SYNC_TABLES/SYNC_TIERS

**Checkpoint**: All three unknowns pinned; Foundational work can proceed with certainty.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, types, accounting constants, sync + RBAC + audit plumbing that every story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create Supabase migration `supabase/migrations/20260702130000_inventory_loss_shrinkage.sql`: `CREATE TABLE inventory_loss_events` (all columns per data-model.md §1 incl. `_synced/_lastSyncedAt/_deleted`, CG-09), `ALTER TABLE inventory_items ADD COLUMN weight_tracked boolean NOT NULL DEFAULT false, ADD COLUMN weight_remaining numeric, ADD COLUMN nominal_unit_weight numeric`, idempotent seed of account `5950 Inventory Loss / Shrinkage` into `chart_of_accounts` for existing stores, branch-isolation RLS policies (CG-06), and indexes on `(store_id, branch_id)`, `inventory_item_id`, `batch_id`
- [X] T005 Bump Dexie schema in `SA/lib/dbSchema.ts`: set `CURRENT_DB_VERSION = 71`, add `V71_STORES` with the `inventory_loss_events` store string from data-model.md §1 (existing stores carried forward unchanged)
- [X] T006 Add `this.version(71).stores(V71_STORES).upgrade(upgradeV71)` in `SA/lib/db.ts` with `upgradeV71` backfilling existing `inventory_items`: `weight_tracked=false`, `weight_remaining=weight ?? null`, `nominal_unit_weight = (weight && received_quantity>0) ? weight/received_quantity : null`
- [X] T007 [P] Add types in `SA/types/index.ts`: extend `InventoryItem` with `weight_tracked?: boolean; weight_remaining?: number | null; nominal_unit_weight?: number | null`; add `InventoryLossEvent` interface (all fields per data-model.md §1); add `'record_inventory_loss' | 'reverse_inventory_loss'` to `OperationName`
- [X] T008 [P] Add `inventory_loss_events` table types + new `inventory_items` columns to `SA/types/database.ts` (mirror the Supabase migration; regenerate via Supabase CLI if available, else hand-add following existing table shapes)
- [X] T009 [P] Add account `{ account_code: '5950', account_name: 'Inventory Loss / Shrinkage', account_type: 'expense', requires_entity: false, is_active: true }` to `DEFAULT_CHART_OF_ACCOUNTS` in `SA/constants/chartOfAccounts.ts`
- [X] T010 [P] Add `INVENTORY_LOSS: 'Inventory Loss / Shrinkage'` to `TRANSACTION_CATEGORIES` and map it to `TRANSACTION_TYPES.EXPENSE` in `CATEGORY_TO_TYPE_MAP` in `SA/constants/transactionCategories.ts`
- [X] T011 [P] Add mapping `[TRANSACTION_CATEGORIES.INVENTORY_LOSS]: { debitAccount: '5950', creditAccount: '1300', description: 'Inventory loss / shrinkage recorded', requiresEntity: false, defaultEntityCode: SYSTEM_ENTITY_CODES.INTERNAL }` in `SA/utils/accountMapping.ts`
- [X] T012 [P] Add `'inventory_loss_recorded' | 'inventory_loss_reversed'` to `AuditAction` in `SA/services/auditLogService.ts`
- [X] T013 [P] Grant `record_inventory_loss` and `reverse_inventory_loss` to `admin` and `manager` role arrays in `SA/services/rolePermissionService.ts` (isOperationAllowed defaults, ~line 175-215)
- [X] T014 [P] Add `emitInventoryLossPosted(storeId, branchId, entityId, userId?, metadata?)` to `SA/services/eventEmissionService.ts` with `event_type: 'inventory_loss_posted'`, mirroring `emitInventoryReceived` (lines 116-133); entity_type `'transaction'` for owned, `'inventory_loss_event'` for commission memo
- [X] T015 Register `inventory_loss_events` as a Tier-2 sync table in `SA/services/syncService.ts` (upload ordering, download/catch-up, deletion detection) and wire `emitInventoryLossPosted` into `uploadLocalChanges()` AFTER batch upload confirmation per the mechanism pinned in T003 (CG-03 upload-then-emit; depends on T003, T014)
- [X] T016 Create `SA/contexts/offlineData/useLossDataLayer.ts`: hydrate `lossEvents: InventoryLossEvent[]` from Dexie scoped by `[store_id+branch_id]`, expose `upsertLossEvents` surgical merge (mirror `useTransactionDataLayer`)
- [X] T017 Extend `SA/contexts/offlineData/offlineDataContextContract.ts`: add `'losses'` to `RefreshDomain`; add `lossEvents`, `recordInventoryLoss`, `reverseInventoryLoss`, `getLotCloseReconciliation`, `reconcileAndCloseLosses` signatures per contracts/loss-operations.md §3
- [X] T018 Create `SA/contexts/offlineData/operations/lossOperations.ts` skeleton: `LossOperationDeps`, `RecordLossParams`, `RecordLossResult`, `ReverseLossParams`, `LotCloseReconciliation`, `CloseClassification` types per contracts/loss-operations.md §1-2, with stub exports (story phases fill the bodies); include shared helpers `getLotById`, `isCommissionLot(bill)`, `computeLossValue(lot, {quantity?, weight?})` using the single cost basis rule (per-weight for weight_tracked, per-unit otherwise)
- [X] T019 Wire loss operations into `SA/contexts/OfflineDataContext.tsx`: `lossOperationDepsRef` (useRef, populated each render with storeId/branch/inventory/inventoryBills/refreshData/upsertTransactions/updateUnsyncedCount/debouncedSync/i18n/language per the paymentOperations pattern at lines 901-944), `useCallback` delegates, expose on context value, mount `useLossDataLayer`, and handle `'losses'` in `refreshData(scope)`
- [X] T020 Add i18n keys to `SA/i18n/locales/en.ts`, `SA/i18n/locales/ar.ts`, `SA/i18n/locales/fr.ts`: loss reasons (shrinkage/lost/spoiled), "Report Loss", modal labels, close-reconciliation strings ("unaccounted units", "shrinkage", "classify to close"), transaction description templates (CG-10)

**Checkpoint**: Schema + accounting + sync + context plumbing ready — user stories can begin (US1/US2 in parallel).

---

## Phase 3: User Story 1 — Automatic weight shrinkage at bill close (Priority: P1) 🎯 MVP

**Goal**: Weight-tracked lots require weight at every sale, live-decrement `weight_remaining` visibly, and their leftover weight is booked automatically as shrinkage (Dr 5950/Cr 1300, or memo for commission) when the bill closes — zeroing the owned lot's inventory value.

**Independent Test**: quickstart.md scenario A — receive 100 kg weight-tracked lot, sell 95 kg, close bill, verify 5 kg shrinkage loss event + balanced journal + lot residual value 0.

### Implementation for User Story 1

- [X] T021 [US1] Add weight-tracked toggle to the receiving flow (`SA/pages/Inventory.tsx` and/or its receive form component): explicit toggle per received line, pre-defaulted from the item's unit measurement type (`units_of_measure.system_role === 'mass'` ⇒ on), operator-overridable, immutable after save (FR-001); on save set `weight_tracked`, `weight_remaining = weight`, `nominal_unit_weight = weight / received_quantity`
- [X] T022 [US1] Add per-lot dual-decrement helper `deductFromLot(inventoryItemId, { quantity, weight })` (and matching `restoreToLot`) in `SA/contexts/offlineData/operations/inventoryItemOperations.ts` — targets the exact lot, decrements `quantity` and (when weight_tracked) `weight_remaining`, clamps at 0, sets `_synced:false`; do NOT route weight lots through the FIFO `deductInventoryQuantity` (R4)
- [X] T023 [US1] Enforce mandatory weight + dual decrement at the sale-creation path pinned in T002 (`SA/pages/POS.tsx` + `SA/contexts/offlineData/operations/billOperations.ts`): if the sold lot has `weight_tracked`, reject the line without `weight > 0` (FR-002), record both units and weight on the `bill_line_items` row, call `deductFromLot` (FR-004); quantity-only lots keep current behavior with weight input hidden (FR-003)
- [X] T024 [US1] Show live remaining weight (and remaining units) for weight-tracked lots in the POS product/lot selection UI in `SA/pages/POS.tsx` (FR-004 visibility)
- [X] T025 [US1] Apply mandatory-weight + per-lot dual decrement/restore to the sale EDIT/DELETE paths in `SA/contexts/offlineData/operations/saleOperations.ts` (lines ~91-122: replace product-FIFO deduct/restore with `deductFromLot`/`restoreToLot` via `inventory_item_id` for weight lots; weight edits adjust `weight_remaining` by the delta)
- [X] T026 [US1] Implement auto-shrinkage in `SA/contexts/offlineData/operations/lossOperations.ts`: `reconcileAndCloseLosses` weight branch — for each weight-tracked lot of the bill compute `residualShrinkageWeight = weight_remaining − Σ(classified units × nominal_unit_weight)`; if > 0 create loss event `{reason:'shrinkage', source:'auto_close', weight, unit_cost, loss_value, is_commission}`; owned ⇒ `transactionService.createTransaction({ category: INVENTORY_LOSS, amount: loss_value, currency: lot currency, skipCashDrawerImpact: true, updateCashDrawer: false, metadata:{ lossEventId, inventoryItemId, batchId, reason } })` and stamp `transaction_id`; commission ⇒ memo (`transaction_id: null`); zero out `weight_remaining`; never book negative shrinkage — flag anomaly instead (edge case); post-write: `upsertTransactions`, `refreshData(['inventory','transactions','losses'])`, `updateUnsyncedCount(+n)`, `debouncedSync()`
- [X] T027 [US1] Implement `getLotCloseReconciliation(billId)` in `SA/contexts/offlineData/operations/lossOperations.ts` returning `LotCloseReconciliation[]` per contracts §2 (received/sold/recorded-losses/unaccounted units, residual shrinkage weight + estimated value per lot)
- [X] T028 [US1] Integrate into the close flow: extend `SA/components/accountingPage/tabs/receivedBills/ReceivedBillSalesLogsModal.tsx` with a pre-close reconciliation panel showing per-lot computed shrinkage (FR-007), and call `reconcileAndCloseLosses` from `handleCloseReceivedBill` in `SA/pages/Accounting.tsx` BEFORE the status→CLOSED update, aborting the close if it fails
- [X] T029 [P] [US1] Vitest in `SA/contexts/offlineData/operations/lossOperations.test.ts`: shrinkage computed & valued correctly on close (success), fully-sold lot books nothing, commission lot books memo without transaction, negative-shrinkage anomaly is not booked (failure path), and — per T001's finding — the "owned lot 1300 residual = 0" invariant (received value = Σ COGS + Σ losses) (CG-12, SC-001)

**Checkpoint**: US1 fully functional — MVP. Weight lots are honest end-to-end.

---

## Phase 4: User Story 2 — Record lost or spoiled stock manually (Priority: P2)

**Goal**: Operators report Lost/Spoiled units against a specific lot from the inventory view anytime; on-hand drops immediately and owned losses hit the books.

**Independent Test**: quickstart.md scenario B — report 3 of 20 boxes Spoiled, verify on-hand 17, loss event + Dr 5950/Cr 1300 for 3×unit cost, audit entry; 6-of-4 rejected.

### Implementation for User Story 2

- [X] T030 [US2] Implement `recordInventoryLoss(deps, params)` in `SA/contexts/offlineData/operations/lossOperations.ts`: RBAC check via `accessControlService` (`record_inventory_loss`), validate `quantity > 0 && ≤ lot.quantity` (FR-010), decrement lot `quantity` via `deductFromLot` — for weight-tracked lots also remove `quantity × nominal_unit_weight` from `weight_remaining` (FR-009, no later double-count) — create loss event `{reason: params.reason, source:'manual'}`, owned ⇒ `createTransaction` (same shape as T026) / commission ⇒ memo, audit via `auditService.record({ entityType:'inventory_loss', action:'inventory_loss_recorded', ... })` (FR-022), post-write sequence as T026
- [X] T031 [US2] Create `SA/components/inventory/ReportLossModal.tsx`: reason picker (Lost/missing | Spoiled/wasted), unit quantity input (max = on-hand), optional notes, loss-value preview (`quantity × unit cost`), commission notice ("recorded as note — supplier's loss"), confirm; multilingual labels (CG-10); calls `useOfflineData().recordInventoryLoss`
- [X] T032 [US2] Add "Report Loss" action per lot in `SA/pages/Inventory.tsx` opening `ReportLossModal`, visible/enabled only for users passing `record_inventory_loss` (CG-07) and lots with on-hand > 0
- [X] T033 [P] [US2] Extend `SA/contexts/offlineData/operations/lossOperations.test.ts`: manual loss success (qty decremented, transaction posted, audit recorded), over-quantity rejection, commission memo path, weight-lot proportional-weight removal (CG-12)

**Checkpoint**: US1 + US2 independently functional.

---

## Phase 5: User Story 3 — Count reconciliation blocks bill close (Priority: P2)

**Goal**: A bill cannot close while any lot has unaccounted units; the operator classifies each remainder as Lost or Spoiled in the close modal, which records the losses and zeroes the lots.

**Independent Test**: quickstart.md scenario C — 100 received / 95 sold, close blocked showing 5 unaccounted; classify 5 Spoiled → close succeeds, on-hand 0.

### Implementation for User Story 3

- [X] T034 [US3] Complete the classification branch of `reconcileAndCloseLosses` in `SA/contexts/offlineData/operations/lossOperations.ts`: validate every lot with `unaccountedUnits > 0` has a `CloseClassification` with `lostUnits + spoiledUnits === unaccountedUnits` (else return blocking error, FR-011), record the classified losses via the T030 logic (`source:'manual'`, close-context), then run the T026 weight branch; the whole close aborts if any step fails
- [X] T035 [US3] Add the classification UI to `SA/components/accountingPage/tabs/receivedBills/ReceivedBillSalesLogsModal.tsx`: per-lot "unaccounted units" rows with Lost/Spoiled split inputs, close button disabled until every gap is fully classified (FR-011/FR-012), RBAC-gated (`record_inventory_loss`), fully-accounted bills show no prompt (US3 scenario 3)
- [X] T036 [P] [US3] Extend `SA/contexts/offlineData/operations/lossOperations.test.ts`: close blocked with unclassified gap, close succeeds after classification (losses recorded, on-hand 0), fully-accounted bill closes without prompt, partial classification (3 lost + 2 spoiled of 5) records two loss events (CG-12, SC-003)

**Checkpoint**: Closing a bill now guarantees received = sold + losses on every lot.

---

## Phase 6: User Story 4 — Reverse a loss recorded by mistake (Priority: P3)

**Goal**: Any loss can be reversed once: stock restored, accounting reversed, both records visible.

**Independent Test**: quickstart.md scenario E — reverse an owned loss: stock restored, reversing Dr 1300/Cr 5950 posted, original marked reversed, second attempt rejected.

### Implementation for User Story 4

- [X] T037 [US4] Implement `reverseInventoryLoss(deps, { lossEventId })` in `SA/contexts/offlineData/operations/lossOperations.ts`: RBAC (`reverse_inventory_loss`), reject if `status === 'reversed'` (FR-018), restore lot `quantity` and/or `weight_remaining` via `restoreToLot`, owned ⇒ `createTransaction({ is_reversal: true, reversal_of_transaction_id, category: INVENTORY_LOSS, ... })`, create linked reversal loss row + set original `status:'reversed'`/`reversed_by_id` (R10), audit `'inventory_loss_reversed'` (FR-022), post-write sequence as T026; works for closed bills (edge case)
- [X] T038 [US4] Add a loss-events history view with Reverse action: new `SA/components/inventory/LossEventsList.tsx` (date, product, lot, reason chip, qty/weight, value, status, reversed-by link, Reverse button with confirm) surfaced as a tab/section in `SA/pages/Inventory.tsx`; RBAC-gated; multilingual
- [X] T039 [P] [US4] Extend `SA/contexts/offlineData/operations/lossOperations.test.ts`: reversal restores stock + posts reversing entry + lineage set, double-reversal rejected, commission-memo reversal restores stock with no transaction (CG-12, SC-007)

**Checkpoint**: Corrections safe — no deletes, full trail.

---

## Phase 7: User Story 5 — Loss reporting (Priority: P3)

**Goal**: Managers see total loss and breakdowns by reason / product / supplier-bill for any period; losses appear as their own expense line.

**Independent Test**: quickstart.md — record mixed-reason losses across bills, open the report, verify totals reconcile to the loss records and 5950 appears separately on financial reports.

### Implementation for User Story 5

- [X] T040 [US5] Create `SA/services/lossReportService.ts`: `getLossReport({from, to, branchId?})` aggregating **active** `inventory_loss_events` client-side from Dexie (CG-05) by reason/product/bill, period bucketing via `getLocalDateString` (CG-11), returning `LossReportRow[]` per contracts §6; include totals and a shrinkage-% helper (loss value ÷ received value of closed bills in period)
- [X] T041 [US5] Create `SA/components/reports/LossReport.tsx` (period picker, totals cards per reason, breakdown tables by product and by supplier/bill, commission losses shown as memo rows excluded from expense totals) and register it in `SA/pages/Reports.tsx` under `<ProtectedRoute>`/report permissions (CG-07)
- [X] T042 [US5] Verify account 5950 flows into the existing income-statement/balance-sheet outputs (spec FR-015): check the accounting report services (`SA/services/reportingService.ts`, balance-sheet feature 018 outputs) treat 5950 as a distinct expense line and do NOT bundle it into COGS; adjust labels/grouping if needed
- [X] T043 [P] [US5] Vitest in `SA/services/lossReportService.test.ts`: period filtering + reason/product/bill aggregation correct, reversed losses excluded, commission memo rows excluded from owned-expense totals, report total equals Σ loss records (CG-12, SC-005, SC-008)

**Checkpoint**: All five stories functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T044 Run `pnpm parity:gate` from `apps/store-app/` and fix any golden-snapshot drift (MANDATORY — syncService/eventEmissionService/transactionService/operations touched, CG-12)
- [X] T045 Run `pnpm test:run` (all Vitest) and `pnpm lint` across the workspace; fix regressions introduced by this feature
- [X] T046 [P] Verify i18n completeness: every new key present in all three of `SA/i18n/locales/{en,ar,fr}.ts`, RTL rendering of the new modals/panels checked in Arabic (CG-10)
- [ ] T047 [P] Offline validation per quickstart.md scenario F: record losses + close a bill offline, confirm rows appear in `SA/pages/UnsyncedItems.tsx`, reconnect, verify upload-then-emit ordering and cross-device catch-up of `inventory_loss_events`
- [ ] T048 Execute all quickstart.md manual scenarios A–F end-to-end in `pnpm dev:store` and check off against spec.md acceptance scenarios (SC-001…SC-008)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — T001/T002/T003 can all run in parallel
- **Foundational (Phase 2)**: T004→(T005→T006); T007–T014 parallel after T004; T015 needs T003+T014; T016–T019 sequential-ish (T017 before T019; T018 before T19); T020 parallel — **BLOCKS all stories**
- **US1 (Phase 3)**: after Phase 2; T021/T022 parallel → T023 (needs T002+T022) → T024, T025; T026→T027→T028; T029 after T026
- **US2 (Phase 4)**: after Phase 2 (+T022 from US1 for `deductFromLot` — or lift T022 into Phase 2 if US2 is built first)
- **US3 (Phase 5)**: after US1 T026/T027 (shares `reconcileAndCloseLosses`) and US2 T030 (classification records manual-style losses)
- **US4 (Phase 6)**: after US2 T030 (reverses what it creates); reversal of shrinkage additionally after US1
- **US5 (Phase 7)**: after any losses exist (US1 or US2); T042 independent
- **Polish (Phase 8)**: after all desired stories

### Story dependency graph

```
Phase 2 ─┬─▶ US1 (P1, MVP) ─┬─▶ US3 (P2, needs US1+US2)
         └─▶ US2 (P2) ──────┤
                            ├─▶ US4 (P3, needs US2; full coverage after US1)
                            └─▶ US5 (P3, needs US1 or US2 data)
```

### Parallel opportunities

- Phase 1: T001 ∥ T002 ∥ T003
- Phase 2: after T004 — T007 ∥ T008 ∥ T009 ∥ T010 ∥ T011 ∥ T012 ∥ T013 ∥ T014 ∥ T020
- US1 ∥ US2 after Phase 2 (different primary files; coordinate on lossOperations.ts if simultaneous)
- All test tasks marked [P] parallel with sibling UI tasks
- US4 ∥ US5 once US1+US2 land

## Parallel Example: Phase 2 fan-out

```bash
# After T004 (migration) completes, launch together:
Task: "T007 types/index.ts additions"
Task: "T009 chartOfAccounts 5950"
Task: "T010 transactionCategories INVENTORY_LOSS"
Task: "T011 accountMapping 5950/1300"
Task: "T012 auditLogService actions"
Task: "T013 rolePermissionService grants"
Task: "T014 eventEmissionService emitter"
Task: "T020 i18n keys en/ar/fr"
```

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + US1.** That alone makes weight lots honest (mandatory weight, live remaining, auto-shrinkage, zeroed inventory) and is independently shippable/demoable per quickstart scenario A.

Then incremental: US2 (manual losses) → US3 (close blocking — completes the "everything accounted for" guarantee) → US4 (reversals) → US5 (reporting). Each checkpoint is independently testable; stop and validate at every one. Commit after each task or logical group; run T044/T045 gates before merge.

## Notes

- Total: **48 tasks** (US1: 9, US2: 4, US3: 3, US4: 3, US5: 4, Setup: 3, Foundational: 17, Polish: 5)
- `lossOperations.ts` is shared across US1–US4 — if stories run in parallel across developers, land T018 (skeleton) first and merge story branches through it carefully
- Constitution gates baked into tasks: CG-03 (T015), CG-04 (T026/T030/T037), CG-09 (T004–T006), CG-10 (T020/T046), CG-11 (T040), CG-12 (T029/T033/T036/T039/T043/T044)
