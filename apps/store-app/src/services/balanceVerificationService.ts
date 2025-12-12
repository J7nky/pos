/**
 * Balance Verification Service
 * 
 * Ensures that cached entity balances match the balances derived from journal entries.
 * This service enforces the accounting principle that journal entries are the source of truth.
 * 
 * Uses the canonical calculateBalance() function as the single source of truth.
 */

import { db } from '../lib/db';
import { calculateEntityBalance } from '../utils/balanceCalculation';

export interface BalanceVerificationResult {
  entityId: string;
  entityName: string;
  entityType: 'customer' | 'supplier' | 'employee';
  isValid: boolean;
  cachedUsdBalance: number;
  journalUsdBalance: number;
  usdDifference: number;
  cachedLbpBalance: number;
  journalLbpBalance: number;
  lbpDifference: number;
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
   * Verify that an entity's cached balance matches the journal-derived balance
   */
  async verifyEntityBalance(entityId: string): Promise<BalanceVerificationResult> {
    // Get entity from database
    const entity = await db.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    
    // Get cached balances
    const cachedUsdBalance = entity.usd_balance || 0;
    const cachedLbpBalance = entity.lb_balance || 0;
    
    // Calculate true balances from journal entries
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
    
    // Calculate differences (tolerance: 0.01 for rounding)
    const usdDifference = Math.abs(cachedUsdBalance - journalUsdBalance);
    const lbpDifference = Math.abs(cachedLbpBalance - journalLbpBalance);
    
    const isValid = usdDifference < 0.01 && lbpDifference < 0.01;
    
    return {
      entityId,
      entityName: entity.name,
      entityType: entity.entity_type as 'customer' | 'supplier' | 'employee',
      isValid,
      cachedUsdBalance,
      journalUsdBalance,
      usdDifference,
      cachedLbpBalance,
      journalLbpBalance,
      lbpDifference
    };
  }
  
  /**
   * Reconcile an entity's cached balance with journal-derived balance
   * Updates the cached balance to match the journal truth
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
      
      if (verification.isValid) {
        console.log(`✅ Entity ${verification.entityName} balance is already correct`);
        return {
          success: true,
          wasUpdated: false,
          oldUsdBalance: verification.cachedUsdBalance,
          newUsdBalance: verification.journalUsdBalance,
          oldLbpBalance: verification.cachedLbpBalance,
          newLbpBalance: verification.journalLbpBalance
        };
      }
      
      // Update entity balance to match journal truth
      await db.entities.update(entityId, {
        usd_balance: verification.journalUsdBalance,
        lb_balance: verification.journalLbpBalance,
        updated_at: new Date().toISOString(),
        _synced: false
      });
      
      console.log(`🔄 Reconciled ${verification.entityName}:`);
      console.log(`   USD: ${verification.cachedUsdBalance} → ${verification.journalUsdBalance}`);
      console.log(`   LBP: ${verification.cachedLbpBalance} → ${verification.journalLbpBalance}`);
      
      return {
        success: true,
        wasUpdated: true,
        oldUsdBalance: verification.cachedUsdBalance,
        newUsdBalance: verification.journalUsdBalance,
        oldLbpBalance: verification.cachedLbpBalance,
        newLbpBalance: verification.journalLbpBalance
      };
      
    } catch (error) {
      console.error(`Error reconciling entity ${entityId}:`, error);
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
      const entities = await db.entities
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
          
          if (result.isValid) {
            validCount++;
          } else {
            invalidCount++;
            totalDiscrepancies += result.usdDifference + result.lbpDifference;
            console.warn(`⚠️ Balance discrepancy for ${result.entityName}:`, {
              usdDiff: result.usdDifference,
              lbpDiff: result.lbpDifference
            });
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
   * Reconcile all entities in the system
   * Updates all cached balances to match journal-derived balances
   */
  async reconcileAllBalances(storeId: string): Promise<{
    totalProcessed: number;
    totalUpdated: number;
    totalSkipped: number;
    errors: number;
  }> {
    try {
      // First verify all balances
      const verification = await this.verifyAllBalances(storeId);
      
      console.log(`🔄 Reconciling ${verification.invalidEntities} entities with discrepancies...`);
      
      let totalUpdated = 0;
      let totalSkipped = 0;
      let errors = 0;
      
      // Only reconcile entities with discrepancies
      const entitiesToReconcile = verification.results.filter(r => !r.isValid);
      
      for (const entity of entitiesToReconcile) {
        try {
          const result = await this.reconcileEntityBalance(entity.entityId);
          if (result.success && result.wasUpdated) {
            totalUpdated++;
          } else {
            totalSkipped++;
          }
        } catch (error) {
          console.error(`Error reconciling entity ${entity.entityId}:`, error);
          errors++;
        }
      }
      
      console.log('✅ Reconciliation complete:', {
        totalProcessed: entitiesToReconcile.length,
        totalUpdated,
        totalSkipped,
        errors
      });
      
      return {
        totalProcessed: entitiesToReconcile.length,
        totalUpdated,
        totalSkipped,
        errors
      };
      
    } catch (error) {
      console.error('Error reconciling all balances:', error);
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
