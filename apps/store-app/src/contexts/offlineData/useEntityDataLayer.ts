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
import { auditService } from '../../services/auditService';
import { getLocalDateString } from '../../utils/dateUtils';
import { sameRowList } from '../../utils/rowListEquality';
import type { EntityDataLayerAdapter, EntityDataLayerResult, Tables } from './types';
import type { CurrencyCode } from '@pos-platform/shared';

/**
 * Coerce an incoming entity-create payload into a per-currency initial
 * balance map. Accepts the new `balances: { USD: 50, LBP: 12000, ... }`
 * shape and falls back to legacy `lb_balance`/`usd_balance` scalars.
 */
function coerceInitialBalanceMap(
  data: Record<string, unknown>
): Partial<Record<CurrencyCode, number>> {
  const map: Partial<Record<CurrencyCode, number>> = {};

  const nested = data.balances as Partial<Record<CurrencyCode, number>> | undefined;
  if (nested && typeof nested === 'object') {
    for (const [code, value] of Object.entries(nested)) {
      if (typeof value === 'number' && value !== 0) {
        map[code as CurrencyCode] = value;
      }
    }
    if (Object.keys(map).length > 0) return map;
  }

  const lb = Number(data.lb_balance ?? 0) || 0;
  const usd = Number(data.usd_balance ?? 0) || 0;
  if (lb !== 0) map.LBP = lb;
  if (usd !== 0) map.USD = usd;
  return map;
}

/**
 * Coerce an incoming supplier-create payload into a per-currency
 * advance-balance map (JSON blob inside `supplier_data`).
 */
function coerceAdvanceBalanceMap(
  data: Record<string, unknown>
): Partial<Record<CurrencyCode, number>> {
  const map: Partial<Record<CurrencyCode, number>> = {};

  const nested = data.advance_balances as Partial<Record<CurrencyCode, number>> | undefined;
  if (nested && typeof nested === 'object') {
    for (const [code, value] of Object.entries(nested)) {
      if (typeof value === 'number') {
        map[code as CurrencyCode] = value;
      }
    }
    return map;
  }

  const lb = Number(data.advance_lb_balance ?? 0) || 0;
  const usd = Number(data.advance_usd_balance ?? 0) || 0;
  if (lb !== 0) map.LBP = lb;
  if (usd !== 0) map.USD = usd;
  return map;
}

/**
 * Post one journal entry per non-zero currency in the balance map. The
 * direction (Debit AR vs Credit AR for customers; Debit AP vs Credit AP
 * for suppliers) is determined per-currency by the sign of the amount.
 * Returns the synthetic transaction_id used to tag all entries — undo
 * uses it to wipe the whole group in one shot.
 */
async function postInitialBalanceEntries(
  entityId: string,
  entityType: 'customer' | 'supplier',
  initialBalances: Partial<Record<CurrencyCode, number>>,
  branchId: string,
  userProfileId: string | undefined,
  now: string
): Promise<string | null> {
  const codes = (Object.keys(initialBalances) as CurrencyCode[])
    .filter(code => (initialBalances[code] ?? 0) !== 0);
  if (codes.length === 0) return null;

  const transactionId = createId();
  const postedDate = getLocalDateString(now);
  const arOrAp = entityType === 'customer' ? '1200' : '2100';

  for (const code of codes) {
    const amount = initialBalances[code] ?? 0;
    const isPositive = amount >= 0;
    const debitAccount = entityType === 'customer'
      ? (isPositive ? arOrAp : '3100')
      : (isPositive ? '3100' : arOrAp);
    const creditAccount = entityType === 'customer'
      ? (isPositive ? '3100' : arOrAp)
      : (isPositive ? arOrAp : '3100');

    await journalService.createJournalEntry({
      transactionId,
      debitAccount,
      creditAccount,
      amount: Math.abs(amount),
      currency: code,
      entityId,
      description: `customers.initialBalance`,
      postedDate,
      createdBy: userProfileId || null,
      branchId,
    });
  }

  return transactionId;
}

