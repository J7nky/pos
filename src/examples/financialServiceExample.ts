import { erpFinancialService } from '../services/erpFinancialService';

/**
 * Example usage of the ERP Financial Service
 * This demonstrates how to process various types of transactions
 * and shows the structured output format
 */

// Example 1: Customer Credit Sale
export const exampleCustomerCreditSale = () => {
  console.log('=== EXAMPLE 1: CUSTOMER CREDIT SALE ===');
  
  const sale = {
    id: 'sale-001',
    customerId: 'customer-001',
    items: [
      {
        id: 'item-001',
        productId: 'product-001',
        productName: 'Fresh Tomatoes',
        supplierId: 'supplier-001',
        supplierName: 'Local Farm',
        quantity: 10,
        weight: 5.5,
        unitPrice: 2.50,
        totalPrice: 13.75,
        notes: 'Premium quality'
      }
    ],
    subtotal: 13.75,
    total: 13.75,
    paymentMethod: 'credit' as const,
    amountPaid: 0,
    amountDue: 13.75,
    status: 'completed' as const,
    notes: 'Credit sale to regular customer',
    createdAt: new Date().toISOString(),
    createdBy: 'user-001'
  };

  const result = erpFinancialService.processCustomerCreditSale(sale, sale.items);
  
  console.log('Transaction Summary:');
  console.log(`- Transaction ID: ${result.transactionId}`);
  console.log(`- Type: ${result.transactionType}`);
  console.log(`- Entity: ${result.entityInvolved}`);
  console.log(`- Amount: $${result.amount.toFixed(2)}`);
  console.log(`- Balance Before: $${result.balanceBefore.toFixed(2)}`);
  console.log(`- Balance After: $${result.balanceAfter.toFixed(2)}`);
  console.log(`- Cash Drawer Impact: $${result.cashDrawerImpact.toFixed(2)}`);
  console.log(`- Items: ${result.itemsAffected.join(', ')}`);
  console.log(`- Status: ${result.status}`);
  console.log(`- Notes: ${result.notes}`);
  console.log(`- Timestamp: ${result.timestamp}`);
  
  return result;
};

// Example 2: Customer Payment
export const exampleCustomerPayment = () => {
  console.log('\n=== EXAMPLE 2: CUSTOMER PAYMENT ===');
  
  const result = erpFinancialService.processCustomerPayment(
    'customer-001',
    10.00,
    'USD',
    'Partial payment for tomatoes',
    'user-001'
  );
  
  console.log('Transaction Summary:');
  console.log(`- Transaction ID: ${result.transactionId}`);
  console.log(`- Type: ${result.transactionType}`);
  console.log(`- Entity: ${result.entityInvolved}`);
  console.log(`- Amount: $${result.amount.toFixed(2)}`);
  console.log(`- Balance Before: $${result.balanceBefore.toFixed(2)}`);
  console.log(`- Balance After: $${result.balanceAfter.toFixed(2)}`);
  console.log(`- Cash Drawer Impact: $${result.cashDrawerImpact.toFixed(2)}`);
  console.log(`- Status: ${result.status}`);
  console.log(`- Notes: ${result.notes}`);
  
  return result;
};

// Example 3: Supplier Commission Payment
export const exampleSupplierCommissionPayment = () => {
  console.log('\n=== EXAMPLE 3: SUPPLIER COMMISSION PAYMENT ===');
  
  const soldItems = [
    {
      id: 'inv-001',
      productId: 'product-001',
      supplierId: 'supplier-001',
      type: 'commission' as const,
      quantity: 10,
      unit: 'kg' as const,
      weight: 5.5,
      price: 2.00,
      commissionRate: 10,
      notes: 'Sold tomatoes',
      receivedAt: new Date().toISOString(),
      receivedBy: 'user-001'
    }
  ];

  const result = erpFinancialService.processSupplierCommissionPayment(
    'supplier-001',
    soldItems,
    10, // 10% commission rate
    'user-001'
  );
  
  console.log('Transaction Summary:');
  console.log(`- Transaction ID: ${result.transactionId}`);
  console.log(`- Type: ${result.transactionType}`);
  console.log(`- Entity: ${result.entityInvolved}`);
  console.log(`- Amount: $${result.amount.toFixed(2)}`);
  console.log(`- Balance Before: $${result.balanceBefore.toFixed(2)}`);
  console.log(`- Balance After: $${result.balanceAfter.toFixed(2)}`);
  console.log(`- Cash Drawer Impact: $${result.cashDrawerImpact.toFixed(2)}`);
  console.log(`- Items: ${result.itemsAffected.join(', ')}`);
  console.log(`- Status: ${result.status}`);
  console.log(`- Notes: ${result.notes}`);
  
  return result;
};

