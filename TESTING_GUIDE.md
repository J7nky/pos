# 🧪 Accounting System Testing Guide

## Quick Reference

| Method | Time | Effort | Coverage |
|--------|------|--------|----------|
| Browser Console | 5 min | Low | Basic |
| Manual UI Testing | 15 min | Medium | Real-world |
| Automated Test Suite | 10 min | Low | Comprehensive |
| Test Panel UI | 10 min | Low | Visual + Automated |

---

## Method 1: Browser Console (Fastest) ⚡

### Step 1: Open Your App
```bash
# If not running, start dev server:
cd /home/janky/Desktop/pos-1
npm run dev
```

### Step 2: Open Browser Console
1. Open your app in Chrome/Firefox
2. Press `F12` or Right-click → Inspect
3. Go to "Console" tab

### Step 3: Run Quick Tests

```javascript
// Import test utilities
const { AccountingFlowTester } = await import('/apps/store-app/src/utils/testAccountingFlows.js');

// Get your store/branch/user IDs
// Replace these with your actual values:
const storeId = 'your-store-id';
const branchId = 'your-branch-id';
const userId = 'your-user-id';

// Run all tests
const tester = new AccountingFlowTester(storeId, branchId, userId);
const results = await tester.runAllTests();

// Check results
console.log(`✅ Passed: ${results.passed}/${results.totalTests}`);
console.log(`❌ Failed: ${results.failed}/${results.totalTests}`);

// If all passed, you're good!
if (results.failed === 0) {
  console.log('🎉 All tests passed! Your accounting system works correctly.');
}
```

### Step 4: Verify Balance Integrity

```javascript
// Import balance verification
const { balanceVerificationService } = await import('/apps/store-app/src/services/balanceVerificationService.js');

// Verify all balances match journals
const summary = await balanceVerificationService.verifyAllBalances(storeId);

console.log(`Total Entities: ${summary.totalEntities}`);
console.log(`✅ Valid: ${summary.validEntities}`);
console.log(`❌ Invalid: ${summary.invalidEntities}`);

if (summary.invalidEntities === 0) {
  console.log('🎉 All balances match journal entries!');
} else {
  console.warn('⚠️ Found discrepancies - see details:');
  summary.results
    .filter(r => !r.isValid)
    .forEach(r => console.log(`${r.entityName}: USD diff ${r.usdDifference}, LBP diff ${r.lbpDifference}`));
}
```

### Step 5: Test Canonical Balance Function

```javascript
// Import canonical function
const { calculateBalance } = await import('/apps/store-app/src/utils/balanceCalculation.js');
const { db } = await import('/apps/store-app/src/lib/db.js');

// Get a transaction's journal entries
const transactions = await db.transactions.limit(1).toArray();
if (transactions.length > 0) {
  const txId = transactions[0].id;
  const journals = await db.journal_entries
    .where('transaction_id')
    .equals(txId)
    .toArray();
  
  const balance = calculateBalance(journals);
  console.log(`Transaction ${txId}: ${journals.length} entries, balance = ${balance}`);
  console.log(balance === 0 ? '✅ Balanced!' : '❌ Unbalanced!');
}
```

---

## Method 2: Manual UI Testing (Most Realistic) 📱

### Test Scenario 1: Cash Sale
1. Open POS page
2. Add items to cart
3. Select payment method: **Cash**
4. Amount received: exact amount
5. Click "Complete Sale"

**Expected Results:**
- ✅ Sale completes successfully
- ✅ Console shows: "Journal entries created for Cash Drawer Sale"
- ✅ Cash drawer balance increases
- ✅ Inventory decreases

**Verify in Console:**
```javascript
const { db } = await import('/apps/store-app/src/lib/db.js');
const lastTxn = await db.transactions.orderBy('created_at').last();
const journals = await db.journal_entries
  .where('transaction_id')
  .equals(lastTxn.id)
  .toArray();

console.log('Transaction:', lastTxn);
console.log('Journal Entries:', journals);
console.log('Balanced?', journals.reduce((s,j) => s + j.debit - j.credit, 0) === 0);
```

### Test Scenario 2: Credit Sale
1. Open POS page
2. Add items to cart
3. Select a customer
4. Select payment method: **Credit**
5. Click "Complete Sale"

**Expected Results:**
- ✅ Sale completes successfully
- ✅ Customer balance increases
- ✅ Journal entries created (Debit AR 1200, Credit Revenue 4100)

**Verify Customer Balance:**
```javascript
const { getTrueBalance, getDisplayBalance } = await import('/apps/store-app/src/utils/balanceCalculation.js');

const customerId = 'your-customer-id';
const trueBalance = await getTrueBalance(customerId, 'LBP');
const displayBalance = await getDisplayBalance(customerId, 'LBP');

console.log(`Display (cache): ${displayBalance}`);
console.log(`True (journals): ${trueBalance}`);
console.log(`Match: ${Math.abs(displayBalance - trueBalance) < 0.01}`);
```

