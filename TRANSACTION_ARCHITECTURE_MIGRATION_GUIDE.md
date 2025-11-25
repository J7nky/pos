# Transaction Architecture Migration Guide

**Date:** November 25, 2025  
**Status:** ✅ CURRENT

---

## Overview

This guide helps migrate from the old scattered transaction architecture to the new unified `TransactionService`. The refactor completed in phases 1-6 has consolidated all transaction logic into a single source of truth.

---

## Quick Migration Reference

### Customer Payments

```typescript
// ❌ OLD WAY (DEPRECATED)
await processCustomerPayment(customerId, amount, currency, description, createdBy, storeId);

// ✅ NEW WAY
const context = {
  userId: createdBy,
  storeId: storeId,
  module: 'payments',
  source: 'web'
};

await transactionService.createCustomerPayment(
  customerId,
  amount,
  currency,
  description,
  context
);
```

### Supplier Payments

```typescript
// ❌ OLD WAY (DEPRECATED)
await processSupplierPayment(supplierId, amount, currency, description, createdBy, storeId);

// ✅ NEW WAY
await transactionService.createSupplierPayment(
  supplierId,
  amount,
  currency,
  description,
  context
);
```

### Direct Transaction Creation

```typescript
// ❌ OLD WAY (DEPRECATED)
await db.transactions.add({
  id: generateId(),
  type: 'income',
  category: 'Customer Payment',
  // ... manual field population
});
await updateCustomerBalance(customerId, amount);
await updateCashDrawer(storeId, amount);

// ✅ NEW WAY
await transactionService.createTransaction({
  category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
  amount,
  currency,
  description,
  context,
  customerId
  // Balance and cash drawer updates happen automatically
});
```

### Balance Updates

```typescript
// ❌ OLD WAY (DEPRECATED)
await updateCustomerBalance(customerId, amount);
await updateSupplierBalance(supplierId, amount);

// ✅ NEW WAY
// No manual balance updates needed!
// TransactionService handles all balance updates automatically
// when creating transactions with updateBalances: true (default)
```

---

## Key Architectural Changes

### Before (Scattered Logic)
- Multiple services handling transactions
- Manual balance updates in multiple places
- Inconsistent validation
- Scattered audit logging
- Risk of partial updates

### After (Unified Service)
- Single `TransactionService` for all operations
- Automatic balance management
- Centralized validation
- Comprehensive audit trails
- Atomic operations with automatic rollback

---

## Import Changes

```typescript
// ❌ OLD IMPORTS
import { processCustomerPayment } from '../services/paymentManagementService';
import { updateCustomerBalance } from '../services/accountBalanceService';
import { updateCashDrawer } from '../services/cashDrawerUpdateService';

// ✅ NEW IMPORTS
import { transactionService } from '../services/transactionService';
import { TRANSACTION_CATEGORIES } from '../constants/transactionCategories';
```

---

## Error Handling Changes

```typescript
// ❌ OLD WAY
try {
  await processCustomerPayment(...);
  // Success assumed if no exception
} catch (error) {
  // Handle error
}

// ✅ NEW WAY
const result = await transactionService.createCustomerPayment(...);

if (result.success) {
  console.log('Transaction successful:', result.transactionId);
} else {
  console.error('Transaction failed:', result.error);
}
```

---

## Validation Changes

```typescript
// ❌ OLD WAY (Manual validation scattered)
if (amount <= 0) throw new Error('Invalid amount');
if (!customerId) throw new Error('Customer required');
// ... more validation in different places

// ✅ NEW WAY (Centralized validation)
// All validation happens automatically in transactionService
// No need for manual validation - service handles it all
```

---

## Audit Logging Changes

```typescript
// ❌ OLD WAY (Manual audit logging)
await auditLogService.log({
  action: 'payment_created',
  // ... manual audit data
});

// ✅ NEW WAY (Automatic audit logging)
// Audit logs created automatically for all transactions
// Includes balance changes, user context, correlation IDs
// Access via result.auditLogId
```

---

## Testing Changes

```typescript
// ❌ OLD WAY (Mock multiple services)
jest.mock('../services/paymentManagementService');
jest.mock('../services/accountBalanceService');
jest.mock('../services/cashDrawerUpdateService');

// ✅ NEW WAY (Mock single service)
jest.mock('../services/transactionService');
```

---

## Benefits of Migration

### Code Quality
- ~1,000 lines of duplicate code removed
- Single source of truth for all transactions
- Type-safe transaction categories
- Consistent error handling

### Reliability
- Atomic operations with automatic rollback
- Centralized validation prevents invalid data
- Comprehensive audit trails for all operations
- Balance integrity maintained automatically

### Maintainability
- Single service to modify for new transaction types
- Clear patterns for all transaction operations
- Easy to test and debug
- Consistent API across all transaction types

---

## Migration Checklist

### Phase 1: Update Imports
- [ ] Replace old service imports with `transactionService`
- [ ] Import `TRANSACTION_CATEGORIES` for type-safe categories
- [ ] Remove unused service imports

### Phase 2: Update Function Calls
- [ ] Replace `processCustomerPayment()` with `transactionService.createCustomerPayment()`
- [ ] Replace `processSupplierPayment()` with `transactionService.createSupplierPayment()`
- [ ] Replace direct `db.transactions.add()` with `transactionService.createTransaction()`

### Phase 3: Remove Manual Operations
- [ ] Remove manual balance update calls
- [ ] Remove manual cash drawer update calls
- [ ] Remove manual audit logging calls
- [ ] Remove manual validation code

### Phase 4: Update Error Handling
- [ ] Change from try/catch to result checking
- [ ] Update error messages to use `result.error`
- [ ] Remove manual rollback logic

### Phase 5: Update Tests
- [ ] Mock `transactionService` instead of multiple services
- [ ] Test result objects instead of exceptions
- [ ] Verify automatic balance updates work

### Phase 6: Verify Integration
- [ ] Test complete transaction flows
- [ ] Verify audit logs are created automatically
- [ ] Confirm balance integrity is maintained
- [ ] Check cash drawer updates work correctly

---

## Common Migration Issues

### Issue: Missing Context Object
```typescript
// ❌ Error: context parameter required
await transactionService.createCustomerPayment(customerId, amount, currency, description);

// ✅ Fix: Provide context
const context = { userId, storeId, module: 'payments', source: 'web' };
await transactionService.createCustomerPayment(customerId, amount, currency, description, context);
```

### Issue: Invalid Transaction Category
```typescript
// ❌ Error: Using string literals
category: 'customer_payment'

// ✅ Fix: Use constants
category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT
```

### Issue: Manual Balance Updates
```typescript
// ❌ Error: Still doing manual updates
await transactionService.createCustomerPayment(...);
await updateCustomerBalance(customerId, amount); // Remove this!

// ✅ Fix: Let service handle it
await transactionService.createCustomerPayment(...);
// Balance updated automatically
```

---

## Support

If you encounter issues during migration:

1. Check the new documentation: `ATOMIC_TRANSACTIONS_NEW_ARCHITECTURE.md`
2. Review the refactor completion report: `TRANSACTION_SERVICE_REFACTOR_COMPLETE.md`
3. Look at the test files for usage examples
4. Check deprecation warnings in console logs

---

**The migration to the new TransactionService architecture provides significant benefits in code quality, reliability, and maintainability while maintaining full backward compatibility during the transition period.**
