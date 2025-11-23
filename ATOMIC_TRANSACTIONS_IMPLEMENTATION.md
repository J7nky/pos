# Atomic Transactions & Balance Verification Implementation

**Date:** November 23, 2025  
**Priority:** 🔥 CRITICAL

---

## Overview

This document shows you how to:
1. ✅ Achieve **atomicity** using IndexedDB transactions (IMMEDIATE)
2. ✅ Verify **sum(debits) = sum(credits)** in your current system
3. ⭐ (Optional) Add explicit journal entries for full double-entry

---

## Part 1: Achieving Atomicity (IMMEDIATE) 🔥

### Current Problem

```typescript
// processCustomerPayment() - CURRENT (NOT ATOMIC)
async processCustomerPayment(customerId, amount, ...) {
  // Step 1: Update customer balance
  await db.customers.update(customerId, { 
    usd_balance: newBalance 
  });  // ✅ Committed
  
  // Step 2: Create transaction
  await db.transactions.add({...});  // ✅ Committed
  
  // Step 3: Update cash drawer
  await cashDrawerUpdateService.update(...);  // ❌ FAILS
}
```

**Result if Step 3 fails:**
- ✅ Customer balance = $0 (paid)
- ✅ Transaction recorded = $100
- ❌ Cash drawer = $0 (SHOULD BE $100)
- 💥 **Books don't balance**

---

### Solution: Wrap in db.transaction()

```typescript
// processCustomerPayment() - FIXED (ATOMIC)
public async processCustomerPayment(
  customerId: string,
  amount: number,
  currency: 'USD' | 'LBP',
  description: string,
  createdBy: string,
  storeId: string,
  options: PaymentProcessingOptions = {}
): Promise<TransactionResult> {
  try {
    // Validate input
    if (!currencyService.validateCurrencyAmount(amount, currency)) {
      return {
        success: false,
        error: 'Invalid amount',
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };
    }

    const { db } = await import('../lib/db');
    
    // Get customer data (outside transaction - read-only)
    const customerData = await db.customers.get(customerId);
    if (!customerData) {
      return {
        success: false,
        error: 'Customer not found',
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };
    }

    const balanceBefore = currency === 'USD' 
      ? (customerData.usd_balance || 0) 
      : (customerData.lb_balance || 0);
    const balanceAfter = balanceBefore - amount;

    let transactionId: string;
    const timestamp = new Date().toISOString();

    // ⭐⭐⭐ ATOMIC TRANSACTION WRAPPER ⭐⭐⭐
    await db.transaction('rw', 
      [db.customers, db.transactions, db.cash_drawer_sessions], 
      async () => {
        // All operations inside this block are ATOMIC
        // Either ALL succeed or ALL rollback
        
        // 1. Update customer balance
        if (options.updateCustomerBalance !== false) {
          const balanceUpdate = currency === 'USD' 
            ? { usd_balance: balanceAfter }
            : { lb_balance: balanceAfter };
          
          await db.customers.update(customerId, { 
            ...balanceUpdate,
            updated_at: timestamp,
            _synced: false
          });
        }

        // 2. Create payment transaction
        transactionId = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        await db.transactions.add({
          id: transactionId,
          store_id: storeId,
          type: PAYMENT_TYPES.INCOME,
          category: PAYMENT_CATEGORIES.CUSTOMER_PAYMENT,
          amount: amount,
          currency: currency,
          description: description,
          reference: generatePaymentReference(),
          created_at: timestamp,
          updated_at: timestamp,
          created_by: createdBy,
          customer_id: customerId,
          supplier_id: null,
          employee_id: null,
          _synced: false
        });

        // 3. Update cash drawer (moved inside transaction)
        if (options.updateCashDrawer !== false) {
          // Get active cash drawer session
          const activeSession = await db.cash_drawer_sessions
            .where('store_id')
            .equals(storeId)
            .and(session => session.closed_at === null)
            .first();

          if (activeSession) {
            const currentAmount = activeSession.current_amount || 0;
            const newAmount = currentAmount + amount;

            await db.cash_drawer_sessions.update(activeSession.id, {
              current_amount: newAmount,
              updated_at: timestamp,
              _synced: false
            });
          }
        }
      }
    );
    // ⭐⭐⭐ END ATOMIC TRANSACTION ⭐⭐⭐
    
    // If we reach here, ALL operations succeeded
    return {
      success: true,
      transactionId: transactionId!,
      balanceBefore,
      balanceAfter,
      affectedRecords: [customerId]
    };

  } catch (error) {
    // If ANY operation fails, ALL are rolled back
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      balanceBefore: 0,
      balanceAfter: 0,
      affectedRecords: []
    };
  }
}
```

