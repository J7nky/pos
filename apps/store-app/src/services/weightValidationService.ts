import { weightManagementService } from './weightManagementService';
import { weightConfigurationService } from './weightConfigurationService';
import { getDB } from '../lib/db';

export interface WeightValidationResult {
  isValid: boolean;
  canProceed: boolean;
  errors: Array<{
    type: 'error' | 'warning' | 'info';
    message: string;
    field?: string;
  }>;
  suggestions: string[];
}

export interface SaleWeightValidationInput {
  inventoryItemId: string;
  saleQuantity: number;
  saleWeight?: number;
  customerId?: string;
}

export interface PurchaseWeightValidationInput {
  supplierId: string;
  productId: string;
  purchaseType: 'cash' | 'credit' | 'commission';
  quantity: number;
  weight?: number;
  unit: string;
}

export class WeightValidationService {
  // Simplified from singleton pattern - this service is stateless

  /**
   * Validate weight for a sale transaction
   */
  public async validateSaleWeight(input: SaleWeightValidationInput): Promise<WeightValidationResult> {
    const errors: Array<{ type: 'error' | 'warning' | 'info'; message: string; field?: string }> = [];
    const suggestions: string[] = [];
    const config = weightConfigurationService.getConfiguration();

    try {
      // Get inventory item
      const inventoryItem = await getDB().inventory_items.get(input.inventoryItemId);
      if (!inventoryItem) {
        return {
          isValid: false,
          canProceed: false,
          errors: [{ type: 'error', message: 'Inventory item not found', field: 'inventoryItemId' }],
          suggestions: ['Please select a valid inventory item']
        };
      }

      // Get inventory bill to determine type
      const inventoryBill = inventoryItem.batch_id 
        ? await getDB().inventory_bills.get(inventoryItem.batch_id)
        : null;
      
      const isCommissionItem = inventoryBill?.type === 'commission';
      const inventoryHasWeight = inventoryItem.weight !== null && inventoryItem.weight !== undefined;

      // Check if weight is required
      const weightRequired = isCommissionItem 
        ? config.requireWeightForCommissionItems 
        : true; // Required for cash/credit items

      if (weightRequired && (!input.saleWeight || input.saleWeight <= 0)) {
        errors.push({
          type: 'error',
          message: `Weight is required for ${isCommissionItem ? 'commission' : 'cash/credit'} items`,
          field: 'saleWeight'
        });
        suggestions.push('Please enter the weight of the items being sold');
      }

      // If weight is provided, validate it
      if (input.saleWeight && input.saleWeight > 0) {
        // Get existing sales for this inventory item
        const existingSales = await getDB().bill_line_items
          .where('inventory_item_id')
          .equals(input.inventoryItemId)
          .toArray();

        const totalSoldWeight = existingSales.reduce((sum, sale) => sum + (sale.weight || 0), 0);
        const totalSoldQuantity = existingSales.reduce((sum, sale) => sum + sale.quantity, 0);

        // Check quantity limits
        const remainingQuantity = inventoryItem.quantity - totalSoldQuantity;
        if (input.saleQuantity > remainingQuantity) {
          errors.push({
            type: 'error',
            message: `Sale quantity (${input.saleQuantity}) exceeds available inventory (${remainingQuantity} remaining)`,
            field: 'saleQuantity'
          });
        }

        // Check weight limits if inventory has weight
        if (inventoryHasWeight) {
          const remainingWeight = inventoryItem.weight! - totalSoldWeight;
          
          if (input.saleWeight > remainingWeight + config.tolerances.minimum) {
            errors.push({
              type: 'error',
              message: `Sale weight (${config.formatWeight(input.saleWeight)}) exceeds remaining inventory weight (${config.formatWeight(remainingWeight)})`,
              field: 'saleWeight'
            });
            suggestions.push('Check the remaining weight in inventory or adjust the sale weight');
          }

          // Check weight-to-quantity ratio consistency
          const saleWeightPerUnit = input.saleWeight / input.saleQuantity;
          const inventoryWeightPerUnit = inventoryItem.weight! / inventoryItem.quantity;
          const ratioDiscrepancy = Math.abs(saleWeightPerUnit - inventoryWeightPerUnit) / inventoryWeightPerUnit * 100;

          if (ratioDiscrepancy > config.discrepancyThresholds.major) {
            errors.push({
              type: 'warning',
              message: `Weight per unit (${config.formatWeight(saleWeightPerUnit)}) differs significantly from inventory average (${config.formatWeight(inventoryWeightPerUnit)}) by ${ratioDiscrepancy.toFixed(1)}%`,
              field: 'saleWeight'
            });
            suggestions.push('Verify the weight measurement or check if the items vary in weight');
          } else if (ratioDiscrepancy > config.discrepancyThresholds.minor) {
            errors.push({
              type: 'info',
              message: `Weight per unit varies slightly from inventory average (${ratioDiscrepancy.toFixed(1)}% difference)`,
              field: 'saleWeight'
            });
          }
        } else if (isCommissionItem) {
          // Commission item without received weight - this is normal
          errors.push({
            type: 'info',
            message: 'Weight tracking is optional for commission items. This weight will be used for comparison purposes only.',
            field: 'saleWeight'
          });
          suggestions.push('Recording weight helps with inventory reconciliation even if not required');
        }

        // Check for reasonable weight values
        if (input.saleWeight > 1000) { // 1 ton
          errors.push({
            type: 'warning',
            message: 'Weight seems unusually high. Please verify the measurement.',
            field: 'saleWeight'
          });
        }

        if (input.saleWeight < 0.001) { // 1 gram
          errors.push({
            type: 'warning',
            message: 'Weight seems unusually low. Please verify the measurement.',
            field: 'saleWeight'
          });
        }
      } else if (inventoryHasWeight && !isCommissionItem) {
        // No weight provided for weighted item
        suggestions.push('Consider entering the weight for better inventory tracking');
      }

      // Use the built-in validation from weight management service
      if (input.saleWeight && input.saleWeight > 0) {
        const validationResult = await weightManagementService.validateSaleWeight(
          input.inventoryItemId,
          input.saleWeight,
          input.saleQuantity
        );

        // Merge validation results
        validationResult.errors.forEach(error => {
          errors.push({ type: 'error', message: error });
        });

        validationResult.warnings.forEach(warning => {
          errors.push({ type: 'warning', message: warning });
        });
      }

      const hasErrors = errors.some(e => e.type === 'error');
      const hasWarnings = errors.some(e => e.type === 'warning');

      return {
        isValid: !hasErrors,
        canProceed: !hasErrors || config.billClosingSettings.allowCloseWithMinorDiscrepancies,
        errors,
        suggestions
      };

    } catch (error) {
      console.error('Error validating sale weight:', error);
      return {
        isValid: false,
        canProceed: false,
        errors: [{ type: 'error', message: 'Error validating weight data' }],
        suggestions: ['Please try again or contact support']
      };
    }
  }

