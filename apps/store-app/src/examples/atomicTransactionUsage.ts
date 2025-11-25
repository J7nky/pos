/**
 * ATOMIC TRANSACTION USAGE EXAMPLES
 * 
 * This file demonstrates how to use the new atomic transaction system
 * following the patterns from ATOMIC_TRANSACTIONS_NEW_ARCHITECTURE.md
 */

import { TransactionService } from '../services/transactionService';
import { balanceVerificationService } from '../services/balanceVerificationService';
import { TRANSACTION_CATEGORIES } from '../constants/transactionCategories';

// Get the singleton instance
const transactionService = TransactionService.getInstance();

// ============================================================================
// BASIC USAGE EXAMPLES
// ============================================================================

/**
 * Example 1: Customer Payment (Atomic)
 */
export async function processCustomerPayment() {
  const context = {
    userId: 'user-123',
    userEmail: 'cashier@store.com',
    userName: 'John Cashier',
    storeId: 'store-456',
    module: 'pos',
    source: 'web' as const
  };

  try {
    // ✅ ATOMIC CUSTOMER PAYMENT (NEW WAY)
    const result = await transactionService.createCustomerPayment(
      'customer-789',
      100.00,
      'USD',
      'Payment for invoice #123',
      context,
      {
        updateCashDrawer: true // Optional: update cash drawer
      }
    );

    if (result.success) {
      console.log('✅ Transaction created atomically:', {
        transactionId: result.transactionId,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        cashDrawerImpact: result.cashDrawerImpact
      });
    } else {
      console.error('❌ Transaction failed:', result.error);
    }

    return result;
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    throw error;
  }
}

/**
 * Example 2: Supplier Payment (Atomic)
 */
export async function processSupplierPayment() {
  const context = {
    userId: 'user-123',
    storeId: 'store-456',
    module: 'accounts_payable',
    source: 'web' as const
  };

  const result = await transactionService.createSupplierPayment(
    'supplier-456',
    200.00,
    'USD',
    'Payment for inventory delivery',
    context,
    {
      updateCashDrawer: true
    }
  );

  return result;
}

/**
 * Example 3: Advanced Transaction with Full Control
 */
export async function createAdvancedTransaction() {
  const context = {
    userId: 'user-123',
    storeId: 'store-456',
    module: 'advanced_operations',
    source: 'api' as const,
    correlationId: 'batch-operation-001'
  };

  // ✅ ATOMIC TRANSACTION WITH FULL CONTROL
  const result = await transactionService.createTransaction({
    category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
    amount: 150.00,
    currency: 'LBP',
    description: 'Payment for multiple invoices',
    context,
    customerId: 'cust123',
    reference: 'PAY-2025-001', // Optional custom reference
    updateBalances: true,      // Default: true
    updateCashDrawer: true,    // Default: true for cash categories
    createAuditLog: true,      // Default: true
    metadata: {
      invoiceIds: ['inv1', 'inv2', 'inv3'],
      paymentMethod: 'cash'
    }
  });

  return result;
}

/**
 * Example 4: Cash Drawer Operations
 */
export async function processCashOperations() {
  const context = {
    userId: 'user-123',
    storeId: 'store-456',
    module: 'cash_management',
    source: 'web' as const
  };

  // Cash sale (increases cash drawer)
  const saleResult = await transactionService.createCashDrawerSale(
    75,
    'USD',
    'Direct cash sale',
    context
  );

  // Cash expense (decreases cash drawer)
  const expenseResult = await transactionService.createCashDrawerExpense(
    25,
    'USD',
    'Office supplies',
    context,
    { category: 'supplies' }
  );

  return { saleResult, expenseResult };
}

// ============================================================================
// BALANCE VERIFICATION EXAMPLES
// ============================================================================

/**
 * Example 5: Verify Balance Integrity
 */
export async function verifySystemIntegrity() {
  const storeId = 'store-456';

  try {
    // Verify all balances in the store
    const verification = await balanceVerificationService.verifyAllBalances(storeId);

    if (verification.verified) {
      console.log('✅ All balances verified - system integrity maintained');
    } else {
      console.warn('❌ Balance discrepancies found:', verification.discrepancies);
      
      // Generate detailed report
      const report = balanceVerificationService.generateVerificationReport(verification);
      console.log(report);
    }

    return verification;
  } catch (error) {
    console.error('❌ Balance verification failed:', error);
    throw error;
  }
}

/**
 * Example 6: Fix Balance Discrepancies (Use with caution)
 */
