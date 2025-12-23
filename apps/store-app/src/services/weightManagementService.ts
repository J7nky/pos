import { getDB, LocalSaleItem, InventoryItem } from '../lib/db';
import { SaleItem, inventory_bills } from '../types';

export interface WeightSummary {
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  
  // Received weight data
  receivedWeight: {
    total: number;
    byBatch: Array<{
      batchId: string;
      billType: 'commission' | 'cash' | 'credit';
      weight: number | null; // null means weight not tracked for this batch
      isWeightOptional: boolean; // true for commission items where weight is optional
      receivedDate: string;
      notes?: string;
    }>;
  };
  
  // Sold weight data
  soldWeight: {
    total: number;
    byTransaction: Array<{
      saleId: string;
      weight: number;
      quantity: number;
      soldDate: string;
      customerId?: string;
      customerName?: string;
    }>;
  };
  
  // Weight comparison
  weightComparison: {
    difference: number; // received - sold
    percentageDifference: number;
    status: 'balanced' | 'over_sold' | 'under_sold' | 'no_comparison'; // no_comparison when received weight is optional/null
    hasDiscrepancy: boolean;
    discrepancyThreshold: number; // configurable threshold (e.g., 5%)
  };
}

export interface BillWeightSummary {
  billId: string;
  billType: 'commission' | 'cash' | 'credit';
  supplierId: string;
  supplierName: string;
  billDate: string;
  status: 'open' | 'closed';
  
  items: Array<{
    productId: string;
    productName: string;
    receivedWeight: number | null; // null for optional weight items
    receivedQuantity: number;
    soldWeight: number;
    soldQuantity: number;
    weightDifference: number | null; // null when received weight is optional
    isWeightOptional: boolean;
    unit: string;
  }>;
  
  totalWeightSummary: {
    totalReceivedWeight: number | null; // null if any items have optional weight
    totalSoldWeight: number;
    totalWeightDifference: number | null;
    hasWeightDiscrepancies: boolean;
    canCompareWeights: boolean; // false if received weights are optional
  };
}

export interface WeightDiscrepancyAlert {
  id: string;
  type: 'over_sold' | 'under_sold' | 'suspicious_pattern';
  severity: 'low' | 'medium' | 'high';
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  discrepancyAmount: number;
  discrepancyPercentage: number;
  detectedAt: string;
  description: string;
  suggestedAction: string;
}

export class WeightManagementService {
  private static instance: WeightManagementService;

  public static getInstance(): WeightManagementService {
    if (!WeightManagementService.instance) {
      WeightManagementService.instance = new WeightManagementService();
    }
    return WeightManagementService.instance;
  }