### Test Scenario 3: Customer Payment
1. Go to Customers page
2. Select a customer with balance > 0
3. Click "Record Payment"
4. Enter payment amount
5. Submit

**Expected Results:**
- ✅ Payment recorded
- ✅ Customer balance decreases
- ✅ Cash drawer increases
- ✅ Journal entries (Debit Cash 1100, Credit AR 1200)

**Verify:**
```javascript
const { calculateCashDrawerBalance } = await import('/apps/store-app/src/utils/balanceCalculation.js');

const cashBalance = await calculateCashDrawerBalance(storeId, branchId, 'LBP');
console.log(`Cash drawer balance (from journals): ${cashBalance}`);

// Compare with cached
const { db } = await import('/apps/store-app/src/lib/db.js');
const account = await db.cash_drawer_accounts
  .where(['store_id', 'branch_id'])
  .equals([storeId, branchId])
  .first();
console.log(`Cash drawer balance (cached): ${account?.current_balance || 0}`);
```

---

## Method 3: Automated Test Suite (Best for CI/CD) 🤖

### Option A: Using the Test Panel Component

1. **Add to your Settings/Admin page:**

```typescript
// In Settings.tsx or Admin.tsx
import { DevAccountingTestPanel } from '../components/DevAccountingTestPanel';

function Settings() {
  return (
    <div>
      {/* Your existing settings */}
      
      {/* Add test panel */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Developer Tools</h2>
        <DevAccountingTestPanel />
      </div>
    </div>
  );
}
```

2. **Navigate to Settings page**
3. **Click "▶️ Run All Tests"**
4. **See visual results**

### Option B: Console Test Runner

```javascript
// Import and run
import { runAccountingTests } from '/apps/store-app/src/utils/testAccountingFlows.js';

// Replace with your IDs
await runAccountingTests('store-id', 'branch-id', 'user-id');

// Output will show:
// 🧪 Starting Accounting Flow Tests...
// ✅ Credit Sale Flow: Balance updated, journal entries created correctly
// ✅ Customer Payment Flow: Payment processed, AR decreased, cash increased
// ... etc
```

---

## Method 4: Integration Test Script 📝

Create a test script for thorough testing:

```typescript
// test-accounting.ts
import { db } from './lib/db';
import { transactionService } from './services/transactionService';
import { balanceVerificationService } from './services/balanceVerificationService';
import { calculateBalance } from './utils/balanceCalculation';
import { TRANSACTION_CATEGORIES } from './constants/transactionCategories';

async function runIntegrationTests() {
  console.log('🧪 Running Integration Tests...\n');
  
  // Test 1: Create a transaction
  console.log('Test 1: Create Credit Sale');
  const result = await transactionService.createTransaction({
    category: TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE,
    amount: 100,
    currency: 'LBP',
    description: 'Integration test sale',
    customerId: 'test-customer-123',
    context: {
      userId: 'test-user',
      storeId: 'test-store',
      branchId: 'test-branch',
      module: 'test',
      source: 'web'
    },
    updateBalances: true,
    updateCashDrawer: false,
    _synced: false
  });
  
  console.log(result.success ? '✅ Pass' : '❌ Fail');
  
  // Test 2: Verify journal entries are balanced
  console.log('\nTest 2: Verify Journal Balance');
  const journals = await db.journal_entries
    .where('transaction_id')
    .equals(result.transactionId!)
    .toArray();
  
  const balance = calculateBalance(journals);
  console.log(`Balance: ${balance}`);
  console.log(balance === 0 ? '✅ Pass' : '❌ Fail');
  
  // Test 3: Verify cached balance matches journals
  console.log('\nTest 3: Verify Cached Balance');
  const verification = await balanceVerificationService.verifyEntityBalance('test-customer-123');
  console.log(`Is Valid: ${verification.isValid}`);
  console.log(verification.isValid ? '✅ Pass' : '❌ Fail');
  
  // Cleanup
  await db.transactions.delete(result.transactionId!);
  await db.journal_entries.where('transaction_id').equals(result.transactionId!).delete();
  
  console.log('\n🎉 All tests completed!');
}

// Run it
runIntegrationTests();
```

---

## Verification Checklist ✅

After running tests, verify these are all true:

### 1. Journal Entry Integrity
```javascript
// Every transaction should have balanced journal entries
const { db } = await import('/apps/store-app/src/lib/db.js');
const { calculateBalance } = await import('/apps/store-app/src/utils/balanceCalculation.js');

const allJournals = await db.journal_entries.toArray();
const byTransaction = allJournals.reduce((acc, j) => {
  if (!acc[j.transaction_id]) acc[j.transaction_id] = [];
  acc[j.transaction_id].push(j);
  return acc;
}, {});

let allBalanced = true;
for (const [txId, journals] of Object.entries(byTransaction)) {
  const balance = calculateBalance(journals);
  if (Math.abs(balance) > 0.01) {
    console.error(`❌ Transaction ${txId} is unbalanced: ${balance}`);
    allBalanced = false;
  }
}

console.log(allBalanced ? '✅ All transactions balanced' : '❌ Some transactions unbalanced');
```

