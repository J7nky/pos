# 💰 Cash Drawer Balance Test Guide

## Quick Console Test (30 seconds)

Open browser console (F12) and run this:

```javascript
// Import utilities
const { db } = await import('./src/lib/db.js');
const { calculateCashDrawerBalance, calculateBalance } = await import('./src/utils/balanceCalculation.js');
const { cashDrawerUpdateService } = await import('./src/services/cashDrawerUpdateService.js');

// Get your IDs
const storeId = '5ab010dc-2e89-4bd6-9d20-b3e86fbdd7b4';
const branchId = '83019a2a-3669-4cea-9598-0d08611fcdc6';

// Test 1: Get cached balance
const account = await db.cash_drawer_accounts
  .where(['store_id', 'branch_id'])
  .equals([storeId, branchId])
  .first();

const cachedBalance = account?.current_balance || 0;
console.log('💵 Cached Balance (fast):', cachedBalance.toFixed(2));

// Test 2: Calculate from journals (TRUTH)
const journalBalance = await calculateCashDrawerBalance(storeId, branchId, 'LBP');
console.log('📊 Journal Balance (truth):', journalBalance.toFixed(2));

// Test 3: Get from service (with reconciliation)
const serviceBalance = await cashDrawerUpdateService.getCurrentCashDrawerBalance(storeId, branchId);
console.log('🔧 Service Balance:', serviceBalance.toFixed(2));

// Test 4: Verify they match
const difference = Math.abs(cachedBalance - journalBalance);
console.log('🎯 Difference:', difference.toFixed(2));
console.log(difference < 0.01 ? '✅ All balances match!' : '❌ Discrepancy detected!');

// Test 5: Show all cash (1100) journal entries
const cashJournals = await db.journal_entries
  .where('account_code')
  .equals('1100')
  .and(e => e.is_posted === true)
  .toArray();

console.log(`📋 Found ${cashJournals.length} cash journal entries`);
console.log('Cash Journal Entries:', cashJournals);

// Test 6: Manual calculation
const manualBalance = cashJournals.reduce((sum, e) => sum + e.debit - e.credit, 0);
console.log('✋ Manual Calculation:', manualBalance.toFixed(2));
```

---

## What Should Happen

### Expected Console Output:

```
💵 Cached Balance (fast): 1500.00
📊 Journal Balance (truth): 1500.00
🔧 Service Balance: 1500.00
🎯 Difference: 0.00
✅ All balances match!
📋 Found 12 cash journal entries
✋ Manual Calculation: 1500.00
```

---

## Manual Test Scenarios

### Scenario 1: Make a Cash Sale

1. **Before:** Note current cash drawer balance
2. **Action:** Complete a cash sale for 100 LBP in POS
3. **After:** Cash drawer should increase by 100

**Verify in Console:**
```javascript
// Check the last transaction
const lastTxn = await db.transactions.orderBy('created_at').last();
console.log('Last Transaction:', lastTxn);

// Check its journal entries
const journals = await db.journal_entries
  .where('transaction_id')
  .equals(lastTxn.id)
  .toArray();

console.log('Journal Entries:', journals);

// Should have:
// Debit: Cash (1100) +100
// Credit: Revenue (4100) +100

// Verify cash drawer updated
const newBalance = await calculateCashDrawerBalance(storeId, branchId, 'LBP');
console.log('New Cash Drawer Balance:', newBalance);
```

### Scenario 2: Customer Pays You

1. **Before:** Note cash drawer balance
2. **Action:** Record customer payment of 50 LBP
3. **After:** Cash drawer should increase by 50

**Verify:**
```javascript
// Should create journals:
// Debit: Cash (1100) +50
// Credit: AR (1200) -50

const journals = await db.journal_entries.orderBy('created_at').last();
console.log('Latest Journal:', journals);
```

### Scenario 3: You Pay Supplier

1. **Before:** Note cash drawer balance
2. **Action:** Pay supplier 75 LBP
3. **After:** Cash drawer should decrease by 75

**Verify:**
```javascript
// Should create journals:
// Debit: AP (2100) -75
// Credit: Cash (1100) -75

const newBalance = await calculateCashDrawerBalance(storeId, branchId, 'LBP');
console.log('Cash Drawer After Payment:', newBalance);
```

---

## Deep Verification Test

This verifies the entire cash drawer flow:

```javascript
// Get ALL cash transactions
const cashJournals = await db.journal_entries
  .where('account_code')
  .equals('1100')
  .and(e => e.is_posted === true)
  .toArray();

console.log(`Found ${cashJournals.length} cash journal entries`);

// Calculate balance manually (CANONICAL FUNCTION)
const { calculateBalance } = await import('./src/utils/balanceCalculation.js');
const calculatedBalance = calculateBalance(cashJournals);

console.log('Calculated from Journals:', calculatedBalance.toFixed(2));

// Get cached balance
const account = await db.cash_drawer_accounts
  .where(['store_id', 'branch_id'])
  .equals([storeId, branchId])
  .first();

console.log('Cached Balance:', account?.current_balance || 0);

// Compare
const diff = Math.abs(calculatedBalance - (account?.current_balance || 0));
console.log(diff < 0.01 ? '✅ Perfect match!' : `❌ Difference: ${diff.toFixed(2)}`);

// Show breakdown
const totalDebits = cashJournals.reduce((sum, e) => sum + e.debit, 0);
const totalCredits = cashJournals.reduce((sum, e) => sum + e.credit, 0);

console.log('Breakdown:');
console.log(`  Total Debits (cash in):  ${totalDebits.toFixed(2)}`);
console.log(`  Total Credits (cash out): ${totalCredits.toFixed(2)}`);
console.log(`  Net Balance: ${(totalDebits - totalCredits).toFixed(2)}`);
```

---

## Automated Test

The automated test has been added! Just:

1. **Refresh browser** (F5)
2. **Go to** `/test-accounting`
3. **Click** "▶️ Run All Tests"
4. **Should see** Test 7: Cash Drawer Balance ✅

---

## What Gets Tested

The new cash drawer test verifies:

1. ✅ Cash drawer account exists
2. ✅ Cached balance is stored
3. ✅ Journal balance can be calculated from entries
4. ✅ Cached balance matches journal balance (canonical function)
5. ✅ Service balance method works correctly

---

## Expected Results

### All Tests Should Pass (7/7):
```
✅ Credit Sale Flow: Balance updated, journal entries created correctly
✅ Customer Payment Flow: Payment processed, AR decreased, cash increased
✅ Cash Sale Flow: Cash sale recorded with proper journal entries
✅ Supplier Payment Flow: Supplier payment processed correctly
✅ Balance Verification Service: Cached balance matches journal-derived balance
✅ Journal Entry Integrity (Double-Entry): All transactions have balanced double-entries
✅ Cash Drawer Balance (Canonical Calculation): Cached matches journal balance
```

---

## If Cash Drawer Has Discrepancy

```javascript
// Fix it manually
const { balanceVerificationService } = await import('./src/services/balanceVerificationService.js');

// This will recalculate from journals and update cache
await balanceVerificationService.reconcileAllBalances(storeId);

// Or specifically for cash drawer:
const trueBalance = await calculateCashDrawerBalance(storeId, branchId, 'LBP');

await db.cash_drawer_accounts
  .where(['store_id', 'branch_id'])
  .equals([storeId, branchId])
  .modify({ current_balance: trueBalance });

console.log('✅ Cash drawer reconciled to:', trueBalance);
```

---

**Run the quick console test now to see if your cash drawer balance is correct!** 💰

