# ERP Financial Service Documentation

## Overview

The ERP Financial Service is a comprehensive financial management system designed to handle customer and supplier accounts, process transactions, update balances, and generate detailed reports. It provides structured outputs for every financial operation and maintains detailed logs of all transactions.

## Key Features

- **Customer Account Management**: Track customer debts, payments, and credit sales
- **Supplier Account Management**: Handle supplier commissions, payments, and balances
- **Cash Drawer Management**: Automatically update cash drawer for cash transactions
- **Transaction Logging**: Detailed logs linking items, quantities, and financial movements
- **Multi-Currency Support**: USD and LBP with automatic conversion
- **Structured Outputs**: Clear, consistent transaction summaries
- **Real-time Balance Updates**: Automatic account balance calculations
- **Comprehensive Reporting**: Financial summaries and transaction history

## Transaction Types

### 1. Customer Credit Sale
- **Purpose**: Record sales made on credit to customers
- **Effect**: Increases customer debt, creates accounts receivable
- **Cash Drawer**: No impact (credit transaction)

### 2. Customer Payment
- **Purpose**: Record payments received from customers
- **Effect**: Decreases customer debt, updates accounts receivable
- **Cash Drawer**: Increases if cash payment

### 3. Supplier Commission Payment
- **Purpose**: Calculate and record commission payments to suppliers
- **Effect**: Creates accounts payable for supplier
- **Cash Drawer**: No impact (liability creation)

### 4. Supplier Payment
- **Purpose**: Record payments made to suppliers
- **Effect**: Decreases supplier balance, updates accounts payable
- **Cash Drawer**: Decreases if cash payment

### 5. Cash Sale
- **Purpose**: Record sales made for cash
- **Effect**: No customer debt impact
- **Cash Drawer**: Increases by sale amount

### 6. Expense
- **Purpose**: Record business expenses
- **Effect**: No account balance impact
- **Cash Drawer**: Decreases by expense amount

## Structured Output Format

Every transaction processed by the ERP Financial Service returns a structured `TransactionSummary` object:

```typescript
interface TransactionSummary {
  transactionId: string;           // Unique transaction identifier
  transactionType: string;         // Type of transaction
  entityInvolved: string;          // Customer or supplier name
  amount: number;                  // Transaction amount
  currency: string;                // Currency used
  balanceBefore: number;           // Account balance before transaction
  balanceAfter: number;            // Account balance after transaction
  cashDrawerImpact: number;        // Impact on cash drawer
  itemsAffected: string[];         // List of items involved
  timestamp: string;               // Transaction timestamp
  status: 'completed' | 'pending' | 'failed';
  notes: string;                   // Additional transaction details
}
```

## Usage Examples

### Basic Usage

```typescript
import { erpFinancialService } from '../services/erpFinancialService';

// Process a customer payment
const result = erpFinancialService.processCustomerPayment(
  'customer-001',
  100.00,
  'USD',
  'Payment for invoice #123',
  'user-001'
);

console.log(`Balance updated: $${result.balanceBefore} → $${result.balanceAfter}`);
```

### Customer Credit Sale

```typescript
const sale = {
  id: 'sale-001',
  customerId: 'customer-001',
  items: [
    {
      id: 'item-001',
      productName: 'Fresh Tomatoes',
      quantity: 10,
      unitPrice: 2.50,
      totalPrice: 25.00
    }
  ],
  total: 25.00,
  amountPaid: 0,
  amountDue: 25.00,
  paymentMethod: 'credit',
  status: 'completed',
  createdBy: 'user-001'
};

const result = erpFinancialService.processCustomerCreditSale(sale, sale.items);
```

### Supplier Commission Payment

```typescript
const soldItems = [
  {
    id: 'inv-001',
    productId: 'product-001',
    supplierId: 'supplier-001',
    type: 'commission',
    quantity: 10,
    weight: 5.5,
    price: 2.00,
    commissionRate: 10
  }
];

const result = erpFinancialService.processSupplierCommissionPayment(
  'supplier-001',
  soldItems,
  10, // 10% commission rate
  'user-001'
);
```

## Account Balance Management

### Get Account Balance

```typescript
const customerBalance = erpFinancialService.getAccountBalance('customer-001');
console.log(`Customer balance: $${customerBalance?.currentBalance}`);
```

### Get All Account Balances

```typescript
const allBalances = erpFinancialService.getAllAccountBalances();
allBalances.forEach(balance => {
  console.log(`${balance.entityName}: $${balance.currentBalance}`);
});
```

## Cash Drawer Management

### Get Cash Drawer Status

```typescript
const cashDrawer = erpFinancialService.getCashDrawerStatus();
console.log(`Current amount: $${cashDrawer?.currentAmount}`);
console.log(`Total cash sales: $${cashDrawer?.totalCashSales}`);
console.log(`Total expenses: $${cashDrawer?.totalExpenses}`);
```

## Transaction History

### Get Transaction History for Entity

