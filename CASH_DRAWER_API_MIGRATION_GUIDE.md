# Cash Drawer API Migration Guide

**For Developers:** Quick reference for migrating from old API to new atomic transaction API

---

## 🔄 Quick Migration Examples

### **1. Cash Sale**

#### ❌ OLD (Deprecated):
```typescript
const result = await cashDrawerUpdateService.updateCashDrawerForSale({
  amount: 100,
  currency: 'USD',
  paymentMethod: 'cash',
  storeId: 'store-123',
  createdBy: 'user-456',
  customerId: 'cust-789',
  billNumber: 'BILL-001'
});
```

#### ✅ NEW (Atomic):
```typescript
import { transactionService } from '../services/transactionService';
import { cashDrawerUpdateService } from '../services/cashDrawerUpdateService';

// 1. Verify session is open
const session = await cashDrawerUpdateService.verifySessionOpen(
  storeId,
  branchId,
  true, // allowAutoOpen for POS
  userId,
  'sale'
);

if (!session) {
  showError('Please open cash drawer first');
  return;
}

// 2. Create transaction atomically
const result = await transactionService.createCashDrawerSale(
  100, // amount
  'USD', // currency
  'Cash sale', // description
  {
    userId: 'user-456',
    storeId: 'store-123',
    branchId: 'branch-001',
    module: 'sales',
    source: 'web'
  },
  {
    reference: 'BILL-001',
    customerId: 'cust-789'
  }
);

// 3. Notify UI (optional)
if (result.success && result.cashDrawerImpact) {
  cashDrawerUpdateService.notifyCashDrawerUpdate(
    storeId,
    result.cashDrawerImpact.newBalance,
    result.transactionId || ''
  );
}
```

---

### **2. Customer Payment**

#### ❌ OLD (Deprecated):
```typescript
const result = await cashDrawerUpdateService.updateCashDrawerForCustomerPayment({
  amount: 50,
  currency: 'USD',
  storeId: 'store-123',
  createdBy: 'user-456',
  customerId: 'cust-789',
  description: 'Payment received',
  allowAutoSessionOpen: true
});
```

#### ✅ NEW (Atomic):
```typescript
// 1. Verify session
const session = await cashDrawerUpdateService.verifySessionOpen(
  storeId,
  branchId,
  true,
  userId,
  'payment'
);

// 2. Create payment
const result = await transactionService.createCustomerPayment(
  'cust-789', // customerId
  50, // amount
  'USD', // currency
  'Payment received', // description
  {
    userId: 'user-456',
    storeId: 'store-123',
    branchId: 'branch-001',
    module: 'payments',
    source: 'web'
  },
  {
    updateCashDrawer: true // Automatically updates cash drawer
  }
);

// 3. Notify UI
if (result.success && result.cashDrawerImpact) {
  cashDrawerUpdateService.notifyCashDrawerUpdate(
    storeId,
    result.cashDrawerImpact.newBalance,
    result.transactionId || ''
  );
}
```

---

### **3. Cash Expense**

#### ❌ OLD (Deprecated):
```typescript
const result = await cashDrawerUpdateService.updateCashDrawerForExpense({
  amount: 25,
  currency: 'USD',
  storeId: 'store-123',
  createdBy: 'user-456',
  description: 'Office supplies',
  category: 'Office Expenses',
  allowAutoSessionOpen: true
});
```

#### ✅ NEW (Atomic):
```typescript
// 1. Verify session
const session = await cashDrawerUpdateService.verifySessionOpen(
  storeId,
  branchId,
  true,
  userId,
  'expense'
);

// 2. Create expense
const result = await transactionService.createCashDrawerExpense(
  25, // amount
  'USD', // currency
  'Office supplies', // description
  {
    userId: 'user-456',
    storeId: 'store-123',
    branchId: 'branch-001',
    module: 'expenses',
    source: 'web'
  },
  {
    category: 'Office Expenses'
  }
);

// 3. Notify UI
if (result.success && result.cashDrawerImpact) {
  cashDrawerUpdateService.notifyCashDrawerUpdate(
    storeId,
    result.cashDrawerImpact.newBalance,
    result.transactionId || ''
  );
}
```

---

### **4. Supplier Payment**

#### ❌ OLD (Deprecated):
```typescript
const result = await cashDrawerUpdateService.updateCashDrawerForTransaction({
  type: 'payment',
  amount: 100,
  currency: 'USD',
  description: 'Payment to supplier',
  reference: 'PAY-001',
  storeId: 'store-123',
  branchId: 'branch-001',
  createdBy: 'user-456',
  supplierId: 'supp-789',
  allowAutoSessionOpen: true
});
```

