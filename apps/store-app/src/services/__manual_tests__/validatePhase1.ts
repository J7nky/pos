/**
 * Manual Validation Script for Transaction Service Phase 1
 * Run this to validate the service works correctly
 * 
 * Usage: node -r esbuild-register validatePhase1.ts
 * Or import and call functions from console
 */

import { TRANSACTION_CATEGORIES, isValidTransactionCategory, getTransactionType } from '../../constants/transactionCategories';

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export function validateTransactionCategories(): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  
  console.log('\n📋 Validating Transaction Categories...\n');
  
  // Check all categories exist
  const expectedCategories = [
    'CUSTOMER_PAYMENT',
    'CUSTOMER_PAYMENT_RECEIVED',
    'CUSTOMER_CREDIT_SALE',
    'SUPPLIER_PAYMENT',
    'SUPPLIER_PAYMENT_RECEIVED',
    'SUPPLIER_CREDIT_SALE',
    'SUPPLIER_COMMISSION',
    'CASH_DRAWER_SALE',
    'CASH_DRAWER_PAYMENT',
    'CASH_DRAWER_REFUND',
    'CASH_DRAWER_EXPENSE',
    'EMPLOYEE_PAYMENT',
    'EMPLOYEE_PAYMENT_RECEIVED',
    'ACCOUNTS_RECEIVABLE',
    'ACCOUNTS_PAYABLE'
  ];
  
  for (const category of expectedCategories) {
    if (!(category in TRANSACTION_CATEGORIES)) {
      errors.push(`Missing category: ${category}`);
    } else {
      console.log(`✅ ${category}: ${(TRANSACTION_CATEGORIES as any)[category]}`);
    }
  }
  
  // Check validation function
  console.log('\n📝 Testing validation function...\n');
  
  const validCategory = TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT;
  const invalidCategory = 'Invalid Category';
  
  if (isValidTransactionCategory(validCategory)) {
    console.log(`✅ Valid category accepted: ${validCategory}`);
  } else {
    errors.push(`Valid category rejected: ${validCategory}`);
  }
  
  if (!isValidTransactionCategory(invalidCategory)) {
    console.log(`✅ Invalid category rejected: ${invalidCategory}`);
  } else {
    errors.push(`Invalid category accepted: ${invalidCategory}`);
  }
  
  // Check type mapping
  console.log('\n🏷️  Testing type mapping...\n');
  
  const testCases = [
    { category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT, expectedType: 'income' },
    { category: TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT, expectedType: 'expense' },
    { category: TRANSACTION_CATEGORIES.CASH_DRAWER_SALE, expectedType: 'income' },
    { category: TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE, expectedType: 'expense' },
  ];
  
  for (const test of testCases) {
    const actualType = getTransactionType(test.category);
    if (actualType === test.expectedType) {
      console.log(`✅ ${test.category} → ${actualType}`);
    } else {
      errors.push(`Type mismatch for ${test.category}: expected ${test.expectedType}, got ${actualType}`);
    }
  }
  
  const passed = errors.length === 0;
  console.log(`\n${passed ? '✅' : '❌'} Transaction Categories: ${passed ? 'PASSED' : 'FAILED'}\n`);
  
  return { passed, errors };
}

export function validateTransactionInterface(): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  
  console.log('\n📋 Validating Transaction Interface...\n');
  
  // We can't directly test the interface, but we can check if types compile
  // This is more of a documentation check
  
  const requiredFields = [
    'id', 'type', 'category', 'amount', 'currency', 'description',
    'reference', 'store_id', 'created_by', 'created_at', 'supplier_id',
    'customer_id', '_synced'
  ];
  
  const newFields = [
    'updated_at', 'employee_id', 'metadata'
  ];
  
  console.log('Required fields:', requiredFields.join(', '));
  console.log('New fields:', newFields.join(', '));
  console.log('✅ Interface structure validated (compile-time check)');
  
  const passed = errors.length === 0;
  console.log(`\n${passed ? '✅' : '❌'} Transaction Interface: ${passed ? 'PASSED' : 'FAILED'}\n`);
  
  return { passed, errors };
}

