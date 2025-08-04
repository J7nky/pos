import { db } from '../lib/db';

/**
 * Cleanup utility to remove the incorrect received_quantity field from sale_items
 * This field should only exist on inventory_items, not sale_items
 */
export async function cleanupSaleItemsReceivedQuantity(): Promise<{
  recordsFound: number;
  recordsCleaned: number;
  errors: string[];
}> {
  const result = {
    recordsFound: 0,
    recordsCleaned: 0,
    errors: [] as string[]
  };

  try {
    console.log('🧹 Starting cleanup of sale_items received_quantity fields...');

    // Get all sale_items records
    const allSaleItems = await db.sale_items.toArray();
    result.recordsFound = allSaleItems.length;

    console.log(`📊 Found ${allSaleItems.length} sale_items records to check`);

    // Filter records that have the incorrect received_quantity field
    const recordsWithReceivedQuantity = allSaleItems.filter((item: any) => 
      item.hasOwnProperty('received_quantity')
    );

    console.log(`❌ Found ${recordsWithReceivedQuantity.length} sale_items with incorrect received_quantity field`);

    if (recordsWithReceivedQuantity.length === 0) {
      console.log('✅ No cleanup needed - all sale_items records are correct');
      return result;
    }

    // Clean up records by removing the received_quantity field
    for (const item of recordsWithReceivedQuantity) {
      try {
        // Create a clean copy without received_quantity
        const { received_quantity, ...cleanItem } = item as any;
        
        // Update the record
        await db.sale_items.update(item.id, {
          ...cleanItem,
          _synced: false // Mark as unsynced so it gets uploaded correctly
        });

        console.log(`🔧 Cleaned sale_item ${item.id} - removed received_quantity: ${received_quantity}`);
        result.recordsCleaned++;

      } catch (error) {
        const errorMsg = `Failed to clean sale_item ${item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    console.log(`✅ Cleanup completed: ${result.recordsCleaned}/${recordsWithReceivedQuantity.length} records cleaned`);

    if (result.errors.length > 0) {
      console.warn(`⚠️ ${result.errors.length} errors occurred during cleanup:`);
      result.errors.forEach(error => console.warn(`  - ${error}`));
    }

  } catch (error) {
    const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`❌ ${errorMsg}`);
    result.errors.push(errorMsg);
  }

  return result;
}

/**
 * Validate sale_items data structure integrity
 */
export async function validateSaleItemsStructure(): Promise<{
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  issues: Array<{ id: string; issue: string; severity: 'warning' | 'error' }>;
}> {
  const result = {
    totalRecords: 0,
    validRecords: 0,
    invalidRecords: 0,
    issues: [] as Array<{ id: string; issue: string; severity: 'warning' | 'error' }>
  };

  try {
    console.log('🔍 Validating sale_items data structure...');

    const allSaleItems = await db.sale_items.toArray();
    result.totalRecords = allSaleItems.length;

    // Expected fields for sale_items
    const requiredFields = [
      'id', 'product_id', 'product_name', 
      'supplier_id', 'supplier_name', 'quantity', 
      'unit_price', 'total_price', 'payment_method', 'created_at'
    ];

    const optionalFields = ['weight', 'notes', 'store_id', '_synced', '_lastSyncedAt'];
    const forbiddenFields = ['received_quantity', 'updated_at']; // These should not be in sale_items

    for (const item of allSaleItems) {
      let isValid = true;

      // Check for required fields
      for (const field of requiredFields) {
        if (
          !Object.prototype.hasOwnProperty.call(item, field) ||
          (item as any)[field] === null ||
          (item as any)[field] === undefined
        ) {
          result.issues.push({
            id: item.id,
            issue: `Missing or null required field: ${field}`,
            severity: 'error'
          });
          isValid = false;
        }
      }

      // Check for forbidden fields
      for (const field of forbiddenFields) {
        if (item.hasOwnProperty(field)) {
          result.issues.push({
            id: item.id,
            issue: `Has forbidden field: ${field} (should only be in inventory_items)`,
            severity: 'error'
          });
          isValid = false;
        }
      }

      // Check data types
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        result.issues.push({
          id: item.id,
          issue: `Invalid quantity: ${item.quantity} (should be positive number)`,
          severity: 'error'
        });
        isValid = false;
      }

      if (typeof item.unit_price !== 'number' || item.unit_price < 0) {
        result.issues.push({
          id: item.id,
          issue: `Invalid unit_price: ${item.unit_price} (should be non-negative number)`,
          severity: 'error'
        });
        isValid = false;
      }

      if (typeof item.total_price !== 'number' || item.total_price < 0) {
        result.issues.push({
          id: item.id,
          issue: `Invalid total_price: ${item.total_price} (should be non-negative number)`,
          severity: 'error'
        });
        isValid = false;
      }

      // Check for orphaned records (product_id or supplier_id doesn't exist)
      try {
        const product = await db.products.get(item.product_id);
        if (!product) {
          result.issues.push({
            id: item.id,
            issue: `Orphaned record: product_id ${item.product_id} does not exist`,
            severity: 'warning'
          });
        }
      } catch (error) {
        result.issues.push({
          id: item.id,
          issue: `Could not verify product_id ${item.product_id}: ${error}`,
          severity: 'warning'
        });
      }

      try {
        const supplier = await db.suppliers.get(item.supplier_id);
        if (!supplier) {
          result.issues.push({
            id: item.id,
            issue: `Orphaned record: supplier_id ${item.supplier_id} does not exist`,
            severity: 'warning'
          });
        }
      } catch (error) {
        result.issues.push({
          id: item.id,
          issue: `Could not verify supplier_id ${item.supplier_id}: ${error}`,
          severity: 'warning'
        });
      }

      if (isValid) {
        result.validRecords++;
      } else {
        result.invalidRecords++;
      }
    }

    console.log(`📊 Validation completed:`);
    console.log(`  - Total records: ${result.totalRecords}`);
    console.log(`  - Valid records: ${result.validRecords}`);
    console.log(`  - Invalid records: ${result.invalidRecords}`);
    console.log(`  - Issues found: ${result.issues.length}`);

    if (result.issues.length > 0) {
      console.log('🚨 Issues found:');
      result.issues.forEach(issue => {
        const icon = issue.severity === 'error' ? '❌' : '⚠️';
        console.log(`  ${icon} [${issue.id}] ${issue.issue}`);
      });
    }

  } catch (error) {
    console.error('❌ Validation failed:', error);
    result.issues.push({
      id: 'SYSTEM',
      issue: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      severity: 'error'
    });
  }

  return result;
}

/**
 * Run both cleanup and validation
 */
export async function cleanupAndValidateSaleItems(): Promise<{
  cleanup: Awaited<ReturnType<typeof cleanupSaleItemsReceivedQuantity>>;
  validation: Awaited<ReturnType<typeof validateSaleItemsStructure>>;
}> {
  console.log('🔧 Running complete sale_items cleanup and validation...');
  
  const cleanup = await cleanupSaleItemsReceivedQuantity();
  const validation = await validateSaleItemsStructure();

  console.log('✅ Cleanup and validation completed');
  
  return { cleanup, validation };
} 