---

### Key Changes

#### **1. Remove External Service Calls**

```typescript
// ❌ BEFORE (Can't rollback external calls)
await cashDrawerUpdateService.updateCashDrawerForCustomerPayment({...});

// ✅ AFTER (Direct DB update inside transaction)
const activeSession = await db.cash_drawer_sessions
  .where('store_id')
  .equals(storeId)
  .and(session => session.closed_at === null)
  .first();

if (activeSession) {
  await db.cash_drawer_sessions.update(activeSession.id, {
    current_amount: currentAmount + amount,
    updated_at: timestamp,
    _synced: false
  });
}
```

#### **2. Remove Duplicate AR Transaction**

```typescript
// ❌ REMOVE THIS (Lines 102-119)
if (options.createReceivable !== false) {
  await db.transactions.add({
    id: `ar-${Date.now()}`,
    category: 'Accounts Receivable',  // DUPLICATE!
    // ...
  });
}
```

**Why?** The payment transaction itself IS the AR update. Creating both is data duplication.

#### **3. Declare transactionId Outside**

```typescript
let transactionId: string;

await db.transaction('rw', [...], async () => {
  transactionId = `txn-${Date.now()}-...`;
  await db.transactions.add({ id: transactionId, ... });
});

// Can use transactionId here
return { transactionId, ... };
```

---

## Part 2: Verifying Balances (sum(debits) = sum(credits))

### Your Current System (Implicit Double-Entry)

You don't have explicit debit/credit columns, but you CAN verify balance integrity:

