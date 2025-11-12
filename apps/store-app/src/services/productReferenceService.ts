import { db } from '../lib/db';

export interface ProductReferences {
  hasReferences: boolean;
  billLineItems: number;
  inventoryItems: number;
  totalReferences: number;
}

/**
 * Check if a product is referenced in bill_line_items or inventory_items
 * @param productId - The ID of the product to check
 * @returns ProductReferences object with reference counts
 */
export async function checkProductReferences(productId: string): Promise<ProductReferences> {
  try {
    // Check bill_line_items for references
    const billLineItemsCount = await db.bill_line_items
      .where('product_id')
      .equals(productId)
      .and(item => !item._deleted)
      .count();

    // Check inventory_items for references
    const inventoryItemsCount = await db.inventory_items
      .where('product_id')
      .equals(productId)
      .and(item => !item._deleted)
      .count();

    const totalReferences = billLineItemsCount + inventoryItemsCount;

    return {
      hasReferences: totalReferences > 0,
      billLineItems: billLineItemsCount,
      inventoryItems: inventoryItemsCount,
      totalReferences,
    };
  } catch (error) {
    console.error('Error checking product references:', error);
    throw new Error('Failed to check product references');
  }
}
