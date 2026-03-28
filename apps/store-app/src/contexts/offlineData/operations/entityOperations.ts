/**
 * Entity (customer / supplier) CRUD operations (thinning OfflineDataContext).
 * addCustomer, addSupplier, updateCustomer, updateSupplier.
 * Singletons (getDB, journalService, emitEntityEvent, buildEventOptions) are
 * imported directly — only context-owned values are passed through deps.
 */

import { getDB, createId } from '../../../lib/db';
import type { Database } from '../../../types/database';
import { journalService } from '../../../services/journalService';
import { getLocalDateString } from '../../../utils/dateUtils';

type CustomerInsert = Omit<Database['public']['Tables']['customers']['Insert'], 'store_id'>;
type CustomerUpdate = Database['public']['Tables']['customers']['Update'];
type SupplierInsert = Omit<Database['public']['Tables']['suppliers']['Insert'], 'store_id'>;
type SupplierUpdate = Database['public']['Tables']['suppliers']['Update'];

export interface EntityCrudDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  pushUndo: (undoData: any) => void;
  refreshData: () => Promise<void>;
  resetAutoSyncTimer: () => void;
}

async function createInitialBalanceJournalEntries(
  entityId: string,
  entityType: 'customer' | 'supplier',
  initialUSDBalance: number,
  initialLBPBalance: number,
  branchId: string,
  userProfileId: string | undefined,
  now: string
): Promise<void> {
  if (initialLBPBalance === 0 && initialUSDBalance === 0) return;

  const transactionId = createId();
  const postedDate = getLocalDateString(now);

  // customer: positive = they owe us → Debit AR(1200) / Credit Equity(3100)
  //           negative = we owe them → Debit Equity(3100) / Credit AR(1200)
  // supplier: positive = we owe them → Debit Equity(3100) / Credit AP(2100)
  //           negative = they owe us → Debit AP(2100) / Credit Equity(3100)
  const arOrAp = entityType === 'customer' ? '1200' : '2100';
  const primaryAmount = initialUSDBalance !== 0 ? initialUSDBalance : initialLBPBalance;
  const isPositive = primaryAmount >= 0;
  const debitAccount = entityType === 'customer'
    ? (isPositive ? arOrAp : '3100')
    : (isPositive ? '3100' : arOrAp);
  const creditAccount = entityType === 'customer'
    ? (isPositive ? '3100' : arOrAp)
    : (isPositive ? arOrAp : '3100');

  const sameSign =
    (initialUSDBalance >= 0 && initialLBPBalance >= 0) ||
    (initialUSDBalance <= 0 && initialLBPBalance <= 0) ||
    initialUSDBalance === 0 || initialLBPBalance === 0;

  if (sameSign) {
    await journalService.createJournalEntry({
      transactionId,
      debitAccount,
      creditAccount,
      amountUSD: Math.abs(initialUSDBalance),
      amountLBP: Math.abs(initialLBPBalance),
      entityId,
      description: `customers.initialBalance`,
      postedDate,
      createdBy: userProfileId || null,
      branchId,
    });
  } else {
    if (initialUSDBalance !== 0) {
      const pos = initialUSDBalance >= 0;
      const dAcc = entityType === 'customer' ? (pos ? arOrAp : '3100') : (pos ? '3100' : arOrAp);
      const cAcc = entityType === 'customer' ? (pos ? '3100' : arOrAp) : (pos ? arOrAp : '3100');
      await journalService.createJournalEntry({
        transactionId, debitAccount: dAcc, creditAccount: cAcc,
        amountUSD: Math.abs(initialUSDBalance), amountLBP: 0,
        entityId, description: `customers.initialUSDBalance`,
        postedDate, createdBy: userProfileId || null, branchId,
      });
    }
    if (initialLBPBalance !== 0) {
      const pos = initialLBPBalance >= 0;
      const dAcc = entityType === 'customer' ? (pos ? arOrAp : '3100') : (pos ? '3100' : arOrAp);
      const cAcc = entityType === 'customer' ? (pos ? '3100' : arOrAp) : (pos ? arOrAp : '3100');
      await journalService.createJournalEntry({
        transactionId, debitAccount: dAcc, creditAccount: cAcc,
        amountUSD: 0, amountLBP: Math.abs(initialLBPBalance),
        entityId, description: `customers.initialLBPBalance`,
        postedDate, createdBy: userProfileId || null, branchId,
      });
    }
  }
}

export async function addCustomer(deps: EntityCrudDeps, customerData: CustomerInsert): Promise<void> {
  const { storeId, currentBranchId, userProfileId, pushUndo, refreshData, resetAutoSyncTimer } = deps;

  const customerId = (customerData as any).id || createId();
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
      address: (customerData as any).address || null
    },
    supplier_data: null,
    created_at: now,
    updated_at: now,
    _synced: false,
    _deleted: false
  };

  await getDB().entities.add(entity);

  if ((initialLBPBalance !== 0 || initialUSDBalance !== 0) && currentBranchId) {
    try {
      await createInitialBalanceJournalEntries(
        customerId, 'customer', initialUSDBalance, initialLBPBalance,
        currentBranchId, userProfileId, now
      );
    } catch (error) {
      console.error('Failed to create initial balance journal entries for customer:', error);
    }
  }

  pushUndo({
    type: 'add_customer',
    affected: [{ table: 'entities', id: customerId }],
    steps: [{ op: 'update', table: 'entities', id: customerId, changes: { _deleted: true, _synced: false } }]
  });

  await refreshData();
  resetAutoSyncTimer();
}