  /**
   * Get comprehensive weight summary for a specific product and supplier
   */
  public async getProductWeightSummary(
    productId: string, 
    supplierId: string, 
    dateRange?: { start: string; end: string }
  ): Promise<WeightSummary | null> {
    try {
      // Get product and supplier info
      const product = await getDB().products.get(productId);
      const entity = await getDB().entities.get(supplierId);
      
      if (!product || !entity || entity.entity_type !== 'supplier') {
        return null;
      }
      
      const supplier = entity;

      // Get inventory items (received items)
      let inventoryItems = await getDB().inventory_items
        .where('product_id')
        .equals(productId)
        // supplier_id REMOVED: Must use linked batch for supplier filter
        .toArray();

      // Only include inventory items where the batch's supplier_id matches supplierId
      const batchIds = [...new Set(inventoryItems.map(item => item.batch_id).filter(Boolean))];
      const inventoryBills = await getDB().inventory_bills
        .where('id')
        .anyOf(batchIds as string[])
        .toArray();
      const batchMap = new Map(inventoryBills.map(b => [b.id, b]));
      inventoryItems = inventoryItems.filter(item => {
        if (!item.batch_id) return false; // ignore orphaned/legacy/no-batch items
        const batch = batchMap.get(item.batch_id);
        return batch?.supplier_id === supplierId;
      });

      // Get sales items (sold items)
      let salesItems = await getDB().bill_line_items
        .where('product_id')
        .equals(productId)
        .toArray();
      
      // Filter by supplier: resolve via inventory_item_id → batch_id → supplier_id
      salesItems = salesItems.filter(item => {
        if (!item.inventory_item_id) return false;
        const inventoryItem = inventoryItems.find(inv => inv.id === item.inventory_item_id);
        if (!inventoryItem?.batch_id) return false;
        const batch = batchMap.get(inventoryItem.batch_id);
        return batch?.supplier_id === supplierId;
      });

      // Apply date range filter if provided
      if (dateRange) {
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        
        inventoryItems = inventoryItems.filter(item => {
          const itemDate = new Date(item.created_at);
          return itemDate >= startDate && itemDate <= endDate;
        });
        
        salesItems = salesItems.filter(item => {
          const itemDate = new Date(item.created_at);
          return itemDate >= startDate && itemDate <= endDate;
        });
      }

      // Get inventory bills to determine batch types
      const batchIdsForBills = [...new Set(inventoryItems.map(item => item.batch_id).filter(Boolean))];
      const inventoryBillsForBills = await getDB().inventory_bills
        .where('id')
        .anyOf(batchIdsForBills as string[])
        .toArray();

      // Calculate received weight summary
      const receivedWeight = {
        total: 0,
        byBatch: inventoryItems.map(item => {
          const bill = inventoryBillsForBills.find(b => b.id === item.batch_id);
          const weight = item.weight;
          const isWeightOptional = bill?.type === 'commission' && weight === null;
          
          if (weight !== null && weight !== undefined) {
            return {
              batchId: item.batch_id || item.id,
              billType: (bill?.type as 'commission' | 'cash' | 'credit') || 'cash',
              weight,
              isWeightOptional,
              receivedDate: item.created_at,
              notes: bill?.notes
            };
          } else {
            return {
              batchId: item.batch_id || item.id,
              billType: (bill?.type as 'commission' | 'cash' | 'credit') || 'commission',
              weight: null,
              isWeightOptional: true,
              receivedDate: item.created_at,
              notes: bill?.notes
            };
          }
        })
      };

      // Calculate total received weight (only for items with actual weight)
      receivedWeight.total = receivedWeight.byBatch
        .filter(batch => batch.weight !== null)
        .reduce((sum, batch) => sum + (batch.weight || 0), 0);

      // Calculate sold weight summary
      const soldWeight = {
        total: 0,
        byTransaction: salesItems
          .filter(item => item.weight !== null && item.weight !== undefined)
          .map(item => ({
            saleId: item.id,
            weight: item.weight || 0,
            quantity: item.quantity,
            soldDate: item.created_at,
            customerId: undefined, // TODO: Get from parent bill via bill_id
            customerName: undefined // Would need to fetch from bills → customers table
          }))
      };

      soldWeight.total = soldWeight.byTransaction.reduce((sum, tx) => sum + tx.weight, 0);

      // Calculate weight comparison
      const hasReceivableWeight = receivedWeight.byBatch.some(batch => batch.weight !== null);
      const difference = receivedWeight.total - soldWeight.total;
      const percentageDifference = receivedWeight.total > 0 ? (difference / receivedWeight.total) * 100 : 0;
      const discrepancyThreshold = 5; // 5% threshold
      
      let status: 'balanced' | 'over_sold' | 'under_sold' | 'no_comparison';
      if (!hasReceivableWeight) {
        status = 'no_comparison';
      } else if (Math.abs(percentageDifference) <= discrepancyThreshold) {
        status = 'balanced';
      } else if (difference < 0) {
        status = 'over_sold';
      } else {
        status = 'under_sold';
      }

      const weightComparison = {
        difference,
        percentageDifference,
        status,
        hasDiscrepancy: hasReceivableWeight && Math.abs(percentageDifference) > discrepancyThreshold,
        discrepancyThreshold
      };

      return {
        productId,
        productName: product.name,
        supplierId,
        supplierName: supplier.name,
        receivedWeight,
        soldWeight,
        weightComparison
      };

    } catch (error) {
      console.error('Error getting product weight summary:', error);
      return null;
    }
  }

