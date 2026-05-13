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
import type { CurrencyCode } from '@pos-platform/shared';

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

/**
 * Coerce an incoming entity-create payload into a per-currency initial
 * balance map. Accepts either:
 *   - the new shape: `balances: { USD: 50, LBP: 12000, AED: 100, ... }`
 *   - the legacy shape: `lb_balance: 12000, usd_balance: 50`
 * Returns `{}` when there's no initial balance to post.
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
 * Post initial balance journal entries — one per currency present in the
 * map. Each entry posts the absolute amount through the AR/AP ↔ Equity
 * pair, with the direction determined by the sign of the amount.
 */
async function createInitialBalanceJournalEntries(
  entityId: string,
  entityType: 'customer' | 'supplier',
  initialBalances: Partial<Record<CurrencyCode, number>>,
  branchId: string,
  userProfileId: string | undefined,
  now: string
): Promise<void> {
  const codes = (Object.keys(initialBalances) as CurrencyCode[])
    .filter(code => (initialBalances[code] ?? 0) !== 0);
  if (codes.length === 0) return;

  const transactionId = createId();
  const postedDate = getLocalDateString(now);

  // customer: positive = they owe us → Debit AR(1200) / Credit Equity(3100)
  //           negative = we owe them → Debit Equity(3100) / Credit AR(1200)
  // supplier: positive = we owe them → Debit Equity(3100) / Credit AP(2100)
  //           negative = they owe us → Debit AP(2100) / Credit Equity(3100)
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
}

export async function addCustomer(deps: EntityCrudDeps, customerData: CustomerInsert): Promise<void> {
  const { storeId, currentBranchId, userProfileId, pushUndo, refreshData, resetAutoSyncTimer } = deps;

  const customerId = (customerData as any).id || createId();
  const now = new Date().toISOString();
  const initialBalances = coerceInitialBalanceMap(customerData as Record<string, unknown>);

  // Customer-data JSONB blob: keep `lb_max_balance` and `credit_limit` for
  // back-compat; new callers can pass `max_balances: { LBP: ... }` and we
  // mirror to the legacy field for downstream code that still reads it.
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
      address: (customerData as any).address || null
    },
    supplier_data: null,
    created_at: now,
    updated_at: now,
    _synced: false,
    _deleted: false
  };

  await getDB().entities.add(entity);

  if (Object.keys(initialBalances).length > 0 && currentBranchId) {
    try {
      await createInitialBalanceJournalEntries(
        customerId, 'customer', initialBalances,
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
      // Legacy mirrors for older readers — drop once Tier 5 sweeps types.
      advance_lb_balance: advanceBalances.LBP ?? 0,
      advance_usd_balance: advanceBalances.USD ?? 0,
      email: (supplierData as any).email || null,
      address: (supplierData as any).address || null
    },
    created_at: now,
    updated_at: now,
    _synced: false,
    _deleted: false
  };

  await getDB().entities.add(entity);

  if (Object.keys(initialBalances).length > 0 && currentBranchId) {
    try {
      await createInitialBalanceJournalEntries(
        supplierId, 'supplier', initialBalances,
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
  const { pushUndo, refreshData, resetAutoSyncTimer } = deps;

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

  // Customer-data nested fields (max_balances JSONB blob).
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
      address: u.address ?? customerData.address ?? null
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
  const { pushUndo, refreshData, resetAutoSyncTimer } = deps;

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

    // Legacy single-currency overrides (callers that still pass scalars).
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
      // Legacy mirrors so existing readers keep working until Tier 5.
      advance_lb_balance: mergedAdvances.LBP ?? 0,
      advance_usd_balance: mergedAdvances.USD ?? 0,
      email: u.email ?? supplierData.email ?? null,
      address: u.address ?? supplierData.address ?? null
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