/** Entity fields tracked in the audit trail (dotted paths into the row). */
const CUSTOMER_AUDIT_PATHS = [
  'name',
  'phone',
  'is_active',
  'customer_data.credit_limit',
  'customer_data.max_balances',
  'customer_data.email',
  'customer_data.address',
];
const SUPPLIER_AUDIT_PATHS = [
  'name',
  'phone',
  'supplier_data.type',
  'supplier_data.advance_balances',
  'supplier_data.email',
  'supplier_data.address',
];

/** Overlay only the defined keys of `updates` onto `base` — avoids treating an
 *  absent (undefined) update field as a change to undefined when diffing. */
function applyDefined<T>(base: T, updates: Record<string, unknown>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

export function useEntityDataLayer(adapter: EntityDataLayerAdapter): EntityDataLayerResult {
  const { storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer, refreshData } = adapter;
  const [entities, setEntities] = useState<Tables['entities']['Row'][]>([]);

  const hydrate = useCallback((entitiesData: Tables['entities']['Row'][]) => {
    setEntities(prev => (sameRowList(prev, entitiesData) ? prev : entitiesData));
  }, []);

  const addSupplier = useCallback(
    async (supplierData: Omit<Tables['suppliers']['Insert'], 'store_id'>): Promise<void> => {
      const supplierId = supplierData.id || createId();
      const now = new Date().toISOString();

      const initialBalances = coerceInitialBalanceMap(supplierData as Record<string, unknown>);
      const advanceBalances = coerceAdvanceBalanceMap(supplierData as Record<string, unknown>);

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
          advance_balances: advanceBalances,
          // Legacy scalar mirrors so existing readers keep working.
          advance_lb_balance: advanceBalances.LBP ?? 0,
          advance_usd_balance: advanceBalances.USD ?? 0,
          email: (supplierData as any).email || null,
          address: (supplierData as any).address || null,
        },
        created_at: now,
        updated_at: now,
        _synced: false,
        _deleted: false,
      };

      await getDB().entities.add(entity);

      let initialBalanceTxnId: string | null = null;
      if (Object.keys(initialBalances).length > 0 && currentBranchId) {
        try {
          initialBalanceTxnId = await postInitialBalanceEntries(
            supplierId,
            'supplier',
            initialBalances,
            currentBranchId,
            userProfileId,
            now,
          );
        } catch (error) {
          console.error('Failed to create initial balance journal entries for supplier:', error);
        }
      }

      const undoSteps: Array<{ op: string; table: string; id: string; transaction_id?: string }> = [
        { op: 'delete', table: 'entities', id: supplierId },
      ];
      if (initialBalanceTxnId) {
        undoSteps.push({
          op: 'delete',
          table: 'journal_entries',
          id: `initial-balance-${supplierId}`,
          transaction_id: initialBalanceTxnId,
        });
      }

      pushUndo({
        type: 'add_supplier',
        affected: [{ table: 'entities', id: supplierId }],
        steps: undoSteps,
      });

      await auditService.record({
        storeId, branchId: currentBranchId, changedBy: userProfileId,
        entityType: 'entity', entityId: supplierId, action: 'create',
        changeReason: 'Supplier created',
      });

      await refreshData(['entities']);
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

      const initialBalances = coerceInitialBalanceMap(customerData as Record<string, unknown>);

      // Per-currency credit-limit map (kept inside customer_data JSONB).
      const maxBalances = ((customerData as any).max_balances ?? {}) as Partial<Record<CurrencyCode, number>>;
      const lbMaxBalance = Number(
        maxBalances.LBP ?? (customerData as any).lb_max_balance ?? 0
      ) || 0;

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
          max_balances: maxBalances,
          lb_max_balance: lbMaxBalance,
          credit_limit: lbMaxBalance,
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

      let initialBalanceTxnId: string | null = null;
      if (Object.keys(initialBalances).length > 0 && currentBranchId) {
        try {
          initialBalanceTxnId = await postInitialBalanceEntries(
            customerId,
            'customer',
            initialBalances,
            currentBranchId,
            userProfileId,
            now,
          );
        } catch (error) {
          console.error('Failed to create initial balance journal entries for customer:', error);
        }
      }

      const undoSteps: Array<{ op: string; table: string; id: string; transaction_id?: string }> = [
        { op: 'delete', table: 'entities', id: customerId },
      ];
      if (initialBalanceTxnId) {
        undoSteps.push({
          op: 'delete',
          table: 'journal_entries',
          id: `initial-balance-${customerId}`,
          transaction_id: initialBalanceTxnId,
        });
      }

      pushUndo({
        type: 'add_customer',
        affected: [{ table: 'entities', id: customerId }],
        steps: undoSteps,
      });

      await auditService.record({
        storeId, branchId: currentBranchId, changedBy: userProfileId,
        entityType: 'entity', entityId: customerId, action: 'create',
        changeReason: 'Customer created',
      });

      await refreshData(['entities']);
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

      const u = updates as Record<string, unknown>;
      const touchesNested =
        u.max_balances !== undefined ||
        u.lb_max_balance !== undefined ||
        u.email !== undefined ||
        u.address !== undefined;

      if (touchesNested) {
        const customerData = (originalEntity.customer_data || {}) as Record<string, unknown>;
        const existingMaxBalances = (customerData.max_balances ?? {}) as Partial<Record<CurrencyCode, number>>;
        const incomingMaxBalances = (u.max_balances ?? {}) as Partial<Record<CurrencyCode, number>>;
        const mergedMaxBalances = { ...existingMaxBalances, ...incomingMaxBalances };

        const lbMax = Number(
          mergedMaxBalances.LBP
            ?? (u.lb_max_balance as number | undefined)
            ?? customerData.lb_max_balance
            ?? 0
        ) || 0;

        entityUpdates.customer_data = {
          ...customerData,
          max_balances: mergedMaxBalances,
          lb_max_balance: lbMax,
          credit_limit: lbMax,
          email: u.email ?? customerData.email ?? null,
          address: u.address ?? customerData.address ?? null,
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

      const customerChanges = auditService.diff(
        originalEntity,
        applyDefined(originalEntity, entityUpdates),
        CUSTOMER_AUDIT_PATHS
      );
      if (customerChanges.length > 0) {
        await auditService.record({
          storeId, branchId: currentBranchId, changedBy: userProfileId,
          entityType: 'entity', entityId: id, action: 'update',
          changes: customerChanges,
        });
      }

      await refreshData(['entities']);
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

      const u = updates as Record<string, unknown>;
      const touchesNested =
        u.type !== undefined ||
        u.advance_balances !== undefined ||
        u.advance_lb_balance !== undefined ||
        u.advance_usd_balance !== undefined ||
        u.email !== undefined ||
        u.address !== undefined;

      if (touchesNested) {
        const supplierData = (originalEntity.supplier_data || {}) as Record<string, unknown>;
        const existingAdvances = (supplierData.advance_balances ?? {}) as Partial<Record<CurrencyCode, number>>;
        const incomingAdvances = (u.advance_balances ?? {}) as Partial<Record<CurrencyCode, number>>;
        const mergedAdvances: Partial<Record<CurrencyCode, number>> = { ...existingAdvances, ...incomingAdvances };

        if (u.advance_lb_balance !== undefined) {
          mergedAdvances.LBP = Number(u.advance_lb_balance) || 0;
        }
        if (u.advance_usd_balance !== undefined) {
          mergedAdvances.USD = Number(u.advance_usd_balance) || 0;
        }

        entityUpdates.supplier_data = {
          ...supplierData,
          type: u.type ?? supplierData.type ?? 'standard',
          advance_balances: mergedAdvances,
          advance_lb_balance: mergedAdvances.LBP ?? 0,
          advance_usd_balance: mergedAdvances.USD ?? 0,
          email: u.email ?? supplierData.email ?? null,
          address: u.address ?? supplierData.address ?? null,
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

      const supplierChanges = auditService.diff(
        originalEntity,
        applyDefined(originalEntity, entityUpdates),
        SUPPLIER_AUDIT_PATHS
      );
      if (supplierChanges.length > 0) {
        await auditService.record({
          storeId, branchId: currentBranchId, changedBy: userProfileId,
          entityType: 'entity', entityId: id, action: 'update',
          changes: supplierChanges,
        });
      }

      await refreshData(['entities']);
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