  /**
   * Get weight summary for a specific bill (for bill closing and review)
   */
  public async getBillWeightSummary(billId: string): Promise<BillWeightSummary | null> {
    try {
      // Get the inventory bill
      const bill = await getDB().inventory_bills.get(billId);
      if (!bill) return null;

      // Get supplier info
      const entity = await getDB().entities.get(bill.supplier_id);
      if (!entity || entity.entity_type !== 'supplier') return null;
      const supplier = entity;

      // Get all inventory items for this bill
      const inventoryItems = await getDB().inventory_items
        .where('batch_id')
        .equals(billId)
        .toArray();

      // Get all products for these items
      const productIds = [...new Set(inventoryItems.map(item => item.product_id))];
      const products = await getDB().products
        .where('id')
        .anyOf(productIds)
        .toArray();

      // For each product, calculate sold quantities and weights
      const itemSummaries = await Promise.all(
        inventoryItems.map(async (inventoryItem) => {
          const product = products.find(p => p.id === inventoryItem.product_id);
          
          // Get sales for this specific inventory item
          const salesForThisItem = await getDB().bill_line_items
            .filter(item => item.inventory_item_id === inventoryItem.id)
            .toArray();

          const soldWeight = salesForThisItem.reduce((sum, sale) => sum + (sale.weight || 0), 0);
          const soldQuantity = salesForThisItem.reduce((sum, sale) => sum + sale.quantity, 0);
          
          const receivedWeight = inventoryItem.weight;
          const isWeightOptional = bill.type === 'commission' && receivedWeight === null;
          const weightDifference = receivedWeight !== null ? receivedWeight - soldWeight : null;

          return {
            productId: inventoryItem.product_id,
            productName: product?.name || 'Unknown Product',
            receivedWeight,
            receivedQuantity: inventoryItem.received_quantity,
            soldWeight,
            soldQuantity,
            weightDifference,
            isWeightOptional,
            unit: inventoryItem.unit
          };
        })
      );

      // Calculate totals
      const totalReceivedWeight = itemSummaries.some(item => item.receivedWeight === null) 
        ? null 
        : itemSummaries.reduce((sum, item) => sum + (item.receivedWeight || 0), 0);
      
      const totalSoldWeight = itemSummaries.reduce((sum, item) => sum + item.soldWeight, 0);
      
      const totalWeightDifference = totalReceivedWeight !== null 
        ? totalReceivedWeight - totalSoldWeight 
        : null;

      const hasWeightDiscrepancies = itemSummaries.some(item => 
        item.weightDifference !== null && Math.abs(item.weightDifference) > 0.1 // 100g threshold
      );

      const canCompareWeights = totalReceivedWeight !== null;

      return {
        billId,
        billType: bill.type as 'commission' | 'cash' | 'credit',
        supplierId: bill.supplier_id,
        supplierName: supplier.name,
        billDate: bill.created_at,
        status: bill.status === 'closed' ? 'closed' : 'open',
        items: itemSummaries,
        totalWeightSummary: {
          totalReceivedWeight,
          totalSoldWeight,
          totalWeightDifference,
          hasWeightDiscrepancies,
          canCompareWeights
        }
      };

    } catch (error) {
      console.error('Error getting bill weight summary:', error);
      return null;
    }
  }