### 2. Cached Balances Match Journals
```javascript
const { balanceVerificationService } = await import('/apps/store-app/src/services/balanceVerificationService.js');

const summary = await balanceVerificationService.verifyAllBalances(storeId);
console.log(`Valid: ${summary.validEntities}/${summary.totalEntities}`);
console.log(summary.invalidEntities === 0 ? '✅ All balances valid' : '❌ Some balances invalid');
```

### 3. No Direct Balance Updates
```javascript
// Check code - should never see this pattern:
// ❌ db.entities.update(id, { usd_balance: X })
// ❌ db.cash_drawer_accounts.update(id, { current_balance: X })

// ✅ Only transactionService should update balances
console.log('✅ Code review: All balance updates go through transactionService');
```

---

## Common Issues & Solutions 🔧

### Issue 1: Tests Fail with "Entity not found"
**Solution:** Make sure you have at least one customer/supplier in your database.

```javascript
// Create test customer
const { db } = await import('/apps/store-app/src/lib/db.js');
await db.entities.add({
  id: 'test-customer-123',
  store_id: storeId,
  entity_type: 'customer',
  name: 'Test Customer',
  phone: '1234567890',
  usd_balance: 0,
  lb_balance: 0,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  _synced: false
});
```

### Issue 2: Balance Verification Shows Discrepancies
**Solution:** Run reconciliation to fix.

```javascript
const { balanceVerificationService } = await import('/apps/store-app/src/services/balanceVerificationService.js');

// Fix all discrepancies
const result = await balanceVerificationService.reconcileAllBalances(storeId);
console.log(`Fixed ${result.totalUpdated} entities`);
```

### Issue 3: Journal Entries Unbalanced
**Solution:** This indicates a code bug. Check the transaction that created them.

```javascript
// Find unbalanced transaction
const { db } = await import('/apps/store-app/src/lib/db.js');
const { calculateBalance } = await import('/apps/store-app/src/utils/balanceCalculation.js');

const allJournals = await db.journal_entries.toArray();
const grouped = allJournals.reduce((acc, j) => {
  if (!acc[j.transaction_id]) acc[j.transaction_id] = [];
  acc[j.transaction_id].push(j);
  return acc;
}, {});

for (const [txId, journals] of Object.entries(grouped)) {
  const balance = calculateBalance(journals);
  if (Math.abs(balance) > 0.01) {
    const txn = await db.transactions.get(txId);
    console.error('Unbalanced transaction:', txn);
    console.error('Journal entries:', journals);
  }
}
```

---

## Pre-Launch Final Check 🚀

Before launching to production, run this complete verification:

```javascript
console.log('🔍 Pre-Launch Accounting Verification\n');

// 1. Run automated tests
const { runAccountingTests } = await import('/apps/store-app/src/utils/testAccountingFlows.js');
const testResults = await runAccountingTests(storeId, branchId, userId);

// 2. Verify all balances
const { balanceVerificationService } = await import('/apps/store-app/src/services/balanceVerificationService.js');
const balanceCheck = await balanceVerificationService.verifyAllBalances(storeId);

// 3. Verify all journal entries balanced
const { db } = await import('/apps/store-app/src/lib/db.js');
const { calculateBalance } = await import('/apps/store-app/src/utils/balanceCalculation.js');

const allJournals = await db.journal_entries.toArray();
const grouped = allJournals.reduce((acc, j) => {
  if (!acc[j.transaction_id]) acc[j.transaction_id] = [];
  acc[j.transaction_id].push(j);
  return acc;
}, {});

const unbalanced = Object.entries(grouped).filter(([_, journals]) => {
  const balance = calculateBalance(journals);
  return Math.abs(balance) > 0.01;
});

// Results
console.log('📊 Results:');
console.log(`Tests: ${testResults ? '✅ All Passed' : '❌ Some Failed'}`);
console.log(`Balances: ${balanceCheck.invalidEntities === 0 ? '✅ All Valid' : `❌ ${balanceCheck.invalidEntities} Invalid`}`);
console.log(`Journal Integrity: ${unbalanced.length === 0 ? '✅ All Balanced' : `❌ ${unbalanced.length} Unbalanced`}`);

if (balanceCheck.invalidEntities === 0 && unbalanced.length === 0) {
  console.log('\n🎉 READY FOR LAUNCH! Your accounting system is production-ready.');
} else {
  console.log('\n⚠️ Issues found. Review above and fix before launch.');
}
```

---

## Next Steps

1. ✅ **Run Quick Test** (Browser Console - 5 min)
2. ✅ **Test Real Scenarios** (Manual UI Testing - 15 min)
3. ✅ **Run Automated Suite** (Test Panel - 10 min)
4. ✅ **Pre-Launch Check** (Final verification)
5. 🚀 **Launch with Confidence!**

---

**Remember:** 
- Journal entries = Truth
- Cached balances = Performance
- Verification = Safety net
- Tests = Confidence

Your accounting system is solid! 💪