```typescript
const customerHistory = erpFinancialService.getTransactionHistory('customer-001');
customerHistory.forEach(transaction => {
  console.log(`${transaction.timestamp}: ${transaction.type} - $${transaction.amount}`);
});
```

## Reporting

### Generate Comprehensive Report

```typescript
const report = erpFinancialService.generateTransactionReport();

console.log('Financial Summary:');
console.log(`Total Transactions: ${report.summary.totalTransactions}`);
console.log(`Total Income: $${report.summary.totalIncome}`);
console.log(`Total Expenses: $${report.summary.totalExpenses}`);
console.log(`Net Cash Flow: $${report.summary.netCashFlow}`);

console.log('Account Balances:');
report.accountBalances.forEach(account => {
  console.log(`${account.entityName}: $${account.currentBalance}`);
});
```

### Date-Range Report

```typescript
const startDate = '2024-01-01T00:00:00Z';
const endDate = '2024-01-31T23:59:59Z';
const report = erpFinancialService.generateTransactionReport(startDate, endDate);
```

## Business Rules

### Customer Transactions
1. **Credit Sales**: Increase customer debt, create accounts receivable
2. **Payments**: Decrease customer debt, update accounts receivable status
3. **Cash Sales**: No impact on customer debt, increase cash drawer

### Supplier Transactions
1. **Commission Payments**: Created when items are sold, commission deducted
2. **Supplier Payments**: Decrease supplier balance, update accounts payable
3. **Non-Priced Items**: Bills cannot be closed if pending non-priced items exist

### Cash Drawer Rules
1. **Cash Sales**: Increase cash drawer by sale amount
2. **Cash Payments**: Increase cash drawer by payment amount
3. **Cash Expenses**: Decrease cash drawer by expense amount
4. **Credit Transactions**: No impact on cash drawer

## Currency Conversion

The service automatically handles currency conversion between USD and LBP:
- **Exchange Rate**: 1 USD = 89,500 LBP
- **Automatic Conversion**: All internal calculations use USD
- **Display Support**: Original currency preserved for display

## Error Handling

The service includes comprehensive error handling:

```typescript
try {
  const result = erpFinancialService.processCustomerPayment(
    'customer-001',
    100.00,
    'USD',
    'Payment',
    'user-001'
  );
} catch (error) {
  console.error('Transaction failed:', error.message);
}
```

## Integration with Existing System

The ERP Financial Service integrates seamlessly with the existing accounting system:

1. **Backward Compatibility**: Maintains existing transaction records
2. **Enhanced Functionality**: Adds structured outputs and detailed logging
3. **Automatic Updates**: Updates both new and legacy systems
4. **Data Persistence**: Uses localStorage for data storage

## Best Practices

1. **Always Check Results**: Verify transaction status and balance updates
2. **Handle Errors**: Implement proper error handling for all transactions
3. **Validate Inputs**: Ensure all required fields are provided
4. **Monitor Balances**: Regularly check account balances for accuracy
5. **Backup Data**: Regularly backup financial data
6. **Audit Trail**: Use transaction history for auditing purposes

## Troubleshooting

### Common Issues

1. **Customer Not Found**: Ensure customer ID exists in the system
2. **Insufficient Balance**: Check if supplier has sufficient balance for payment
3. **Non-Priced Items**: Verify no pending non-priced items before closing bills
4. **Currency Issues**: Ensure proper currency format (USD or LBP)

### Debug Information

Enable debug logging to see detailed transaction information:

```typescript
// The service automatically logs all transactions
// Check browser console for detailed information
```

## API Reference

### Core Methods

- `processCustomerCreditSale(sale, items)`: Process credit sales
- `processCustomerPayment(customerId, amount, currency, description, createdBy)`: Process customer payments
- `processSupplierCommissionPayment(supplierId, items, commissionRate, createdBy)`: Process supplier commissions
- `processSupplierPayment(supplierId, amount, currency, description, createdBy)`: Process supplier payments
- `processCashSale(sale, items)`: Process cash sales
- `processExpense(amount, currency, category, description, createdBy)`: Process expenses

### Query Methods

- `getAccountBalance(entityId)`: Get specific account balance
- `getAllAccountBalances()`: Get all account balances
- `getTransactionHistory(entityId)`: Get transaction history
- `getCashDrawerStatus()`: Get cash drawer status
- `generateTransactionReport(startDate?, endDate?)`: Generate financial report

### Utility Methods

- `hasNonPricedItems(supplierId)`: Check for pending non-priced items
- `getPendingReceivables(customerId)`: Get pending receivables
- `getPendingPayables(supplierId)`: Get pending payables

## Support

For questions or issues with the ERP Financial Service:

1. Check the example file: `src/examples/financialServiceExample.ts`
2. Review the integration in: `src/components/Accounting.tsx`
3. Examine the service implementation: `src/services/erpFinancialService.ts`
4. Test with the Financial Processor component: `src/components/FinancialProcessor.tsx` 