// Accounting Service - Store App
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md - Phase 1
// 
// Note: Store initialization happens in admin-app via Supabase functions
// This service provides read-only access and validation for the store app

import { db } from '../lib/db';
import { SYSTEM_ENTITY_IDS } from '../constants/systemEntities';
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
   * Get system entity by ID
   */
  async getSystemEntity(storeId: string, entityId: string): Promise<Entity | null> {
    const entity = await db.entities.get(entityId);
    return entity && entity.store_id === storeId && entity.is_system_entity ? entity : null;
  }
  
  /**
   * Get system entity by type
   */
  async getSystemEntityByType(storeId: string, entityType: 'cash' | 'supplier' | 'employee' | 'internal' | 'bank' | 'tax' | 'utilities' | 'rent'): Promise<Entity | null> {
    const entityId = entityType === 'cash' ? SYSTEM_ENTITY_IDS.CASH_CUSTOMER :
                    entityType === 'supplier' ? SYSTEM_ENTITY_IDS.CASH_SUPPLIER :
                    entityType === 'employee' ? SYSTEM_ENTITY_IDS.SALARIES :
                    entityType === 'internal' ? SYSTEM_ENTITY_IDS.INTERNAL :
                    entityType === 'bank' ? SYSTEM_ENTITY_IDS.BANK :
                    entityType === 'tax' ? SYSTEM_ENTITY_IDS.TAX_AUTHORITY :
                    entityType === 'utilities' ? SYSTEM_ENTITY_IDS.UTILITIES :
                    entityType === 'rent' ? SYSTEM_ENTITY_IDS.RENT :
                    SYSTEM_ENTITY_IDS.OWNER;
    
    return await this.getSystemEntity(storeId, entityId);
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
