export interface SalesDataDebugInfo {
  inventoryItemId: string;
  productId: string;
  supplierId: string;
  totalSalesInSystem: number;
  relatedSalesCount: number;
  relatedSalesWithItems: number;
  matchingItemsCount: number;
  debugDetails: {
    relatedSaleIds: string[];
    salesWithoutItems: string[];
    itemsPerSale: Record<string, number>;
    matchingCriteria: {
      productMatches: number;
      supplierMatches: number;
      bothMatch: number;
    };
  };
}

export function debugSalesData(
  inventoryItem: any,
  allSales: any[],
  productId: string,
  supplierId: string
): SalesDataDebugInfo {
  console.log('🔍 Debug: Starting sales data analysis for inventory item:', inventoryItem.id);
  
  // Filter related sales based on date and product/supplier matching
  const relatedSales = allSales.filter(sale => {
    const saleDate = new Date(sale.created_at || sale.createdAt).getTime();
    const itemReceivedDate = new Date(inventoryItem.received_at || inventoryItem.created_at).getTime();
    
    const isAfterReceived = saleDate >= itemReceivedDate;
    
    if (!isAfterReceived) {
      console.log(`⏰ Sale ${sale.id} skipped: occurred before inventory received`);
      return false;
    }

    // Check if sale has matching items
    const hasMatchingItems = sale.items && Array.isArray(sale.items) && 
      sale.items.some((item: any) => {
        const productMatch = item.productId === productId || item.product_id === productId;
        const supplierMatch = item.supplierId === supplierId || item.supplier_id === supplierId;
        return productMatch && supplierMatch;
      });

    if (hasMatchingItems) {
      console.log(`✅ Sale ${sale.id} has matching items`);
    } else {
      console.log(`❌ Sale ${sale.id} has no matching items`);
    }

    return hasMatchingItems;
  });

  console.log(`📊 Found ${relatedSales.length} related sales out of ${allSales.length} total sales`);

  // Analyze sales structure
  const relatedSalesWithItems = relatedSales.filter(sale => sale.items && Array.isArray(sale.items));
  const salesWithoutItems = relatedSales.filter(sale => !sale.items || !Array.isArray(sale.items));

  // Count matching items
  let totalMatchingItems = 0;
  let productMatches = 0;
  let supplierMatches = 0;
  let bothMatch = 0;

  const itemsPerSale: Record<string, number> = {};

  relatedSales.forEach(sale => {
    if (sale.items && Array.isArray(sale.items)) {
      let saleMatchingItems = 0;
      
      sale.items.forEach((item: any) => {
        const productMatch = item.productId === productId || item.product_id === productId;
        const supplierMatch = item.supplierId === supplierId || item.supplier_id === supplierId;
        
        if (productMatch) productMatches++;
        if (supplierMatch) supplierMatches++;
        if (productMatch && supplierMatch) {
          bothMatch++;
          saleMatchingItems++;
          totalMatchingItems++;
        }
      });
      
      itemsPerSale[sale.id] = saleMatchingItems;
    }
  });

  const debugInfo: SalesDataDebugInfo = {
    inventoryItemId: inventoryItem.id,
    productId,
    supplierId,
    totalSalesInSystem: allSales.length,
    relatedSalesCount: relatedSales.length,
    relatedSalesWithItems: relatedSalesWithItems.length,
    matchingItemsCount: totalMatchingItems,
    debugDetails: {
      relatedSaleIds: relatedSales.map(s => s.id),
      salesWithoutItems: salesWithoutItems.map(s => s.id),
      itemsPerSale,
      matchingCriteria: {
        productMatches,
        supplierMatches,
        bothMatch
      }
    }
  };

  console.log('🎯 Sales data debug summary:', debugInfo);
  
  return debugInfo;
}

