# Cash Drawer Getter Fix - Pure Getter Pattern

## Problem

The `getCurrentCashDrawerBalance()` function was violating core accounting principles:

### ❌ What Was Wrong

1. **Recalculated balances during normal reads** - Expensive, unsafe offline, breaks determinism
2. **Mutated data inside a "getter"** - A function named `getCurrentCashDrawerBalance` must never write to the database
3. **Silently auto-reconciled discrepancies** - Hides bugs, destroys auditability, can corrupt accounting data
4. **Used wrong source of truth** - Was calculating from transactions instead of journal entries (account_code = 1100)
5. **Created race conditions** - Reads and writes mixed together can overwrite correct balances during concurrent operations

### Example of the Problem

```typescript
// ❌ BEFORE: Auto-reconciliation in getter
public async getCurrentCashDrawerBalance(storeId: string, branchId: string): Promise<number> {
  const calculatedBalance = await this.calculateBalanceFromTransactions(storeId, branchId);
  const storedBalance = Number(account?.current_balance || 0);

  // ❌ SILENTLY RECONCILES - BAD!
  if (Math.abs(calculatedBalance - storedBalance) > 0.01) {
    await db.cash_drawer_accounts.update(account.id, {
      current_balance: calculatedBalance  // ❌ Writing in a getter!
    });
  }
  
  return calculatedBalance;
}
```

**Problems:**
- Every read could trigger a write
- No audit trail for reconciliations
- Could overwrite correct balances during concurrent operations
- Expensive recalculation on every read

---

## Solution

### ✅ What the Function SHOULD Do

**Core Rule:** Balances are updated **only** when posting journal entries. Reads must never change accounting state.

```typescript
// ✅ AFTER: Pure getter - zero side effects
public async getCurrentCashDrawerBalance(storeId: string, branchId: string): Promise<number> {
  const account = await this.getCashDrawerAccount(storeId, branchId);
  if (!account) return 0;
  
  // ✅ PURE GETTER: Return cached balance only
  // Balance is updated when posting journal entries, not during reads
  return Number(account?.current_balance || 0);
}
```

**Benefits:**
- ✅ Zero side effects - never writes to database
- ✅ Fast - no expensive recalculations
- ✅ Safe - no race conditions
- ✅ Deterministic - same input always returns same output
- ✅ Offline-safe - no network operations

---

## Explicit Reconciliation

Reconciliation is now **explicit and controlled**, not automatic:

### ✅ New `reconcileCashDrawerBalance()` Method

```typescript
/**
 * Reconcile cash drawer balance from journal entries - EXPLICIT RECONCILIATION
 * 
 * ✅ Calculates TRUE balance from journal entries (account_code = 1100)
 * ✅ Updates cash_drawer_accounts.current_balance to match
 * ✅ Logs the reconciliation for auditability
 * ✅ Should be called explicitly: end-of-day, session close, admin reconcile, sync repair
 */
public async reconcileCashDrawerBalance(
  storeId: string,
  branchId: string,
  reason: string = 'Manual reconciliation'
): Promise<{
  success: boolean;
  oldBalance: number;
  newBalance: number;
  discrepancy: number;
  error?: string;
}>
```

### ✅ Where Reconciliation IS Allowed

Reconciliation must be **explicit and intentional**, for example:

1. **End-of-day closing** - Explicit reconciliation before closing books
2. **Cash drawer session close** - Reconcile when closing a session
3. **Admin "Reconcile" action** - Manual reconciliation by admin
4. **Sync repair / debugging** - Fix data inconsistencies

**Requirements:**
- ✅ Must be logged
- ✅ Must be intentional
- ✅ Never happens silently

---

## Changes Made

### 1. Simplified `getCurrentCashDrawerBalance()`

**File:** `apps/store-app/src/services/cashDrawerUpdateService.ts`

**Before:**
- Recalculated balance from transactions
- Auto-reconciled discrepancies
- Wrote to database during reads

