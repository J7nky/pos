// Entity Migration Script - Phase 2 Implementation
// Run this script to migrate existing customers/suppliers to entities table

import { db } from '../lib/db';
import { entityMigrationService } from '../services/entityMigrationService';
import { accountingInitService } from '../services/accountingInitService';

/**
 * Run entity migration for a specific store
 * This script should be run once per store to migrate to the new entities table
 */
export async function runEntityMigration(storeId: string): Promise<void> {
  console.log(`🚀 Starting Entity Migration for Store: ${storeId}`);
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Verify accounting foundation is initialized
    console.log('1️⃣ Verifying accounting foundation...');
    const isAccountingReady = await accountingInitService.isInitialized(storeId);
    
    if (!isAccountingReady) {
      console.log('❌ Accounting foundation not initialized!');
      console.log('   Please ensure the admin app has set up the store properly.');
      console.log('   Required: chart_of_accounts and system entities tables populated.');
      return;
    }
    
    console.log('✅ Accounting foundation is ready');
    
    // Step 2: Check if migration is already completed
    console.log('2️⃣ Checking migration status...');
    const isAlreadyMigrated = await entityMigrationService.isMigrationCompleted(storeId);
    
    if (isAlreadyMigrated) {
      console.log('✅ Migration already completed for this store');
      
      // Run verification anyway
      const verification = await entityMigrationService.verifyMigration(storeId);
      console.log('📊 Migration Summary:', verification.summary);
      
      if (verification.success) {
        console.log('✅ Migration verification passed');
      } else {
        console.log('⚠️ Migration verification found issues:');
        verification.issues.forEach(issue => console.log(`   - ${issue}`));
      }
      
      return;
    }
    
    // Step 3: Show current data counts
    console.log('3️⃣ Analyzing current data...');
    const [customersCount, suppliersCount, employeesCount, entitiesCount] = await Promise.all([
      db.customers.where('store_id').equals(storeId).count(),
      db.suppliers.where('store_id').equals(storeId).count(),
      db.users.where('store_id').equals(storeId).count(),
      db.entities.where('store_id').equals(storeId).count()
    ]);
    
    console.log(`   📊 Current Data:`);
    console.log(`      - Customers: ${customersCount}`);
    console.log(`      - Suppliers: ${suppliersCount}`);
    console.log(`      - Employees: ${employeesCount}`);
    console.log(`      - Entities: ${entitiesCount}`);
    
    if (customersCount === 0 && suppliersCount === 0 && employeesCount === 0) {
      console.log('ℹ️ No data to migrate - store appears to be empty');
      
      // Still create system entities
      console.log('4️⃣ Creating system entities...');
      const result = await entityMigrationService.migrateToEntities(storeId);
      
      if (result.success) {
        console.log(`✅ System entities created: ${result.systemEntitiesCount}`);
      } else {
        console.log('❌ Failed to create system entities:', result.errors);
      }
      
      return;
    }
    
    // Step 4: Run the migration
    console.log('4️⃣ Running entity migration...');
    console.log('   This will:');
    console.log('   - Migrate all customers to entities table');
    console.log('   - Migrate all suppliers to entities table');
    console.log('   - Migrate all employees to entities table');
    console.log('   - Create system entities (Cash Customer, Internal, etc.)');
    console.log('   - Preserve all existing data and IDs');
    console.log('');
    
    const migrationResult = await entityMigrationService.migrateToEntities(storeId);
    
    if (!migrationResult.success) {
      console.log('❌ Migration failed!');
      migrationResult.errors.forEach(error => console.log(`   - ${error}`));
      return;
    }
    
    // Step 5: Show migration results
    console.log('5️⃣ Migration completed successfully! 🎉');
    console.log(`   📊 Migration Results:`);
    console.log(`      - Customers migrated: ${migrationResult.customersCount}`);
    console.log(`      - Suppliers migrated: ${migrationResult.suppliersCount}`);
    console.log(`      - Employees migrated: ${migrationResult.employeesCount}`);
    console.log(`      - System entities created: ${migrationResult.systemEntitiesCount}`);
    
    // Step 6: Verify migration integrity
    console.log('6️⃣ Verifying migration integrity...');
    const verification = await entityMigrationService.verifyMigration(storeId);
    
    console.log(`   📊 Final Summary:`);
    console.log(`      - Original customers: ${verification.summary.originalCustomers}`);
    console.log(`      - Original suppliers: ${verification.summary.originalSuppliers}`);
    console.log(`      - Original employees: ${verification.summary.originalEmployees}`);
    console.log(`      - Migrated entities: ${verification.summary.migratedEntities}`);
    console.log(`      - System entities: ${verification.summary.systemEntities}`);
    
    if (verification.success) {
      console.log('✅ Migration verification passed - all data migrated correctly!');
    } else {
      console.log('⚠️ Migration verification found issues:');
      verification.issues.forEach(issue => console.log(`   - ${issue}`));
    }
    
    // Step 7: Next steps
    console.log('');
    console.log('🎯 Next Steps:');
    console.log('   1. ✅ Phase 2 Complete - Entity migration done');
    console.log('   2. 🔄 Phase 3 - Implement parallel journal entry creation');
    console.log('   3. 📊 Phase 4 - Implement balance snapshots');
    console.log('   4. 🔍 Phase 5 - Update queries to use entities table');
    console.log('   5. 🧪 Phase 6 - Testing and verification');
    console.log('');
    console.log('💡 The existing customers/suppliers tables are preserved for backward compatibility.');
    console.log('   New operations should use the entities table going forward.');
    
  } catch (error) {
    console.error('❌ Entity Migration Script Failed:', error);
    throw error;
  }
}

/**
 * Get all stores and run migration for each
 */
export async function runMigrationForAllStores(): Promise<void> {
  console.log('🌍 Running Entity Migration for All Stores');
  console.log('=' .repeat(60));
  
  try {
    const stores = await db.stores.toArray();
    
    if (stores.length === 0) {
      console.log('ℹ️ No stores found in database');
      return;
    }
    
    console.log(`Found ${stores.length} store(s)`);
    
    for (const store of stores) {
      console.log('');
      console.log(`📍 Processing Store: ${store.name} (${store.id})`);
      console.log('-' .repeat(40));
      
      try {
        await runEntityMigration(store.id);
      } catch (error) {
        console.error(`❌ Failed to migrate store ${store.id}:`, error);
        // Continue with other stores
      }
    }
    
    console.log('');
    console.log('🎉 All stores processed!');
    
  } catch (error) {
    console.error('❌ Failed to run migration for all stores:', error);
    throw error;
  }
}

// Export functions for use in console or other scripts
export const migrationScripts = {
  runEntityMigration,
  runMigrationForAllStores
};

// If running directly in browser console:
// import { migrationScripts } from './scripts/runEntityMigration';
// await migrationScripts.runMigrationForAllStores();
