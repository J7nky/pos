# Phase 0 Research: Inventory Loss & Shrinkage

Feature branch: `019-inventory-loss-shrinkage`. This document records the design decisions that resolve the technical unknowns, each grounded in the current codebase (citations are `file:line`).

## Setup investigation findings (T001–T003, 2026-07-02)

- **T001 (amends R5)** — COGS is **never journal-posted**. `Dr 1300` happens at receiving only (`receivedItemsJournalService.ts:253-265`: cash → Cr 1100, credit → Cr 2100, commission → **no entry**). Sales decrement `inventory_items.quantity` with **no** journal relief of 1300; COGS is a computed P&L figure stored on the bill at close (`profitLossService.ts:55-246`; commission bills hardcode `cogs = 0` at :180-182). **Implication**: the loss posting Dr 5950 / Cr 1300 is the only journal movement relieving 1300, mirroring how the asset was built. The "lot residual = 0" invariant (FR-006) is a **P&L-level identity** — received value = stored COGS + loss events — validated in tests as such, NOT as a journal-balance assertion. Loss values must stay OUT of the close-time COGS figure (separate expense line, FR-015).
- **T002 (amends R4)** — the sale-creation deduction is **inline in `billOperations.ts:505-527`** inside the `createBill` transaction (bulkPut of decremented quantities, keyed off the line items) — already per-lot. POS already has an optional weight input (`POS.tsx:1936-1943` → `lineItemsData` weight at :1150). Work needed: make weight mandatory for weight-tracked lots and add `weight_remaining` decrement in that same createBill block; `saleOperations.ts` edit/delete paths adjusted likewise.
- **T003 (amends R7)** — upload-then-emit lives in **`syncUpload.ts:856-1019`** as per-table if-else blocks after each confirmed batch upsert (NOT in syncService.ts directly). Upload ordering: `SYNC_TABLES` (`syncConfig.ts:29-65`); hydration waves: `SYNC_TIERS` (`syncConfig.ts:72-106`, tier2 for business data). Registration of `inventory_loss_events` = add to both syncConfig lists + a new if-block in syncUpload.ts emitting `inventory_loss_posted` + extend the event-stream catch-up entity_type→table handling in `eventStreamService.ts`.

---

## R1 — New loss ledger table vs. reusing existing tables

**Decision**: Introduce a dedicated, lot-scoped, append-style table `inventory_loss_events` (Dexie + Supabase) rather than overloading `missed_products`, `transactions`, or a flag on `inventory_items`.

**Rationale**: Loss is an auditable event with reason/source/value/lineage that must be queried and reported independently. `missed_products` (`services/missedProductsService.ts`) models physical-count variance in a cash-drawer session — a different concept. `inventory_items` mutates in place with no movement history, so it cannot record *why* stock left. A first-class table is the missing movement ledger.

**Alternatives considered**: (a) reuse `missed_products` — rejected, wrong semantics and no accounting linkage; (b) store loss only as `transactions` metadata — rejected, not queryable by lot/reason and commission losses have no transaction.

---

## R2 — Schema versioning

**Decision**: Dexie bump **v70 → v71** (`lib/dbSchema.ts:5` `CURRENT_DB_VERSION`, `lib/db.ts:243`), plus one committed Supabase migration. Per **CG-09**, both are required.

**Changes**:
- New store `inventory_loss_events`.
- New `inventory_items` columns: `weight_tracked` (bool), `weight_remaining` (number|null), `nominal_unit_weight` (number|null). Dexie only needs new indexes for fields queried by index; the three new fields are non-indexed data, so the `inventory_items` store string only needs `weight_tracked` added if we filter on it (we default-scan by `[store_id+branch_id]`, so no new index is strictly required — decision: **do not** add them to the index string, keep migration minimal).
- Supabase: `CREATE TABLE inventory_loss_events` + `ALTER TABLE inventory_items ADD COLUMN ...` + seed account `5950` into `chart_of_accounts` for existing stores (idempotent) + branch-isolation RLS.

**Rationale**: Matches the established migration discipline (`transaction_correction_status` v70, migration `20260606130000`).

---

## R3 — Where the "weight-tracked" flag and live weight live

**Decision**: `weight_tracked` is stored explicitly on `inventory_items` (not derived at read time), set at receiving, immutable. `weight` (existing, `types/index.ts:196-220`) stays the **frozen received weight**; the new `weight_remaining` is the **live** on-hand weight (init = received weight). `nominal_unit_weight = received weight ÷ received quantity`, snapshotted at receiving.

