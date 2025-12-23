/**
 * Final migration script to ensure all data is in entities table
 * Run this before removing legacy tables to ensure no data loss
 * 
 * Usage:
 *   import { migrateToEntitiesOnly } from './scripts/migrateToEntitiesOnly';
 *   const result = await migrateToEntitiesOnly(storeId);
 *   console.log(result);
 */

import { getDB } from '../lib/db';
import { Entity } from '../types/accounting';

export interface MigrationResult {
  customersMigrated: number;
  suppliersMigrated: number;
  employeesMigrated: number;
  customersUpdated: number;
  suppliersUpdated: number;
  employeesUpdated: number;
  errors: Array<{
    type: 'customer' | 'supplier' | 'employee';
    id: string;
    name: string;
    error: string;
  }>;
  summary: {
    success: boolean;
    totalProcessed: number;
    totalMigrated: number;
    totalUpdated: number;
    totalErrors: number;
  };
}

/**
 * Migrate any missing customers, suppliers, and employees to entities table
 * Also update existing entities if balances are out of sync
 */
export async function migrateToEntitiesOnly(storeId: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    customersMigrated: 0,
    suppliersMigrated: 0,
    employeesMigrated: 0,
    customersUpdated: 0,
    suppliersUpdated: 0,
    employeesUpdated: 0,
    errors: [],
    summary: {
      success: false,
      totalProcessed: 0,
      totalMigrated: 0,
      totalUpdated: 0,
      totalErrors: 0
    }
  };

  console.log(`🚀 Starting migration for store: ${storeId}`);

  try {
    await getDB().transaction('rw', [getDB().entities, getDB().customers, getDB().suppliers, getDB().users], async () => {
      // Migrate customers
      console.log('📦 Migrating customers...');
      const customers = await getDB().customers
        .where('store_id')
        .equals(storeId)
        .filter(c => !c._deleted)
        .toArray();
      
      console.log(`   Found ${customers.length} customers to process`);

      for (const customer of customers) {
        try {
          const existing = await getDB().entities.get(customer.id);
          
          if (!existing) {
            // Create new entity
            const entity: Entity = {
              id: customer.id,
              store_id: storeId,
              branch_id: null,
              entity_type: 'customer',
              entity_code: `CUST-${customer.id.slice(0, 8).toUpperCase()}`,
              name: customer.name,
              phone: customer.phone || null,
              lb_balance: customer.lb_balance || 0,
              usd_balance: customer.usd_balance || 0,
              is_system_entity: false,
              is_active: customer.is_active ?? true,
              customer_data: {
                lb_max_balance: (customer as any).lb_max_balance || 0,
                credit_limit: (customer as any).lb_max_balance || 0,
                email: (customer as any).email || null,
                address: (customer as any).address || null
              },
              supplier_data: null,
              created_at: customer.created_at || new Date().toISOString(),
              updated_at: customer.updated_at || new Date().toISOString(),
              _synced: customer._synced ?? false
            };

            await getDB().entities.add(entity);
            result.customersMigrated++;
            console.log(`   ✅ Migrated customer: ${customer.name}`);
          } else {
            // Update existing entity if balances are out of sync
            const balanceMismatch = 
              Math.abs((customer.usd_balance || 0) - (existing.usd_balance || 0)) > 0.01 ||
              Math.abs((customer.lb_balance || 0) - (existing.lb_balance || 0)) > 0.01;

            if (balanceMismatch || existing.entity_type !== 'customer') {
              await getDB().entities.update(customer.id, {
                entity_type: 'customer',
                name: customer.name,
                phone: customer.phone || null,
                lb_balance: customer.lb_balance || 0,
                usd_balance: customer.usd_balance || 0,
                is_active: customer.is_active ?? true,
                customer_data: {
                  lb_max_balance: (customer as any).lb_max_balance || 0,
                  credit_limit: (customer as any).lb_max_balance || 0,
                  email: (customer as any).email || null,
                  address: (customer as any).address || null
                },
                updated_at: new Date().toISOString(),
                _synced: false
              });
              result.customersUpdated++;
              console.log(`   🔄 Updated customer entity: ${customer.name}`);
            }
          }
        } catch (error: any) {
          result.errors.push({
            type: 'customer',
            id: customer.id,
            name: customer.name,
            error: error.message || 'Unknown error'
          });
          console.error(`   ❌ Error migrating customer ${customer.name}:`, error);
        }
      }

      // Migrate suppliers
      console.log('📦 Migrating suppliers...');
      const suppliers = await getDB().suppliers
        .where('store_id')
        .equals(storeId)
        .filter(s => !s._deleted)
        .toArray();
      
      console.log(`   Found ${suppliers.length} suppliers to process`);

      for (const supplier of suppliers) {
        try {
          const existing = await getDB().entities.get(supplier.id);
          
          if (!existing) {
            // Create new entity
            const entity: Entity = {
              id: supplier.id,
              store_id: storeId,
              branch_id: null,
              entity_type: 'supplier',
              entity_code: `SUPP-${supplier.id.slice(0, 8).toUpperCase()}`,
              name: supplier.name,
              phone: (supplier as any).phone || null,
              lb_balance: supplier.lb_balance || 0,
              usd_balance: supplier.usd_balance || 0,
              is_system_entity: false,
              is_active: (supplier as any).is_active ?? true,
              customer_data: null,
              supplier_data: {
                type: supplier.type || 'standard',
                advance_lb_balance: supplier.advance_lb_balance || 0,
                advance_usd_balance: supplier.advance_usd_balance || 0,
                email: (supplier as any).email || null,
                address: (supplier as any).address || null
              },
              created_at: (supplier as any).created_at || new Date().toISOString(),
              updated_at: (supplier as any).updated_at || new Date().toISOString(),
              _synced: (supplier as any)._synced ?? false
            };

            await getDB().entities.add(entity);
            result.suppliersMigrated++;
            console.log(`   ✅ Migrated supplier: ${supplier.name}`);
          } else {
            // Update existing entity if balances are out of sync
            const balanceMismatch = 
              Math.abs((supplier.usd_balance || 0) - (existing.usd_balance || 0)) > 0.01 ||
              Math.abs((supplier.lb_balance || 0) - (existing.lb_balance || 0)) > 0.01;

            if (balanceMismatch || existing.entity_type !== 'supplier') {
              await getDB().entities.update(supplier.id, {
                entity_type: 'supplier',
                name: supplier.name,
                phone: (supplier as any).phone || null,
                lb_balance: supplier.lb_balance || 0,
                usd_balance: supplier.usd_balance || 0,
                is_active: (supplier as any).is_active ?? true,
                supplier_data: {
                  type: supplier.type || 'standard',
                  advance_lb_balance: supplier.advance_lb_balance || 0,
                  advance_usd_balance: supplier.advance_usd_balance || 0,
                  email: (supplier as any).email || null,
                  address: (supplier as any).address || null
                },
                updated_at: new Date().toISOString(),
                _synced: false
              });
              result.suppliersUpdated++;
              console.log(`   🔄 Updated supplier entity: ${supplier.name}`);
            }
          }
        } catch (error: any) {
          result.errors.push({
            type: 'supplier',
            id: supplier.id,
            name: supplier.name,
            error: error.message || 'Unknown error'
          });
          console.error(`   ❌ Error migrating supplier ${supplier.name}:`, error);
        }
      }

      // Migrate employees
      console.log('📦 Migrating employees...');
      const employees = await getDB().users
        .where('store_id')
        .equals(storeId)
        .filter(e => !e._deleted)
        .toArray();
      
      console.log(`   Found ${employees.length} employees to process`);

      for (const employee of employees) {
        try {
          const existing = await getDB().entities.get(employee.id);
          
          if (!existing) {
            // Create new entity
            const entity: Entity = {
              id: employee.id,
              store_id: storeId,
              branch_id: null,
              entity_type: 'employee',
              entity_code: `EMP-${employee.id.slice(0, 8).toUpperCase()}`,
              name: employee.name || employee.email,
              phone: (employee as any).phone || null,
              lb_balance: (employee as any).lbp_balance || 0,
              usd_balance: (employee as any).usd_balance || 0,
              is_system_entity: false,
              is_active: (employee as any).is_active ?? true,
              customer_data: null,
              supplier_data: null,
              created_at: (employee as any).created_at || new Date().toISOString(),
              updated_at: (employee as any).updated_at || new Date().toISOString(),
              _synced: (employee as any)._synced ?? false
            };

            await getDB().entities.add(entity);
            result.employeesMigrated++;
            console.log(`   ✅ Migrated employee: ${employee.name || employee.email}`);
          } else {
            // Update existing entity if balances are out of sync
            const employeeUsdBalance = (employee as any).usd_balance || 0;
            const employeeLbpBalance = (employee as any).lbp_balance || 0;
            
            const balanceMismatch = 
              Math.abs(employeeUsdBalance - (existing.usd_balance || 0)) > 0.01 ||
              Math.abs(employeeLbpBalance - (existing.lb_balance || 0)) > 0.01;

            if (balanceMismatch || existing.entity_type !== 'employee') {
              await getDB().entities.update(employee.id, {
                entity_type: 'employee',
                name: employee.name || employee.email,
                phone: (employee as any).phone || null,
                lb_balance: employeeLbpBalance,
                usd_balance: employeeUsdBalance,
                is_active: (employee as any).is_active ?? true,
                updated_at: new Date().toISOString(),
                _synced: false
              });
              result.employeesUpdated++;
              console.log(`   🔄 Updated employee entity: ${employee.name || employee.email}`);
            }
          }
        } catch (error: any) {
          result.errors.push({
            type: 'employee',
            id: employee.id,
            name: employee.name || employee.email,
            error: error.message || 'Unknown error'
          });
          console.error(`   ❌ Error migrating employee ${employee.name || employee.email}:`, error);
        }
      }
    });

    // Calculate summary
    const totalProcessed = 
      result.customersMigrated + result.suppliersMigrated + result.employeesMigrated +
      result.customersUpdated + result.suppliersUpdated + result.employeesUpdated;
    const totalMigrated = result.customersMigrated + result.suppliersMigrated + result.employeesMigrated;
    const totalUpdated = result.customersUpdated + result.suppliersUpdated + result.employeesUpdated;

    result.summary = {
      success: result.errors.length === 0,
      totalProcessed,
      totalMigrated,
      totalUpdated,
      totalErrors: result.errors.length
    };

    console.log('✅ Migration complete');
    console.log(`   Summary: ${totalMigrated} migrated, ${totalUpdated} updated, ${result.errors.length} errors`);

    return result;

  } catch (error) {
    console.error('❌ Error during migration:', error);
    result.summary.success = false;
    throw error;
  }
}

