/**
 * Entity (customer/supplier) domain layer for OfflineDataContext (§1.3).
 * Owns entities state and add/update customer & supplier; composer calls hydrate() from refreshData.
 * Entity ops use getDB().entities directly (not crudHelperService), so the layer calls refreshData after writes.
 */

import { useState, useCallback } from 'react';
import { createId } from '../../lib/db';
import { getDB } from '../../lib/db';
import { journalService } from '../../services/journalService';
import { emitEntityEvent, buildEventOptions } from '../../services/eventEmissionHelper';
import { getLocalDateString } from '../../utils/dateUtils';
import type { EntityDataLayerAdapter, EntityDataLayerResult, Tables } from './types';

export function useEntityDataLayer(adapter: EntityDataLayerAdapter): EntityDataLayerResult {
  const { storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer, refreshData } = adapter;
  const [entities, setEntities] = useState<Tables['entities']['Row'][]>([]);

  const hydrate = useCallback((entitiesData: Tables['entities']['Row'][]) => {
    setEntities(entitiesData);
  }, []);

  const addSupplier = useCallback(
    async (supplierData: Omit<Tables['suppliers']['Insert'], 'store_id'>): Promise<void> => {
      const supplierId = supplierData.id || createId();
      const now = new Date().toISOString();

      const initialLBPBalance = (supplierData as any).lb_balance || 0;
      const initialUSDBalance = (supplierData as any).usd_balance || 0;

      const entity = {
        id: supplierId,
        store_id: storeId!,
        branch_id: currentBranchId,
        entity_type: 'supplier' as const,
        entity_code: `SUPP-${supplierId.slice(0, 8).toUpperCase()}`,
        name: supplierData.name,
        phone: supplierData.phone || null,
        is_system_entity: false,
        is_active: true,
        customer_data: null,
        supplier_data: {
          type: (supplierData as any).type || 'standard',
          advance_lb_balance: (supplierData as any).advance_lb_balance || 0,
          advance_usd_balance: (supplierData as any).advance_usd_balance || 0,
          email: (supplierData as any).email || null,
          address: (supplierData as any).address || null,
        },
        created_at: now,
        updated_at: now,
        _synced: false,
        _deleted: false,
      };

      await getDB().entities.add(entity);

      if ((initialLBPBalance !== 0 || initialUSDBalance !== 0) && currentBranchId) {
        const transactionId = createId();
        const postedDate = getLocalDateString(now);
        try {
          const primaryAmount = initialUSDBalance !== 0 ? initialUSDBalance : initialLBPBalance;
          const isPositive = primaryAmount >= 0;
          const debitAccount = isPositive ? '3100' : '2100';
          const creditAccount = isPositive ? '2100' : '3100';
          const sameSign =
            (initialUSDBalance >= 0 && initialLBPBalance >= 0) ||
            (initialUSDBalance <= 0 && initialLBPBalance <= 0) ||
            initialUSDBalance === 0 ||
            initialLBPBalance === 0;

          if (sameSign) {
            await journalService.createJournalEntry({
              transactionId,
              debitAccount,
              creditAccount,
              amountUSD: Math.abs(initialUSDBalance),
              amountLBP: Math.abs(initialLBPBalance),
              entityId: supplierId,
              description: `customers.initialBalance`,
              postedDate,
              createdBy: userProfileId || null,
              branchId: currentBranchId,
            });
          } else {
            if (initialUSDBalance !== 0) {
              const usdIsPositive = initialUSDBalance >= 0;
              await journalService.createJournalEntry({
                transactionId,
                debitAccount: usdIsPositive ? '3100' : '2100',
                creditAccount: usdIsPositive ? '2100' : '3100',
                amountUSD: Math.abs(initialUSDBalance),
                amountLBP: 0,
                entityId: supplierId,
                description: `customers.initialUSDBalance`,
                postedDate,
                createdBy: userProfileId || null,
                branchId: currentBranchId,
              });
            }
            if (initialLBPBalance !== 0) {
              const lbpIsPositive = initialLBPBalance >= 0;
              await journalService.createJournalEntry({
                transactionId,
                debitAccount: lbpIsPositive ? '3100' : '2100',
                creditAccount: lbpIsPositive ? '2100' : '3100',
                amountUSD: 0,
                amountLBP: Math.abs(initialLBPBalance),
                entityId: supplierId,
                description: `customers.initialLBPBalance`,
                postedDate,
                createdBy: userProfileId || null,
                branchId: currentBranchId,
              });
            }
          }
        } catch (error) {
          console.error('Failed to create initial balance journal entries for supplier:', error);
        }
      }

      pushUndo({
        type: 'add_supplier',
        affected: [{ table: 'entities', id: supplierId }],
        steps: [{ op: 'update', table: 'entities', id: supplierId, changes: { _deleted: true, _synced: false } }],
      });

      await refreshData();
      resetAutoSyncTimer();

      await emitEntityEvent(
        supplierId,
        buildEventOptions(storeId!, currentBranchId, userProfileId, 'create', { entity_type: 'supplier' })
      );
    },
    [storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer, refreshData]
  );

  const addCustomer = useCallback(
    async (customerData: Omit<Tables['customers']['Insert'], 'store_id'>): Promise<void> => {
      const customerId = customerData.id || createId();
      const now = new Date().toISOString();

      const initialLBPBalance = (customerData as any).lb_balance || 0;
      const initialUSDBalance = (customerData as any).usd_balance || 0;

      const entity = {
        id: customerId,
        store_id: storeId!,
        branch_id: currentBranchId,
        entity_type: 'customer' as const,
        entity_code: `CUST-${customerId.slice(0, 8).toUpperCase()}`,
        name: customerData.name,
        phone: customerData.phone || null,
        is_system_entity: false,
        is_active: customerData.is_active ?? true,
        customer_data: {
          lb_max_balance: customerData.lb_max_balance || 0,
          credit_limit: customerData.lb_max_balance || 0,
          email: (customerData as any).email || null,
          address: (customerData as any).address || null,
        },
        supplier_data: null,
        created_at: now,
        updated_at: now,
        _synced: false,
        _deleted: false,
      };

      await getDB().entities.add(entity);

      if ((initialLBPBalance !== 0 || initialUSDBalance !== 0) && currentBranchId) {
        const transactionId = createId();
        const postedDate = getLocalDateString(now);
        try {
          const primaryAmount = initialUSDBalance !== 0 ? initialUSDBalance : initialLBPBalance;
          const isPositive = primaryAmount >= 0;
          const debitAccount = isPositive ? '1200' : '3100';
          const creditAccount = isPositive ? '3100' : '1200';
          const sameSign =
            (initialUSDBalance >= 0 && initialLBPBalance >= 0) ||
            (initialUSDBalance <= 0 && initialLBPBalance <= 0) ||
            initialUSDBalance === 0 ||
            initialLBPBalance === 0;

          if (sameSign) {
            await journalService.createJournalEntry({
              transactionId,
              debitAccount,
              creditAccount,
              amountUSD: Math.abs(initialUSDBalance),
              amountLBP: Math.abs(initialLBPBalance),
              entityId: customerId,
              description: `customers.initialBalance`,
              postedDate,
              createdBy: userProfileId || null,
              branchId: currentBranchId,
            });
          } else {
            if (initialUSDBalance !== 0) {
              const usdIsPositive = initialUSDBalance >= 0;
              await journalService.createJournalEntry({
                transactionId,
                debitAccount: usdIsPositive ? '1200' : '3100',
                creditAccount: usdIsPositive ? '3100' : '1200',
                amountUSD: Math.abs(initialUSDBalance),
                amountLBP: 0,
                entityId: customerId,
                description: `customers.initialUSDBalance`,
                postedDate,
                createdBy: userProfileId || null,
                branchId: currentBranchId,
              });
            }
            if (initialLBPBalance !== 0) {
              const lbpIsPositive = initialLBPBalance >= 0;
              await journalService.createJournalEntry({
                transactionId,
                debitAccount: lbpIsPositive ? '1200' : '3100',
                creditAccount: lbpIsPositive ? '3100' : '1200',
                amountUSD: 0,
                amountLBP: Math.abs(initialLBPBalance),
                entityId: customerId,
                description: `customers.initialLBPBalance`,
                postedDate,
                createdBy: userProfileId || null,
                branchId: currentBranchId,
              });
            }
          }
        } catch (error) {
          console.error('Failed to create initial balance journal entries for customer:', error);
        }
      }

      pushUndo({
        type: 'add_customer',
        affected: [{ table: 'entities', id: customerId }],
        steps: [{ op: 'update', table: 'entities', id: customerId, changes: { _deleted: true, _synced: false } }],
      });

      await refreshData();
      resetAutoSyncTimer();

      await emitEntityEvent(
        customerId,
        buildEventOptions(storeId!, currentBranchId, userProfileId, 'create', { entity_type: 'customer' })
      );
    },
    [storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer, refreshData]
  );

  const updateCustomer = useCallback(
    async (id: string, updates: Tables['customers']['Update']): Promise<void> => {
      const originalEntity = await getDB().entities.get(id);
      if (!originalEntity || originalEntity.entity_type !== 'customer') {
        throw new Error('Customer entity not found');
      }

      const entityUpdates: any = {
        name: updates.name,
        phone: updates.phone ?? null,
        is_active: updates.is_active,
        updated_at: new Date().toISOString(),
        _synced: false,
      };

      if (
        updates.lb_max_balance !== undefined ||
        (updates as any).email !== undefined ||
        (updates as any).address !== undefined
      ) {
        const customerData = originalEntity.customer_data || {};
        entityUpdates.customer_data = {
          ...customerData,
          lb_max_balance: updates.lb_max_balance ?? (customerData as any).lb_max_balance ?? 0,
          credit_limit: updates.lb_max_balance ?? (customerData as any).credit_limit ?? 0,
          email: (updates as any).email ?? (customerData as any).email ?? null,
          address: (updates as any).address ?? (customerData as any).address ?? null,
        };
      }

      await getDB().entities.update(id, entityUpdates);

      const undoChanges: any = {
        name: originalEntity.name,
        phone: originalEntity.phone,
        is_active: originalEntity.is_active,
        customer_data: originalEntity.customer_data,
      };

      pushUndo({
        type: 'update_customer',
        affected: [{ table: 'entities', id }],
        steps: [{ op: 'update', table: 'entities', id, changes: undoChanges }],
      });

      await refreshData();
      resetAutoSyncTimer();

      await emitEntityEvent(id, buildEventOptions(storeId!, currentBranchId, userProfileId, 'update', {
        entity_type: 'customer',
        fields_changed: Object.keys(updates),
      }));
    },
    [storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer, refreshData]
  );

  const updateSupplier = useCallback(
    async (id: string, updates: Tables['suppliers']['Update']): Promise<void> => {
      const originalEntity = await getDB().entities.get(id);
      if (!originalEntity || originalEntity.entity_type !== 'supplier') {
        throw new Error('Supplier entity not found');
      }

      const entityUpdates: any = {
        name: updates.name,
        phone: updates.phone ?? null,
        updated_at: new Date().toISOString(),
        _synced: false,
      };

      if (
        (updates as any).type !== undefined ||
        (updates as any).advance_lb_balance !== undefined ||
        (updates as any).advance_usd_balance !== undefined ||
        (updates as any).email !== undefined ||
        (updates as any).address !== undefined
      ) {
        const supplierData = originalEntity.supplier_data || {};
        entityUpdates.supplier_data = {
          ...supplierData,
          type: (updates as any).type ?? (supplierData as any).type ?? 'standard',
          advance_lb_balance: (updates as any).advance_lb_balance ?? (supplierData as any).advance_lb_balance ?? 0,
          advance_usd_balance: (updates as any).advance_usd_balance ?? (supplierData as any).advance_usd_balance ?? 0,
          email: (updates as any).email ?? (supplierData as any).email ?? null,
          address: (updates as any).address ?? (supplierData as any).address ?? null,
        };
      }

      await getDB().entities.update(id, entityUpdates);

      const undoChanges: any = {
        name: originalEntity.name,
        phone: originalEntity.phone,
        supplier_data: originalEntity.supplier_data,
      };

      pushUndo({
        type: 'update_supplier',
        affected: [{ table: 'entities', id }],
        steps: [{ op: 'update', table: 'entities', id, changes: undoChanges }],
      });

      await refreshData();
      resetAutoSyncTimer();

      await emitEntityEvent(id, buildEventOptions(storeId!, currentBranchId, userProfileId, 'update', {
        entity_type: 'supplier',
        fields_changed: Object.keys(updates),
      }));
    },
    [storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer, refreshData]
  );

  return {
    entities,
    addSupplier,
    addCustomer,
    updateCustomer,
    updateSupplier,
    hydrate,
  };
}