**Rationale**: Today `weight` is never decremented on sale (only `quantity` is — `saleOperations.ts:115-120`). Rather than change the meaning of `weight`, add a parallel live field, mirroring the existing `received_quantity` (frozen) vs `quantity` (live) pattern. Explicit flag satisfies clarification Q1 (toggle defaulted from unit type, override allowed) and avoids fragile inference from `units_of_measure.system_role`.

---

## R4 — Per-lot decrement, NOT the FIFO-by-product helper

**Decision**: Sales of a weight-tracked lot decrement **both** `quantity` and `weight_remaining` on the **specific `inventory_item_id`** of the sold lot. The existing `deductInventoryQuantity(productId, qty)` (`inventoryItemOperations.ts:366`) walks lots by product (FIFO-ish) and is **wrong** for this business model (per-supplier-bill stock, no pooling — see business-model memory). Loss and sale deductions target the exact lot.

**Rationale**: Sales already link to a specific lot via `bill_line_items.inventory_item_id`; the deduction must follow the same lot. This is also required for correct cost-basis valuation of shrinkage.

**Follow-up for tasks**: locate the sale-creation deduction path used by `POS.tsx`/`billOperations.ts` (the `saleOperations.ts` site is the edit path; `addSale` is deprecated) and apply per-lot dual decrement + mandatory-weight validation there.

---

## R5 — Accounting: account, category, mapping, and the "zero the residual" reconciliation

**Decision**:
- Add expense account **`5950` "Inventory Loss / Shrinkage"** to `DEFAULT_CHART_OF_ACCOUNTS` (`constants/chartOfAccounts.ts`), `account_type: 'expense'`, `requires_entity: false`. `5900` (Misc) already exists, `5950` is free.
- Add category `INVENTORY_LOSS: 'Inventory Loss / Shrinkage'` to `TRANSACTION_CATEGORIES` (`constants/transactionCategories.ts:6`) and map to `EXPENSE` in `CATEGORY_TO_TYPE_MAP`.
- Add mapping in `utils/accountMapping.ts`: `{ debitAccount: '5950', creditAccount: '1300', description: 'Inventory loss / shrinkage recorded', requiresEntity: false, defaultEntityCode: SYSTEM_ENTITY_CODES.INTERNAL }`.
- Post via `transactionService.createTransaction({ category: INVENTORY_LOSS, amount: lossValue, currency: lotCurrency, description, context, metadata:{ lossEventId, inventoryItemId, reason }, skipCashDrawerImpact: true, updateCashDrawer: false })` (`transactionService.ts:56-121,168`). Reversal uses `is_reversal: true` + `reversal_of_transaction_id`.

**Cost basis & no double-count** (clarification Q3): value comes from a **single basis** — per-weight for weight-tracked lots (`weight × price`), per-unit for quantity-only lots (`quantity × price`). A whole-unit loss on a weight lot consumes `nominal_unit_weight` from `weight_remaining` so the same weight is never later booked again as shrinkage. Therefore, for an owned lot: `Σ COGS(sold) + Σ unit-losses + residual-shrinkage = received value`, driving the lot's `1300` contribution to exactly zero at close (FR-006).

**Open verification (resolve in tasks, not blocking design)**: confirm whether COGS is posted **per sale** (Dr 5100/Cr 1300) or only computed at close by `profitLossService.calculateBillPL` (`services/profitLossService.ts`). If COGS is close-only, the loss postings still credit `1300` correctly; the "zero residual" invariant is validated by test rather than assumed. A Vitest reconciliation test (CG-12) will assert the invariant per lot.

---

## R6 — Commission lots: memo-only, no journal entry

**Decision**: When the lot's bill `type === 'commission'` (`inventory_bills.type`, `types/index.ts:248-278`), record the `inventory_loss_events` row with `transaction_id = null` and **do not** call `createTransaction`. The supplier settlement at close (`Accounting.tsx handleCloseReceivedBill` → commission computed on sold value) is inherently based on sold quantity/weight, so the loss is the consignor's.

**Rationale**: Commission goods carry no `1300` inventory asset (COGS=0). Posting a loss would fabricate an expense/asset movement that never existed. Satisfies clarification/decision on commission handling and **CG-08** (no unbalanced or spurious journal entries).

---

## R7 — Sync & the upload-then-emit contract (CG-03)

