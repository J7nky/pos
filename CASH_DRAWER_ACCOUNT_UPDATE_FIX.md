# Cash Drawer Account Update Fix

## Problem

When journal entries were created, the system was updating `cash_drawer_sessions.actual_amount` instead of `cash_drawer_accounts.current_balance`.

### ❌ What Was Wrong

**File:** `apps/store-app/src/services/transactionService.ts` - `updateCashDrawerAtomic()`

```typescript
// ❌ BEFORE: Updated session.actual_amount instead of account.current_balance
const activeSession = await db.cash_drawer_sessions
  .where(['store_id', 'branch_id'])
  .equals([storeId, branchId])
  .and(session => session.closed_at === null)
  .first();

const previousBalance = (activeSession).actual_amount || 0;
// ... calculate balance change ...
await db.cash_drawer_sessions.update(activeSession.id, {
  actual_amount: newBalance,  // ❌ WRONG: Updating session, not account
  // ...
});
```

**Problems:**
1. ❌ Updated `cash_drawer_sessions.actual_amount` (session control field)
2. ❌ Should update `cash_drawer_accounts.current_balance` (account cache)
3. ❌ Sessions are for control/audit, not for storing balances
4. ❌ Balance should come from journal entries, not transaction type

---

## Solution

### ✅ What the Function SHOULD Do

According to the **Atomic Posting Pattern**:

1. **Journal entries are the source of truth** - Balance changes come from journal entries (account_code = 1100)
2. **Update account cache** - `cash_drawer_accounts.current_balance` is the cache that should be updated
3. **Sessions are for control** - `cash_drawer_sessions` is for audit/control, not balance storage

### ✅ Fixed Implementation

**File:** `apps/store-app/src/services/transactionService.ts` - `updateCashDrawerAtomic()`

```typescript
// ✅ AFTER: Updates account.current_balance based on journal entries
const account = await db.getCashDrawerAccount(storeId, branchId);

const previousBalance = Number((account as any)?.current_balance || 0);

// ✅ Calculate balance change from journal entries (account_code = 1100)
// Journal entries are the single source of truth
const cashJournalEntries = await db.journal_entries
  .where('transaction_id')
  .equals(transaction.id)
  .and(entry => entry.account_code === '1100' && entry.is_posted === true)
  .toArray();

// Calculate balance change: sum of (debit - credit) for cash account entries
let balanceChange = 0;
for (const entry of cashJournalEntries) {
  balanceChange += (entry.debit || 0) - (entry.credit || 0);
}

const newBalance = previousBalance + balanceChange;

// ✅ Update cash_drawer_accounts.current_balance (not session.actual_amount)
await db.cash_drawer_accounts.update(account.id as string, {
  current_balance: newBalance as any,
  updated_at: timestamp,
  _synced: false
});
```

---

## Changes Made

### 1. Updated `updateCashDrawerAtomic()` Method

**File:** `apps/store-app/src/services/transactionService.ts`

**Changes:**
- ✅ Gets `cash_drawer_account` instead of `cash_drawer_session`
- ✅ Calculates balance change from journal entries (account_code = 1100)
- ✅ Updates `cash_drawer_accounts.current_balance` instead of `cash_drawer_sessions.actual_amount`
- ✅ Uses journal entries as single source of truth (debit - credit)

### 2. Added `cash_drawer_accounts` to Transaction Scope

**File:** `apps/store-app/src/services/transactionService.ts`

```typescript
// ✅ Added cash_drawer_accounts to transaction scope
await db.transaction('rw', 
  [db.transactions, db.cash_drawer_sessions, db.journal_entries, db.entities, db.chart_of_accounts, db.cash_drawer_accounts], 
  async () => {
```

### 3. Made `getCashDrawerAccount()` Public

**File:** `apps/store-app/src/services/cashDrawerUpdateService.ts`

Changed from `private` to `public` to allow access from `transactionService` (though we ended up using `db.getCashDrawerAccount` directly).

---

## Accounting Pattern Compliance

This fix ensures compliance with the **Atomic Posting Pattern**:

✅ **Step 4 — Apply cache updates** - Cache (`cash_drawer_accounts.current_balance`) is updated based on journal entries

✅ **Journal entries as truth** - Balance change calculated from journal entries (account_code = 1100), not transaction type

✅ **Correct cache target** - Updates account cache, not session control field

✅ **Atomic updates** - All updates happen within the same transaction

---

## Key Differences

### Before (WRONG)
- Updated `cash_drawer_sessions.actual_amount`
- Calculated balance change from transaction type (income/expense)
- Sessions are for control/audit, not balance storage

### After (CORRECT)
- Updates `cash_drawer_accounts.current_balance`
- Calculates balance change from journal entries (account_code = 1100)
- Journal entries are the single source of truth
- Account cache is updated atomically with journal entries

---

## Impact

### ✅ Fixed Issues

1. **Correct cache updated** - `cash_drawer_accounts.current_balance` is now updated (not session)
2. **Journal entries as truth** - Balance changes come from journal entries, not transaction type
3. **Atomic updates** - Account balance updated atomically with journal entries
4. **Proper separation** - Sessions remain for control/audit, accounts store balances

### 📝 Notes

- **Sessions vs Accounts:**
  - `cash_drawer_sessions` = Control/audit mechanism (observes money)
  - `cash_drawer_accounts` = Cache for balance (updated from journal entries)
  
- **Balance Calculation:**
  - Balance change = sum of (debit - credit) for journal entries with account_code = 1100
  - This ensures balance matches journal entries exactly

---

## Related Files

- `apps/store-app/src/services/transactionService.ts` - Main fix location
- `apps/store-app/src/services/cashDrawerUpdateService.ts` - Made method public (though not used)
- `apps/store-app/src/lib/db.ts` - `getCashDrawerAccount()` method

---

## Testing

After this fix:

1. **Create a cash sale** - Journal entries should update `cash_drawer_accounts.current_balance`
2. **Check account balance** - Should match sum of journal entries (account_code = 1100)
3. **Verify session unchanged** - `cash_drawer_sessions.actual_amount` should only change on session close
4. **Test multiple transactions** - Balance should accumulate correctly from journal entries

---

## Core Rule Enforced

**When posting journal entries with account_code = 1100, update `cash_drawer_accounts.current_balance` based on the journal entries (debit - credit), not `cash_drawer_sessions.actual_amount`.**

