/**
 * Account Balance Management - Usage Examples
 * 
 * This file demonstrates how to use the hybrid account balance approach:
 * - Cached balances for fast POS operations
 * - Dynamic calculation for accuracy and audit
 * - Immutable transactions with reversal support
 * - Backdated transaction handling
 */

import { accountBalanceService } from '../services/accountBalanceService';
import { transactionValidationService } from '../services/transactionValidationService';
import { AccountStatementService } from '../services/accountStatementService';
import { db } from '../lib/db';
import { Transaction } from '../lib/db';

// Example 1: Get Account Balance (Fast - uses cached balance)
export async function getCustomerBalanceFast(customerId: string) {
  console.log('=== Example 1: Fast Balance Lookup ===');
  
  const result = await accountBalanceService.getAccountBalance(
    'customer',
    customerId,
    false // Don't verify - use cached balance for speed
  );

  console.log('Current Balance:', result.currentBalance);
  console.log('Is Reconciled:', result.isReconciled);
  
  return result.currentBalance;
}

// Example 2: Get Account Balance (Accurate - verifies against transactions)
export async function getCustomerBalanceAccurate(customerId: string) {
  console.log('=== Example 2: Accurate Balance Lookup ===');
  
  const result = await accountBalanceService.getAccountBalance(
    'customer',
    customerId,
    true // Verify balance against transactions
  );

  console.log('Current Balance:', result.currentBalance);
  console.log('Opening Balance:', result.openingBalance);
  console.log('Is Reconciled:', result.isReconciled);
  
  if (result.discrepancy) {
    console.log('Discrepancy Found:', result.discrepancy);
    console.log('Balance has been automatically reconciled');
  }
  
  return result.currentBalance;
}