/**
 * Print migration result in a readable format
 */
export function printMigrationResult(result: MigrationResult): void {
  console.log('\n📋 MIGRATION RESULT');
  console.log('='.repeat(50));
  
  console.log('\n📦 Customers:');
  console.log(`   Migrated: ${result.customersMigrated}`);
  console.log(`   Updated: ${result.customersUpdated}`);

  console.log('\n📦 Suppliers:');
  console.log(`   Migrated: ${result.suppliersMigrated}`);
  console.log(`   Updated: ${result.suppliersUpdated}`);

  console.log('\n📦 Employees:');
  console.log(`   Migrated: ${result.employeesMigrated}`);
  console.log(`   Updated: ${result.employeesUpdated}`);

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach(error => {
      console.log(`   - ${error.type} ${error.name} (${error.id}): ${error.error}`);
    });
  }

  console.log('\n📈 Summary:');
  console.log(`   Success: ${result.summary.success ? '✅ YES' : '❌ NO'}`);
  console.log(`   Total Processed: ${result.summary.totalProcessed}`);
  console.log(`   Total Migrated: ${result.summary.totalMigrated}`);
  console.log(`   Total Updated: ${result.summary.totalUpdated}`);
  console.log(`   Total Errors: ${result.summary.totalErrors}`);
  console.log('='.repeat(50) + '\n');
}