```typescript
// Balance Verification Service
export class BalanceVerificationService {
  
  /**
   * Verify that all balances match transaction history
   */
  public async verifyAllBalances(storeId: string): Promise<{
    verified: boolean;
    discrepancies: Array<{
      entityType: 'customer' | 'supplier';
      entityId: string;
      entityName: string;
      cachedBalance: { USD: number; LBP: number };
      calculatedBalance: { USD: number; LBP: number };
      difference: { USD: number; LBP: number };
    }>;
  }> {
    const { db } = await import('../lib/db');
    const discrepancies = [];
    
    // 1. Verify all customers
    const customers = await db.customers
      .where('store_id')
      .equals(storeId)
      .toArray();
    
    for (const customer of customers) {
      const calculated = await this.calculateCustomerBalance(customer.id);
      
      const cachedUSD = customer.usd_balance || 0;
      const cachedLBP = customer.lb_balance || 0;
      
      const usdDiff = Math.abs(calculated.USD - cachedUSD);
      const lbpDiff = Math.abs(calculated.LBP - cachedLBP);
      
      if (usdDiff > 0.01 || lbpDiff > 0.01) {
        discrepancies.push({
          entityType: 'customer',
          entityId: customer.id,
          entityName: customer.name,
          cachedBalance: { USD: cachedUSD, LBP: cachedLBP },
          calculatedBalance: calculated,
          difference: { 
            USD: calculated.USD - cachedUSD, 
            LBP: calculated.LBP - cachedLBP 
          }
        });
      }
    }
    
    // 2. Verify all suppliers
    const suppliers = await db.suppliers
      .where('store_id')
      .equals(storeId)
      .toArray();
    
    for (const supplier of suppliers) {
      const calculated = await this.calculateSupplierBalance(supplier.id);
      
      const cachedUSD = supplier.usd_balance || 0;
      const cachedLBP = supplier.lb_balance || 0;
      
      const usdDiff = Math.abs(calculated.USD - cachedUSD);
      const lbpDiff = Math.abs(calculated.LBP - cachedLBP);
      
      if (usdDiff > 0.01 || lbpDiff > 0.01) {
        discrepancies.push({
          entityType: 'supplier',
          entityId: supplier.id,
          entityName: supplier.name,
          cachedBalance: { USD: cachedUSD, LBP: cachedLBP },
          calculatedBalance: calculated,
          difference: { 
            USD: calculated.USD - cachedUSD, 
            LBP: calculated.LBP - cachedLBP 
          }
        });
      }
    }
    
    return {
      verified: discrepancies.length === 0,
      discrepancies
    };
  }
  
  /**
   * Calculate customer balance from transactions (source of truth)
   */
  private async calculateCustomerBalance(
    customerId: string
  ): Promise<{ USD: number; LBP: number }> {
    const { db } = await import('../lib/db');
    
    // Get all transactions for this customer
    const transactions = await db.transactions
      .where('customer_id')
      .equals(customerId)
      .toArray();
    
    // Get all credit sales (from bills)
    const creditBills = await db.bills
      .where('customer_id')
      .equals(customerId)
      .and(b => b.payment_method === 'credit')
      .toArray();
    
    // Get line items for credit bills
    const billIds = creditBills.map(b => b.id);
    const lineItems = billIds.length > 0
      ? await db.bill_line_items
          .where('bill_id')
          .anyOf(billIds)
          .toArray()
      : [];
    
    // Calculate balances
    let usdBalance = 0;
    let lbpBalance = 0;
    
    // Credit sales INCREASE balance (customer owes us)
    const totalCreditSales = lineItems.reduce(
      (sum, item) => sum + (item.line_total || 0), 
      0
    );
    lbpBalance += totalCreditSales;
    
    // Payments DECREASE balance (customer pays us)
    for (const txn of transactions) {
      if (txn.type === 'income' && txn.category === 'Customer Payment') {
        if (txn.currency === 'USD') {
          usdBalance -= txn.amount;
        } else {
          lbpBalance -= txn.amount;
        }
      }
    }
    
    return { USD: usdBalance, LBP: lbpBalance };
  }
  
  /**
   * Calculate supplier balance from transactions (source of truth)
   */
  private async calculateSupplierBalance(
    supplierId: string
  ): Promise<{ USD: number; LBP: number }> {
    const { db } = await import('../lib/db');
    
    // Get all transactions for this supplier
    const transactions = await db.transactions
      .where('supplier_id')
      .equals(supplierId)
      .toArray();
    
    // Get inventory bills (credit purchases + commissions)
    const inventoryBills = await db.inventory_bills
      .where('supplier_id')
      .equals(supplierId)
      .toArray();
    
    let usdBalance = 0;
    let lbpBalance = 0;
    
    // Credit purchases INCREASE balance (we owe supplier)
    for (const bill of inventoryBills) {
      if (bill.type === 'credit') {
        // Get inventory items for this bill
        const items = await db.inventory
          .where('batch_id')
          .equals(bill.id)
          .toArray();
        
        const billTotal = items.reduce(
          (sum, item) => sum + ((item.quantity || 0) * (item.price || 0)), 
          0
        );
        lbpBalance += billTotal;
      }
      
      // Closed commission bills INCREASE balance (we owe supplier commission)
      if (bill.status === 'closed' && bill.commission_amount) {
        lbpBalance += bill.commission_amount;
      }
    }
    
    // Payments DECREASE balance (we pay supplier)
    for (const txn of transactions) {
      if (txn.type === 'expense' && txn.category === 'Supplier Payment') {
        if (txn.currency === 'USD') {
          usdBalance -= txn.amount;
        } else {
          lbpBalance -= txn.amount;
        }
      }
    }
    
    return { USD: usdBalance, LBP: lbpBalance };
  }
  
  /**
   * Auto-fix discrepancies by updating cached balances
   */
  public async fixDiscrepancies(
    discrepancies: Array<{
      entityType: 'customer' | 'supplier';
      entityId: string;
      calculatedBalance: { USD: number; LBP: number };
    }>
  ): Promise<number> {
    const { db } = await import('../lib/db');
    let fixed = 0;
    
    for (const discrepancy of discrepancies) {
      const updateData = {
        usd_balance: discrepancy.calculatedBalance.USD,
        lb_balance: discrepancy.calculatedBalance.LBP,
        updated_at: new Date().toISOString(),
        _synced: false
      };
      
      if (discrepancy.entityType === 'customer') {
        await db.customers.update(discrepancy.entityId, updateData);
      } else {
        await db.suppliers.update(discrepancy.entityId, updateData);
      }
      
      fixed++;
    }
    
    return fixed;
  }
}

export const balanceVerificationService = new BalanceVerificationService();
```

