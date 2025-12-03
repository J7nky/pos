/**
 * Test runner script for entities migration
 * 
 * Usage in browser console:
 *   import('./scripts/runMigrationTest').then(m => m.runMigrationTest('your-store-id'));
 * 
 * Or in a component:
 *   import { runMigrationTest } from './scripts/runMigrationTest';
 *   await runMigrationTest(storeId);
 */

import { verifyEntitiesMigration, printVerificationReport } from './verifyEntitiesMigration';
import { migrateToEntitiesOnly, printMigrationResult } from './migrateToEntitiesOnly';

export interface TestResult {
  verification: Awaited<ReturnType<typeof verifyEntitiesMigration>>;
  migration?: Awaited<ReturnType<typeof migrateToEntitiesOnly>>;
  success: boolean;
  message: string;
}

/**
 * Run complete migration test: verify current state, migrate if needed, verify again
 */
export async function runMigrationTest(storeId: string, autoMigrate: boolean = false): Promise<TestResult> {
  console.log('🧪 Starting Migration Test');
  console.log('='.repeat(60));
  console.log(`Store ID: ${storeId}`);
  console.log(`Auto-migrate: ${autoMigrate ? 'YES' : 'NO'}`);
  console.log('='.repeat(60) + '\n');

  try {
    // Step 1: Verify current state
    console.log('📋 Step 1: Verifying current migration state...\n');
    const verification = await verifyEntitiesMigration(storeId);
    printVerificationReport(verification);

    // Check if migration is needed
    const needsMigration = 
      verification.customers.missing.length > 0 ||
      verification.suppliers.missing.length > 0 ||
      verification.employees.missing.length > 0 ||
      verification.customers.issues.length > 0 ||
      verification.suppliers.issues.length > 0 ||
      verification.employees.issues.length > 0;

    if (!needsMigration && verification.summary.allMigrated) {
      console.log('✅ All entities are already migrated! No action needed.');
      return {
        verification,
        success: true,
        message: 'All entities are already migrated and verified'
      };
    }

    // Step 2: Migrate if needed and requested
    let migration;
    if (needsMigration) {
      if (autoMigrate) {
        console.log('\n📦 Step 2: Running migration...\n');
        migration = await migrateToEntitiesOnly(storeId);
        printMigrationResult(migration);

        if (migration.summary.totalErrors > 0) {
          console.log('⚠️ Migration completed with errors. Please review.');
          return {
            verification,
            migration,
            success: false,
            message: `Migration completed with ${migration.summary.totalErrors} errors`
          };
        }

        // Step 3: Verify again after migration
        console.log('\n📋 Step 3: Verifying after migration...\n');
        const postVerification = await verifyEntitiesMigration(storeId);
        printVerificationReport(postVerification);

        if (postVerification.summary.allMigrated) {
          console.log('✅ Migration successful! All entities verified.');
          return {
            verification: postVerification,
            migration,
            success: true,
            message: 'Migration completed successfully and verified'
          };
        } else {
          console.log('⚠️ Migration completed but verification shows issues.');
          return {
            verification: postVerification,
            migration,
            success: false,
            message: 'Migration completed but verification shows remaining issues'
          };
        }
      } else {
        console.log('\n⚠️ Migration needed but auto-migrate is disabled.');
        console.log('   Run with autoMigrate=true to perform migration.');
        return {
          verification,
          success: false,
          message: 'Migration needed but not performed (autoMigrate=false)'
        };
      }
    }

    return {
      verification,
      migration,
      success: true,
      message: 'Test completed'
    };

  } catch (error: any) {
    console.error('❌ Error during migration test:', error);
    return {
      verification: {
        customers: { total: 0, migrated: 0, missing: [], issues: [] },
        suppliers: { total: 0, migrated: 0, missing: [], issues: [] },
        employees: { total: 0, migrated: 0, missing: [], issues: [] },
        foreignKeys: { valid: 0, invalid: 0, issues: [] },
        summary: { allMigrated: false, totalEntities: 0, totalLegacy: 0, discrepancies: 0 }
      },
      success: false,
      message: `Error: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Quick verification only (no migration)
 */
export async function quickVerify(storeId: string): Promise<void> {
  console.log('🔍 Quick Verification');
  console.log('='.repeat(60) + '\n');
  
  const verification = await verifyEntitiesMigration(storeId);
  printVerificationReport(verification);
  
  if (verification.summary.allMigrated) {
    console.log('✅ All entities are properly migrated!');
  } else {
    console.log('⚠️ Migration issues found. Run full migration test to fix.');
  }
}

/**
 * Quick migration only (no verification)
 */
export async function quickMigrate(storeId: string): Promise<void> {
  console.log('📦 Quick Migration');
  console.log('='.repeat(60) + '\n');
  
  const migration = await migrateToEntitiesOnly(storeId);
  printMigrationResult(migration);
  
  if (migration.summary.success) {
    console.log('✅ Migration completed successfully!');
  } else {
    console.log('⚠️ Migration completed with errors. Please review.');
  }
}

