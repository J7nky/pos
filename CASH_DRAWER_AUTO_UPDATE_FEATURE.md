# Cash Drawer Auto-Update Feature

## Overview

This feature automatically updates the cash drawer value whenever cash transactions occur in the system, including sales, payments, expenses, and refunds. The system maintains real-time accuracy of cash drawer balances without manual intervention.

## Features

### 🚀 Automatic Updates
- **Cash Sales**: Automatically increases cash drawer when cash sales are completed
- **Customer Payments**: Updates cash drawer when customers make cash payments
- **Expenses**: Decreases cash drawer when cash expenses are recorded
- **Refunds**: Adjusts cash drawer for cash refunds

### 🔄 Real-time Monitoring
- Live cash drawer balance display
- Transaction history tracking
- Automatic balance calculations
- Session-based tracking

### 🛡️ Safety Features
- Only processes USD transactions (prevents currency conversion issues)
- Requires active cash drawer session
- Prevents infinite loops with transaction hooks
- Comprehensive error handling

## How It Works

### 1. Transaction Processing
When a transaction occurs, the system automatically:
1. Identifies the transaction type (sale, payment, expense, refund)
2. Checks if it's a cash transaction
3. Calculates the balance change
4. Updates the cash drawer account
5. Creates an audit trail transaction

### 2. Database Hooks
The system uses database hooks to automatically trigger updates:
- `handleTransactionCreated`: Processes new transactions
- `handleSaleItemCreated`: Handles new sale items
- Prevents infinite loops by filtering cash drawer transactions

### 3. Balance Calculation
```typescript
// Cash sales and payments increase balance
if (transactionType === 'sale' || transactionType === 'payment') {
  newBalance = currentBalance + amount;
}

// Expenses and refunds decrease balance
if (transactionType === 'expense' || transactionType === 'refund') {
  newBalance = currentBalance - amount;
}
```

## Components

### CashDrawerUpdateService
Core service that handles all cash drawer updates:

```typescript
// Update cash drawer for a sale
await cashDrawerUpdateService.updateCashDrawerForSale({
  amount: 100,
  currency: 'USD',
  paymentMethod: 'cash',
  storeId: 'store-1',
  createdBy: 'user-1'
});

// Update cash drawer for an expense
await cashDrawerUpdateService.updateCashDrawerForExpense({
  amount: 25,
  currency: 'USD',
  storeId: 'store-1',
  createdBy: 'user-1',
  description: 'Office supplies',
  category: 'Office'
});
```

### CashDrawerMonitor Component
UI component that displays:
- Current cash drawer balance
- Transaction history
- Real-time updates
- Auto-refresh functionality

## Integration Points

### POS Component
Automatically updates cash drawer when cash sales are completed:

```typescript
// In handleCheckout function
if (activeTab.paymentMethod === 'cash') {
  const cashDrawerResult = await cashDrawerUpdateService.updateCashDrawerForSale({
    amount: total,
    currency: 'USD',
    paymentMethod: activeTab.paymentMethod,
    storeId: raw.storeId,
    createdBy: userProfile?.id || '',
    customerId: activeTab.selectedCustomer || undefined,
    billNumber: billData.bill_number
  });
}
```

### Transaction Service
Updates cash drawer for customer payments and expenses:

```typescript
// Customer payments
if (options.updateCashDrawer !== false) {
  await cashDrawerUpdateService.updateCashDrawerForCustomerPayment({
    amount: amountInUSD,
    currency: 'USD',
    storeId,
    createdBy,
    customerId,
    description: `Payment for ${description}`
  });
}

// Expenses
await cashDrawerUpdateService.updateCashDrawerForExpense({
  amount: amountInUSD,
  currency: 'USD',
  storeId,
  createdBy,
  description,
  category
});
```

## Database Schema

### Cash Drawer Tables
- `cash_drawer_accounts`: Stores account information and current balance
- `cash_drawer_sessions`: Tracks open/closed sessions
- `transactions`: Records all cash drawer updates with `cash_drawer_` prefix

### Transaction Categories
- `cash_drawer_sale`: Cash sales
- `cash_drawer_payment`: Customer payments
- `cash_drawer_expense`: Cash expenses
- `cash_drawer_refund`: Cash refunds

## Usage Examples

### 1. Complete a Cash Sale
```typescript
// In POS component
const saleData = {
  amount: 150.00,
  currency: 'USD',
  paymentMethod: 'cash',
  storeId: 'store-1',
  createdBy: 'user-1'
};

const result = await cashDrawerUpdateService.updateCashDrawerForSale(saleData);
console.log(`Cash drawer updated: $${result.previousBalance} → $${result.newBalance}`);
```

### 2. Record a Cash Expense
```typescript
const expenseData = {
  amount: 25.50,
  currency: 'USD',
  storeId: 'store-1',
  createdBy: 'user-1',
  description: 'Coffee for office',
  category: 'Office Supplies'
};

const result = await cashDrawerUpdateService.updateCashDrawerForExpense(expenseData);
```

### 3. Monitor Cash Drawer
```typescript
// Get current balance
const balance = await cashDrawerUpdateService.getCurrentCashDrawerBalance('store-1');

// Get transaction history
const history = await cashDrawerUpdateService.getCashDrawerTransactionHistory('store-1');
```

## Error Handling

The system handles various error scenarios:

- **Missing Cash Drawer Account**: Returns error if no account exists
- **No Active Session**: Requires open cash drawer session
- **Invalid Currency**: Only processes USD transactions
- **Database Errors**: Comprehensive error logging and fallbacks

## Testing

Run the test suite to verify functionality:

```bash
npm test -- cashDrawerUpdateService.test.ts
```

Tests cover:
- Cash sale updates
- Expense processing
- Error handling
- Edge cases

## Configuration

### Environment Variables
- No additional configuration required
- Uses existing store and user context

### Database Requirements
- Requires `cash_drawer_accounts` table
- Requires `cash_drawer_sessions` table
- Requires `transactions` table

## Benefits

1. **Accuracy**: Real-time cash drawer balance updates
2. **Efficiency**: No manual balance calculations needed
3. **Audit Trail**: Complete transaction history
4. **User Experience**: Live balance monitoring
5. **Compliance**: Automated financial tracking

## Future Enhancements

- Multi-currency support
- Advanced reporting and analytics
- Integration with external accounting systems
- Mobile notifications for large transactions
- Automated reconciliation features
