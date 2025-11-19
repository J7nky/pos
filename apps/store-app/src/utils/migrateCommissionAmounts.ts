import { db } from '../lib/db';

/**
 * Migration utility to populate commission_amount for existing closed bills
 * 
 * This should be run once after adding the commission_amount field to the database.
 * It will:
 * 1. Find all closed bills without commission_amount
 * 2. Recalculate commission from sales
 * 3. Store the commission_amount in the bill
 * 
 * Usage:
 * - Import and call this function from the console or a migration script
 * - Run: migrateCommissionAmounts()
 */
export async function migrateCommissionAmounts(): Promise<{
  success: boolean;
  migratedCount: number;
  skippedCount: number;
  errors: Array<{ billId: string; error: string }>;
}> {
  console.log('🔄 Starting commission amount migration...');
  
  const results = {
    success: true,
    migratedCount: 0,
    skippedCount: 0,
    errors: [] as Array<{ billId: string; error: string }>
  };

  try {
    // Find all closed bills without commission_amount
    const closedBills = await db.inventory_bills
      .filter(bill => 
        (bill.status === 'closed' || bill.status === 'CLOSED' || 
         (bill.notes && bill.notes.includes('[CLOSED]'))) &&
        (!bill.commission_amount || bill.commission_amount === 0)
      )
      .toArray();

    console.log(`📊 Found ${closedBills.length} closed bills to migrate`);

    for (const bill of closedBills) {
      try {
        // Get all inventory items for this bill
        const billItems = await db.inventory_items
          .where('batch_id')
          .equals(bill.id)
          .toArray();

        if (billItems.length === 0) {
          console.log(`⚠️  Bill ${bill.id} has no items, skipping`);
          results.skippedCount++;
          continue;
        }

        // Calculate total sales for all items in this bill
        let totalSales = 0;
        for (const item of billItems) {
          const sales = await db.bill_line_items
            .where('inventory_item_id')
            .equals(item.id)
            .toArray();
          
          totalSales += sales.reduce((sum, sale) => sum + (sale.line_total || 0), 0);
        }

        // Calculate commission
        const commissionRate = bill.commission_rate ? Number(bill.commission_rate) : 10;
        const commissionAmount = (totalSales * commissionRate) / 100;

        if (commissionAmount > 0) {
          // Update bill with calculated commission
          await db.inventory_bills.update(bill.id, {
            commission_amount: commissionAmount,
            closed_at: bill.created_at, // Use created_at as fallback for closed_at
            updated_at: new Date().toISOString(),
            _synced: false
          });

          console.log(`✅ Migrated bill ${bill.id}: Commission = ${commissionAmount} LBP (${commissionRate}% of ${totalSales} LBP sales)`);
          results.migratedCount++;
        } else {
          console.log(`⚠️  Bill ${bill.id} has no sales, setting commission to 0`);
          await db.inventory_bills.update(bill.id, {
            commission_amount: 0,
            closed_at: bill.created_at,
            updated_at: new Date().toISOString(),
            _synced: false
          });
          results.skippedCount++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error migrating bill ${bill.id}:`, errorMessage);
        results.errors.push({ billId: bill.id, error: errorMessage });
        results.success = false;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Migrated: ${results.migratedCount} bills`);
    console.log(`   ⚠️  Skipped: ${results.skippedCount} bills`);
    console.log(`   ❌ Errors: ${results.errors.length} bills`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Failed bills:');
      results.errors.forEach(({ billId, error }) => {
        console.log(`   - ${billId}: ${error}`);
      });
    }

    return results;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return {
      success: false,
      migratedCount: results.migratedCount,
      skippedCount: results.skippedCount,
      errors: [...results.errors, { billId: 'GLOBAL', error: error instanceof Error ? error.message : 'Unknown error' }]
    };
  }
}

/**
 * Verify migration results
 * Checks that all closed bills now have commission_amount set
 */
export async function verifyCommissionMigration(): Promise<{
  totalClosedBills: number;
  billsWithCommission: number;
  billsWithoutCommission: number;
  isComplete: boolean;
}> {
  console.log('🔍 Verifying commission migration...');

  const closedBills = await db.inventory_bills
    .filter(bill => 
      bill.status === 'closed' || bill.status === 'CLOSED' || 
      (bill.notes && bill.notes.includes('[CLOSED]'))
    )
    .toArray();

  const billsWithCommission = closedBills.filter(bill => 
    bill.commission_amount !== null && bill.commission_amount !== undefined
  );

  const billsWithoutCommission = closedBills.filter(bill => 
    bill.commission_amount === null || bill.commission_amount === undefined
  );

  const results = {
    totalClosedBills: closedBills.length,
    billsWithCommission: billsWithCommission.length,
    billsWithoutCommission: billsWithoutCommission.length,
    isComplete: billsWithoutCommission.length === 0
  };

  console.log('\n📊 Verification Results:');
  console.log(`   Total closed bills: ${results.totalClosedBills}`);
  console.log(`   ✅ With commission: ${results.billsWithCommission}`);
  console.log(`   ❌ Without commission: ${results.billsWithoutCommission}`);
  console.log(`   Status: ${results.isComplete ? '✅ Complete' : '⚠️  Incomplete'}`);

  if (billsWithoutCommission.length > 0) {
    console.log('\n⚠️  Bills without commission:');
    billsWithoutCommission.forEach(bill => {
      console.log(`   - ${bill.id} (status: ${bill.status})`);
    });
  }

  return results;
}

// Make functions available in browser console for manual execution
if (typeof window !== 'undefined') {
  (window as any).migrateCommissionAmounts = migrateCommissionAmounts;
  (window as any).verifyCommissionMigration = verifyCommissionMigration;
  console.log('💡 Migration utilities loaded. Available commands:');
  console.log('   - migrateCommissionAmounts()');
  console.log('   - verifyCommissionMigration()');
}
