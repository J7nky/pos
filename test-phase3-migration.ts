/**
 * Phase 3 Migration Test Script
 * Tests the migrated service layer to ensure transactionService integration works correctly
 */

import { TransactionService } from './apps/store-app/src/services/transactionService';
import { EnhancedTransactionService } from './apps/store-app/src/services/enhancedTransactionService';
import { AccountBalanceService } from './apps/store-app/src/services/accountBalanceService';
import { InventoryPurchaseService } from './apps/store-app/src/services/inventoryPurchaseService';
import { CashDrawerUpdateService } from './apps/store-app/src/services/cashDrawerUpdateService';

const transactionService = TransactionService.getInstance();
const enhancedTransactionService = EnhancedTransactionService.getInstance();
const accountBalanceService = AccountBalanceService.getInstance();
const inventoryPurchaseService = InventoryPurchaseService.getInstance();
const cashDrawerUpdateService = CashDrawerUpdateService.getInstance();

interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

/**
 * Test 1: Enhanced Transaction Service - Customer Payment with AR
 */
async function testEnhancedCustomerPayment(): Promise<TestResult> {
  try {
    const result = await enhancedTransactionService.processCustomerPayment(
      'test-customer-1',
      100,
      'USD',
      'Test payment',
      {
        userId: 'test-user',
        userEmail: 'test@example.com',
        userName: 'Test User',
        module: 'test',
        source: 'api'
      },
      'test-store-1',
      {
        updateCustomerBalance: true,
        createReceivable: true,
        updateCashDrawer: false
      }
    );

    return {
      testName: 'Enhanced Customer Payment with AR',
      passed: result.success && !!result.transactionId && !!result.auditLogId,
      details: {
        transactionId: result.transactionId,
        auditLogId: result.auditLogId,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter
      }
    };
  } catch (error) {
    return {
      testName: 'Enhanced Customer Payment with AR',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Test 2: Account Balance Service - Reversal Transaction
 */
async function testReversalTransaction(): Promise<TestResult> {
  try {
    // First create a transaction to reverse
    const originalResult = await transactionService.processCustomerPayment(
      'test-customer-2',
      50,
      'USD',
      'Original payment',
      'test-user',
      'test-store-1',
      {
        updateCustomerBalance: true,
        createReceivable: false,
        updateCashDrawer: false
      }
    );

    if (!originalResult.transactionId) {
      throw new Error('Failed to create original transaction');
    }

    // Now reverse it
    const reversalTransaction = await accountBalanceService.createReversalTransaction(
      originalResult.transactionId,
      'Test reversal',
      'test-user'
    );

    return {
      testName: 'Reversal Transaction',
      passed: !!reversalTransaction && !!reversalTransaction.id,
      details: {
        originalTransactionId: originalResult.transactionId,
        reversalTransactionId: reversalTransaction.id,
        reversalAmount: reversalTransaction.amount,
        reversalType: reversalTransaction.type
      }
    };
  } catch (error) {
    return {
      testName: 'Reversal Transaction',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Test 3: Inventory Purchase Service - Credit Purchase
 */
async function testCreditPurchase(): Promise<TestResult> {
  try {
    const result = await inventoryPurchaseService.processPurchase({
      supplier_id: 'test-supplier-1',
      type: 'credit',
      items: [
        {
          product_id: 'test-product-1',
          quantity: 10,
          unit: 'kg',
          price: 5000,
          selling_price: 7000
        }
      ],
      porterage_fee: 1000,
      transfer_fee: 500,
      created_by: 'test-user',
      store_id: 'test-store-1'
    });

    return {
      testName: 'Credit Purchase Transaction',
      passed: result.success && !!result.transactionId,
      details: {
        transactionId: result.transactionId,
        totalAmount: result.totalAmount,
        supplierBalanceImpact: result.supplierBalanceImpact,
        fees: result.fees
      }
    };
  } catch (error) {
    return {
      testName: 'Credit Purchase Transaction',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Test 4: Cash Drawer Service - Customer Payment
 */
async function testCashDrawerCustomerPayment(): Promise<TestResult> {
  try {
    const result = await cashDrawerUpdateService.updateCashDrawerForCustomerPayment({
      amount: 75,
      currency: 'USD',
      storeId: 'test-store-1',
      createdBy: 'test-user',
      customerId: 'test-customer-3',
      description: 'Test cash drawer payment'
    });

    return {
      testName: 'Cash Drawer Customer Payment',
      passed: result.success && !!result.transactionId,
      details: {
        transactionId: result.transactionId,
        previousBalance: result.previousBalance,
        newBalance: result.newBalance
      }
    };
  } catch (error) {
    return {
      testName: 'Cash Drawer Customer Payment',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Test 5: Cash Drawer Service - Expense
 */
async function testCashDrawerExpense(): Promise<TestResult> {
  try {
    const result = await cashDrawerUpdateService.updateCashDrawerForExpense({
      amount: 25,
      currency: 'USD',
      storeId: 'test-store-1',
      createdBy: 'test-user',
      description: 'Test expense',
      category: 'Office Supplies'
    });

    return {
      testName: 'Cash Drawer Expense',
      passed: result.success && !!result.transactionId,
      details: {
        transactionId: result.transactionId,
        previousBalance: result.previousBalance,
        newBalance: result.newBalance
      }
    };
  } catch (error) {
    return {
      testName: 'Cash Drawer Expense',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🧪 Starting Phase 3 Migration Tests...\n');

  // Run tests
  results.push(await testEnhancedCustomerPayment());
  results.push(await testReversalTransaction());
  results.push(await testCreditPurchase());
  results.push(await testCashDrawerCustomerPayment());
  results.push(await testCashDrawerExpense());

  // Print results
  console.log('\n📊 Test Results:\n');
  console.log('═'.repeat(80));
  
  let passedCount = 0;
  let failedCount = 0;

  results.forEach((result, index) => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const icon = result.passed ? '✓' : '✗';
    
    console.log(`\n${index + 1}. ${icon} ${result.testName}`);
    console.log(`   Status: ${status}`);
    
    if (result.passed) {
      passedCount++;
      if (result.details) {
        console.log(`   Details:`, JSON.stringify(result.details, null, 2));
      }
    } else {
      failedCount++;
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }
  });

  console.log('\n' + '═'.repeat(80));
  console.log(`\n📈 Summary: ${passedCount}/${results.length} tests passed`);
  
  if (failedCount > 0) {
    console.log(`⚠️  ${failedCount} test(s) failed`);
  } else {
    console.log('🎉 All tests passed!');
  }

  console.log('\n✨ Phase 3 Migration Testing Complete\n');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

export { runAllTests, results };
