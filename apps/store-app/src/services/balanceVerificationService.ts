/**
 * BALANCE VERIFICATION SERVICE
 * Verifies entity balances against transaction history for data integrity
 * 
 * This service ensures that stored balances match calculated balances from transactions
 */

import { db } from '../lib/db';
import { TransactionService } from './transactionService';
import { currencyService } from './currencyService';
import { auditLogService } from './auditLogService';
import { BalanceCalculator } from '../utils/balanceCalculator';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface BalanceDiscrepancy {
  entityType: 'customer' | 'supplier';
  entityId: string;
  entityName: string;
  storedBalance: { USD: number; LBP: number };
  calculatedBalance: { USD: number; LBP: number };
  difference: { USD: number; LBP: number };
}

export interface BalanceVerificationResult {
  verified: boolean;
  discrepancies: BalanceDiscrepancy[];
  totalEntitiesChecked: number;
  verificationTimestamp: string;
}

export interface EntityBalance {
  USD: number;
  LBP: number;
}

// ============================================================================
// BALANCE VERIFICATION SERVICE CLASS
// ============================================================================

export class BalanceVerificationService {
  // Simplified from singleton pattern - this service is stateless
  private transactionService: TransactionService;

  constructor() {
    this.transactionService = TransactionService.getInstance();
  }

  // ==========================================================================
  // MAIN VERIFICATION METHODS
  // ==========================================================================

  /**
   * Verify all customer and supplier balances against transaction history
   */
  public async verifyAllBalances(storeId: string): Promise<BalanceVerificationResult> {
    try {
      const discrepancies: BalanceDiscrepancy[] = [];
      let totalEntitiesChecked = 0;

      // Verify customers
      const customerDiscrepancies = await this.verifyCustomerBalances(storeId);
      discrepancies.push(...customerDiscrepancies);
      
      // Count customers checked
      const customers = await db.customers
        .where('store_id')
        .equals(storeId)
        .and(c => !c._deleted)
        .toArray();
      totalEntitiesChecked += customers.length;

      // Verify suppliers
      const supplierDiscrepancies = await this.verifySupplierBalances(storeId);
      discrepancies.push(...supplierDiscrepancies);
      
      // Count suppliers checked
      const suppliers = await db.suppliers
        .where('store_id')
        .equals(storeId)
        .and(s => !s._deleted)
        .toArray();
      totalEntitiesChecked += suppliers.length;

      const result: BalanceVerificationResult = {
        verified: discrepancies.length === 0,
        discrepancies,
        totalEntitiesChecked,
        verificationTimestamp: new Date().toISOString()
      };

      // Log verification result
      await this.logVerificationResult(storeId, result);

      return result;

    } catch (error) {
      console.error('❌ Balance verification failed:', error);
      throw error;
    }
  }

  /**
   * Verify balances for a specific entity
   */
  public async verifyEntityBalance(
    entityId: string,
    entityType: 'customer' | 'supplier'
  ): Promise<BalanceDiscrepancy | null> {
    try {
      const entity = entityType === 'customer' 
        ? await db.customers.get(entityId)
        : await db.suppliers.get(entityId);

      if (!entity) {
        throw new Error(`${entityType} not found: ${entityId}`);
      }

      const storedBalance = {
        USD: entity.usd_balance || 0,
        LBP: entity.lb_balance || 0
      };

      const calculatedBalance = await this.calculateEntityBalanceFromTransactions(
        entityId,
        entityType
      );

      const usdDiff = Math.abs(calculatedBalance.USD - storedBalance.USD);
      const lbpDiff = Math.abs(calculatedBalance.LBP - storedBalance.LBP);

      // Consider balances equal if difference is less than 0.01 (1 cent)
      if (usdDiff < 0.01 && lbpDiff < 0.01) {
        return null; // No discrepancy
      }

      return {
        entityType,
        entityId,
        entityName: entity.name,
        storedBalance,
        calculatedBalance,
        difference: {
          USD: calculatedBalance.USD - storedBalance.USD,
          LBP: calculatedBalance.LBP - storedBalance.LBP
        }
      };

    } catch (error) {
      console.error(`❌ Entity balance verification failed for ${entityType} ${entityId}:`, error);
      throw error;
    }
  }

  // ==========================================================================
  // CUSTOMER BALANCE VERIFICATION
  // ==========================================================================

  /**
   * Verify all customer balances in a store
   */
  private async verifyCustomerBalances(storeId: string): Promise<BalanceDiscrepancy[]> {
    const discrepancies: BalanceDiscrepancy[] = [];

    try {
      const customers = await db.customers
        .where('store_id')
        .equals(storeId)
        .and(c => !c._deleted)
        .toArray();

      for (const customer of customers) {
        const discrepancy = await this.verifyEntityBalance(customer.id, 'customer');
        if (discrepancy) {
          discrepancies.push(discrepancy);
        }
      }

    } catch (error) {
      console.error('❌ Customer balance verification failed:', error);
      throw error;
    }

    return discrepancies;
  }

