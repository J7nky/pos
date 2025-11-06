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
    const allSaleItems = await db.bill_line_items.toArray();
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
        await db.bill_line_items.update(item.id, {
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

    const allSaleItems = await db.bill_line_items.toArray();
    result.totalRecords = allSaleItems.length;

    // Expected fields for sale_items (matching Supabase schema)
    const requiredFields = [
      'id', 'product_id', 'supplier_id', 'quantity', 
      'unit_price', 'received_value', 'payment_method', 'created_at',
      'inventory_item_id', 'store_id', 'created_by'
    ];

    // const optionalFields = ['weight', 'notes', 'customer_id', '_synced', '_lastSyncedAt']; // Currently unused
    const forbiddenFields = ['received_quantity', 'updated_at', 'productName', 'supplierName', 'totalPrice', 'receivedValue', 'inventoryType']; // These should not be in sale_items

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

      if (typeof item.received_value !== 'number' || item.received_value < 0) {
        result.issues.push({
          id: item.id,
          issue: `Invalid received_value: ${item.received_value} (should be non-negative number)`,
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
 * Repair sale_items data to match Supabase schema
 */
export async function repairSaleItemsData(): Promise<{
  recordsProcessed: number;
  recordsRepaired: number;
  errors: string[];
}> {
  const result = {
    recordsProcessed: 0,
    recordsRepaired: 0,
    errors: [] as string[]
  };

  try {
    console.log('🔧 Starting repair of sale_items data...');

    const allSaleItems = await db.bill_line_items.toArray();
    result.recordsProcessed = allSaleItems.length;

    console.log(`📊 Found ${allSaleItems.length} sale_items records to process`);

    for (const item of allSaleItems) {
      try {
        let needsRepair = false;
        const repairedItem: any = { ...item };

        // Remove forbidden fields that don't exist in Supabase
        if (repairedItem.hasOwnProperty('productName')) {
          delete repairedItem.productName;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('supplierName')) {
          delete repairedItem.supplierName;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('totalPrice')) {
          delete repairedItem.totalPrice;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('receivedValue')) {
          delete repairedItem.receivedValue;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('inventoryType')) {
          delete repairedItem.inventoryType;
          needsRepair = true;
        }

        // Map camelCase to snake_case field names
        if (repairedItem.inventoryItemId && !repairedItem.inventory_item_id) {
          repairedItem.inventory_item_id = repairedItem.inventoryItemId;
          needsRepair = true;
        }
        if (repairedItem.productId && !repairedItem.product_id) {
          repairedItem.product_id = repairedItem.productId;
          needsRepair = true;
        }
        if (repairedItem.supplierId && !repairedItem.supplier_id) {
          repairedItem.supplier_id = repairedItem.supplierId;
          needsRepair = true;
        }
        if (repairedItem.customerId !== undefined && repairedItem.customer_id === undefined) {
          repairedItem.customer_id = repairedItem.customerId;
          needsRepair = true;
        }
        if (repairedItem.unitPrice !== undefined && !repairedItem.unit_price) {
          repairedItem.unit_price = repairedItem.unitPrice;
          needsRepair = true;
        }
        if (repairedItem.paymentMethod && !repairedItem.payment_method) {
          repairedItem.payment_method = repairedItem.paymentMethod;
          needsRepair = true;
        }
        if (repairedItem.createdBy && !repairedItem.created_by) {
          repairedItem.created_by = repairedItem.createdBy;
          needsRepair = true;
        }
        if (repairedItem.storeId && !repairedItem.store_id) {
          repairedItem.store_id = repairedItem.storeId;
          needsRepair = true;
        }
        if (repairedItem.createdAt && !repairedItem.created_at) {
          repairedItem.created_at = repairedItem.createdAt;
          needsRepair = true;
        }
        // Map totalPrice to received_value
        if (repairedItem.totalPrice !== undefined && !repairedItem.received_value) {
          repairedItem.received_value = repairedItem.totalPrice;
          needsRepair = true;
        }
        
        // Remove legacy field names after mapping
        if (repairedItem.hasOwnProperty('inventoryItemId')) {
          delete repairedItem.inventoryItemId;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('productId')) {
          delete repairedItem.productId;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('supplierId')) {
          delete repairedItem.supplierId;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('customerId')) {
          delete repairedItem.customerId;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('unitPrice')) {
          delete repairedItem.unitPrice;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('totalPrice')) {
          delete repairedItem.totalPrice;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('paymentMethod')) {
          delete repairedItem.paymentMethod;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('createdBy')) {
          delete repairedItem.createdBy;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('storeId')) {
          delete repairedItem.storeId;
          needsRepair = true;
        }
        if (repairedItem.hasOwnProperty('createdAt')) {
          delete repairedItem.createdAt;
          needsRepair = true;
        }

        // Fix missing required fields
        if (!repairedItem.inventory_item_id) {
          repairedItem.inventory_item_id = repairedItem.id || 'unknown';
          needsRepair = true;
        }
        if (!repairedItem.created_by) {
          repairedItem.created_by = 'system';
          needsRepair = true;
        }
        if (!repairedItem.store_id) {
          repairedItem.store_id = 'default-store';
          needsRepair = true;
        }
        if (!repairedItem.payment_method) {
          repairedItem.payment_method = 'cash';
          needsRepair = true;
        }

        // Calculate received_value from unit_price and quantity if missing
        if (!repairedItem.received_value && repairedItem.unit_price && repairedItem.quantity) {
          repairedItem.received_value = repairedItem.unit_price * repairedItem.quantity;
          needsRepair = true;
        } else if (!repairedItem.received_value) {
          repairedItem.received_value = 0;
          needsRepair = true;
        }

        // Ensure numeric fields are valid
        if (!repairedItem.quantity || repairedItem.quantity <= 0) {
          repairedItem.quantity = 1;
          needsRepair = true;
        }
        if (!repairedItem.unit_price || repairedItem.unit_price < 0) {
          repairedItem.unit_price = 0;
          needsRepair = true;
        }

        // Set customer_id to null if not specified
        if (!repairedItem.customer_id) {
          repairedItem.customer_id = null;
          needsRepair = true;
        }

        if (needsRepair) {
          // Mark as unsynced so it gets uploaded with correct data
          repairedItem._synced = false;
          
          await db.bill_line_items.update(item.id, repairedItem);
          console.log(`🔧 Repaired sale_item ${item.id}`);
          result.recordsRepaired++;
        }

      } catch (error) {
        const errorMsg = `Failed to repair sale_item ${item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    console.log(`✅ Repair completed: ${result.recordsRepaired}/${result.recordsProcessed} records repaired`);

    if (result.errors.length > 0) {
      console.warn(`⚠️ ${result.errors.length} errors occurred during repair:`);
      result.errors.forEach(error => console.warn(`  - ${error}`));
    }

  } catch (error) {
    const errorMsg = `Repair failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`❌ ${errorMsg}`);
    result.errors.push(errorMsg);
  }

  return result;
}

/**
 * Quick debug function to show current sale_items data structure
 */
export async function debugSaleItemsData(): Promise<void> {
  try {
    const saleItems = await db.bill_line_items.limit(5).toArray();
    console.log('🔍 Sample sale_items data:', saleItems.map(item => ({
      id: item.id,
      fields: Object.keys(item),
      hasProblematicFields: Object.keys(item).filter(key => 
        ['supplier_name', 'product_name', 'total_price', 'receivedValue', 'inventoryType'].includes(key)
      )
    })));
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

/**
 * Run cleanup, repair, and validation
 */
export async function cleanupAndValidateSaleItems(): Promise<{
  cleanup: Awaited<ReturnType<typeof cleanupSaleItemsReceivedQuantity>>;
  repair: Awaited<ReturnType<typeof repairSaleItemsData>>;
  validation: Awaited<ReturnType<typeof validateSaleItemsStructure>>;
}> {
  console.log('🔧 Running complete sale_items cleanup, repair, and validation...');
  
  await debugSaleItemsData();
  
  const cleanup = await cleanupSaleItemsReceivedQuantity();
  const repair = await repairSaleItemsData();
  const validation = await validateSaleItemsStructure();

  console.log('✅ Cleanup, repair, and validation completed');
  
  return { cleanup, repair, validation };
} 