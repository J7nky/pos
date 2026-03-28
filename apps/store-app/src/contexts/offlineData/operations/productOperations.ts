/**
 * Product CRUD operations (thinning OfflineDataContext).
 * addProduct, updateProduct, deleteProduct.
 */

import { getDB, createId } from '../../../lib/db';
import type { Database } from '../../../types/database';
import { crudHelperService } from '../../../services/crudHelperService';

type ProductInsert = Omit<Database['public']['Tables']['products']['Insert'], 'store_id'>;
type ProductUpdate = Database['public']['Tables']['products']['Update'];

export interface ProductCrudDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  pushUndo: (undoData: any) => void;
  resetAutoSyncTimer: () => void;
}

export async function addProduct(deps: ProductCrudDeps, productData: ProductInsert): Promise<void> {
  const { storeId, pushUndo, resetAutoSyncTimer } = deps;

  const productId = (productData as any).id || createId();
  const dataWithId = { ...productData, id: productId };

  await crudHelperService.addEntity('products', storeId!, dataWithId);

  pushUndo({
    type: 'add_product',
    affected: [{ table: 'products', id: productId }],
    steps: [{ op: 'delete', table: 'products', id: productId }]
  });

  resetAutoSyncTimer();
}

export async function updateProduct(deps: ProductCrudDeps, id: string, updates: ProductUpdate): Promise<void> {
  const { pushUndo, resetAutoSyncTimer } = deps;

  const originalProduct = await getDB().products.get(id);
  if (!originalProduct) throw new Error('Product not found');

  await crudHelperService.updateEntity('products', id, updates);

  const undoChanges: any = {};
  for (const key of Object.keys(updates)) {
    if (key !== '_synced' && key !== 'updated_at') {
      undoChanges[key] = (originalProduct as any)[key];
    }
  }

  pushUndo({
    type: 'update_product',
    affected: [{ table: 'products', id }],
    steps: [{ op: 'update', table: 'products', id, changes: undoChanges }]
  });

  resetAutoSyncTimer();
}

export async function deleteProduct(deps: ProductCrudDeps, id: string): Promise<void> {
  const { pushUndo, resetAutoSyncTimer } = deps;

  const originalProduct = await getDB().products.get(id);
  if (!originalProduct) throw new Error('Product not found');

  await crudHelperService.deleteEntity('products', id);

  pushUndo({
    type: 'delete_product',
    affected: [{ table: 'products', id }],
    steps: [{ op: 'update', table: 'products', id, changes: { _deleted: false, _synced: false } }]
  });

  resetAutoSyncTimer();
}