export async function fixBalanceDiscrepancies() {
  const storeId = 'store-456';
  const userId = 'admin-123';

  try {
    // First, verify balances
    const verification = await balanceVerificationService.verifyAllBalances(storeId);

    if (!verification.verified && verification.discrepancies.length > 0) {
      console.warn(`Found ${verification.discrepancies.length} discrepancies. Attempting to fix...`);

      // Fix discrepancies (USE WITH EXTREME CAUTION)
      const fixResult = await balanceVerificationService.fixDiscrepancies(
        verification.discrepancies,
        userId,
        'Automated balance correction after verification'
      );

      console.log(`✅ Fixed ${fixResult.fixed} discrepancies, ${fixResult.failed} failed`);
      
      if (fixResult.errors.length > 0) {
        console.error('❌ Errors during correction:', fixResult.errors);
      }

      return fixResult;
    }

    console.log('✅ No discrepancies to fix');
    return { fixed: 0, failed: 0, errors: [] };
  } catch (error) {
    console.error('❌ Balance correction failed:', error);
    throw error;
  }
}

// ============================================================================
// ERROR HANDLING EXAMPLES
// ============================================================================

/**
 * Example 7: Proper Error Handling
 */
export async function handleTransactionErrors() {
  const context = {
    userId: 'user-123',
    storeId: 'store-456',
    module: 'error_handling_demo',
    source: 'web' as const
  };

  const result = await transactionService.createTransaction({
    category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
    amount: 100,
    currency: 'USD',
    description: 'Test transaction',
    context,
    customerId: 'customer-123'
  });

  if (!result.success) {
    // Handle specific error types
    switch (true) {
      case result.error?.includes('Invalid category'):
        console.error('Invalid transaction category provided');
        break;
      case result.error?.includes('Amount must be greater'):
        console.error('Invalid amount provided');
        break;
      case result.error?.includes('not found'):
        console.error('Entity (customer/supplier) not found');
        break;
      default:
        console.error('Unknown transaction error:', result.error);
    }
    
    // No cleanup needed - all operations automatically rolled back
    return { success: false, error: result.error };
  }

  return result;
}

// ============================================================================
// BATCH OPERATIONS (Future Enhancement)
// ============================================================================

/**
 * Example 8: Simulated Batch Operations
 * (This would be a future enhancement to the TransactionService)
 */
export async function processBatchTransactions() {
  const context = {
    userId: 'user-123',
    storeId: 'store-456',
    module: 'batch_operations',
    source: 'api' as const,
    correlationId: 'batch-001'
  };

  // For now, process transactions sequentially with same correlation ID
  const transactions = [
    {
      category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
      customerId: 'customer-1',
      amount: 50,
      description: 'Batch payment 1'
    },
    {
      category: TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT,
      supplierId: 'supplier-1',
      amount: 75,
      description: 'Batch payment 2'
    }
  ];

  const results = [];

  for (const txn of transactions) {
    const result = await transactionService.createTransaction({
      ...txn,
      currency: 'USD' as const,
      context
    });
    results.push(result);

    // If any transaction fails, you might want to handle it
    if (!result.success) {
      console.error(`❌ Batch transaction failed: ${txn.description}`, result.error);
    }
  }

  return results;
}

// ============================================================================
// USAGE SUMMARY
// ============================================================================

/**
 * Complete workflow example combining multiple operations
 */
export async function completeWorkflowExample() {
  console.log('🚀 Starting complete atomic transaction workflow...');

  try {
    // 1. Process customer payment
    console.log('📝 Processing customer payment...');
    const paymentResult = await processCustomerPayment();
    
    // 2. Verify system integrity
    console.log('🔍 Verifying system integrity...');
    const verificationResult = await verifySystemIntegrity();
    
    // 3. Handle any errors gracefully
    if (!paymentResult.success) {
      console.log('⚠️ Handling payment error...');
      await handleTransactionErrors();
    }

    console.log('✅ Workflow completed successfully!');
    
    return {
      payment: paymentResult,
      verification: verificationResult
    };
  } catch (error) {
    console.error('❌ Workflow failed:', error);
    throw error;
  }
}

// Export all examples for easy testing
export const examples = {
  processCustomerPayment,
  processSupplierPayment,
  createAdvancedTransaction,
  processCashOperations,
  verifySystemIntegrity,
  fixBalanceDiscrepancies,
  handleTransactionErrors,
  processBatchTransactions,
  completeWorkflowExample
};