**Decision**: The loss operation writes the `inventory_loss_events` row (and any `transactions` row via `transactionService`) to IndexedDB with `_synced: false` and triggers `debouncedSync()`. It does **NOT** emit a branch event directly. Event emission for the new table is added to `syncService.uploadLocalChanges()` so the event fires **after** the batch is confirmed uploaded, via a new `eventEmissionService.emitInventoryLossPosted(...)` (`event_type: 'inventory_loss_posted'`, mirroring `emitInventoryReceived` at `eventEmissionService.ts:116-133`). `inventory_loss_events` is registered as a **Tier-2** table in `syncService` upload ordering and download/catch-up, and handled by `eventStreamService` catch-up on other devices.

**Rationale**: **CG-03** mandates events be emitted only by `syncService` after upload; emitting from the operation is forbidden. Touching `syncService.ts`/`eventEmissionService.ts` triggers the **`pnpm parity:gate`** requirement (CG-12).

---

## R8 — RBAC

**Decision**: Add operation `record_inventory_loss` (and reuse it for reversal, or add `reverse_inventory_loss`) under the `inventory` module (`types/index.ts:40,43-77`), granted to `admin` and `manager` in `rolePermissionService.ts:175-215`. Enforce via `accessControlService.checkOperationLimit()` before recording/reversing and before classifying count gaps at close. Any new route/page is wrapped in `<ProtectedRoute>` (CG-07). Automatic shrinkage rides the authorized bill-close and needs no extra permission.

---

## R9 — Audit logging (clarification Q4)

**Decision**: Manual loss creation and reversal call `auditService.record({ storeId, branchId, changedBy, entityType: 'inventory_loss', entityId: lossEventId, action: 'update', changes:[...], changeReason })` (pattern at `saleOperations.ts:99-112`). Add `'inventory_loss_recorded'` (and optionally `'inventory_loss_reversed'`) to `AuditAction` (`auditLogService.ts:43-62`). Automatic shrinkage does **not** emit its own audit entry — it is covered by the existing bill-close audit (FR-022). This is consistent with the locked audit-log design ([[audit_log_design_decisions]]) which keeps journal/transaction rows out of audit scope; here we audit the **loss event entity**, not its journal.

---

## R10 — Reversal model

**Decision**: Reuse the transaction-correction lifecycle shape (`status: 'active' | 'reversed'`, lineage columns) that already exists on `transactions` (v70, [[transaction_correction_status]]). Reversing a loss: (1) restore the lot's `quantity` (and `weight_remaining` + attributed weight, for weight lots); (2) for owned losses, post a reversing `createTransaction({ is_reversal: true, reversal_of_transaction_id })`; (3) set the loss row `status: 'reversed'`, link `reversed_by_id`; never delete. Guard against double reversal (FR-018).

---

## R11 — Multilingual & date (CG-10, CG-11)

**Decision**: Loss reason labels, the transaction `description` (`MultilingualString`), and any notes use `createMultilingualFromString()`/`getTranslatedString()` with en/ar/fr keys; new i18n keys added to `i18n/locales/{en,ar,fr}.ts`. All "today"/period-bucketing in the loss report uses `getLocalDateString()`/`getTodayLocalDate()` (`utils/dateUtils.ts`), never `toISOString().split('T')[0]`.

---

## R12 — Shared package boundary (CG-13)

**Decision**: The loss feature is store-app-only (admin-app has no offline inventory layer). Reason/source enums and the `InventoryLossEvent` type live in `apps/store-app`. If admin-app later needs to report losses, promote the enums/types to `packages/shared` at that time. No cross-app duplication is introduced now.

---

## Summary of unknowns resolved

| Unknown | Resolution |
|---|---|
| Where losses are stored | New `inventory_loss_events` table (R1) |
| Schema version | Dexie v70→v71 + Supabase migration (R2) |
| Weight tracking representation | Explicit `weight_tracked` + live `weight_remaining` + `nominal_unit_weight` (R3) |
| Deduction path | Per-lot dual decrement, not FIFO helper (R4) |
| Account / category / posting | 5950, `INVENTORY_LOSS`, mapping 5950/1300, `createTransaction` (R5) |
| Commission handling | Memo-only, no journal (R6) |
| Event sync | Upload-then-emit via syncService (R7, CG-03) |
| Permissions | `record_inventory_loss`, admin+manager (R8) |
| Audit | Manual + reversal only (R9) |
| Reversal | Correction-lifecycle status/lineage (R10) |
| Remaining verification | COGS timing invariant, sale-creation deduction site (R4, R5) — validated in tasks/tests |
