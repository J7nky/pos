# 🚨 CRITICAL: Cash Drawer Discrepancy Found

## The Issue

Your test revealed a **real discrepancy** in your cash drawer:

- **Cached Balance:** 0.00 LBP
- **Journal Balance (TRUTH):** 1,450,036.00 LBP
- **Discrepancy:** 1,450,036.00 LBP

This means:
1. ❌ Your cash drawer account shows 0 balance (cached)
2. ✅ But you have 1.45M LBP in cash journal entries
3. ⚠️ The cache was never updated when transactions were created

## Why This Happened

This likely occurred because:
1. Transactions were created BEFORE we implemented the atomic balance updates
2. Or the `updateCashDrawer` flag was set to `false` for some transactions
3. Or old code created journal entries without updating the cash drawer cache

## How to Fix

Run this in your browser console to reconcile:

```javascript
const { db } = await import('./src/lib/db.js');
const { calculateCashDrawerBalance } = await import('./src/utils/balanceCalculation.js');

const storeId = '5ab010dc-2e89-4bd6-9d20-b3e86fbdd7b4';
const branchId = '83019a2a-3669-4cea-9598-0d08611fcdc6';

// Calculate TRUE balance from journals
const trueBalance = await calculateCashDrawerBalance(storeId, branchId, 'LBP');
console.log('TRUE Balance (from journals):', trueBalance.toFixed(2), 'LBP');

// Update cached balance to match
const account = await db.cash_drawer_accounts
  .where(['store_id', 'branch_id'])
  .equals([storeId, branchId])
  .first();

if (account) {
  await db.cash_drawer_accounts.update(account.id, {
    current_balance: trueBalance,
    updated_at: new Date().toISOString(),
    _synced: false
  });
  
  console.log('✅ Cash drawer reconciled!');
  console.log('   Old:', account.current_balance);
  console.log('   New:', trueBalance);
} else {
  console.error('❌ No cash drawer account found!');
}

// Verify fix
const updatedAccount = await db.cash_drawer_accounts.get(account.id);
console.log('Verification:', updatedAccount.current_balance === trueBalance ? '✅ Fixed!' : '❌ Still wrong');
```

## Investigation - What Cash Transactions Exist?

```javascript
// See all cash transactions
const cashJournals = await db.journal_entries
  .where('[store_id+branch_id]')
  .equals([storeId, branchId])
  .and(e => e.account_code === '1100' && e.is_posted === true)
  .toArray();

console.log(`Found ${cashJournals.length} cash journal entries`);

// Group by transaction type
const grouped = cashJournals.reduce((acc, j) => {
  const desc = j.description || 'Unknown';
  acc[desc] = (acc[desc] || 0) + 1;
  return acc;
}, {});

console.table(grouped);

// Show debits vs credits
const totalDebits = cashJournals.reduce((sum, e) => sum + e.debit, 0);
const totalCredits = cashJournals.reduce((sum, e) => sum + e.credit, 0);

console.log('Cash IN (debits):', totalDebits.toFixed(2));
console.log('Cash OUT (credits):', totalCredits.toFixed(2));
console.log('Net:', (totalDebits - totalCredits).toFixed(2));
```

## Expected Results After Fix

Once you run the reconciliation script, run the tests again:

```
✅ Cash Drawer Balance (Canonical Calculation): Cached balance (1450036.00) matches journal balance (1450036.00)
```

And Balance Verification should still show all valid.

---

**This is actually GOOD NEWS!** The test found a real issue before you launched to production! 🎯