// Example 3: Create a New Transaction (with validation)
export async function createCustomerPayment(customerId: string, amount: number, currency: 'USD' | 'LBP') {
  console.log('=== Example 3: Create Customer Payment ===');
  
  const newTransaction = {
    store_id: 'store_123',
    type: 'income' as const,
    category: 'Customer Payment',
    amount: amount,
    currency: currency,
    description: `Payment received from customer`,
    reference: `PAY-${Date.now()}`,
    created_by: 'user_123',
    customer_id: customerId,
    supplier_id: null
  };

  // Validate the transaction before creation
  const validation = await transactionValidationService.validateTransactionCreation(newTransaction);
  
  if (!validation.isValid) {
    console.error('Transaction validation failed:', validation.errors);
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  if (validation.warnings.length > 0) {
    console.warn('Transaction warnings:', validation.warnings);
  }

  // Create the transaction
  const transaction: Transaction = {
    ...newTransaction,
    id: `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    created_at: new Date().toISOString(),
    _synced: false
  };

  await db.transactions.add(transaction);
  console.log('Transaction created:', transaction.id);

  // Update cached balance (automatically done by balance service when needed)
  await accountBalanceService.handleBackdatedTransaction('customer', customerId, transaction.created_at);
  
  return transaction;
}

// Example 4: Handle a Mistake - Create Reversal Transaction
export async function fixTransactionMistake(originalTransactionId: string, reason: string) {
  console.log('=== Example 4: Fix Transaction Mistake ===');
  
  try {
    // This will fail - transactions are immutable
    const updateValidation = await transactionValidationService.validateTransactionUpdate(
      originalTransactionId,
      { amount: 100 }, // Try to change amount
      { enforceImmutability: true }
    );
    
    console.log('Update validation result:', updateValidation);
    
    if (!updateValidation.isValid) {
      console.log('Cannot update transaction (immutable). Creating reversal instead...');
      
      // Create a reversal transaction instead
      const reversalResult = await transactionValidationService.createReversalTransaction(
        originalTransactionId,
        reason,
        'user_123'
      );
      
      console.log('Reversal transaction created:', reversalResult.reversalTransaction.id);
      console.log('Original transaction preserved for audit trail');
      
      return reversalResult.reversalTransaction;
    }
  } catch (error) {
    console.error('Error handling transaction mistake:', error);
    throw error;
  }
}

// Example 5: Handle Backdated Transaction
export async function createBackdatedTransaction(customerId: string, transactionDate: string) {
  console.log('=== Example 5: Handle Backdated Transaction ===');
  
  const backdatedTransaction: Transaction = {
    id: `backdate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    store_id: 'store_123',
    type: 'income',
    category: 'Customer Payment',
    amount: 500,
    currency: 'USD',
    description: 'Backdated payment received',
    reference: `BACKDATE-${Date.now()}`,
    created_by: 'user_123',
    created_at: transactionDate, // Past date
    customer_id: customerId,
    supplier_id: null,
    _synced: false
  };

  // Validate and create the backdated transaction
  const validation = await transactionValidationService.validateTransactionCreation({
    store_id: backdatedTransaction.store_id,
    type: backdatedTransaction.type,
    category: backdatedTransaction.category,
    amount: backdatedTransaction.amount,
    currency: backdatedTransaction.currency,
    description: backdatedTransaction.description,
    reference: backdatedTransaction.reference,
    created_by: backdatedTransaction.created_by,
    customer_id: backdatedTransaction.customer_id,
    supplier_id: backdatedTransaction.supplier_id
  });

  if (validation.isValid) {
    await db.transactions.add(backdatedTransaction);
    console.log('Backdated transaction created:', backdatedTransaction.id);
    
    // Handle the backdated transaction - this will recalculate balances
    await accountBalanceService.handleBackdatedTransaction(
      'customer',
      customerId,
      transactionDate
    );
    
    console.log('Account balance recalculated for backdated transaction');
  } else {
    console.error('Backdated transaction validation failed:', validation.errors);
  }
  
  return backdatedTransaction;
}

// Example 6: Generate Account Statement with Accurate Balances
export async function generateCustomerStatement(customerId: string, dateRange?: { start: string; end: string }) {
  console.log('=== Example 6: Generate Account Statement ===');
  
  // Get customer and related data
  const customer = await db.customers.get(customerId);
  if (!customer) {
    throw new Error(`Customer not found: ${customerId}`);
  }

  const [sales, transactions, products, inventory] = await Promise.all([
    db.bill_line_items.where('customer_id').equals(customerId).toArray(),
    db.transactions.where('customer_id').equals(customerId).toArray(),
    db.products.toArray(),
    db.inventory_items.toArray()
  ]);

  // Generate statement using enhanced service
  const statementService = AccountStatementService.getInstance();
  const statement = await statementService.generateCustomerStatement(
    customer,
    sales,
    transactions,
    products,
    inventory,
    dateRange,
    'detailed'
  );

  console.log('Statement generated for:', statement.entityName);
  console.log('Opening Balance:', statement.financialSummary.openingBalance);
  console.log('Current Balance:', statement.financialSummary.currentBalance);
  console.log('Transaction Count:', statement.transactions.length);
  
  return statement;
}

// Example 7: Reconcile All Account Balances
export async function reconcileAllAccountBalances(storeId: string) {
  console.log('=== Example 7: Reconcile All Account Balances ===');
  
  const reconciliationResult = await accountBalanceService.reconcileAllBalances(storeId);
  
  console.log('Reconciliation Results:');
  console.log(`- Customers reconciled: ${reconciliationResult.customersReconciled}`);
  console.log(`- Suppliers reconciled: ${reconciliationResult.suppliersReconciled}`);
  console.log(`- Discrepancies found: ${reconciliationResult.discrepanciesFound}`);
  console.log(`- Discrepancies fixed: ${reconciliationResult.discrepanciesFixed}`);
  
  if (reconciliationResult.discrepanciesFound === 0) {
    console.log('✅ All account balances are in sync!');
  } else {
    console.log('⚠️  Some discrepancies were found and corrected');
  }
  
  return reconciliationResult;
}

// Example 8: Calculate Running Balance for Date Range
export async function calculateBalanceForPeriod(customerId: string, startDate: string, endDate: string) {
  console.log('=== Example 8: Calculate Balance for Specific Period ===');
  
  const result = await accountBalanceService.calculateBalanceFromTransactions(
    'customer',
    customerId,
    { start: startDate, end: endDate }
  );

  console.log('Period:', startDate, 'to', endDate);
  console.log('Opening Balance:', result.openingBalance);
  console.log('Closing Balance:', result.currentBalance);
  console.log('Net Change USD:', result.currentBalance.USD - result.openingBalance.USD);
  console.log('Net Change LBP:', result.currentBalance.LBP - result.openingBalance.LBP);
  
  return result;
}

// Complete workflow example
export async function completeWorkflowExample() {
  console.log('=== Complete Workflow Example ===');
  
  const customerId = 'customer_123';
  const storeId = 'store_123';
  
  try {
    // 1. Check current balance (fast)
    console.log('\n1. Checking current balance...');
    const currentBalance = await getCustomerBalanceFast(customerId);
    
    // 2. Create a payment transaction
    console.log('\n2. Creating payment transaction...');
    const payment = await createCustomerPayment(customerId, 1000, 'USD');
    
    // 3. Verify balance accuracy
    console.log('\n3. Verifying balance accuracy...');
    const verifiedBalance = await getCustomerBalanceAccurate(customerId);
    
    // 4. Create a backdated transaction
    console.log('\n4. Creating backdated transaction...');
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await createBackdatedTransaction(customerId, yesterdayDate);
    
    // 5. Generate account statement
    console.log('\n5. Generating account statement...');
    const statement = await generateCustomerStatement(customerId);
    
    // 6. Demonstrate error correction
    console.log('\n6. Demonstrating error correction...');
    await fixTransactionMistake(payment.id, 'Incorrect amount entered');
    
    // 7. Final reconciliation
    console.log('\n7. Final reconciliation...');
    await reconcileAllAccountBalances(storeId);
    
    console.log('\n✅ Complete workflow example finished successfully!');
    
  } catch (error) {
    console.error('Error in workflow example:', error);
    throw error;
  }
}

// Export all examples
export const examples = {
  getCustomerBalanceFast,
  getCustomerBalanceAccurate,
  createCustomerPayment,
  fixTransactionMistake,
  createBackdatedTransaction,
  generateCustomerStatement,
  reconcileAllAccountBalances,
  calculateBalanceForPeriod,
  completeWorkflowExample
};