export function validateSalesDataStructure(sales: any[]): {
  valid: number;
  invalid: number;
  issues: string[];
} {
  const issues: string[] = [];
  let valid = 0;
  let invalid = 0;

  sales.forEach((sale, index) => {
    if (!sale.id) {
      issues.push(`Sale at index ${index} missing ID`);
      invalid++;
      return;
    }

    if (!sale.items) {
      issues.push(`Sale ${sale.id} missing items array`);
      invalid++;
      return;
    }

    if (!Array.isArray(sale.items)) {
      issues.push(`Sale ${sale.id} items is not an array`);
      invalid++;
      return;
    }

    if (sale.items.length === 0) {
      issues.push(`Sale ${sale.id} has empty items array`);
    }

    // Validate item structure
    sale.items.forEach((item: any, itemIndex: number) => {
      if (!item.productId && !item.product_id) {
        issues.push(`Sale ${sale.id} item ${itemIndex} missing product ID`);
      }
      if (!item.supplierId && !item.supplier_id) {
        issues.push(`Sale ${sale.id} item ${itemIndex} missing supplier ID`);
      }
      if (typeof item.quantity !== 'number') {
        issues.push(`Sale ${sale.id} item ${itemIndex} missing or invalid quantity`);
      }
    });

    valid++;
  });

  console.log(`📋 Sales data validation: ${valid} valid, ${invalid} invalid`);
  if (issues.length > 0) {
    console.log('⚠️ Sales data issues:', issues);
  }

  return { valid, invalid, issues };
}

export function generateSalesDataReport(
  inventoryItems: any[],
  sales: any[],
  products: any[],
  suppliers: any[]
): {
  totalInventoryItems: number;
  itemsWithSales: number;
  itemsWithoutSales: number;
  totalSales: number;
  validSales: number;
  averageItemsPerSale: number;
  topProductsBySales: Array<{ productId: string; productName: string; salesCount: number }>;
  topSuppliersBySales: Array<{ supplierId: string; supplierName: string; salesCount: number }>;
} {
  console.log('📈 Generating comprehensive sales data report...');

  const salesValidation = validateSalesDataStructure(sales);
  
  let itemsWithSales = 0;
  let itemsWithoutSales = 0;
  
  const productSalesCount: Record<string, number> = {};
  const supplierSalesCount: Record<string, number> = {};

  inventoryItems.forEach(item => {
    const debugInfo = debugSalesData(item, sales, item.product_id, item.supplier_id);
    
    if (debugInfo.matchingItemsCount > 0) {
      itemsWithSales++;
    } else {
      itemsWithoutSales++;
    }

    // Count sales by product and supplier
    if (debugInfo.matchingItemsCount > 0) {
      productSalesCount[item.product_id] = (productSalesCount[item.product_id] || 0) + debugInfo.matchingItemsCount;
      supplierSalesCount[item.supplier_id] = (supplierSalesCount[item.supplier_id] || 0) + debugInfo.matchingItemsCount;
    }
  });

  // Calculate average items per sale
  const totalItems = sales.reduce((sum, sale) => sum + (sale.items?.length || 0), 0);
  const averageItemsPerSale = sales.length > 0 ? totalItems / sales.length : 0;

  // Get top products and suppliers
  const topProductsBySales = Object.entries(productSalesCount)
    .map(([productId, count]) => ({
      productId,
      productName: products.find(p => p.id === productId)?.name || 'Unknown',
      salesCount: count
    }))
    .sort((a, b) => b.salesCount - a.salesCount)
    .slice(0, 10);

  const topSuppliersBySales = Object.entries(supplierSalesCount)
    .map(([supplierId, count]) => ({
      supplierId,
      supplierName: suppliers.find(s => s.id === supplierId)?.name || 'Unknown',
      salesCount: count
    }))
    .sort((a, b) => b.salesCount - a.salesCount)
    .slice(0, 10);

  const report = {
    totalInventoryItems: inventoryItems.length,
    itemsWithSales,
    itemsWithoutSales,
    totalSales: sales.length,
    validSales: salesValidation.valid,
    averageItemsPerSale,
    topProductsBySales,
    topSuppliersBySales
  };

  console.log('📊 Sales data report:', report);
  
  return report;
} 