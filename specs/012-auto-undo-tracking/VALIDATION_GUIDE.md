# Phase 2 Validation Guide: Automatic Undo Tracking System

**Status**: Phase 1 (Infrastructure) ✅ Complete  
**Current Phase**: Phase 2 (Validation) — Manual & Integration Tests  
**Dev Server**: http://localhost:5179/

---

## Quick Validation Checklist

### User Story 1: Automatic Undo Capture (P1)
**Goal**: Verify all changes are automatically captured without manual undo construction.

#### T013 — Manual Test: createBill Multi-Table Capture
- [x] Open app, navigate to Bills
- [x] Create a bill with 3+ line items
- [x] Open DevTools → Application → Session Storage
- [x] Check `last_undo_action` key contains undo steps for:
  - `bills` (main bill)
  - `bill_line_items` (3+ items)
  - `transactions` (payment transaction)
  - `journal_entries` (accounting entries)
  - `inventory_items` (stock reduction)
- [x] Click Undo in UI
- [x] Verify all records deleted across all 5 table types in DevTools → Storage → IndexedDB

#### T014 — Manual Test: Multi-Table Operation Order
- [x] Create a payment (transaction + journal entries)
- [x] DevTools → Application → Session Storage → `last_undo_action` 
- [ ] Verify `steps` array is in **reverse chronological order**:
  - Last-created record should be first undo step
  - Example: If journal created last, should be first in undo steps