  // ==========================================================================
  // SUPPLIER BALANCE VERIFICATION
  // ==========================================================================

  /**
   * Verify all supplier balances in a store
   */
  private async verifySupplierBalances(storeId: string): Promise<BalanceDiscrepancy[]> {
    const discrepancies: BalanceDiscrepancy[] = [];

    try {
      const suppliers = await db.suppliers
        .where('store_id')
        .equals(storeId)
        .and(s => !s._deleted)
        .toArray();

      for (const supplier of suppliers) {
        const discrepancy = await this.verifyEntityBalance(supplier.id, 'supplier');
        if (discrepancy) {
          discrepancies.push(discrepancy);
        }
      }

    } catch (error) {
      console.error('❌ Supplier balance verification failed:', error);
      throw error;
    }

    return discrepancies;
  }

  // ==========================================================================
  // BALANCE CALCULATION FROM TRANSACTIONS
  // ==========================================================================

  /**
   * Calculate entity balance from transaction history
   * Now using BalanceCalculator utility for consistent calculation
   */
  private async calculateEntityBalanceFromTransactions(
    entityId: string,
    entityType: 'customer' | 'supplier'
  ): Promise<EntityBalance> {
    try {
      const transactions = await this.transactionService.getTransactionsByEntity(
        entityId,
        entityType
      );

      // Use BalanceCalculator for consistent balance calculation logic
      return BalanceCalculator.calculateFromTransactions(transactions, entityType);

    } catch (error) {
      console.error(`❌ Balance calculation failed for ${entityType} ${entityId}:`, error);
      throw error;
    }
  }

  // ==========================================================================
  // BALANCE CORRECTION METHODS
  // ==========================================================================

  /**
   * Fix balance discrepancies by updating stored balances to match calculated ones
   * USE WITH EXTREME CAUTION - This modifies stored data
   */
  public async fixDiscrepancies(
    discrepancies: BalanceDiscrepancy[],
    userId: string,
    reason: string = 'Balance verification correction'
  ): Promise<{ fixed: number; failed: number; errors: string[] }> {
    let fixed = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      for (const discrepancy of discrepancies) {
        try {
          await this.fixEntityBalance(discrepancy, userId, reason);
          fixed++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to fix ${discrepancy.entityType} ${discrepancy.entityName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error('❌', errorMsg);
        }
      }

      // Log the correction operation
      await auditLogService.log({
        action: 'system_maintenance',
        entityType: 'system',
        entityId: 'balance_verification',
        description: `Fixed ${fixed} balance discrepancies, ${failed} failed. Reason: ${reason}`,
        userId,
        severity: 'high',
        tags: ['balance_correction', 'system_maintenance'],
        metadata: {
          source: 'system',
          module: 'balance_verification',
          correlationId: `balance-fix-${Date.now()}`
        }
      });

      return { fixed, failed, errors };

    } catch (error) {
      console.error('❌ Balance correction process failed:', error);
      throw error;
    }
  }

  /**
   * Fix a single entity's balance discrepancy
   */
  private async fixEntityBalance(
    discrepancy: BalanceDiscrepancy,
    userId: string,
    reason: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    try {
      // Update the entity's balance to match calculated balance
      const updateData: any = {
        usd_balance: discrepancy.calculatedBalance.USD,
        lb_balance: discrepancy.calculatedBalance.LBP,
        updated_at: timestamp,
        _synced: false
      };

      if (discrepancy.entityType === 'customer') {
        await db.customers.update(discrepancy.entityId, updateData);
      } else {
        await db.suppliers.update(discrepancy.entityId, updateData);
      }

      // Log the correction
      const balanceAction = discrepancy.entityType === 'customer' ? 'customer_balance_adjusted' : 'supplier_balance_adjusted';
      await auditLogService.log({
        action: balanceAction,
        entityType: discrepancy.entityType,
        entityId: discrepancy.entityId,
        entityName: discrepancy.entityName,
        description: `Balance corrected: USD ${currencyService.formatCurrency(discrepancy.storedBalance.USD, 'USD')} → ${currencyService.formatCurrency(discrepancy.calculatedBalance.USD, 'USD')}, LBP ${currencyService.formatCurrency(discrepancy.storedBalance.LBP, 'LBP')} → ${currencyService.formatCurrency(discrepancy.calculatedBalance.LBP, 'LBP')}. Reason: ${reason}`,
        userId,
        previousData: {
          usd_balance: discrepancy.storedBalance.USD,
          lb_balance: discrepancy.storedBalance.LBP
        },
        newData: {
          usd_balance: discrepancy.calculatedBalance.USD,
          lb_balance: discrepancy.calculatedBalance.LBP
        },
        changedFields: ['usd_balance', 'lb_balance'],
        severity: 'high',
        tags: ['balance_correction', discrepancy.entityType],
        metadata: {
          source: 'system',
          module: 'balance_verification',
          correlationId: `balance-correction-${Date.now()}`
        }
      });

    } catch (error) {
      console.error(`❌ Failed to fix balance for ${discrepancy.entityType} ${discrepancy.entityName}:`, error);
      throw error;
    }
  }

