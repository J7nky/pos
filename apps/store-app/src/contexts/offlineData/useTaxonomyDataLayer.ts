/**
 * Taxonomy domain layer for OfflineDataContext (v64).
 * Owns `product_categories` and `units_of_measure` state. Hydrate is driven
 * by the composer (loadAllStoreData fans into hydrate); CRUD goes through
 * `categoryService` / `unitService`.
 */

import { useState, useCallback } from 'react';
import { getDB } from '../../lib/db';
import {
  categoryService,
  unitService,
  type CreateCategoryInput,
  type CreateUnitInput,
} from '../../services/taxonomyService';
import { auditService } from '../../services/auditService';
import type { ProductCategory, UnitOfMeasure } from '../../types/taxonomy';

export interface TaxonomyDataLayerAdapter {
  storeId: string | null;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  resetAutoSyncTimer: () => void;
  debouncedSync: () => void;
}

export interface TaxonomyDataLayerResult {
  categories: ProductCategory[];
  units: UnitOfMeasure[];
  hydrate: (categoriesData: ProductCategory[], unitsData: UnitOfMeasure[]) => void;
  refresh: () => Promise<void>;
  createCategory: (input: CreateCategoryInput) => Promise<string>;
  updateCategory: (id: string, updates: Parameters<typeof categoryService.update>[1]) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  createUnit: (input: CreateUnitInput) => Promise<string>;
  updateUnit: (id: string, updates: Parameters<typeof unitService.update>[1]) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
}

export function useTaxonomyDataLayer(adapter: TaxonomyDataLayerAdapter): TaxonomyDataLayerResult {
  const { storeId, currentBranchId, userProfileId, resetAutoSyncTimer, debouncedSync } = adapter;
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);

  const hydrate = useCallback((categoriesData: ProductCategory[], unitsData: UnitOfMeasure[]) => {
    setCategories(categoriesData || []);
    setUnits(unitsData || []);
  }, []);

  const refresh = useCallback(async () => {
    if (!storeId) return;
    const [cats, us] = await Promise.all([
      categoryService.list(storeId),
      unitService.list(storeId),
    ]);
    setCategories(cats);
    setUnits(us);
  }, [storeId]);

  const createCategory = useCallback(async (input: CreateCategoryInput): Promise<string> => {
    if (!storeId) throw new Error('No active store');
    const id = await categoryService.create(storeId, input);
    await refresh();
    resetAutoSyncTimer();
    debouncedSync();
    await auditService.record({
      storeId, branchId: currentBranchId, changedBy: userProfileId,
      entityType: 'product_category', entityId: id, action: 'create',
      changeReason: 'Category created',
    });
    return id;
  }, [storeId, currentBranchId, userProfileId, refresh, resetAutoSyncTimer, debouncedSync]);

  const updateCategory = useCallback(async (id: string, updates: Parameters<typeof categoryService.update>[1]): Promise<void> => {
    const before = await getDB().product_categories.get(id);
    await categoryService.update(id, updates);
    await refresh();
    resetAutoSyncTimer();
    debouncedSync();
    const changes = auditService.diffUpdates(before, updates as Record<string, unknown>);
    if (changes.length > 0) {
      await auditService.record({
        storeId, branchId: currentBranchId, changedBy: userProfileId,
        entityType: 'product_category', entityId: id, action: 'update', changes,
      });
    }
  }, [storeId, currentBranchId, userProfileId, refresh, resetAutoSyncTimer, debouncedSync]);

  const deleteCategory = useCallback(async (id: string): Promise<void> => {
    await categoryService.softDelete(id);
    await refresh();
    resetAutoSyncTimer();
    debouncedSync();
    await auditService.record({
      storeId, branchId: currentBranchId, changedBy: userProfileId,
      entityType: 'product_category', entityId: id, action: 'delete',
      changeReason: 'Category deleted',
    });
  }, [storeId, currentBranchId, userProfileId, refresh, resetAutoSyncTimer, debouncedSync]);

  const createUnit = useCallback(async (input: CreateUnitInput): Promise<string> => {
    if (!storeId) throw new Error('No active store');
    const id = await unitService.create(storeId, input);
    await refresh();
    resetAutoSyncTimer();
    debouncedSync();
    await auditService.record({
      storeId, branchId: currentBranchId, changedBy: userProfileId,
      entityType: 'unit_of_measure', entityId: id, action: 'create',
      changeReason: 'Unit created',
    });
    return id;
  }, [storeId, currentBranchId, userProfileId, refresh, resetAutoSyncTimer, debouncedSync]);

  const updateUnit = useCallback(async (id: string, updates: Parameters<typeof unitService.update>[1]): Promise<void> => {
    const before = await getDB().units_of_measure.get(id);
    await unitService.update(id, updates);
    await refresh();
    resetAutoSyncTimer();
    debouncedSync();
    const changes = auditService.diffUpdates(before, updates as Record<string, unknown>);
    if (changes.length > 0) {
      await auditService.record({
        storeId, branchId: currentBranchId, changedBy: userProfileId,
        entityType: 'unit_of_measure', entityId: id, action: 'update', changes,
      });
    }
  }, [storeId, currentBranchId, userProfileId, refresh, resetAutoSyncTimer, debouncedSync]);

  const deleteUnit = useCallback(async (id: string): Promise<void> => {
    await unitService.softDelete(id);
    await refresh();
    resetAutoSyncTimer();
    debouncedSync();
    await auditService.record({
      storeId, branchId: currentBranchId, changedBy: userProfileId,
      entityType: 'unit_of_measure', entityId: id, action: 'delete',
      changeReason: 'Unit deleted',
    });
  }, [storeId, currentBranchId, userProfileId, refresh, resetAutoSyncTimer, debouncedSync]);

  return {
    categories,
    units,
    hydrate,
    refresh,
    createCategory,
    updateCategory,
    deleteCategory,
    createUnit,
    updateUnit,
    deleteUnit,
  };
}