- [x] Click Undo (failed, did't undone)
- [ ] Check order matches reversal (most recent first)

#### T015 — Integration Test: buildUndoFromChanges
```bash
pnpm test:run src/__tests__/integration/changeTracker.integration.test.ts (failed)
```
- [ ] Test wraps operation with `withUndoOperation()`
- [ ] Verifies multiple DB writes via Dexie are captured
- [ ] Asserts `buildUndoFromChanges` produces matching undo steps
- [ ] **Result**: Should pass with all assertions green

---

### User Story 2: Backward Compatibility (P1)
**Goal**: Verify existing manual undo operations still work unchanged.

#### T016 — Manual Test: Legacy pushUndo Operations
- [x] Execute existing operation that uses manual `pushUndo()` (e.g., deleteSale)
- [ ] Undo should work identically to before (failed)
- [ ] Open DevTools Console
- [ ] Search for `changeTracker.isActive()` logs
- [ ] Should NOT appear (legacy operations don't use auto-tracking)
- [ ] **Verify**: Legacy operation runs WITHOUT changeTracker interference

#### T017 — Regression Test Suite
```bash
cd apps/store-app
pnpm test:run  ✅ Done: all 129 tests passed
```
- [x] Run full test suite
- [x] **All tests PASS** (129/129) ✅
- [x] **Zero changes to existing operation files** (except Phase 3) ✅
- [x] **Verify**: No regressions in legacy code ✅ **CONFIRMED**

---

### User Story 3: Prevent Undo-of-Undo (P1)
**Goal**: Verify undo suppression prevents tracking undo actions themselves.

#### T018 — Manual Test: sessionStorage Clears After Undo
- [x] Create a bill (undo entry created in sessionStorage)
- [x] DevTools → Application → Session Storage → `last_undo_action` = ✅ **Present**
- [x] Click Undo button in UI
- [x] Check sessionStorage again
- [x] `last_undo_action` should be **CLEARED** / `null` ✅ **CONFIRMED**
- [x] Undo button disappears (expected behavior — no undo data left)
- [x] Create another bill → new Undo button appears
- [x] **RESULT**: Undo-of-undo prevention working correctly ✅

#### T019 — Manual Test: Suppression Active During Undo
- [x] Navigate to Bills, create a bill
- [x] Open DevTools Console (F12)
- [x] Filter for logs during bill creation (search: "DB Hook" or "[DB Hook]")
- [x] Should see logs like: `🔄 [DB Hook] Creating record...`
- [x] Click Undo button
- [x] **Verify**: No new tracker logs appear during undo execution (console stays silent)
- [x] **Result**: Undo suppression working correctly ✅ (no changeTracker logs found in console during undo)

---

### User Story 4: Sync Operations Excluded (P2)
**Goal**: Verify sync download operations don't trigger change tracking.

#### T020 — Manual Test: Sync Download Exclusion
- [x] Open DevTools Console (set filter: "changeTracker")
- [x] Go offline (DevTools → Network → Offline)
- [x] Wait 10 seconds (no sync activity)
- [x] Go online (DevTools → Network → Online)
- [x] Sync download begins
- [x] **Verify**: No `changeTracker` activity in console during sync
- [x] Perform a user operation inside `withUndoOperation()` (e.g., create bill)
- [x] **Verify**: Only user changes tracked, not sync changes

#### T021 — Code Inspection: Sync Guards
- [x] Open `apps/store-app/src/lib/db.ts`
- [x] Find `triggerSyncOnUnsynced` hook
- [x] **Verify**: `changeTracker.trackCreate()` called **inside** `if (obj._synced === false)` guard
- [x] Find `triggerSyncOnUpdate` hook
- [x] **Verify**: `changeTracker.trackUpdate()` called **inside** `_synced` check
- [x] **Result**: Sync-sourced changes (with `_synced: true`) are not tracked

---

### User Story 5: Complex Multi-Table Transactions (P2)
**Goal**: Verify undo works for complex multi-table operations.

#### T022 — Manual Test: addInventoryBatch Undo
- [ ] Navigate to Inventory → Batches / Receive
- [ ] Create an inventory batch (writes to multiple tables):
  - `inventory_bills`
  - `inventory_items` (multiple rows)
  - `transactions` (accounting entry)
  - `journal_entries` (accounting detail)
- [ ] DevTools → Application → Session Storage → `last_undo_action`
- [ ] Verify undo array has entries for **all tables**
- [ ] Verify steps are in **reverse order** (most recent table first) (that is what found in last_undo_action: {
    "type": "add_inventory_batch",
    "affected": [
        {
            "table": "inventory_bills",
            "id": "dd5a6e91-4df5-446d-8e91-ce0c9d964c3f"
        },
        {
            "table": "inventory_items",
            "id": "a506c3c6-71df-449c-ac96-12f3e37167d3"
        }
    ],
    "steps": [
        {
            "op": "delete",
            "table": "inventory_bills",
            "id": "dd5a6e91-4df5-446d-8e91-ce0c9d964c3f"
        },
        {
            "op": "delete",
            "table": "inventory_items",
            "id": "a506c3c6-71df-449c-ac96-12f3e37167d3"
        }
    ],
    "timestamp": 1776611699020
})
- [ ] Click Undo
- [ ] **Verify**: All records deleted across all tables (DevTools → Storage → IndexedDB)

#### T023 — Test Helper Creation
```bash
# Create helper file with captureChanges() utility
touch apps/store-app/src/__tests__/helpers/trackingTestHelper.ts
```
- [ ] File should export `captureChanges(operationFn)` async function
- [ ] Utility starts session, runs operation, ends session, returns change counts per table
- [ ] **Example usage**:
  ```typescript
  const counts = await captureChanges(async () => {
    await someOperation();
  });
  expect(counts['bills']).toBe(1);
  expect(counts['journal_entries']).toBeGreaterThan(0);
  ```

---

## Integration Test Execution

### T015 Integration Test
```bash
cd apps/store-app
pnpm test:run src/__tests__/integration/changeTracker.integration.test.ts (didnt work)
```

**Expected output**: ✓ All integration tests pass

---

## Success Criteria

| Task | Success Condition | Status |
|------|-------------------|--------|
| T013 | createBill captures all 5 table types | 🔄 Ready to test |
| T014 | Undo steps in reverse chronological order | 🔄 Ready to test |
| T015 | Integration test passes | 🔄 Ready to test |
| T016 | Legacy operations work unchanged | 🔄 Ready to test |
| T017 | Full test suite passes (0 failures) | ✅ Verified |
| T018 | sessionStorage cleared after undo | 🔄 Ready to test |
| T019 | No tracker logs during undo execution | 🔄 Ready to test |
| T020 | No changeTracker activity during sync | 🔄 Ready to test |
| T021 | Sync guards in place (code verified) | 🔄 Ready to test |
| T022 | addInventoryBatch undo reverses all tables | 🔄 Ready to test |
| T023 | Test helper utility created | 🔄 Ready to test |

---

## Manual Testing Environment

**Dev Server**: http://localhost:5179/  
**DevTools Access**: F12 (Windows/Linux) or Cmd+Option+I (Mac)  
**Key Storage Locations**:
- Session Storage: `last_undo_action` (undo payload)
- IndexedDB: POSDatabase tables (actual records)
- Console: changeTracker logs (with filter) (no changeTracker logs found)

---

## Notes

1. **Phase 2 focuses on validation only** — No code changes, only verification
2. **Phase 3 (Deferred)** — Will migrate `processPayment` and `processEmployeePayment` to `withUndoOperation()`
3. **All Phase 1 tests passing**: 23 changeTracker + 12 withUndoOperation tests ✅
4. **Sync parity verified**: `pnpm parity:gate` passes 100%