---

### Usage: Verify Balances

```typescript
// Run verification
const result = await balanceVerificationService.verifyAllBalances(storeId);

if (!result.verified) {
  console.warn('❌ Balance discrepancies found:', result.discrepancies);
  
  // Auto-fix
  const fixed = await balanceVerificationService.fixDiscrepancies(
    result.discrepancies
  );
  
  console.log(`✅ Fixed ${fixed} discrepancies`);
} else {
  console.log('✅ All balances verified correctly');
}
```

---

### Run Verification Nightly

```typescript
// Add to your app initialization
setInterval(async () => {
  const result = await balanceVerificationService.verifyAllBalances(storeId);
  
  if (!result.verified) {
    // Log to monitoring service
    console.error('Balance verification failed', {
      discrepancies: result.discrepancies.length,
      details: result.discrepancies
    });
    
    // Optionally auto-fix
    await balanceVerificationService.fixDiscrepancies(result.discrepancies);
  }
}, 24 * 60 * 60 * 1000);  // Every 24 hours
```

---

## Part 3: (Optional) Explicit Journal Entries

If you want TRUE double-entry with explicit debits/credits:

### Add Journal Entries Table

```typescript
// In db.ts
interface JournalEntry {
  id: string;
  store_id: string;
  transaction_id: string;  // Links multiple entries
  account: 'customer_ar' | 'supplier_ap' | 'cash' | 'revenue' | 'cogs' | 'expense';
  entity_id: string | null;
  debit: number;
  credit: number;
  currency: 'USD' | 'LBP';
  description: string;
  created_at: string;
  created_by: string;
  _synced?: boolean;
}

// Update schema
this.version(X).stores({
  // ... existing tables
  journal_entries: `
    ++id,
    store_id,
    transaction_id,
    [store_id+transaction_id],
    [store_id+account],
    [store_id+entity_id],
    created_at
  `
});
```

### Update processCustomerPayment with Journal Entries

```typescript
await db.transaction('rw', 
  [db.customers, db.transactions, db.cash_drawer_sessions, db.journal_entries], 
  async () => {
    const txnId = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    // 1. Create journal entries (double-entry)
    // Debit: Cash
    await db.journal_entries.add({
      id: `jrnl-${Date.now()}-1`,
      store_id: storeId,
      transaction_id: txnId,
      account: 'cash',
      entity_id: null,
      debit: amount,
      credit: 0,
      currency: currency,
      description: `Payment from ${customer.name}`,
      created_at: timestamp,
      created_by: createdBy,
      _synced: false
    });
    
    // Credit: Customer AR
    await db.journal_entries.add({
      id: `jrnl-${Date.now()}-2`,
      store_id: storeId,
      transaction_id: txnId,
      account: 'customer_ar',
      entity_id: customerId,
      debit: 0,
      credit: amount,
      currency: currency,
      description: `Payment from ${customer.name}`,
      created_at: timestamp,
      created_by: createdBy,
      _synced: false
    });
    
    // 2. Create transaction record (for compatibility)
    await db.transactions.add({ id: txnId, ... });
    
    // 3. Update cached balances (for performance)
    await db.customers.update(customerId, { usd_balance: newBalance });
    await db.cash_drawer_sessions.update(sessionId, { current_amount: newAmount });
  }
);
```

