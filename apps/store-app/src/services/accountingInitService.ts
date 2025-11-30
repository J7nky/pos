// Accounting Service - Store App
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md - Phase 1
// 
// Note: Store initialization happens in admin-app via Supabase functions
// This service provides read-only access and validation for the store app

import { db } from '../lib/db';
import { SYSTEM_ENTITY_CODES, getSystemEntity } from '../constants/systemEntities';
import { ChartOfAccounts, Entity } from '../types/accounting';

/**
 * Accounting service for store operations
 * Store initialization is handled by admin-app via Supabase functions
 */
export class AccountingInitService {
  
  /**
   * Check if accounting foundation is initialized for a store
   * This validates that admin-app has properly set up the store
   */
  async isInitialized(storeId: string): Promise<boolean> {
    const [accountsCount, entitiesCount] = await Promise.all([
      db.chart_of_accounts.where('store_id').equals(storeId).count(),
      db.entities.where('[store_id+is_system_entity]').equals([storeId, true]).count()
    ]);
    
    return accountsCount > 0 && entitiesCount >= 9; // All 9 system entities
  }
  
  /**
   * Get account by code for a store
   */
  async getAccount(storeId: string, accountCode: string): Promise<ChartOfAccounts | null> {
    return await db.chart_of_accounts
      .where('[store_id+account_code]')
      .equals([storeId, accountCode])
      .first() || null;
  }
  
  /**
   * Get all accounts for a store
   */
  async getAccounts(storeId: string): Promise<ChartOfAccounts[]> {
    return await db.chart_of_accounts
      .where('store_id')
      .equals(storeId)
      .filter(account => account.is_active)
      .toArray();
  }
  
  /**
   * Get system entity by code
   * @deprecated Use getSystemEntityByType() instead
   */
  async getSystemEntityByCode(storeId: string, entityCode: string): Promise<Entity | null> {
    return await getSystemEntity(db, storeId, entityCode);
  }
  
  /**
   * Get system entity by type
   * Queries entities by entity_code (unique per store) instead of hardcoded IDs
   */
  async getSystemEntityByType(storeId: string, entityType: 'cash' | 'supplier' | 'employee' | 'internal' | 'bank' | 'tax' | 'utilities' | 'rent'): Promise<Entity | null> {
    const entityCode = entityType === 'cash' ? SYSTEM_ENTITY_CODES.CASH_CUSTOMER :
                      entityType === 'supplier' ? SYSTEM_ENTITY_CODES.CASH_SUPPLIER :
                      entityType === 'employee' ? SYSTEM_ENTITY_CODES.SALARIES :
                      entityType === 'internal' ? SYSTEM_ENTITY_CODES.INTERNAL :
                      entityType === 'bank' ? SYSTEM_ENTITY_CODES.BANK :
                      entityType === 'tax' ? SYSTEM_ENTITY_CODES.TAX_AUTHORITY :
                      entityType === 'utilities' ? SYSTEM_ENTITY_CODES.UTILITIES :
                      entityType === 'rent' ? SYSTEM_ENTITY_CODES.RENT :
                      SYSTEM_ENTITY_CODES.OWNER;
    
    return await getSystemEntity(db, storeId, entityCode);
  }
  
  /**
   * Get all entities for a store
   */
  async getEntities(storeId: string, entityType?: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal'): Promise<Entity[]> {
    let query = db.entities.where('store_id').equals(storeId);
    
    if (entityType) {
      query = db.entities.where('[store_id+entity_type]').equals([storeId, entityType]);
    }
    
    return await query.filter(entity => entity.is_active).toArray();
  }
  
  /**
   * Validate that accounting foundation is ready for operations
   * Throws error if not properly initialized by admin-app
   */
  async validateAccountingSetup(storeId: string): Promise<void> {
    const isReady = await this.isInitialized(storeId);
    
    if (!isReady) {
      throw new Error(
        `Accounting foundation not initialized for store ${storeId}. ` +
        `Please contact admin to set up the store properly.`
      );
    }
  }
}

// Export singleton instance
export const accountingInitService = new AccountingInitService();