  /**
   * Get weight discrepancy alerts for potential issues
   */
  public async getWeightDiscrepancyAlerts(
    storeId: string, 
    thresholdPercentage: number = 5
  ): Promise<WeightDiscrepancyAlert[]> {
    try {
      const alerts: WeightDiscrepancyAlert[] = [];

      // Get all products and suppliers (including global products)
      const products = await getDB().getAvailableProducts(storeId);
      const suppliers = await getDB().entities
        .where('[store_id+entity_type]')
        .equals([storeId, 'supplier'])
        .filter(s => !s._deleted)
        .toArray();

      // Check each product-supplier combination
      for (const product of products) {
        for (const supplier of suppliers) {
          const weightSummary = await this.getProductWeightSummary(product.id, supplier.id);
          
          if (weightSummary && weightSummary.weightComparison.hasDiscrepancy) {
            const { difference, percentageDifference, status } = weightSummary.weightComparison;
            
            let severity: 'low' | 'medium' | 'high';
            if (Math.abs(percentageDifference) > 20) severity = 'high';
            else if (Math.abs(percentageDifference) > 10) severity = 'medium';
            else severity = 'low';

            let description: string;
            let suggestedAction: string;

            if (status === 'over_sold') {
              description = `Sold weight (${weightSummary.soldWeight.total}kg) exceeds received weight (${weightSummary.receivedWeight.total}kg) by ${Math.abs(difference).toFixed(2)}kg (${Math.abs(percentageDifference).toFixed(1)}%)`;
              suggestedAction = 'Review sales records and inventory receipts. Check for data entry errors or potential theft.';
            } else {
              description = `Received weight (${weightSummary.receivedWeight.total}kg) exceeds sold weight (${weightSummary.soldWeight.total}kg) by ${difference.toFixed(2)}kg (${percentageDifference.toFixed(1)}%)`;
              suggestedAction = 'Check for unsold inventory or data entry errors in sales records.';
            }

            alerts.push({
              id: `${product.id}-${supplier.id}-${Date.now()}`,
              type: status === 'over_sold' ? 'over_sold' : 'under_sold',
              severity,
              productId: product.id,
              productName: product.name,
              supplierId: supplier.id,
              supplierName: supplier.name,
              discrepancyAmount: Math.abs(difference),
              discrepancyPercentage: Math.abs(percentageDifference),
              detectedAt: new Date().toISOString(),
              description,
              suggestedAction
            });
          }
        }
      }

      // Sort by severity and discrepancy percentage
      return alerts.sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.discrepancyPercentage - a.discrepancyPercentage;
      });

    } catch (error) {
      console.error('Error getting weight discrepancy alerts:', error);
      return [];
    }
  }

  /**
   * Validate weight data for a sale transaction
   */
  public validateSaleWeight(
    inventoryItemId: string, 
    saleWeight: number, 
    saleQuantity: number
  ): Promise<{
    isValid: boolean;
    warnings: string[];
    errors: string[];
  }> {
    return new Promise(async (resolve) => {
      const warnings: string[] = [];
      const errors: string[] = [];

      try {
        // Get the inventory item
        const inventoryItem = await getDB().inventory_items.get(inventoryItemId);
        if (!inventoryItem) {
          errors.push('Inventory item not found');
          return resolve({ isValid: false, warnings, errors });
        }

        // Get existing sales for this inventory item
        const existingSales = await getDB().bill_line_items
          .filter(item => item.inventory_item_id === inventoryItemId)
          .toArray();

        const totalSoldWeight = existingSales.reduce((sum, sale) => sum + (sale.weight || 0), 0);
        const totalSoldQuantity = existingSales.reduce((sum, sale) => sum + sale.quantity, 0);

        // Check if sale would exceed available inventory
        if (totalSoldQuantity + saleQuantity > inventoryItem.quantity) {
          errors.push(`Sale quantity (${saleQuantity}) would exceed available inventory (${inventoryItem.quantity - totalSoldQuantity} remaining)`);
        }

        // Check weight consistency if inventory has weight
        if (inventoryItem.weight !== null && inventoryItem.weight !== undefined) {
          const remainingWeight = inventoryItem.weight - totalSoldWeight;
          
          if (saleWeight > remainingWeight) {
            errors.push(`Sale weight (${saleWeight}kg) exceeds remaining inventory weight (${remainingWeight.toFixed(2)}kg)`);
          }

          // Check for reasonable weight per quantity ratio
          const weightPerUnit = saleWeight / saleQuantity;
          const inventoryWeightPerUnit = inventoryItem.weight / inventoryItem.quantity;
          const weightRatioDifference = Math.abs(weightPerUnit - inventoryWeightPerUnit) / inventoryWeightPerUnit;

          if (weightRatioDifference > 0.2) { // 20% difference threshold
            warnings.push(`Weight per unit (${weightPerUnit.toFixed(3)}kg) differs significantly from inventory average (${inventoryWeightPerUnit.toFixed(3)}kg)`);
          }
        } else {
          // Inventory weight is optional (commission items)
          if (saleWeight <= 0) {
            warnings.push('Weight not provided for sale of commission item (weight tracking is optional but recommended for comparison)');
          }
        }

        resolve({
          isValid: errors.length === 0,
          warnings,
          errors
        });

      } catch (error) {
        console.error('Error validating sale weight:', error);
        errors.push('Error validating weight data');
        resolve({ isValid: false, warnings, errors });
      }
    });
  }

  /**
   * Generate weight comparison report for bill closing
   */
  public async generateBillClosingWeightReport(billId: string): Promise<{
    canClose: boolean;
    report: BillWeightSummary;
    issues: Array<{
      type: 'error' | 'warning' | 'info';
      message: string;
      productId?: string;
    }>;
  }> {
    const issues: Array<{ type: 'error' | 'warning' | 'info'; message: string; productId?: string }> = [];
    
    const report = await this.getBillWeightSummary(billId);
    if (!report) {
      return {
        canClose: false,
        report: {} as BillWeightSummary,
        issues: [{ type: 'error', message: 'Bill not found or invalid' }]
      };
    }

    let canClose = true;

    // Check each item for weight discrepancies
    report.items.forEach(item => {
      if (item.isWeightOptional) {
        issues.push({
          type: 'info',
          message: `${item.productName}: Weight tracking is optional for commission items`,
          productId: item.productId
        });
      } else if (item.weightDifference !== null) {
        const discrepancyPercentage = item.receivedWeight 
          ? Math.abs(item.weightDifference / item.receivedWeight) * 100 
          : 0;

        if (Math.abs(item.weightDifference) > 0.5) { // 500g threshold
          if (discrepancyPercentage > 10) {
            issues.push({
              type: 'error',
              message: `${item.productName}: Significant weight discrepancy of ${item.weightDifference.toFixed(2)}kg (${discrepancyPercentage.toFixed(1)}%)`,
              productId: item.productId
            });
            canClose = false;
          } else {
            issues.push({
              type: 'warning',
              message: `${item.productName}: Minor weight discrepancy of ${item.weightDifference.toFixed(2)}kg (${discrepancyPercentage.toFixed(1)}%)`,
              productId: item.productId
            });
          }
        }
      }
    });

    // Overall bill assessment
    if (report.totalWeightSummary.canCompareWeights && report.totalWeightSummary.hasWeightDiscrepancies) {
      const totalDiscrepancy = report.totalWeightSummary.totalWeightDifference || 0;
      const totalReceived = report.totalWeightSummary.totalReceivedWeight || 0;
      const discrepancyPercentage = totalReceived > 0 ? Math.abs(totalDiscrepancy / totalReceived) * 100 : 0;

      if (discrepancyPercentage > 5) {
        issues.push({
          type: 'warning',
          message: `Total bill weight discrepancy: ${totalDiscrepancy.toFixed(2)}kg (${discrepancyPercentage.toFixed(1)}%)`
        });
      }
    }

    return {
      canClose,
      report,
      issues
    };
  }
}

export const weightManagementService = WeightManagementService.getInstance();