  /**
   * Validate weight for a purchase transaction
   */
  public async validatePurchaseWeight(input: PurchaseWeightValidationInput): Promise<WeightValidationResult> {
    const errors: Array<{ type: 'error' | 'warning' | 'info'; message: string; field?: string }> = [];
    const suggestions: string[] = [];
    const config = weightConfigurationService.getConfiguration();

    try {
      const weightRequired = config.isWeightRequired(input.purchaseType);

      // Check if weight is required
      if (weightRequired && (!input.weight || input.weight <= 0)) {
        errors.push({
          type: 'error',
          message: `Weight is required for ${input.purchaseType} purchases`,
          field: 'weight'
        });
        suggestions.push('Please enter the weight of the received items');
      }

      // If weight is provided, validate it
      if (input.weight && input.weight > 0) {
        // Check for reasonable weight values
        if (input.weight > 10000) { // 10 tons
          errors.push({
            type: 'warning',
            message: 'Weight seems unusually high for a single purchase. Please verify.',
            field: 'weight'
          });
        }

        if (input.weight < 0.001) { // 1 gram
          errors.push({
            type: 'warning',
            message: 'Weight seems unusually low. Please verify the measurement.',
            field: 'weight'
          });
        }

        // Check weight-to-quantity ratio for reasonableness
        const weightPerUnit = input.weight / input.quantity;
        
        // Define reasonable weight ranges per unit based on common products
        const reasonableRanges = {
          'kg': { min: 0.001, max: 100 }, // 1g to 100kg per unit
          'piece': { min: 0.001, max: 50 }, // 1g to 50kg per piece
          'box': { min: 0.1, max: 500 }, // 100g to 500kg per box
          'bag': { min: 0.1, max: 100 }, // 100g to 100kg per bag
          'bundle': { min: 0.1, max: 200 }, // 100g to 200kg per bundle
          'dozen': { min: 0.012, max: 600 } // 12g to 600kg per dozen (1g-50kg per item)
        };

        const range = reasonableRanges[input.unit as keyof typeof reasonableRanges] || reasonableRanges['piece'];
        
        if (weightPerUnit < range.min) {
          errors.push({
            type: 'warning',
            message: `Weight per ${input.unit} (${config.formatWeight(weightPerUnit)}) seems unusually low`,
            field: 'weight'
          });
          suggestions.push('Verify the weight measurement and unit selection');
        } else if (weightPerUnit > range.max) {
          errors.push({
            type: 'warning',
            message: `Weight per ${input.unit} (${config.formatWeight(weightPerUnit)}) seems unusually high`,
            field: 'weight'
          });
          suggestions.push('Verify the weight measurement and unit selection');
        }

        // Special handling for commission items
        if (input.purchaseType === 'commission') {
          if (!weightRequired) {
            errors.push({
              type: 'info',
              message: 'Weight is optional for commission items but recommended for comparison tracking',
              field: 'weight'
            });
            suggestions.push('Recording weight helps track discrepancies when items are sold');
          }
        }
      } else if (input.purchaseType === 'commission' && !weightRequired) {
        // Commission item without weight - this is acceptable
        errors.push({
          type: 'info',
          message: 'Weight not provided for commission item. Weight comparison will not be available.',
          field: 'weight'
        });
        suggestions.push('Consider recording weight for better inventory reconciliation');
      }

      // Check for existing similar purchases to detect patterns
      try {
        const recentPurchases = await getDB().inventory_items
          .where('product_id')
          .equals(input.productId)
          .filter(item => item.supplier_id === input.supplierId)
          .limit(5)
          .toArray();

        if (recentPurchases.length > 0 && input.weight) {
          const recentWeights = recentPurchases
            .filter(item => item.weight && item.weight > 0)
            .map(item => item.weight! / item.quantity);

          if (recentWeights.length > 0) {
            const avgWeightPerUnit = recentWeights.reduce((sum, w) => sum + w, 0) / recentWeights.length;
            const currentWeightPerUnit = input.weight / input.quantity;
            const deviation = Math.abs(currentWeightPerUnit - avgWeightPerUnit) / avgWeightPerUnit * 100;

            if (deviation > config.discrepancyThresholds.major) {
              errors.push({
                type: 'warning',
                message: `Weight per unit differs significantly from recent purchases (${deviation.toFixed(1)}% deviation)`,
                field: 'weight'
              });
              suggestions.push('Verify the weight or check if this is a different variety/size of the product');
            }
          }
        }
      } catch (error) {
        // Non-critical error - don't fail validation
        console.warn('Could not check recent purchase patterns:', error);
      }

      const hasErrors = errors.some(e => e.type === 'error');

      return {
        isValid: !hasErrors,
        canProceed: !hasErrors,
        errors,
        suggestions
      };

    } catch (error) {
      console.error('Error validating purchase weight:', error);
      return {
        isValid: false,
        canProceed: false,
        errors: [{ type: 'error', message: 'Error validating weight data' }],
        suggestions: ['Please try again or contact support']
      };
    }
  }

