# Quickstart: Inventory Loss & Shrinkage

Developer walkthrough to build, run, and validate the feature. Assumes the monorepo is set up (`pnpm setup`).

## Prerequisites
- `pnpm dev:store` runs the store app.
- A test store with at least one open received bill containing (a) a weight-tracked lot and (b) a quantity-only lot.

## Build order (see plan.md → tasks)
1. **Schema** — Supabase migration (`inventory_loss_events`, `inventory_items` columns, seed `5950`, RLS) + Dexie **v71** bump in `lib/db.ts` / `lib/dbSchema.ts` with an `upgradeV71` that backfills `weight_tracked`/`weight_remaining`/`nominal_unit_weight` for existing lots (`weight_tracked=false`, `weight_remaining=weight`).
2. **Accounting wiring** — `chartOfAccounts.ts` (5950), `transactionCategories.ts` (`INVENTORY_LOSS`), `accountMapping.ts` (5950/1300).
3. **Receiving** — add the weight-tracked toggle (defaulted from unit type) to the receive flow; snapshot `nominal_unit_weight`.
4. **POS** — enforce mandatory weight for weight-tracked lots; per-lot dual decrement of `quantity` + `weight_remaining`; show remaining weight.
5. **Operations** — `lossOperations.ts` (`recordInventoryLoss`, `reverseInventoryLoss`, `reconcileAndCloseLosses`) + `useLossDataLayer` + `OfflineDataContext` wiring + `'losses'` refresh domain.
6. **Close** — extend `handleCloseReceivedBill` with reconciliation panel + block-until-classified + auto-shrinkage.
7. **Sync** — register `inventory_loss_events` in `syncService` (Tier 2) + `emitInventoryLossPosted` after upload; run `pnpm parity:gate`.
8. **UI** — inventory-tab "Report Loss" modal; close-modal reconciliation; loss report; i18n keys (en/ar/fr).
9. **RBAC** — `record_inventory_loss` permission (admin/manager); gate the modal + close classification.

## Manual verification scenarios (map to spec acceptance)

### A. Automatic weight shrinkage (US1)
1. Receive a weight-tracked owned lot: 10 units / 100 kg at known cost.
2. In POS, sell 10 units / 95 kg total (mandatory weight enforced; remaining weight visibly drops to 5 kg / 0 units).
3. Close the bill → confirm the close modal shows "shrinkage 5 kg → loss $X"; confirm.
4. **Expect**: one `inventory_loss_events` row `reason=shrinkage, source=auto_close`; a Dr 5950 / Cr 1300 transaction for $X; the lot's residual `1300` value = 0 (SC-001).

### B. Manual spoilage (US2)
1. On a quantity-only owned lot with 20 boxes, open "Report Loss" → Spoiled, qty 3 → confirm.
2. **Expect**: on-hand 20→17; loss row `reason=spoiled, source=manual`; Dr 5950 / Cr 1300 for 3×unit cost; audit entry `inventory_loss_recorded`.
3. Try qty 6 on a 4-box lot → rejected (FR-010).

### C. Count reconciliation blocks close (US3)
1. Quantity-only lot: received 100, sold 95, none reported lost/spoiled.
2. Attempt close → **blocked**; modal shows 5 unaccounted; classify 5 as Spoiled → close succeeds; on-hand → 0 (SC-003).

### D. Commission memo-only (US1/US2)
1. Repeat A or B on a **commission** bill's lot.
2. **Expect**: loss row with `is_commission=true, transaction_id=null`; **no** journal entry; supplier settlement unchanged beyond sold amount (SC-006).

### E. Reversal (US4)
1. Reverse a recorded owned loss → stock restored; reversing Dr 1300 / Cr 5950 posted; original row `status=reversed`, both visible; second reversal attempt rejected (SC-007).

### F. Offline (FR-020)
1. Go offline; perform B and C; confirm they complete and appear in Unsynced Items; reconnect → `inventory_loss_events` uploads and `inventory_loss_posted` event fires (verify no emit-before-upload; `pnpm parity:gate` passes).

## Tests (CG-12)
- `lossOperations.test.ts`: success + failure for record/reverse; commission memo path; over-quantity rejection; **reconciliation invariant** (received value = Σ COGS + Σ unit-losses + residual shrinkage → lot 1300 zero).
- Run `pnpm test:run` and `pnpm parity:gate` (sync-critical files touched).
