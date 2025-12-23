// Legacy Compatibility Service - Phase 5 of Accounting Foundation Migration
// Provides backward compatibility layer for existing customer/supplier operations

import { getDB } from '../lib/db';
import { entityQueryService } from './entityQueryService';
import { Entity } from '../types/accounting';

export interface LegacyCustomer {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  lb_balance: number;
  usd_balance: number;
  lb_max_balance: number;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _deleted?: boolean;
}

export interface LegacySupplier {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  lb_balance: number;
  usd_balance: number;
  supplier_type: string;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _deleted?: boolean;
}

/**
 * Compatibility service to bridge between legacy customer/supplier operations
 * and the new unified entities table
 */
export class LegacyCompatibilityService {
  
  /**
   * Get customers in legacy format using entities table
   */
  async getCustomers(storeId: string): Promise<LegacyCustomer[]> {
    try {
      const entities = await entityQueryService.getCustomers(storeId, {
        includeInactive: false,
        includeCurrentBalance: true
      });
      
      return entities.map(entity => this.entityToLegacyCustomer(entity));
    } catch (error) {
      console.error('Failed to get customers from entities:', error);
      throw error; // No fallback - legacy tables removed
    }
  }
  
  /**
   * Get suppliers in legacy format using entities table
   */
  async getSuppliers(storeId: string): Promise<LegacySupplier[]> {
    try {
      const entities = await entityQueryService.getSuppliers(storeId, {
        includeInactive: false,
        includeCurrentBalance: true
      });
      
      return entities.map(entity => this.entityToLegacySupplier(entity));
    } catch (error) {
      console.error('Failed to get suppliers from entities:', error);
      throw error; // No fallback - legacy tables removed
    }
  }
  
  /**
   * Get single customer by ID
   */
  async getCustomerById(storeId: string, customerId: string): Promise<LegacyCustomer | null> {
    try {
      const entity = await entityQueryService.getEntityById(storeId, customerId, {
        includeCurrentBalance: true
      });
      
      if (!entity || entity.entity_type !== 'customer') {
        return null;
      }
      
      return this.entityToLegacyCustomer(entity);
    } catch (error) {
      console.error('Failed to get customer from entities:', error);
      throw error; // No fallback - legacy tables removed
    }
  }
  
  /**
   * Get single supplier by ID
   */
  async getSupplierById(storeId: string, supplierId: string): Promise<LegacySupplier | null> {
    try {
      const entity = await entityQueryService.getEntityById(storeId, supplierId, {
        includeCurrentBalance: true
      });
      
      if (!entity || entity.entity_type !== 'supplier') {
        return null;
      }
      
      return this.entityToLegacySupplier(entity);
    } catch (error) {
      console.error('Failed to get supplier from entities:', error);
      throw error; // No fallback - legacy tables removed
    }
  }
  
  /**
   * Update customer balance using entities table
   */
  async updateCustomerBalance(
    customerId: string,
    balanceField: 'lb_balance' | 'usd_balance',
    newBalance: number
  ): Promise<void> {
    try {
      // Update in entities table
      const updateData: any = { _synced: false };
      updateData[balanceField] = newBalance;
      
      await getDB().entities.update(customerId, updateData);
    } catch (error) {
      console.error('Failed to update customer balance:', error);
      throw error; // No fallback - legacy tables removed
    }
  }
  
  /**
   * Update supplier balance using entities table
   */
  async updateSupplierBalance(
    supplierId: string,
    balanceField: 'lb_balance' | 'usd_balance',
    newBalance: number
  ): Promise<void> {
    try {
      // Update in entities table
      const updateData: any = { _synced: false };
      updateData[balanceField] = newBalance;
      
      await getDB().entities.update(supplierId, updateData);
    } catch (error) {
      console.error('Failed to update supplier balance:', error);
      throw error; // No fallback - legacy tables removed
    }
  }
  
  /**
   * Get customer/supplier count using entities table
   */
  async getEntityCounts(storeId: string): Promise<{
    customerCount: number;
    supplierCount: number;
  }> {
    try {
      const [customers, suppliers] = await Promise.all([
        entityQueryService.getCustomers(storeId, { includeInactive: false }),
        entityQueryService.getSuppliers(storeId, { includeInactive: false })
      ]);
      
      return {
        customerCount: customers.length,
        supplierCount: suppliers.length
      };
    } catch (error) {
      console.error('Failed to get entity counts from entities table:', error);
      throw error; // No fallback - legacy tables removed
    }
  }
  
  /**
   * Search customers by name using entities table
   */
  async searchCustomers(storeId: string, searchTerm: string): Promise<Map<string, string>> {
    try {
      const customers = await entityQueryService.searchEntities(storeId, searchTerm, {
        includeInactive: false
      });
      
      const customersMap = new Map<string, string>();
      customers
        .filter(entity => entity.entity_type === 'customer')
        .forEach(entity => customersMap.set(entity.id, entity.name.toLowerCase()));
      
      return customersMap;
    } catch (error) {
      console.error('Failed to search customers from entities:', error);
      throw error; // No fallback - legacy tables removed
    }
  }
  
  /**
   * Find entity by ID in either customers or suppliers (legacy compatibility)
   */
  async findEntityById(entityId: string): Promise<{
    entity: LegacyCustomer | LegacySupplier | null;
    type: 'customer' | 'supplier' | null;
  }> {
    try {
      // Try to find in entities table first
      const entity = await getDB().entities.get(entityId);
      
      if (entity) {
        if (entity.entity_type === 'customer') {
          return {
            entity: this.entityToLegacyCustomer(entity as any),
            type: 'customer'
          };
        } else if (entity.entity_type === 'supplier') {
          return {
            entity: this.entityToLegacySupplier(entity as any),
            type: 'supplier'
          };
        }
      }
    } catch (error) {
      console.warn('Failed to find entity in entities table:', error);
    }
    
    // No fallback - legacy tables removed
    return { entity: null, type: null };
  }
  
  /**
   * Convert entity to legacy customer format
   */
  private entityToLegacyCustomer(entity: Entity & { current_balance_usd?: number; current_balance_lbp?: number }): LegacyCustomer {
    const customerData = entity.customer_data || {};
    
    return {
      id: entity.id,
      store_id: entity.store_id,
      name: entity.name,
      phone: entity.phone,
      lb_balance: entity.current_balance_lbp || entity.lb_balance || 0,
      usd_balance: entity.current_balance_usd || entity.usd_balance || 0,
      lb_max_balance: customerData.lb_max_balance || 0,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      _synced: entity._synced,
      _deleted: !entity.is_active
    };
  }
  
  /**
   * Convert entity to legacy supplier format
   */
  private entityToLegacySupplier(entity: Entity & { current_balance_usd?: number; current_balance_lbp?: number }): LegacySupplier {
    const supplierData = entity.supplier_data || {};
    
    return {
      id: entity.id,
      store_id: entity.store_id,
      name: entity.name,
      phone: entity.phone,
      lb_balance: entity.current_balance_lbp || entity.lb_balance || 0,
      usd_balance: entity.current_balance_usd || entity.usd_balance || 0,
      supplier_type: supplierData.supplier_type || 'general',
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      _synced: entity._synced,
      _deleted: !entity.is_active
    };
  }
}

// Export singleton instance
export const legacyCompatibilityService = new LegacyCompatibilityService();