// Example 4: Supplier Payment
export const exampleSupplierPayment = () => {
  console.log('\n=== EXAMPLE 4: SUPPLIER PAYMENT ===');
  
  const result = erpFinancialService.processSupplierPayment(
    'supplier-001',
    8.00,
    'USD',
    'Payment for commission on sold tomatoes',
    'user-001'
  );
  
  console.log('Transaction Summary:');
  console.log(`- Transaction ID: ${result.transactionId}`);
  console.log(`- Type: ${result.transactionType}`);
  console.log(`- Entity: ${result.entityInvolved}`);
  console.log(`- Amount: $${result.amount.toFixed(2)}`);
  console.log(`- Balance Before: $${result.balanceBefore.toFixed(2)}`);
  console.log(`- Balance After: $${result.balanceAfter.toFixed(2)}`);
  console.log(`- Cash Drawer Impact: $${result.cashDrawerImpact.toFixed(2)}`);
  console.log(`- Status: ${result.status}`);
  console.log(`- Notes: ${result.notes}`);
  
  return result;
};

// Example 5: Cash Sale
export const exampleCashSale = () => {
  console.log('\n=== EXAMPLE 5: CASH SALE ===');
  
  const sale = {
    id: 'sale-002',
    customerId: undefined,
    items: [
      {
        id: 'item-002',
        productId: 'product-002',
        productName: 'Fresh Lettuce',
        supplierId: 'supplier-002',
        supplierName: 'Green Valley Farm',
        quantity: 5,
        weight: 2.0,
        unitPrice: 1.50,
        totalPrice: 3.00,
        notes: 'Organic lettuce'
      }
    ],
    subtotal: 3.00,
    total: 3.00,
    paymentMethod: 'cash' as const,
    amountPaid: 3.00,
    amountDue: 0,
    status: 'completed' as const,
    notes: 'Cash sale',
    createdAt: new Date().toISOString(),
    createdBy: 'user-001'
  };

  const result = erpFinancialService.processCashSale(sale, sale.items);
  
  console.log('Transaction Summary:');
  console.log(`- Transaction ID: ${result.transactionId}`);
  console.log(`- Type: ${result.transactionType}`);
  console.log(`- Entity: ${result.entityInvolved}`);
  console.log(`- Amount: $${result.amount.toFixed(2)}`);
  console.log(`- Balance Before: $${result.balanceBefore.toFixed(2)}`);
  console.log(`- Balance After: $${result.balanceAfter.toFixed(2)}`);
  console.log(`- Cash Drawer Impact: $${result.cashDrawerImpact.toFixed(2)}`);
  console.log(`- Items: ${result.itemsAffected.join(', ')}`);
  console.log(`- Status: ${result.status}`);
  console.log(`- Notes: ${result.notes}`);
  
  return result;
};

// Example 6: Expense
export const exampleExpense = () => {
  console.log('\n=== EXAMPLE 6: EXPENSE ===');
  
  const result = erpFinancialService.processExpense(
    25.00,
    'USD',
    'Utilities',
    'Electricity bill for the month',
    'user-001'
  );
  
  console.log('Transaction Summary:');
  console.log(`- Transaction ID: ${result.transactionId}`);
  console.log(`- Type: ${result.transactionType}`);
  console.log(`- Entity: ${result.entityInvolved}`);
  console.log(`- Amount: $${result.amount.toFixed(2)}`);
  console.log(`- Balance Before: $${result.balanceBefore.toFixed(2)}`);
  console.log(`- Balance After: $${result.balanceAfter.toFixed(2)}`);
  console.log(`- Cash Drawer Impact: $${result.cashDrawerImpact.toFixed(2)}`);
  console.log(`- Status: ${result.status}`);
  console.log(`- Notes: ${result.notes}`);
  
  return result;
};

// Example 7: Generate Comprehensive Report
export const exampleGenerateReport = () => {
  console.log('\n=== EXAMPLE 7: COMPREHENSIVE FINANCIAL REPORT ===');
  
  const report = erpFinancialService.generateTransactionReport();
  
  console.log('Financial Summary:');
  console.log(`- Total Transactions: ${report.summary.totalTransactions}`);
  console.log(`- Total Income: $${report.summary.totalIncome.toFixed(2)}`);
  console.log(`- Total Expenses: $${report.summary.totalExpenses.toFixed(2)}`);
  console.log(`- Net Cash Flow: $${report.summary.netCashFlow.toFixed(2)}`);
  console.log(`- Customer Payments: $${report.summary.customerPayments.toFixed(2)}`);
  console.log(`- Supplier Payments: $${report.summary.supplierPayments.toFixed(2)}`);
  console.log(`- Cash Sales: $${report.summary.cashSales.toFixed(2)}`);
  
  console.log('\nAccount Balances:');
  report.accountBalances.forEach(account => {
    console.log(`- ${account.entityName} (${account.entityType}): $${account.currentBalance.toFixed(2)}`);
  });
  
  if (report.cashDrawer) {
    console.log('\nCash Drawer Status:');
    console.log(`- Opening Amount: $${report.cashDrawer.openingAmount.toFixed(2)}`);
    console.log(`- Current Amount: $${report.cashDrawer.currentAmount.toFixed(2)}`);
    console.log(`- Total Cash Sales: $${report.cashDrawer.totalCashSales.toFixed(2)}`);
    console.log(`- Total Cash Payments: $${report.cashDrawer.totalCashPayments.toFixed(2)}`);
    console.log(`- Total Expenses: $${report.cashDrawer.totalExpenses.toFixed(2)}`);
  }
  
  return report;
};

