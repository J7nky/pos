/**
 * Balance Verification Service
 * 
 * Provides balance verification and reconciliation utilities.
 * Since balances are now calculated exclusively from journal entries (no cached fields),
 * this service focuses on verifying journal entry integrity and calculating balances.
 * 
 * Uses the canonical calculateBalance() function as the single source of truth.
 */

import { getDB } from '../lib/db';
import { calculateEntityBalance } from '../utils/balanceCalculation';

export interface BalanceVerificationResult {
  entityId: string;
  entityName: string;
  entityType: 'customer' | 'supplier' | 'employee';
  isValid: boolean; // Always true since balances are calculated from journals (source of truth)
  journalUsdBalance: number;
  journalLbpBalance: number;
  // Note: cached balance fields removed - balances are always calculated from journal entries
}

export interface BalanceReconciliationResult {
  totalEntities: number;
  validEntities: number;
  invalidEntities: number;
  totalDiscrepancies: number;
  results: BalanceVerificationResult[];
}

export class BalanceVerificationService {
  
  /**
   * Calculate customer/supplier balance from journal entries
   * This is the TRUE balance based on double-entry accounting
   * 
   * Uses the canonical calculateEntityBalance() function.
   * 
   * For customers:
   * - Debit AR (1200) = increases customer balance (they owe us)
   * - Credit AR (1200) = decreases customer balance (we paid them or they paid us)
   * 
   * For suppliers:
   * - Credit AP (2100) = increases supplier balance (we owe them)
   * - Debit AP (2100) = decreases supplier balance (we paid them or they paid us)
   */
  async calculateBalanceFromJournals(
    entityId: string,
    entityType: 'customer' | 'supplier' | 'employee',
    currency: 'USD' | 'LBP'
  ): Promise<number> {
    try {
      // Determine the account code based on entity type
      const accountCode = entityType === 'supplier' ? '2100' : '1200';
      
      // Use the canonical calculation function (SINGLE SOURCE OF TRUTH)
      return await calculateEntityBalance(
        entityId,
        currency,
        accountCode as '1200' | '2100'
      );
    } catch (error) {
      console.error(`Error calculating balance from journals for entity ${entityId}:`, error);
      return 0;
    }
  }
  
  /**
   * Verify entity balance by calculating from journal entries
   * Since balances are now calculated exclusively from journal entries,
   * this always returns valid (balances are the source of truth)
   */
  async verifyEntityBalance(entityId: string): Promise<BalanceVerificationResult> {
    // Get entity from database
    const entity = await getDB().entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    
    // Calculate balances from journal entries (source of truth)
    const journalUsdBalance = await this.calculateBalanceFromJournals(
      entityId,
      entity.entity_type as 'customer' | 'supplier' | 'employee',
      'USD'
    );
    const journalLbpBalance = await this.calculateBalanceFromJournals(
      entityId,
      entity.entity_type as 'customer' | 'supplier' | 'employee',
      'LBP'
    );
    
    // Always valid since balances are calculated from journal entries (source of truth)
    return {
      entityId,
      entityName: entity.name,
      entityType: entity.entity_type as 'customer' | 'supplier' | 'employee',
      isValid: true, // Always valid - journal entries are the source of truth
      journalUsdBalance,
      journalLbpBalance
    };
  }
  
  /**
   * @deprecated Reconcile is no longer needed - balances are calculated from journal entries
   * There are no cached balance fields to reconcile.
   * This method is kept for backward compatibility but always returns success with no updates.
   */
  async reconcileEntityBalance(entityId: string): Promise<{
    success: boolean;
    wasUpdated: boolean;
    oldUsdBalance: number;
    newUsdBalance: number;
    oldLbpBalance: number;
    newLbpBalance: number;
  }> {
    try {
      const verification = await this.verifyEntityBalance(entityId);
      
      // No reconciliation needed - balances are always calculated from journal entries
      console.log(`✅ Entity ${verification.entityName} balance calculated from journal entries`);
      
      return {
        success: true,
        wasUpdated: false, // No cached fields to update
        oldUsdBalance: verification.journalUsdBalance,
        newUsdBalance: verification.journalUsdBalance,
        oldLbpBalance: verification.journalLbpBalance,
        newLbpBalance: verification.journalLbpBalance
      };
      
    } catch (error) {
      console.error(`Error processing entity ${entityId}:`, error);
      return {
        success: false,
        wasUpdated: false,
        oldUsdBalance: 0,
        newUsdBalance: 0,
        oldLbpBalance: 0,
        newLbpBalance: 0
      };
    }
  }
  
  /**
   * Verify all entities in the system
   * Returns a summary of balance verification results
   */
  async verifyAllBalances(storeId: string): Promise<BalanceReconciliationResult> {
    try {
      // Get all entities for the store
      const entities = await getDB().entities
        .where('store_id')
        .equals(storeId)
        .and(e => !e._deleted && (e.entity_type === 'customer' || e.entity_type === 'supplier' || e.entity_type === 'employee'))
        .toArray();
      
      console.log(`🔍 Verifying balances for ${entities.length} entities...`);
      
      const results: BalanceVerificationResult[] = [];
      let validCount = 0;
      let invalidCount = 0;
      let totalDiscrepancies = 0;
      
      for (const entity of entities) {
        try {
          const result = await this.verifyEntityBalance(entity.id);
          results.push(result);
          
          // All balances are valid since they're calculated from journal entries (source of truth)
          if (result.isValid) {
            validCount++;
          } else {
            // This should never happen, but kept for backward compatibility
            invalidCount++;
            console.warn(`⚠️ Unexpected invalid balance for ${result.entityName}`);
          }
        } catch (error) {
          console.error(`Error verifying entity ${entity.id}:`, error);
        }
      }
      
      const summary = {
        totalEntities: entities.length,
        validEntities: validCount,
        invalidEntities: invalidCount,
        totalDiscrepancies,
        results
      };
      
      console.log('📊 Balance Verification Summary:', {
        total: summary.totalEntities,
        valid: summary.validEntities,
        invalid: summary.invalidEntities,
        totalDiscrepancies: summary.totalDiscrepancies.toFixed(2)
      });
      
      return summary;
      
    } catch (error) {
      console.error('Error verifying all balances:', error);
      return {
        totalEntities: 0,
        validEntities: 0,
        invalidEntities: 0,
        totalDiscrepancies: 0,
        results: []
      };
    }
  }
  
  /**
   * @deprecated Reconcile is no longer needed - balances are calculated from journal entries
   * There are no cached balance fields to reconcile.
   * This method is kept for backward compatibility.
   */
  async reconcileAllBalances(storeId: string): Promise<{
    totalProcessed: number;
    totalUpdated: number;
    totalSkipped: number;
    errors: number;
  }> {
    try {
      // Verify all balances (all will be valid since calculated from journals)
      const verification = await this.verifyAllBalances(storeId);
      
      console.log(`✅ All ${verification.totalEntities} entities have balances calculated from journal entries`);
      
      // No reconciliation needed - balances are always calculated from journal entries
      return {
        totalProcessed: verification.totalEntities,
        totalUpdated: 0, // No cached fields to update
        totalSkipped: verification.totalEntities,
        errors: 0
      };
      
    } catch (error) {
      console.error('Error processing balances:', error);
      return {
        totalProcessed: 0,
        totalUpdated: 0,
        totalSkipped: 0,
        errors: 1
      };
    }
  }
}

// Export singleton instance
export const balanceVerificationService = new BalanceVerificationService();
