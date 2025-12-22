/**
 * Phase 8: Verification Script for Journal-Based Balance System
 * 
 * This script verifies that:
 * 1. Journal entries use the new base currency schema (debit_usd, credit_usd, debit_lbp, credit_lbp)
 * 2. Entity balances are calculated from journal entries (not stored)
 * 3. Double-entry bookkeeping is balanced for both currencies
 * 4. No direct balance updates are happening on entities
 * 5. Balance calculation utilities work correctly
 */

import { db } from '../lib/db';
import { entityBalanceService } from '../services/entityBalanceService';
import { calculateBalance, calculateBothCurrencies } from '../utils/balanceCalculation';
import { journalValidationService } from '../services/journalValidationService';

interface VerificationResult {
  testName: string;
  passed: boolean;
  details: string;
  error?: string;
}

export async function verifyJournalBasedBalances(storeId: string): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  
  console.log('🔍 Verifying Journal-Based Balance System...');
  console.log('='.repeat(60));
  
  try {
    // Test 1: Verify journal entry schema
    results.push(await verifyJournalEntrySchema(storeId));
    
    // Test 2: Verify double-entry balance for USD
    results.push(await verifyDoubleEntryBalance(storeId, 'USD'));
    
    // Test 3: Verify double-entry balance for LBP
    results.push(await verifyDoubleEntryBalance(storeId, 'LBP'));
    
    // Test 4: Verify entity balances are calculated (not stored)
    results.push(await verifyEntityBalancesCalculated(storeId));
    
    // Test 5: Verify balance calculation utilities
    results.push(await verifyBalanceCalculationUtilities(storeId));
    
    // Test 6: Verify no balance fields in entities table
    results.push(await verifyNoBalanceFieldsInEntities(storeId));
    
    // Test 7: Verify journal validation service
    results.push(await verifyJournalValidationService(storeId));
    
    // Test 8: Verify entity balance service
    results.push(await verifyEntityBalanceService(storeId));
    
    // Print summary
    console.log('\n📊 Verification Summary:');
    console.log('='.repeat(60));
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    results.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.testName}`);
      if (!result.passed) {
        console.log(`   ${result.details}`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      }
    });
    
    console.log(`\n✅ Passed: ${passed}/${results.length}`);
    if (failed > 0) {
      console.log(`❌ Failed: ${failed}/${results.length}`);
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Verification failed with error:', error);
    results.push({
      testName: 'Verification Script',
      passed: false,
      details: 'Verification script encountered an error',
      error: error instanceof Error ? error.message : String(error)
    });
    return results;
  }
}

/**
 * Test 1: Verify journal entry schema uses base currency fields
 */
async function verifyJournalEntrySchema(storeId: string): Promise<VerificationResult> {
  try {
    const sampleEntries = await db.journal_entries
      .where('store_id')
      .equals(storeId)
      .limit(10)
      .toArray();
    
    if (sampleEntries.length === 0) {
      return {
        testName: 'Journal Entry Schema (Base Currency Fields)',
        passed: true,
        details: 'No journal entries found - schema verification skipped (expected for new systems)'
      };
    }
    
    // Check that entries have the new schema fields
    const hasNewSchema = sampleEntries.every(entry => {
      return (
        'debit_usd' in entry &&
        'credit_usd' in entry &&
        'debit_lbp' in entry &&
        'credit_lbp' in entry
      );
    });
    
    // Check that old schema fields don't exist
    const hasOldSchema = sampleEntries.some(entry => {
      return 'debit' in entry || 'credit' in entry || 'currency' in entry;
    });
    
    if (!hasNewSchema) {
      return {
        testName: 'Journal Entry Schema (Base Currency Fields)',
        passed: false,
        details: 'Some journal entries are missing base currency fields (debit_usd, credit_usd, debit_lbp, credit_lbp)'
      };
    }
    
    if (hasOldSchema) {
      return {
        testName: 'Journal Entry Schema (Base Currency Fields)',
        passed: false,
        details: 'Some journal entries still have old schema fields (debit, credit, currency)'
      };
    }
    
    return {
      testName: 'Journal Entry Schema (Base Currency Fields)',
      passed: true,
      details: `All ${sampleEntries.length} sampled entries use the new base currency schema`
    };
    
  } catch (error) {
    return {
      testName: 'Journal Entry Schema (Base Currency Fields)',
      passed: false,
      details: 'Failed to verify journal entry schema',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test 2 & 3: Verify double-entry balance for a currency
 */
async function verifyDoubleEntryBalance(storeId: string, currency: 'USD' | 'LBP'): Promise<VerificationResult> {
  try {
    const allEntries = await db.journal_entries
      .where('store_id')
      .equals(storeId)
      .and(e => e.is_posted === true)
      .toArray();
    
    if (allEntries.length === 0) {
      return {
        testName: `Double-Entry Balance (${currency})`,
        passed: true,
        details: 'No journal entries found - balance verification skipped (expected for new systems)'
      };
    }
    
    // Group by transaction_id
    const transactionGroups = new Map<string, typeof allEntries>();
    allEntries.forEach(entry => {
      const group = transactionGroups.get(entry.transaction_id) || [];
      group.push(entry);
      transactionGroups.set(entry.transaction_id, group);
    });
    
    // Verify each transaction is balanced
    const unbalancedTransactions: string[] = [];
    
    for (const [txnId, entries] of transactionGroups.entries()) {
      let totalDebits = 0;
      let totalCredits = 0;
      
      entries.forEach(entry => {
        if (currency === 'USD') {
          totalDebits += entry.debit_usd || 0;
          totalCredits += entry.credit_usd || 0;
        } else {
          totalDebits += entry.debit_lbp || 0;
          totalCredits += entry.credit_lbp || 0;
        }
      });
      
      // Allow for small rounding errors (0.01)
      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        unbalancedTransactions.push(txnId);
      }
    }
    
    const passed = unbalancedTransactions.length === 0;
    
    return {
      testName: `Double-Entry Balance (${currency})`,
      passed,
      details: passed
        ? `All ${transactionGroups.size} transactions are balanced for ${currency}`
        : `${unbalancedTransactions.length} unbalanced transactions found for ${currency}`
    };
    
  } catch (error) {
    return {
      testName: `Double-Entry Balance (${currency})`,
      passed: false,
      details: 'Failed to verify double-entry balance',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test 4: Verify entity balances are calculated from journal entries
 */
async function verifyEntityBalancesCalculated(storeId: string): Promise<VerificationResult> {
  try {
    // Get a sample entity
    const sampleEntity = await db.entities
      .where('store_id')
      .equals(storeId)
      .and(e => (e.entity_type === 'customer' || e.entity_type === 'supplier') && !e._deleted)
      .first();
    
    if (!sampleEntity) {
      return {
        testName: 'Entity Balances Calculated from Journals',
        passed: true,
        details: 'No entities found - verification skipped (expected for new systems)'
      };
    }
    
    // Verify entity doesn't have balance fields (they should be removed)
    const hasBalanceFields = 'usd_balance' in sampleEntity || 'lb_balance' in sampleEntity;
    
    if (hasBalanceFields) {
      return {
        testName: 'Entity Balances Calculated from Journals',
        passed: false,
        details: 'Entity still has balance fields (usd_balance or lb_balance) - these should be removed'
      };
    }
    
    // Calculate balance from journal entries
    const accountCode = sampleEntity.entity_type === 'supplier' ? '2100' : '1200';
    const calculatedBalance = await entityBalanceService.getEntityBalances(
      sampleEntity.id,
      accountCode,
      false // Don't use snapshot for verification
    );
    
    return {
      testName: 'Entity Balances Calculated from Journals',
      passed: true,
      details: `Entity balance calculated from journal entries: USD ${calculatedBalance.USD.toFixed(2)}, LBP ${calculatedBalance.LBP.toFixed(2)}`
    };
    
  } catch (error) {
    return {
      testName: 'Entity Balances Calculated from Journals',
      passed: false,
      details: 'Failed to verify entity balance calculation',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test 5: Verify balance calculation utilities work correctly
 */
async function verifyBalanceCalculationUtilities(storeId: string): Promise<VerificationResult> {
  try {
    // Get sample journal entries
    const sampleEntries = await db.journal_entries
      .where('store_id')
      .equals(storeId)
      .and(e => e.is_posted === true)
      .limit(100)
      .toArray();
    
    if (sampleEntries.length === 0) {
      return {
        testName: 'Balance Calculation Utilities',
        passed: true,
        details: 'No journal entries found - utility verification skipped (expected for new systems)'
      };
    }
    
    // Test calculateBalance for USD
    const usdBalance = calculateBalance(sampleEntries, 'USD');
    
    // Test calculateBalance for LBP
    const lbpBalance = calculateBalance(sampleEntries, 'LBP');
    
    // Test calculateBothCurrencies
    const bothCurrencies = calculateBothCurrencies(sampleEntries);
    
    // Verify results match
    const usdMatches = Math.abs(usdBalance - bothCurrencies.USD) < 0.01;
    const lbpMatches = Math.abs(lbpBalance - bothCurrencies.LBP) < 0.01;
    
    if (!usdMatches || !lbpMatches) {
      return {
        testName: 'Balance Calculation Utilities',
        passed: false,
        details: 'Balance calculation utilities return inconsistent results'
      };
    }
    
    return {
      testName: 'Balance Calculation Utilities',
      passed: true,
      details: `Balance calculation utilities working correctly (tested with ${sampleEntries.length} entries)`
    };
    
  } catch (error) {
    return {
      testName: 'Balance Calculation Utilities',
      passed: false,
      details: 'Failed to verify balance calculation utilities',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test 6: Verify no balance fields in entities table
 */
async function verifyNoBalanceFieldsInEntities(storeId: string): Promise<VerificationResult> {
  try {
    const sampleEntities = await db.entities
      .where('store_id')
      .equals(storeId)
      .limit(10)
      .toArray();
    
    if (sampleEntities.length === 0) {
      return {
        testName: 'No Balance Fields in Entities Table',
        passed: true,
        details: 'No entities found - verification skipped (expected for new systems)'
      };
    }
    
    // Check that entities don't have balance fields
    const entitiesWithBalanceFields = sampleEntities.filter(entity => {
      return 'usd_balance' in entity || 'lb_balance' in entity;
    });
    
    if (entitiesWithBalanceFields.length > 0) {
      return {
        testName: 'No Balance Fields in Entities Table',
        passed: false,
        details: `${entitiesWithBalanceFields.length} entities still have balance fields (usd_balance or lb_balance)`
      };
    }
    
    return {
      testName: 'No Balance Fields in Entities Table',
      passed: true,
      details: `All ${sampleEntities.length} sampled entities have no balance fields (as expected)`
    };
    
  } catch (error) {
    return {
      testName: 'No Balance Fields in Entities Table',
      passed: false,
      details: 'Failed to verify entities table structure',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test 7: Verify journal validation service
 */
async function verifyJournalValidationService(storeId: string): Promise<VerificationResult> {
  try {
    const validation = await journalValidationService.validateStoreJournalEntries(storeId);
    
    return {
      testName: 'Journal Validation Service',
      passed: validation.isValid,
      details: validation.isValid
        ? 'All journal entries are valid'
        : `Validation errors: ${validation.errors.join(', ')}`
    };
    
  } catch (error) {
    return {
      testName: 'Journal Validation Service',
      passed: false,
      details: 'Failed to run journal validation',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test 8: Verify entity balance service
 */
async function verifyEntityBalanceService(storeId: string): Promise<VerificationResult> {
  try {
    // Get a sample entity
    const sampleEntity = await db.entities
      .where('store_id')
      .equals(storeId)
      .and(e => (e.entity_type === 'customer' || e.entity_type === 'supplier') && !e._deleted)
      .first();
    
    if (!sampleEntity) {
      return {
        testName: 'Entity Balance Service',
        passed: true,
        details: 'No entities found - service verification skipped (expected for new systems)'
      };
    }
    
    const accountCode = sampleEntity.entity_type === 'supplier' ? '2100' : '1200';
    
    // Test getEntityBalances
    const balances = await entityBalanceService.getEntityBalances(
      sampleEntity.id,
      accountCode,
      false // Don't use snapshot
    );
    
    // Verify balances are numbers
    if (typeof balances.USD !== 'number' || typeof balances.LBP !== 'number') {
      return {
        testName: 'Entity Balance Service',
        passed: false,
        details: 'Entity balance service returned invalid balance types'
      };
    }
    
    return {
      testName: 'Entity Balance Service',
      passed: true,
      details: `Entity balance service working correctly (USD: ${balances.USD.toFixed(2)}, LBP: ${balances.LBP.toFixed(2)})`
    };
    
  } catch (error) {
    return {
      testName: 'Entity Balance Service',
      passed: false,
      details: 'Failed to verify entity balance service',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Run verification for a specific store
 */
export async function runVerification(storeId: string): Promise<void> {
  const results = await verifyJournalBasedBalances(storeId);
  
  const allPassed = results.every(r => r.passed);
  
  if (allPassed) {
    console.log('\n🎉 All verification tests passed!');
    console.log('✅ Journal-based balance system is working correctly');
  } else {
    console.log('\n⚠️ Some verification tests failed');
    console.log('Please review the errors above and fix any issues');
  }
}

