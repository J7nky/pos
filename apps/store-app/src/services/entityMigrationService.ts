// Entity Migration Service - Phase 2 of Accounting Foundation Migration
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md - Phase 2
// 
// Migrates existing customers, suppliers, and employees to the unified entities table
// Maintains backward compatibility by keeping same IDs and preserving all data

import { db } from '../lib/db';
import { Entity } from '../types/accounting';
import { SYSTEM_ENTITY_CODES, createSystemEntities, getSystemEntity } from '../constants/systemEntities';
import { createId } from '../lib/db';

export interface MigrationResult {
  success: boolean;
  customersCount: number;
  suppliersCount: number;
  employeesCount: number;
  systemEntitiesCount: number;
  errors: string[];
}

/**
 * Entity Migration Service for Phase 2
 * Migrates existing data to unified entities table while maintaining backward compatibility
 */
export class EntityMigrationService {
  
  /**
   * Check if entities migration has been completed for a store
   */
  async isMigrationCompleted(storeId: string): Promise<boolean> {
    const [entitiesCount, customersCount, suppliersCount] = await Promise.all([
      db.entities.where('store_id').equals(storeId).count(),
      db.customers.where('store_id').equals(storeId).count(),
      db.suppliers.where('store_id').equals(storeId).count()
    ]);
    
    // Migration is complete if we have entities and they roughly match existing data
    return entitiesCount > 0 && entitiesCount >= (customersCount + suppliersCount);
  }
  
  /**
   * Migrate all customers, suppliers, and employees to entities table
   * Creates system entities and preserves all existing data
   */
  async migrateToEntities(storeId: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      customersCount: 0,
      suppliersCount: 0,
      employeesCount: 0,
      systemEntitiesCount: 0,
      errors: []
    };
    
    try {
      // Check if already migrated
      const alreadyMigrated = await this.isMigrationCompleted(storeId);
      if (alreadyMigrated) {
        result.success = true;
        result.errors.push('Migration already completed for this store');
        return result;
      }
      
      await db.transaction('rw', [db.entities, db.customers, db.suppliers, db.users], async () => {
        // 1. Migrate customers to entities
        const customers = await db.customers.where('store_id').equals(storeId).toArray();
        for (const customer of customers) {
          const entity: Omit<Entity, 'created_at' | 'updated_at'> = {
            id: customer.id, // Keep same ID for backward compatibility
            store_id: storeId,
            branch_id: null, // Will be populated later when branches are implemented
            entity_type: 'customer',
            entity_code: `CUST-${customer.id.slice(0, 8)}`,
            name: customer.name,
            phone: customer.phone,
            lb_balance: customer.lb_balance || 0,
            usd_balance: customer.usd_balance || 0,
            is_system_entity: false,
            is_active: customer.is_active ?? true,
            customer_data: {
              lb_max_balance: customer.lb_max_balance || 0,
              credit_limit: customer.lb_max_balance || 0,
              payment_terms: 'standard'
            },
            supplier_data: null,
            _synced: customer._synced ?? false
          };
          
          await db.entities.add({
            ...entity,
            created_at: customer.created_at || new Date().toISOString(),
            updated_at: customer.updated_at || new Date().toISOString()
          });
          
          result.customersCount++;
        }
        
        // 2. Migrate suppliers to entities
        const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
        for (const supplier of suppliers) {
          const entity: Omit<Entity, 'created_at' | 'updated_at'> = {
            id: supplier.id, // Keep same ID for backward compatibility
            store_id: storeId,
            branch_id: null,
            entity_type: 'supplier',
            entity_code: `SUPP-${supplier.id.slice(0, 8)}`,
            name: supplier.name,
            phone: supplier.phone,
            lb_balance: -(supplier.lb_balance || 0), // Suppliers have negative balance (we owe them)
            usd_balance: -(supplier.usd_balance || 0),
            is_system_entity: false,
            is_active: true, // Suppliers don't have is_active field, default to true
            customer_data: null,
            supplier_data: {
              supplier_type: 'regular', // Supplier.type doesn't exist in current type
              payment_terms: 'standard',
              advance_lb_balance: supplier.advance_lb_balance || 0,
              advance_usd_balance: supplier.advance_usd_balance || 0
            },
            _synced: supplier._synced ?? false
          };
          
          await db.entities.add({
            ...entity,
            created_at: supplier.created_at || new Date().toISOString(),
            updated_at: supplier.updated_at || new Date().toISOString()
          });
          
          result.suppliersCount++;
        }
        
        // 3. Migrate employees to entities
        const employees = await db.users.where('store_id').equals(storeId).toArray();
        for (const employee of employees) {
          const entity: Omit<Entity, 'created_at' | 'updated_at'> = {
            id: employee.id, // Keep same ID for backward compatibility
            store_id: storeId,
            branch_id: null,
            entity_type: 'employee',
            entity_code: `EMP-${employee.id.slice(0, 8)}`,
            name: employee.name,
            phone: employee.phone || null,
            lb_balance: -(employee.lbp_balance || 0), // Employees have negative balance (we owe them)
            usd_balance: -(employee.usd_balance || 0),
            is_system_entity: false,
            is_active: true, // Employees don't have is_active field, default to true
            customer_data: null,
            supplier_data: null,
            _synced: employee._synced ?? false
          };
          
          await db.entities.add({
            ...entity,
            created_at: employee.created_at || new Date().toISOString(),
            updated_at: employee.updated_at || new Date().toISOString()
          });
          
          result.employeesCount++;
        }
        
        // 4. Create system entities
        const systemEntities = createSystemEntities(storeId);
        for (const systemEntity of systemEntities) {
          // Map entity codes to the correct entity codes from our constants
          let entityCode: string;
          switch (systemEntity.entity_code) {
            case 'CASH':
              entityCode = SYSTEM_ENTITY_CODES.CASH_CUSTOMER;
              break;
            case 'INTERNAL':
              entityCode = SYSTEM_ENTITY_CODES.INTERNAL;
              break;
            case 'BANK':
              entityCode = SYSTEM_ENTITY_CODES.BANK;
              break;
            case 'OWNER':
              entityCode = SYSTEM_ENTITY_CODES.OWNER;
              break;
            default:
              // For any other system entities, use the entity_code as-is
              entityCode = systemEntity.entity_code;
          }
          
          // Check if system entity already exists by entity_code
          const existing = await getSystemEntity(db, storeId, entityCode);
          if (!existing) {
            // Create new entity with proper entity_code and auto-generated UUID
            const entity: Entity = {
              ...systemEntity,
              entity_code: entityCode, // Use the mapped entity_code
              id: createId(), // Generate proper UUID
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              _synced: false
            };
            
            await db.entities.add(entity);
            result.systemEntitiesCount++;
          }
        }
      });
      
      result.success = true;
      
    } catch (error) {
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error('Entity migration failed:', error);
    }
    