  // ==========================================================================
  // REPORTING AND LOGGING
  // ==========================================================================

  /**
   * Generate a detailed balance verification report
   */
  public generateVerificationReport(result: BalanceVerificationResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('BALANCE VERIFICATION REPORT');
    lines.push('='.repeat(60));
    lines.push(`Verification Time: ${new Date(result.verificationTimestamp).toLocaleString()}`);
    lines.push(`Total Entities Checked: ${result.totalEntitiesChecked}`);
    lines.push(`Status: ${result.verified ? '✅ ALL BALANCES VERIFIED' : '❌ DISCREPANCIES FOUND'}`);
    lines.push('');

    if (result.discrepancies.length > 0) {
      lines.push(`DISCREPANCIES FOUND: ${result.discrepancies.length}`);
      lines.push('-'.repeat(60));

      for (const discrepancy of result.discrepancies) {
        lines.push(`${discrepancy.entityType.toUpperCase()}: ${discrepancy.entityName} (${discrepancy.entityId})`);
        lines.push(`  Stored Balance:     USD ${currencyService.formatCurrency(discrepancy.storedBalance.USD, 'USD')}, LBP ${currencyService.formatCurrency(discrepancy.storedBalance.LBP, 'LBP')}`);
        lines.push(`  Calculated Balance: USD ${currencyService.formatCurrency(discrepancy.calculatedBalance.USD, 'USD')}, LBP ${currencyService.formatCurrency(discrepancy.calculatedBalance.LBP, 'LBP')}`);
        lines.push(`  Difference:         USD ${currencyService.formatCurrency(discrepancy.difference.USD, 'USD')}, LBP ${currencyService.formatCurrency(discrepancy.difference.LBP, 'LBP')}`);
        lines.push('');
      }
    } else {
      lines.push('✅ No discrepancies found. All balances are correct.');
    }

    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * Log verification result to audit log
   */
  private async logVerificationResult(
    storeId: string,
    result: BalanceVerificationResult
  ): Promise<void> {
    try {
      await auditLogService.log({
        action: 'system_maintenance',
        entityType: 'system',
        entityId: 'balance_verification',
        description: `Balance verification completed for store ${storeId}. ${result.verified ? 'All balances verified' : `${result.discrepancies.length} discrepancies found`}. Checked ${result.totalEntitiesChecked} entities.`,
        userId: 'system',
        severity: result.verified ? 'low' : 'high',
        tags: ['balance_verification', 'system_check'],
        metadata: {
          source: 'system',
          module: 'balance_verification',
          correlationId: `verification-${Date.now()}`
        }
      });
    } catch (error) {
      console.warn('⚠️ Failed to log verification result:', error);
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Check if an entity has any balance discrepancies
   */
  public async hasDiscrepancies(
    entityId: string,
    entityType: 'customer' | 'supplier'
  ): Promise<boolean> {
    try {
      const discrepancy = await this.verifyEntityBalance(entityId, entityType);
      return discrepancy !== null;
    } catch (error) {
      console.error(`❌ Error checking discrepancies for ${entityType} ${entityId}:`, error);
      return false;
    }
  }

  /**
   * Get summary of balance verification status for a store
   */
  public async getVerificationSummary(storeId: string): Promise<{
    totalCustomers: number;
    totalSuppliers: number;
    customersWithDiscrepancies: number;
    suppliersWithDiscrepancies: number;
    lastVerificationTime?: string;
  }> {
    try {
      const customers = await db.customers
        .where('store_id')
        .equals(storeId)
        .and(c => !c._deleted)
        .toArray();

      const suppliers = await db.suppliers
        .where('store_id')
        .equals(storeId)
        .and(s => !s._deleted)
        .toArray();

      let customersWithDiscrepancies = 0;
      let suppliersWithDiscrepancies = 0;

      // Check each customer for discrepancies
      for (const customer of customers) {
        if (await this.hasDiscrepancies(customer.id, 'customer')) {
          customersWithDiscrepancies++;
        }
      }

      // Check each supplier for discrepancies
      for (const supplier of suppliers) {
        if (await this.hasDiscrepancies(supplier.id, 'supplier')) {
          suppliersWithDiscrepancies++;
        }
      }

      return {
        totalCustomers: customers.length,
        totalSuppliers: suppliers.length,
        customersWithDiscrepancies,
        suppliersWithDiscrepancies
      };

    } catch (error) {
      console.error('❌ Error getting verification summary:', error);
      throw error;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

// Export service instance (stateless service - no singleton needed)
export const balanceVerificationService = new BalanceVerificationService();