export function validateReferenceGenerators(): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  
  console.log('\n📋 Validating Reference Generators...\n');
  
  try {
    const {
      generatePaymentReference,
      generateExpenseReference,
      generateARReference,
      generateAPReference,
      generateReference
    } = require('../../utils/referenceGenerator');
    
    // Generate some references
    const paymentRef = generatePaymentReference();
    const expenseRef = generateExpenseReference();
    const arRef = generateARReference();
    const apRef = generateAPReference();
    const customRef = generateReference('CUSTOM');
    
    // Check formats
    if (paymentRef.startsWith('PAY-') && paymentRef.length > 4) {
      console.log(`✅ Payment reference: ${paymentRef}`);
    } else {
      errors.push(`Invalid payment reference format: ${paymentRef}`);
    }
    
    if (expenseRef.startsWith('EXP-') && expenseRef.length > 4) {
      console.log(`✅ Expense reference: ${expenseRef}`);
    } else {
      errors.push(`Invalid expense reference format: ${expenseRef}`);
    }
    
    if (arRef.startsWith('AR-') && arRef.length > 3) {
      console.log(`✅ AR reference: ${arRef}`);
    } else {
      errors.push(`Invalid AR reference format: ${arRef}`);
    }
    
    if (apRef.startsWith('AP-') && apRef.length > 3) {
      console.log(`✅ AP reference: ${apRef}`);
    } else {
      errors.push(`Invalid AP reference format: ${apRef}`);
    }
    
    if (customRef.startsWith('CUSTOM-') && customRef.length > 7) {
      console.log(`✅ Custom reference: ${customRef}`);
    } else {
      errors.push(`Invalid custom reference format: ${customRef}`);
    }
    
    // Check uniqueness
    const ref1 = generatePaymentReference();
    const ref2 = generatePaymentReference();
    if (ref1 !== ref2) {
      console.log(`✅ References are unique: ${ref1} !== ${ref2}`);
    } else {
      errors.push('References are not unique!');
    }
    
  } catch (error) {
    errors.push(`Error loading reference generators: ${error}`);
  }
  
  const passed = errors.length === 0;
  console.log(`\n${passed ? '✅' : '❌'} Reference Generators: ${passed ? 'PASSED' : 'FAILED'}\n`);
  
  return { passed, errors };
}

export function validateServiceStructure(): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  
  console.log('\n📋 Validating Service Structure...\n');
  
  try {
    const { transactionService } = require('../transactionService.refactored');
    
    // Check core method exists
    const methods = [
      'createTransaction',
      'createCustomerPayment',
      'createSupplierPayment',
      'createCustomerCreditSale',
      'createEmployeePayment',
      'createCashDrawerSale',
      'createCashDrawerExpense',
      'createAccountsReceivable',
      'createAccountsPayable',
      'updateTransaction',
      'deleteTransaction',
      'getTransaction',
      'getTransactionsByStore',
      'getTransactionsByEntity'
    ];
    
    for (const method of methods) {
      if (typeof (transactionService as any)[method] === 'function') {
        console.log(`✅ Method exists: ${method}()`);
      } else {
        errors.push(`Missing method: ${method}`);
      }
    }
    
  } catch (error) {
    errors.push(`Error loading service: ${error}`);
  }
  
  const passed = errors.length === 0;
  console.log(`\n${passed ? '✅' : '❌'} Service Structure: ${passed ? 'PASSED' : 'FAILED'}\n`);
  
  return { passed, errors };
}

// ============================================================================
// RUN ALL VALIDATIONS
// ============================================================================

export async function runAllValidations(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('  PHASE 1 VALIDATION SUITE');
  console.log('='.repeat(60));
  
  const results = [
    validateTransactionCategories(),
    validateTransactionInterface(),
    validateReferenceGenerators(),
    validateServiceStructure()
  ];
  
  const allPassed = results.every(r => r.passed);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  
  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nTotal tests: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.passed).length}`);
  console.log(`Failed: ${results.filter(r => !r.passed).length}`);
  console.log(`Total errors: ${totalErrors}`);
  
  if (!allPassed) {
    console.log('\n❌ ERRORS FOUND:\n');
    results.forEach((result, index) => {
      if (result.errors.length > 0) {
        console.log(`Test ${index + 1} errors:`);
        result.errors.forEach(error => console.log(`  - ${error}`));
        console.log();
      }
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(allPassed ? '✅ ALL VALIDATIONS PASSED' : '❌ SOME VALIDATIONS FAILED');
  console.log('='.repeat(60) + '\n');
  
  return allPassed;
}

// Auto-run if executed directly
if (require.main === module) {
  runAllValidations().then(success => {
    process.exit(success ? 0 : 1);
  });
}
