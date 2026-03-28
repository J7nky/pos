/* eslint-disable @typescript-eslint/no-explicit-any -- mirrors composer stockLevels shape */
import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Database } from '../../types/database';

type Tables = Database['public']['Tables'];

export interface DerivedStockLevelsInput {
  products: Tables['products']['Row'][];
  inventoryItems: any[];
  entities: Tables['entities']['Row'][];
  lowStockAlertsEnabled: boolean;
  lowStockThreshold: number;
}

/**
 * Aggregates per-product stock and supplier breakdown for POS / alerts.
 */
export function useDerivedStockLevels({
  products,
  inventoryItems,
  entities,
  lowStockAlertsEnabled,
  lowStockThreshold,
}: DerivedStockLevelsInput): { stockLevels: any[]; setStockLevels: Dispatch<SetStateAction<any[]>> } {
  const [stockLevels, setStockLevels] = useState<any[]>([]);

  const updateStockLevels = useCallback(() => {
    const levels = products.map(product => {
      const productInventory = inventoryItems.filter((item: any) => item.product_id === product.id);
      const totalStock = productInventory.reduce((sum: number, item: any) => sum + item.quantity, 0);
      const supplierEntities = entities.filter(e => e.entity_type === 'supplier' && !e._deleted);
      const supplierStocks = productInventory.reduce(
        (acc: Array<{ supplierId: string; supplierName: string; quantity: number }>, item: any) => {
          const existing = acc.find((s: any) => s.supplierId === item.supplier_id);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            const supplier = supplierEntities.find(s => s.id === item.supplier_id);
            acc.push({
              supplierId: item.supplier_id || '',
              supplierName: supplier?.name || 'Unknown Supplier',
              quantity: item.quantity,
            });
          }
          return acc;
        },
        [] as Array<{ supplierId: string; supplierName: string; quantity: number }>
      );
      return {
        id: product.id,
        productId: product.id,
        productName: product.name,
        currentStock: totalStock,
        suppliers: supplierStocks,
        lowStockAlert: lowStockAlertsEnabled && totalStock <= lowStockThreshold,
      };
    });
    setStockLevels(levels);
  }, [products, inventoryItems, entities, lowStockAlertsEnabled, lowStockThreshold]);

  useEffect(() => {
    updateStockLevels();
  }, [updateStockLevels]);

  return { stockLevels, setStockLevels };
}