// Example 8: Get Account Balance
export const exampleGetAccountBalance = () => {
  console.log('\n=== EXAMPLE 8: ACCOUNT BALANCE QUERY ===');
  
  const customerBalance = erpFinancialService.getAccountBalance('customer-001');
  const supplierBalance = erpFinancialService.getAccountBalance('supplier-001');
  
  if (customerBalance) {
    console.log('Customer Balance:');
    console.log(`- Name: ${customerBalance.entityName}`);
    console.log(`- Type: ${customerBalance.entityType}`);
    console.log(`- Current Balance: $${customerBalance.currentBalance.toFixed(2)}`);
    console.log(`- Currency: ${customerBalance.currency}`);
    console.log(`- Last Transaction: ${customerBalance.lastTransactionDate}`);
    console.log(`- Total Transactions: ${customerBalance.totalTransactions}`);
  }
  
  if (supplierBalance) {
    console.log('\nSupplier Balance:');
    console.log(`- Name: ${supplierBalance.entityName}`);
    console.log(`- Type: ${supplierBalance.entityType}`);
    console.log(`- Current Balance: $${supplierBalance.currentBalance.toFixed(2)}`);
    console.log(`- Currency: ${supplierBalance.currency}`);
    console.log(`- Last Transaction: ${supplierBalance.lastTransactionDate}`);
    console.log(`- Total Transactions: ${supplierBalance.totalTransactions}`);
  }
  
  return { customerBalance, supplierBalance };
};

// Example 9: Get Transaction History
export const exampleGetTransactionHistory = () => {
  console.log('\n=== EXAMPLE 9: TRANSACTION HISTORY ===');
  
  const customerHistory = erpFinancialService.getTransactionHistory('customer-001');
  const supplierHistory = erpFinancialService.getTransactionHistory('supplier-001');
  
  console.log('Customer Transaction History:');
  customerHistory.forEach(transaction => {
    console.log(`- ${transaction.timestamp}: ${transaction.type} - $${transaction.amount.toFixed(2)} (${transaction.description})`);
  });
  
  console.log('\nSupplier Transaction History:');
  supplierHistory.forEach(transaction => {
    console.log(`- ${transaction.timestamp}: ${transaction.type} - $${transaction.amount.toFixed(2)} (${transaction.description})`);
  });
  
  return { customerHistory, supplierHistory };
};

// Example 10: Check Non-Priced Items
export const exampleCheckNonPricedItems = () => {
  console.log('\n=== EXAMPLE 10: NON-PRICED ITEMS CHECK ===');
  
  const hasNonPricedItems = erpFinancialService.hasNonPricedItems('supplier-001');
  
  console.log(`Supplier has non-priced items: ${hasNonPricedItems}`);
  
  if (hasNonPricedItems) {
    console.log('⚠️  Cannot close supplier bill - pending non-priced items exist');
  } else {
    console.log('✅ Supplier bill can be closed - no pending non-priced items');
  }
  
  return hasNonPricedItems;
};

// Run all examples
export const runAllExamples = () => {
  console.log('🚀 RUNNING ERP FINANCIAL SERVICE EXAMPLES\n');
  
  try {
    exampleCustomerCreditSale();
    exampleCustomerPayment();
    exampleSupplierCommissionPayment();
    exampleSupplierPayment();
    exampleCashSale();
    exampleExpense();
    exampleGenerateReport();
    exampleGetAccountBalance();
    exampleGetTransactionHistory();
    exampleCheckNonPricedItems();
    
    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
};

// Export structured output format
export interface StructuredOutput {
  transactionId: string;
  transactionType: string;
  entityInvolved: string;
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  cashDrawerImpact: number;
  itemsAffected: string[];
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
  notes: string;
  relatedItems?: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    totalValue: number;
  }>;
  commissionRate?: number;
  commissionAmount?: number;
  netAmount?: number;
}

export default {
  exampleCustomerCreditSale,
  exampleCustomerPayment,
  exampleSupplierCommissionPayment,
  exampleSupplierPayment,
  exampleCashSale,
  exampleExpense,
  exampleGenerateReport,
  exampleGetAccountBalance,
  exampleGetTransactionHistory,
  exampleCheckNonPricedItems,
  runAllExamples
}; 