### Verify Books Balance

```typescript
// With journal entries, you can do this:
const entries = await db.journal_entries
  .where('store_id')
  .equals(storeId)
  .toArray();

const totalDebits = entries.reduce((sum, e) => sum + e.debit, 0);
const totalCredits = entries.reduce((sum, e) => sum + e.credit, 0);

if (Math.abs(totalDebits - totalCredits) > 0.01) {
  console.error('❌ BOOKS DO NOT BALANCE', {
    debits: totalDebits,
    credits: totalCredits,
    difference: totalDebits - totalCredits
  });
} else {
  console.log('✅ Books balanced', { total: totalDebits });
}
```

---

## Implementation Priority

### Immediate (This Week)

1. ✅ **Add db.transaction() wrappers** to:
   - `processCustomerPayment()`
   - `processSupplierPayment()`
   - `processExpense()`

2. ✅ **Remove duplicate AR/AP transactions** (lines 102-119)

3. ✅ **Move cash drawer logic** inside transactions

### Near-term (Next Week)

4. ✅ **Implement BalanceVerificationService**

5. ✅ **Add nightly verification job**

6. ✅ **Test failure scenarios** (verify rollback works)

### Long-term (If Needed)

7. ⭐ **Add journal_entries table** (only if need full GL)

8. ⭐ **Update all transaction methods** to create journal entries

---

## Testing Atomicity

```typescript
// Test that rollback works
async function testAtomicity() {
  const { db } = await import('../lib/db');
  
  // Get initial state
  const customerBefore = await db.customers.get(customerId);
  const cashBefore = await db.cash_drawer_sessions
    .where('closed_at').equals(null)
    .first();
  
  const initialCustomerBalance = customerBefore.usd_balance;
  const initialCashAmount = cashBefore.current_amount;
  
  try {
    // Force a failure by corrupting data mid-transaction
    await db.transaction('rw', 
      [db.customers, db.transactions, db.cash_drawer_sessions], 
      async () => {
        await db.customers.update(customerId, { usd_balance: 0 });
        await db.transactions.add({ id: 'test-txn', ... });
        
        // Force failure
        throw new Error('TEST FAILURE');
      }
    );
  } catch (error) {
    console.log('Expected failure:', error.message);
  }
  
  // Verify rollback
  const customerAfter = await db.customers.get(customerId);
  const cashAfter = await db.cash_drawer_sessions
    .where('closed_at').equals(null)
    .first();
  
  console.assert(
    customerAfter.usd_balance === initialCustomerBalance,
    'Customer balance should be unchanged'
  );
  
  console.assert(
    cashAfter.current_amount === initialCashAmount,
    'Cash drawer should be unchanged'
  );
  
  console.log('✅ Atomicity test passed - rollback works correctly');
}
```

---

## Summary

### ✅ Achieving Atomicity (Your System)

```typescript
await db.transaction('rw', [db.tables...], async () => {
  // All database operations here are atomic
  // Either ALL succeed or ALL rollback
});
```

### ✅ Verifying sum(debits) = sum(credits) (Your System)

```typescript
// Calculate balance from transactions (source of truth)
const calculated = await calculateBalanceFromTransactions(entityId);

// Compare with cached balance
const cached = entity.usd_balance;

if (Math.abs(calculated - cached) > 0.01) {
  console.error('Discrepancy found!');
}
```

### ⭐ (Optional) Explicit Double-Entry

```typescript
// Create journal entries with debit/credit columns
await db.journal_entries.add({ debit: 100, credit: 0 });  // Debit cash
await db.journal_entries.add({ debit: 0, credit: 100 });  // Credit AR

// Verify
const sum_debits = SUM(journal_entries.debit);
const sum_credits = SUM(journal_entries.credit);
assert(sum_debits === sum_credits);
```

---

**You don't need journal entries to have a working, auditable system.**

**You DO need atomic transactions to ensure data integrity.**

**Implement Part 1 (atomicity) this week. Part 2 (verification) next week. Part 3 (journal entries) only if you grow into a full ERP.**