  /**
   * Validate weight data consistency across related records
   */
  public async validateWeightConsistency(
    productId: string,
    supplierId: string
  ): Promise<{
    isConsistent: boolean;
    issues: Array<{
      type: 'error' | 'warning' | 'info';
      message: string;
      affectedRecords?: string[];
    }>;
    recommendations: string[];
  }> {
    const issues: Array<{ type: 'error' | 'warning' | 'info'; message: string; affectedRecords?: string[] }> = [];
    const recommendations: string[] = [];

    try {
      const weightSummary = await weightManagementService.getProductWeightSummary(productId, supplierId);
      
      if (!weightSummary) {
        return {
          isConsistent: true,
          issues: [{ type: 'info', message: 'No weight data found for this product-supplier combination' }],
          recommendations: ['Start recording weights for better inventory tracking']
        };
      }

      const { weightComparison, receivedWeight, soldWeight } = weightSummary;

      // Check for major discrepancies
      if (weightComparison.status === 'over_sold') {
        issues.push({
          type: 'error',
          message: `Over-selling detected: Sold weight (${soldWeight.total}kg) exceeds received weight (${receivedWeight.total}kg) by ${Math.abs(weightComparison.difference).toFixed(2)}kg`,
        });
        recommendations.push('Review sales records and inventory receipts for errors');
        recommendations.push('Check for potential data entry mistakes or unauthorized sales');
      } else if (weightComparison.status === 'under_sold' && weightComparison.hasDiscrepancy) {
        issues.push({
          type: 'warning',
          message: `Under-selling detected: Received weight (${receivedWeight.total}kg) exceeds sold weight (${soldWeight.total}kg) by ${weightComparison.difference.toFixed(2)}kg`,
        });
        recommendations.push('Check for unsold inventory or missing sales records');
      }

      // Check for missing weight data
      const missingReceivedWeights = receivedWeight.byBatch.filter(batch => batch.weight === null && !batch.isWeightOptional);
      if (missingReceivedWeights.length > 0) {
        issues.push({
          type: 'warning',
          message: `${missingReceivedWeights.length} received batches are missing weight data`,
          affectedRecords: missingReceivedWeights.map(batch => batch.batchId)
        });
        recommendations.push('Update missing weight data in inventory records');
      }

      const missingSoldWeights = soldWeight.byTransaction.filter(tx => tx.weight === 0);
      if (missingSoldWeights.length > 0) {
        issues.push({
          type: 'info',
          message: `${missingSoldWeights.length} sales transactions are missing weight data`,
          affectedRecords: missingSoldWeights.map(tx => tx.saleId)
        });
        recommendations.push('Consider recording weights for future sales for better tracking');
      }

      // Check for suspicious patterns
      const soldTransactions = soldWeight.byTransaction;
      if (soldTransactions.length >= 3) {
        const weights = soldTransactions.map(tx => tx.weight);
        const avgWeight = weights.reduce((sum, w) => sum + w, 0) / weights.length;
        const suspiciousTransactions = soldTransactions.filter(tx => 
          Math.abs(tx.weight - avgWeight) / avgWeight > 0.5 // 50% deviation
        );

        if (suspiciousTransactions.length > 0) {
          issues.push({
            type: 'info',
            message: `${suspiciousTransactions.length} sales have unusual weight patterns`,
            affectedRecords: suspiciousTransactions.map(tx => tx.saleId)
          });
          recommendations.push('Review transactions with unusual weights for accuracy');
        }
      }

      const hasErrors = issues.some(issue => issue.type === 'error');
      const hasWarnings = issues.some(issue => issue.type === 'warning');

      return {
        isConsistent: !hasErrors && !hasWarnings,
        issues,
        recommendations
      };

    } catch (error) {
      console.error('Error validating weight consistency:', error);
      return {
        isConsistent: false,
        issues: [{ type: 'error', message: 'Error checking weight consistency' }],
        recommendations: ['Please try again or contact support']
      };
    }
  }