    return result;
  }
  
  /**
   * Verify migration integrity
   * Ensures all data was migrated correctly and balances match
   */
  async verifyMigration(storeId: string): Promise<{
    success: boolean;
    issues: string[];
    summary: {
      originalCustomers: number;
      originalSuppliers: number;
      originalEmployees: number;
      migratedEntities: number;
      systemEntities: number;
    };
  }> {
    const issues: string[] = [];
    
    try {
      const [customers, suppliers, employees, entities] = await Promise.all([
        db.customers.where('store_id').equals(storeId).toArray(),
        db.suppliers.where('store_id').equals(storeId).toArray(),
        db.users.where('store_id').equals(storeId).toArray(),
        db.entities.where('store_id').equals(storeId).toArray()
      ]);
      
      const systemEntities = entities.filter(e => e.is_system_entity);
      const migratedEntities = entities.filter(e => !e.is_system_entity);
      
      // Check counts
      const expectedTotal = customers.length + suppliers.length + employees.length;
      if (migratedEntities.length !== expectedTotal) {
        issues.push(`Entity count mismatch: expected ${expectedTotal}, got ${migratedEntities.length}`);
      }
      
      // Check system entities
      if (systemEntities.length < 4) {
        issues.push(`Missing system entities: expected at least 4, got ${systemEntities.length}`);
      }
      
      // Verify each customer was migrated
      for (const customer of customers) {
        const entity = entities.find(e => e.id === customer.id && e.entity_type === 'customer');
        if (!entity) {
          issues.push(`Customer ${customer.name} (${customer.id}) not found in entities`);
        } else {
          // Check balance consistency
          if (Math.abs((entity.lb_balance || 0) - (customer.lb_balance || 0)) > 0.01) {
            issues.push(`Customer ${customer.name} LBP balance mismatch`);
          }
          if (Math.abs((entity.usd_balance || 0) - (customer.usd_balance || 0)) > 0.01) {
            issues.push(`Customer ${customer.name} USD balance mismatch`);
          }
        }
      }
      
      // Verify each supplier was migrated
      for (const supplier of suppliers) {
        const entity = entities.find(e => e.id === supplier.id && e.entity_type === 'supplier');
        if (!entity) {
          issues.push(`Supplier ${supplier.name} (${supplier.id}) not found in entities`);
        } else {
          // Check balance consistency (suppliers have negative balances in entities)
          if (Math.abs((entity.lb_balance || 0) + (supplier.lb_balance || 0)) > 0.01) {
            issues.push(`Supplier ${supplier.name} LBP balance mismatch`);
          }
          if (Math.abs((entity.usd_balance || 0) + (supplier.usd_balance || 0)) > 0.01) {
            issues.push(`Supplier ${supplier.name} USD balance mismatch`);
          }
        }
      }
      
      return {
        success: issues.length === 0,
        issues,
        summary: {
          originalCustomers: customers.length,
          originalSuppliers: suppliers.length,
          originalEmployees: employees.length,
          migratedEntities: migratedEntities.length,
          systemEntities: systemEntities.length
        }
      };
      
    } catch (error) {
      return {
        success: false,
        issues: [`Verification failed: ${error instanceof Error ? error.message : String(error)}`],
        summary: {
          originalCustomers: 0,
          originalSuppliers: 0,
          originalEmployees: 0,
          migratedEntities: 0,
          systemEntities: 0
        }
      };
    }
  }
  
  /**
   * Get entity by original ID (for backward compatibility)
   * This allows existing code to continue working with the same IDs
   */
  async getEntityById(entityId: string): Promise<Entity | null> {
    return await db.entities.get(entityId) || null;
  }
  
  /**
   * Get entities by type for a store
   */
  async getEntitiesByType(storeId: string, entityType: 'customer' | 'supplier' | 'employee'): Promise<Entity[]> {
    return await db.entities
      .where('[store_id+entity_type]')
      .equals([storeId, entityType])
      .filter(entity => entity.is_active && !entity.is_system_entity)
      .toArray();
  }
}

// Export singleton instance
export const entityMigrationService = new EntityMigrationService();