export async function addSupplier(deps: EntityCrudDeps, supplierData: SupplierInsert): Promise<void> {
  const { storeId, currentBranchId, userProfileId, pushUndo, refreshData, resetAutoSyncTimer } = deps;

  const supplierId = (supplierData as any).id || createId();
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
      address: (supplierData as any).address || null
    },
    created_at: now,
    updated_at: now,
    _synced: false,
    _deleted: false
  };

  await getDB().entities.add(entity);

  if ((initialLBPBalance !== 0 || initialUSDBalance !== 0) && currentBranchId) {
    try {
      await createInitialBalanceJournalEntries(
        supplierId, 'supplier', initialUSDBalance, initialLBPBalance,
        currentBranchId, userProfileId, now
      );
    } catch (error) {
      console.error('Failed to create initial balance journal entries for supplier:', error);
    }
  }

  pushUndo({
    type: 'add_supplier',
    affected: [{ table: 'entities', id: supplierId }],
    steps: [{ op: 'update', table: 'entities', id: supplierId, changes: { _deleted: true, _synced: false } }]
  });

  await refreshData();
  resetAutoSyncTimer();
}

export async function updateCustomer(deps: EntityCrudDeps, id: string, updates: CustomerUpdate): Promise<void> {
  const { storeId, currentBranchId, userProfileId, pushUndo, refreshData, resetAutoSyncTimer } = deps;

  const originalEntity = await getDB().entities.get(id);
  if (!originalEntity || originalEntity.entity_type !== 'customer') {
    throw new Error('Customer entity not found');
  }

  const entityUpdates: any = {
    name: updates.name,
    phone: updates.phone ?? null,
    is_active: updates.is_active,
    updated_at: new Date().toISOString(),
    _synced: false
  };

  if ('lb_balance' in entityUpdates) delete entityUpdates.lb_balance;
  if ('usd_balance' in entityUpdates) delete entityUpdates.usd_balance;

  if (updates.lb_max_balance !== undefined || (updates as any).email !== undefined || (updates as any).address !== undefined) {
    const customerData = originalEntity.customer_data || {};
    entityUpdates.customer_data = {
      ...customerData,
      lb_max_balance: updates.lb_max_balance ?? (customerData as any).lb_max_balance ?? 0,
      credit_limit: updates.lb_max_balance ?? (customerData as any).credit_limit ?? 0,
      email: (updates as any).email ?? (customerData as any).email ?? null,
      address: (updates as any).address ?? (customerData as any).address ?? null
    };
  }

  await getDB().entities.update(id, entityUpdates);

  pushUndo({
    type: 'update_customer',
    affected: [{ table: 'entities', id }],
    steps: [{ op: 'update', table: 'entities', id, changes: {
      name: originalEntity.name,
      phone: originalEntity.phone,
      is_active: originalEntity.is_active,
      customer_data: originalEntity.customer_data
    }}]
  });

  await refreshData();
  resetAutoSyncTimer();
}

export async function updateSupplier(deps: EntityCrudDeps, id: string, updates: SupplierUpdate): Promise<void> {
  const { storeId, currentBranchId, userProfileId, pushUndo, refreshData, resetAutoSyncTimer } = deps;

  const originalEntity = await getDB().entities.get(id);
  if (!originalEntity || originalEntity.entity_type !== 'supplier') {
    throw new Error('Supplier entity not found');
  }

  const entityUpdates: any = {
    name: updates.name,
    phone: updates.phone ?? null,
    updated_at: new Date().toISOString(),
    _synced: false
  };

  if ('lb_balance' in entityUpdates) delete entityUpdates.lb_balance;
  if ('usd_balance' in entityUpdates) delete entityUpdates.usd_balance;

  if ((updates as any).type !== undefined || (updates as any).advance_lb_balance !== undefined || (updates as any).advance_usd_balance !== undefined || (updates as any).email !== undefined || (updates as any).address !== undefined) {
    const supplierData = originalEntity.supplier_data || {};
    entityUpdates.supplier_data = {
      ...supplierData,
      type: (updates as any).type ?? (supplierData as any).type ?? 'standard',
      advance_lb_balance: (updates as any).advance_lb_balance ?? (supplierData as any).advance_lb_balance ?? 0,
      advance_usd_balance: (updates as any).advance_usd_balance ?? (supplierData as any).advance_usd_balance ?? 0,
      email: (updates as any).email ?? (supplierData as any).email ?? null,
      address: (updates as any).address ?? (supplierData as any).address ?? null
    };
  }

  await getDB().entities.update(id, entityUpdates);

  pushUndo({
    type: 'update_supplier',
    affected: [{ table: 'entities', id }],
    steps: [{ op: 'update', table: 'entities', id, changes: {
      name: originalEntity.name,
      phone: originalEntity.phone,
      supplier_data: originalEntity.supplier_data
    }}]
  });

  await refreshData();
  resetAutoSyncTimer();
}