#### ✅ NEW (Atomic):
```typescript
// 1. Verify session
const session = await cashDrawerUpdateService.verifySessionOpen(
  storeId,
  branchId,
  true,
  userId,
  'payment'
);

// 2. Create supplier payment
const result = await transactionService.createSupplierPayment(
  'supp-789', // supplierId
  100, // amount
  'USD', // currency
  'Payment to supplier', // description
  {
    userId: 'user-456',
    storeId: 'store-123',
    branchId: 'branch-001',
    module: 'payments',
    source: 'web'
  },
  {
    reference: 'PAY-001',
    updateCashDrawer: true
  }
);

// 3. Notify UI
if (result.success && result.cashDrawerImpact) {
  cashDrawerUpdateService.notifyCashDrawerUpdate(
    storeId,
    result.cashDrawerImpact.newBalance,
    result.transactionId || ''
  );
}
```

---

### **5. Refund**

#### ❌ OLD (Deprecated):
```typescript
const result = await cashDrawerUpdateService.updateCashDrawerForRefund({
  amount: 30,
  currency: 'USD',
  storeId: 'store-123',
  createdBy: 'user-456',
  description: 'Product return',
  originalTransactionId: 'txn-001'
});
```

#### ✅ NEW (Atomic):
```typescript
// Note: Use expense with refund category until createCashDrawerRefund is added

// 1. Verify session
const session = await cashDrawerUpdateService.verifySessionOpen(
  storeId,
  branchId,
  true,
  userId,
  'refund'
);

// 2. Create refund expense
const result = await transactionService.createCashDrawerExpense(
  30, // amount
  'USD', // currency
  'Refund: Product return', // description
  {
    userId: 'user-456',
    storeId: 'store-123',
    branchId: 'branch-001',
    module: 'refunds',
    source: 'web'
  },
  {
    reference: 'txn-001', // Original transaction
    category: 'refund'
  }
);

// 3. Notify UI
if (result.success && result.cashDrawerImpact) {
  cashDrawerUpdateService.notifyCashDrawerUpdate(
    storeId,
    result.cashDrawerImpact.newBalance,
    result.transactionId || ''
  );
}
```

---

## 🎯 Key Differences

| Aspect | OLD API | NEW API |
|--------|---------|---------|
| **Entry Point** | `cashDrawerUpdateService` | `transactionService` |
| **Session Check** | Implicit (auto-open) | Explicit (`verifySessionOpen`) |
| **Atomicity** | Manual, partial | Automatic, complete |
| **Balance Update** | Manual | Automatic (within transaction) |
| **Journal Entries** | ❌ None | ✅ Automatic |
| **Audit Log** | ❌ Partial | ✅ Complete |
| **Rollback** | ❌ Manual | ✅ Automatic |
| **Type Safety** | ❌ Weak | ✅ Strong |

---

## 📋 Migration Checklist

### For Each Cash Drawer Operation:

- [ ] Replace `cashDrawerUpdateService.updateCashDrawerFor*()` calls
- [ ] Add explicit `verifySessionOpen()` call
- [ ] Use appropriate `transactionService.create*()` method
- [ ] Pass proper `TransactionContext` with `branchId`
- [ ] Add UI notification if needed
- [ ] Test atomicity (simulate failures)
- [ ] Verify journal entries are created
- [ ] Check audit logs

---

## 🔧 Common Patterns

### **Pattern 1: POS Sale Flow**
```typescript
async function processCashSale(items: SaleItem[], customerId?: string) {
  // 1. Calculate total
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  // 2. Verify cash drawer session
  const session = await cashDrawerUpdateService.verifySessionOpen(
    storeId,
    branchId,
    true, // Auto-open for POS
    userId,
    'sale'
  );
  
  if (!session) {
    throw new Error('Cash drawer session required');
  }
  
  // 3. Create sale transaction
  const result = await transactionService.createCashDrawerSale(
    total,
    currency,
    `Sale of ${items.length} items`,
    {
      userId,
      storeId,
      branchId,
      module: 'pos',
      source: 'web'
    },
    {
      customerId,
      reference: generateSaleReference()
    }
  );
  
  // 4. Handle result
  if (!result.success) {
    throw new Error(result.error || 'Transaction failed');
  }
  
  // 5. Notify UI
  cashDrawerUpdateService.notifyCashDrawerUpdate(
    storeId,
    result.cashDrawerImpact!.newBalance,
    result.transactionId!
  );
  
  return result;
}
```

### **Pattern 2: Accounting Payment Flow**
```typescript
async function recordPayment(
  entityType: 'customer' | 'supplier',
  entityId: string,
  amount: number,
  description: string
) {
  // 1. Verify session (strict - no auto-open)
  const session = await cashDrawerUpdateService.verifySessionOpen(
    storeId,
    branchId,
    false, // No auto-open in accounting
    userId,
    'payment'
  );
  
  if (!session) {
    throw new Error('Please open cash drawer session first');
  }
  
  // 2. Create appropriate payment
  const result = entityType === 'customer'
    ? await transactionService.createCustomerPayment(
        entityId,
        amount,
        currency,
        description,
        { userId, storeId, branchId, module: 'accounting', source: 'web' },
        { updateCashDrawer: true }
      )
    : await transactionService.createSupplierPayment(
        entityId,
        amount,
        currency,
        description,
        { userId, storeId, branchId, module: 'accounting', source: 'web' },
        { updateCashDrawer: true }
      );
  
  // 3. Handle result
  if (!result.success) {
    throw new Error(result.error || 'Payment failed');
  }
  
  return result;
}
```