**After:**
- Returns cached balance only
- Zero side effects
- Never writes to database

### 2. Created `reconcileCashDrawerBalance()` Method

**File:** `apps/store-app/src/services/cashDrawerUpdateService.ts`

- Calculates TRUE balance from journal entries (account_code = 1100)
- Updates `cash_drawer_accounts.current_balance` explicitly
- Logs reconciliation for auditability
- Returns reconciliation result with old/new balances

### 3. Updated Balance Calculation

**File:** `apps/store-app/src/services/cashDrawerUpdateService.ts`

- Removed `calculateBalanceFromTransactions()` method
- Reconciliation now uses `calculateCashDrawerBalance()` from `balanceCalculation.ts`
- Uses journal entries (account_code = 1100) as single source of truth

### 4. Removed Unused Imports

- Removed `BalanceCalculator` import (no longer needed)

---

## Accounting Pattern Compliance

This fix ensures compliance with the **Atomic Posting Pattern**:

✅ **Step 4 — Apply cache updates** - Cache is updated ONLY when posting journal entries (in `transactionService`)

✅ **Reads never mutate** - `getCurrentCashDrawerBalance()` is a pure getter

✅ **Explicit reconciliation** - Reconciliation is intentional and logged

✅ **Journal entries as truth** - Balance calculation uses journal entries (account_code = 1100), not transactions

---

## Usage Examples

### ✅ Getting Balance (No Side Effects)

```typescript
// ✅ Safe to call anywhere - zero side effects
const balance = await cashDrawerUpdateService.getCurrentCashDrawerBalance(storeId, branchId);
```

### ✅ Explicit Reconciliation

```typescript
// ✅ Called explicitly during session close
const result = await cashDrawerUpdateService.reconcileCashDrawerBalance(
  storeId,
  branchId,
  'Session close reconciliation'
);

if (result.discrepancy !== 0) {
  console.log(`Reconciled: ${result.oldBalance} → ${result.newBalance}`);
  // Log to audit trail
}
```

### ✅ When to Reconcile

```typescript
// 1. End-of-day closing
await reconcileCashDrawerBalance(storeId, branchId, 'End-of-day reconciliation');

// 2. Session close
await reconcileCashDrawerBalance(storeId, branchId, 'Session close');

// 3. Admin action
await reconcileCashDrawerBalance(storeId, branchId, 'Admin manual reconciliation');

// 4. Sync repair
await reconcileCashDrawerBalance(storeId, branchId, 'Sync repair after data inconsistency');
```

---

## Impact

### ✅ Fixed Issues

1. **No more silent auto-reconciliation** - All reconciliations are explicit and logged
2. **No race conditions** - Getters never write, eliminating concurrent write conflicts
3. **Fast reads** - No expensive recalculations during normal reads
4. **Offline-safe** - Pure getters work offline without network operations
5. **Audit trail** - All reconciliations are logged with reason and timestamp
6. **Correct source of truth** - Uses journal entries (account_code = 1100), not transactions

### ⚠️ Breaking Changes

- **Auto-reconciliation removed** - If code was relying on automatic reconciliation, it must now call `reconcileCashDrawerBalance()` explicitly
- **Balance calculation changed** - Now uses journal entries instead of transactions (more accurate)

---

## Related Files

- `apps/store-app/src/services/cashDrawerUpdateService.ts` - Main service file
- `apps/store-app/src/utils/balanceCalculation.ts` - Balance calculation utilities
- `apps/store-app/src/services/transactionService.ts` - Updates balance when posting journal entries

---

## Testing

After this fix:

1. **Test getter** - Should return cached balance without any side effects
2. **Test reconciliation** - Should explicitly reconcile and log the action
3. **Test concurrent reads** - Multiple simultaneous reads should not cause race conditions
4. **Test offline** - Getter should work offline without network operations

---

## Core Rule to Enforce

**Balances are updated only when posting journal entries. Reads must never change accounting state. Reconciliation is explicit, not implicit.**