  /**
   * Batch validate multiple weight records
   */
  public async batchValidateWeights(
    validationInputs: Array<SaleWeightValidationInput | PurchaseWeightValidationInput>
  ): Promise<{
    overallValid: boolean;
    results: Array<WeightValidationResult & { inputIndex: number }>;
    summary: {
      totalItems: number;
      validItems: number;
      itemsWithErrors: number;
      itemsWithWarnings: number;
    };
  }> {
    const results: Array<WeightValidationResult & { inputIndex: number }> = [];

    for (let i = 0; i < validationInputs.length; i++) {
      const input = validationInputs[i];
      let result: WeightValidationResult;

      if ('inventoryItemId' in input) {
        // Sale weight validation
        result = await this.validateSaleWeight(input);
      } else {
        // Purchase weight validation
        result = await this.validatePurchaseWeight(input);
      }

      results.push({ ...result, inputIndex: i });
    }

    const validItems = results.filter(r => r.isValid).length;
    const itemsWithErrors = results.filter(r => r.errors.some(e => e.type === 'error')).length;
    const itemsWithWarnings = results.filter(r => r.errors.some(e => e.type === 'warning')).length;

    return {
      overallValid: itemsWithErrors === 0,
      results,
      summary: {
        totalItems: validationInputs.length,
        validItems,
        itemsWithErrors,
        itemsWithWarnings
      }
    };
  }
}

// Export service instance (stateless service - no singleton needed)
export const weightValidationService = new WeightValidationService();