### **Pattern 3: Background/Hook Flow**
```typescript
// ⚠️ AVOID: Don't use database hooks for cash drawer updates
// ❌ BAD:
db.transactions.hook('creating', async (primKey, obj, trans) => {
  await cashDrawerUpdateService.updateCashDrawerForExpense({...});
});

// ✅ GOOD: Call transactionService directly from application code
async function recordExpense(data: ExpenseData) {
  const session = await cashDrawerUpdateService.verifySessionOpen(
    data.storeId,
    data.branchId,
    true,
    data.createdBy,
    'expense'
  );
  
  if (session) {
    await transactionService.createCashDrawerExpense(
      data.amount,
      data.currency,
      data.description,
      {
        userId: data.createdBy,
        storeId: data.storeId,
        branchId: data.branchId,
        module: data.module,
        source: 'web'
      }
    );
  }
}
```

---

## ⚠️ Common Pitfalls

### **1. Forgetting Session Verification**
```typescript
// ❌ BAD: Skip session check
await transactionService.createCashDrawerSale(...);
// Transaction may fail silently if no session!

// ✅ GOOD: Always verify first
const session = await cashDrawerUpdateService.verifySessionOpen(...);
if (session) {
  await transactionService.createCashDrawerSale(...);
}
```

### **2. Missing branchId**
```typescript
// ❌ BAD: No branch context
const context = {
  userId,
  storeId,
  module: 'pos',
  source: 'web'
};

// ✅ GOOD: Include branch
const context = {
  userId,
  storeId,
  branchId, // Required!
  module: 'pos',
  source: 'web'
};
```

### **3. Not Handling Failures**
```typescript
// ❌ BAD: Ignore result
await transactionService.createCashDrawerSale(...);
// Continue regardless of failure

// ✅ GOOD: Check result
const result = await transactionService.createCashDrawerSale(...);
if (!result.success) {
  showError(result.error);
  return;
}
```

### **4. Double Processing**
```typescript
// ❌ BAD: Manual balance update + transaction
await db.cash_drawer_accounts.update(accountId, { balance: newBalance });
await transactionService.createCashDrawerSale(...);
// Cash drawer updated twice!

// ✅ GOOD: Let transactionService handle it
await transactionService.createCashDrawerSale(...);
// Balance updated automatically
```

---

## 🧪 Testing Your Migration

### **Test 1: Atomic Rollback**
```typescript
test('transaction rollback on failure', async () => {
  const balanceBefore = await cashDrawerUpdateService.getCurrentCashDrawerBalance(storeId, branchId);
  
  try {
    // Simulate failure midway
    await transactionService.createCashDrawerSale(
      100,
      'USD',
      'Test sale',
      { ...context, userId: 'invalid-user' } // Will fail
    );
  } catch (error) {
    // Expected to fail
  }
  
  const balanceAfter = await cashDrawerUpdateService.getCurrentCashDrawerBalance(storeId, branchId);
  
  // Balance should be unchanged
  expect(balanceAfter).toBe(balanceBefore);
});
```

### **Test 2: Journal Entry Creation**
```typescript
test('creates journal entries', async () => {
  const result = await transactionService.createCashDrawerSale(
    100,
    'USD',
    'Test sale',
    context
  );
  
  // Check journal entries were created
  const journalEntries = await db.journal_entries
    .where('transaction_id')
    .equals(result.transactionId!)
    .toArray();
  
  expect(journalEntries.length).toBeGreaterThan(0);
});
```

### **Test 3: Concurrent Transactions**
```typescript
test('handles concurrent transactions', async () => {
  const promises = [
    transactionService.createCashDrawerSale(50, 'USD', 'Sale 1', context),
    transactionService.createCashDrawerSale(30, 'USD', 'Sale 2', context),
    transactionService.createCashDrawerExpense(20, 'USD', 'Expense 1', context)
  ];
  
  const results = await Promise.all(promises);
  
  // All should succeed
  expect(results.every(r => r.success)).toBe(true);
  
  // Balance should be correct
  const balance = await cashDrawerUpdateService.getCurrentCashDrawerBalance(storeId, branchId);
  expect(balance).toBe(openingAmount + 50 + 30 - 20);
});
```

---

## 📚 Additional Resources

- **transactionService.ts** - Full API documentation
- **CASH_DRAWER_SERVICE_CLEANUP_SUMMARY.md** - Complete refactoring details
- **ATOMIC_TRANSACTIONS_IMPLEMENTATION.md** - Atomicity guidelines
- **ARCHITECTURE_RULES.md** - Overall patterns

---

**Need Help?** Check the inline documentation in `transactionService.ts` or refer to the examples in `OfflineDataContext.tsx` and `inventoryPurchaseService.ts`.

