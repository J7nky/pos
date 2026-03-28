/**
 * Product domain layer for OfflineDataContext (IMPROVEMENTS_ENHANCEMENTS_REPORT §1.3).
 * Owns products state and product CRUD; composer calls hydrate() from refreshData.
 * Adapter may be refs so the composer can set pushUndo/resetAutoSyncTimer after they are defined.
 */

import { useState, useCallback } from 'react';
import { createId } from '../../lib/db';
import { getDB } from '../../lib/db';
import { crudHelperService } from '../../services/crudHelperService';
import { emitProductEvent, buildEventOptions } from '../../services/eventEmissionHelper';
import type { ProductDataLayerAdapter, ProductDataLayerResult, Tables } from './types';

export function useProductDataLayer(adapter: ProductDataLayerAdapter): ProductDataLayerResult {
  const { storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer } = adapter;
  const [products, setProducts] = useState<Tables['products']['Row'][]>([]);

  const hydrate = useCallback((productsData: Tables['products']['Row'][]) => {
    setProducts(productsData);
  }, []);

  const addProduct = useCallback(
    async (productData: Omit<Tables['products']['Insert'], 'store_id'>): Promise<void> => {
      const productId = productData.id || createId();
      const dataWithId = { ...productData, id: productId };

      await crudHelperService.addEntity('products', storeId!, dataWithId);

      pushUndo({
        type: 'add_product',
        affected: [{ table: 'products', id: productId }],
        steps: [{ op: 'delete', table: 'products', id: productId }],
      });

      resetAutoSyncTimer();

      await emitProductEvent(
        productId,
        buildEventOptions(storeId!, currentBranchId, userProfileId, 'create')
      );
    },
    [storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer]
  );

  const updateProduct = useCallback(
    async (id: string, updates: Tables['products']['Update']): Promise<void> => {
      const originalProduct = await getDB().products.get(id);
      if (!originalProduct) throw new Error('Product not found');

      await crudHelperService.updateEntity('products', id, updates);

      const undoChanges: Record<string, unknown> = {};
      for (const key of Object.keys(updates)) {
        if (key !== '_synced' && key !== 'updated_at') {
          undoChanges[key] = (originalProduct as Record<string, unknown>)[key];
        }
      }

      pushUndo({
        type: 'update_product',
        affected: [{ table: 'products', id }],
        steps: [{ op: 'update', table: 'products', id, changes: undoChanges }],
      });

      resetAutoSyncTimer();

      await emitProductEvent(
        id,
        buildEventOptions(storeId!, currentBranchId, userProfileId, 'update', { fields_changed: Object.keys(updates) })
      );
    },
    [storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer]
  );

  const deleteProduct = useCallback(
    async (id: string): Promise<void> => {
      const originalProduct = await getDB().products.get(id);
      if (!originalProduct) throw new Error('Product not found');

      await crudHelperService.deleteEntity('products', id);

      pushUndo({
        type: 'delete_product',
        affected: [{ table: 'products', id }],
        steps: [
          {
            op: 'update',
            table: 'products',
            id,
            changes: { _deleted: false, _synced: false },
          },
        ],
      });

      resetAutoSyncTimer();

      await emitProductEvent(id, buildEventOptions(storeId!, currentBranchId, userProfileId, 'delete'));
    },
    [storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer]
  );

  return {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    hydrate,
  };
}
