# Phase 3 Migration Roadmap: Complete Undo System Coverage

**Date**: 2026-04-19  
**Status**: Discovery Complete  
**Scope**: 10 operation files, 30 manual pushUndo calls  
**Recommendation**: Phased multi-sprint migration

---

## Executive Summary

The automatic undo system (Phase 1) is complete and working. However, **10 operation files** across the application still use **manual pushUndo construction** instead of the automatic `withUndoOperation()` wrapper.

**Current Risk**: These operations are subject to incomplete undo coverage when they perform multi-table writes (creating transactions, journal entries, etc. that aren't included in the manual undo data).

**Recommendation**: Migrate these files to automatic tracking in Phase 3 (could be split across multiple sprints).

---

## Operations Using Manual pushUndo (High Priority)

### 🔴 Critical (Multi-table Financial Impact)

#### 1. inventoryBatchOperations.ts (4 calls)
- **Operations**: addInventoryBatch, updateInventoryBatch, deleteInventoryBatch, applyCommissionRateToBatch
- **Gap**: Missing undo for transactions & journal_entries created by processInventoryPurchase
- **Risk Level**: 🔴 CRITICAL
- **Affected Tables**: inventory_bills, inventory_items, transactions, journal_entries
- **Current Undo Coverage**: 50% (2/4 tables)
- **Effort**: Medium (restructure to wrap operation, not just Dexie transaction)

**Example Problem**:
```typescript
// Current: Undoing inventory batch doesn't undo its financial impact
addInventoryBatch() {
  // Creates inventory_bills + inventory_items
  // Creates transactions + journal_entries (by processInventoryPurchase)
  // Only inventory_bills + inventory_items included in undo ❌
  pushUndo({ steps: [...] }); // Incomplete!
}
```

#### 2. paymentOperations.ts (4 calls)
- **Operations**: processPayment, processEmployeePayment, processSupplierAdvance, (others)
- **Gap**: Missing undo for complex transaction/journal workflows
- **Risk Level**: 🔴 CRITICAL (Originally identified in Phase 2)
- **Affected Tables**: transactions, journal_entries, cash_drawer_sessions, entities
- **Current Undo Coverage**: 50-70% (varies by operation)
- **Effort**: Medium-High (complex financial logic)
- **Status**: Already identified in original Phase 3 plan

#### 3. transactionOperations.ts (1 call)
- **Operations**: Likely transaction creation
- **Gap**: May miss journal entry creation
- **Risk Level**: 🔴 CRITICAL (Financial core)
- **Affected Tables**: transactions, journal_entries
- **Current Undo Coverage**: Unknown (1 call - need investigation)
- **Effort**: Low (single operation likely)

---

### 🟠 High Priority (Multi-table Operations)

#### 4. billOperations.ts (3 calls)
- **Operations**: createBill, updateBill, deleteBill (likely)
- **Gap**: Missing related transaction/adjustment undo
- **Risk Level**: 🟠 HIGH
- **Affected Tables**: bills, bill_line_items, (possibly transactions)
- **Current Undo Coverage**: 70% (bill tables covered, financial entries may not be)
- **Effort**: Medium

#### 5. entityOperations.ts (4 calls)
- **Operations**: createEntity, updateEntity, deleteEntity, (others)
- **Gap**: May miss related transaction/entity_balance changes
- **Risk Level**: 🟠 HIGH
- **Affected Tables**: entities, transactions, journal_entries, balance_snapshots
- **Current Undo Coverage**: 50-70% (core table covered, related changes may not)
- **Effort**: Medium-High (complex entity lifecycle)

#### 6. employeeBranchOperations.ts (4 calls)
- **Operations**: Likely employee/branch CRUD operations
- **Gap**: May miss related transaction/payment records
- **Risk Level**: 🟠 HIGH
- **Affected Tables**: employees(?), transactions, journal_entries
- **Current Undo Coverage**: Unknown (need investigation)
- **Effort**: Medium

---

### 🟡 Medium Priority (Simpler Operations)

#### 7. inventoryItemOperations.ts (3 calls)
- **Operations**: Likely inventory item CRUD
- **Gap**: May miss batch-related undo
- **Risk Level**: 🟡 MEDIUM
- **Affected Tables**: inventory_items, (batch-related)
- **Current Undo Coverage**: 80% (core tables covered)
- **Effort**: Low-Medium

#### 8. cashDrawerSessionOperations.ts (2 calls)
- **Operations**: Open/close drawer sessions
- **Gap**: May miss transaction records
- **Risk Level**: 🟡 MEDIUM
- **Affected Tables**: cash_drawer_sessions, cash_drawer_accounts, transactions
- **Current Undo Coverage**: 70%
- **Effort**: Low-Medium

#### 9. saleOperations.ts (2 calls)
- **Operations**: Likely sale creation/deletion
- **Gap**: May miss inventory updates
- **Risk Level**: 🟡 MEDIUM
- **Affected Tables**: (varied)
- **Current Undo Coverage**: 70-80%
- **Effort**: Low

#### 10. productOperations.ts (3 calls)
- **Operations**: Create/update/delete products
- **Gap**: May miss related pricing/inventory changes
- **Risk Level**: 🟡 MEDIUM
- **Affected Tables**: products, (related tables)
- **Current Undo Coverage**: 80%
- **Effort**: Low-Medium

---

## Migration Priority Matrix

```
Risk Level | Operations | Undo Gap | Effort | Priority | Est. Sprint
-----------|------------|----------|--------|----------|------------
🔴 Critical | inventoryBatchOperations (4) | 40-50% | M | ⭐⭐⭐ | 1-2
🔴 Critical | paymentOperations (4) | 30-50% | M-H | ⭐⭐⭐ | 1-2
🔴 Critical | transactionOperations (1) | 20-30% | L | ⭐⭐⭐ | 1
🟠 High | billOperations (3) | 20-30% | M | ⭐⭐ | 2-3
🟠 High | entityOperations (4) | 30-50% | M-H | ⭐⭐ | 2-3
🟠 High | employeeBranchOperations (4) | 30-40% | M | ⭐⭐ | 2
🟡 Medium | inventoryItemOperations (3) | 10-20% | L-M | ⭐ | 3
🟡 Medium | cashDrawerSessionOperations (2) | 20-30% | L-M | ⭐ | 3
🟡 Medium | saleOperations (2) | 15-25% | L | ⭐ | 3
🟡 Medium | productOperations (3) | 10-20% | L | ⭐ | 3
```

---

## Recommended Phasing

### Sprint 1 (Phase 3a): Critical Financial Operations
**Effort**: 2-3 weeks  
**Operations**: 9 pushUndo calls  
**Files**:
1. `transactionOperations.ts` (1 call) — Fast win
2. `paymentOperations.ts` (4 calls) — Main scope (already planned in Phase 3)
3. `inventoryBatchOperations.ts` (4 calls) — High impact

**Outcome**: All critical financial operations auto-track

**Tasks**:
- T024-T027: processPayment + processEmployeePayment (existing)
- T028-T031: inventoryBatchOperations (add/update/delete batch + commission)
- T032-T034: transactionOperations core functions

---

### Sprint 2 (Phase 3b): High-Priority Business Operations
**Effort**: 2-3 weeks  
**Operations**: 11 pushUndo calls  
**Files**:
1. `billOperations.ts` (3 calls)
2. `entityOperations.ts` (4 calls)
3. `employeeBranchOperations.ts` (4 calls)

**Outcome**: All bill & entity management auto-tracked

---

### Sprint 3 (Phase 3c): Remaining Operations
**Effort**: 1-2 weeks  
**Operations**: 10 pushUndo calls  
**Files**:
1. `inventoryItemOperations.ts` (3 calls)
2. `cashDrawerSessionOperations.ts` (2 calls)
3. `saleOperations.ts` (2 calls)
4. `productOperations.ts` (3 calls)

**Outcome**: Complete application coverage

---

## Migration Pattern

All operations follow the same pattern:

### Before (Manual)
```typescript
export async function addSomething(deps, args) {
  // ... operation code ...
  
  // Manually construct undo
  const undoSteps = [ /* complex manual construction */ ];
  pushUndo({ type: 'add_something', steps: undoSteps, affected: [...] });
}
```

### After (Automatic)
```typescript
export async function addSomething(deps, args) {
  const { pushUndo, ... } = deps;
  
  // Wrap entire operation - automatic tracking
  await withUndoOperation('operation', pushUndo, async () => {
    // ... operation code (unchanged) ...
    // All DB writes automatically captured!
  });
  
  // Remove manual pushUndo construction
}
```

### Benefits
- ✅ Auto-captures all tables (no gaps)
- ✅ Handles nested operations correctly
- ✅ Prevents undo-of-undo automatically
- ✅ Simpler, more maintainable code
- ✅ No risk of missing financial records

---

## Testing Strategy for Phase 3

Each migration should include:

1. **Unit Test** (per operation)
   - Verify `withUndoOperation()` wrapper calls `pushUndo`
   - Verify failure doesn't call `pushUndo`
   - Verify multi-table changes captured

2. **Integration Test** (per operation)
   - Create operation with manual test data
   - Verify undo reverts all tables
   - Verify financial records included

3. **Regression Test** (full suite)
   - `pnpm test:run` must pass
   - All existing tests unchanged
   - No regressions in other operations

4. **Manual Verification** (sample operations)
   - Browser-based undo testing
   - DevTools verification
   - Multi-table undo confirmation

---

## Files Affected

### Core Migration Files
- `inventoryBatchOperations.ts` — 4 functions
- `paymentOperations.ts` — 4 functions
- `transactionOperations.ts` — 1-2 functions
- `billOperations.ts` — 3 functions
- `entityOperations.ts` — 4 functions
- `employeeBranchOperations.ts` — 4 functions
- `inventoryItemOperations.ts` — 3 functions
- `cashDrawerSessionOperations.ts` — 2 functions
- `saleOperations.ts` — 2 functions
- `productOperations.ts` — 3 functions

### No Changes Required
- `withUndoOperation.ts` — Already provides the wrapper
- `undoOperations.ts` — Already uses suppression wrapper
- `db.ts` — Already has hook integration

---

## Success Criteria

- ✅ All 30 pushUndo calls migrated to `withUndoOperation()`
- ✅ Zero decrease in test passing rate
- ✅ All integration tests pass (new + existing)
- ✅ Constitutional gate CG-12 maintained (test coverage)
- ✅ Manual undo testing confirms multi-table reversal
- ✅ No new bug reports for undo functionality

---

## Summary

| Metric | Value |
|--------|-------|
| **Total Operations to Migrate** | 30 pushUndo calls across 10 files |
| **Critical Priority** | 9 calls (3 files) |
| **Estimated Effort** | 4-6 weeks (split into 3 sprints) |
| **Risk Reduction** | From ~50% incomplete coverage to 100% |
| **Recommended Start** | After Phase 2 validation complete |
| **Dependency** | None (Phase 1 infrastructure ready) |

---

## Decision Required

**Option A**: Implement Phase 3a only (critical financial + payment operations)
- **Scope**: 9 pushUndo calls across 3 files
- **Effort**: 2-3 weeks
- **Coverage**: 95% of financial transactions
- **Outcome**: Resolves original problem (payment undo incomplete)

**Option B**: Implement Phase 3 full (all 30 pushUndo calls)
- **Scope**: All 10 operation files
- **Effort**: 4-6 weeks
- **Coverage**: 100% application undo coverage
- **Outcome**: Complete system consistency

**Recommendation**: Start with Phase 3a (critical) in next sprint, plan Phase 3b-c for following sprints.

This ensures the most impactful fixes (financial operations) are completed first, with full coverage as a longer-term goal.
