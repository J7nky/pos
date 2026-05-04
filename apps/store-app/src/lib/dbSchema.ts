import type { Transaction as DexieTransaction } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import type { SyncMetadata, PendingSync } from '../types';

export const CURRENT_DB_VERSION = 60;

export const V54_STORES = {
  stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
  branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',

  products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
  users: 'id, store_id, branch_id, email, name, role, updated_at, monthly_salary, working_hours_start, working_hours_end, working_days, _synced, _deleted',

  inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
  transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, employee_id, entity_id, reversal_of_transaction_id, [store_id+branch_id], [entity_id], _synced, _deleted',
  inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, closed_at, [store_id+branch_id], _synced, _deleted',

  bills: 'id, store_id, branch_id, entity_id, bill_number, payment_method, payment_status, bill_date, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
  bill_line_items: 'id, store_id, branch_id, bill_id, inventory_item_id, product_id, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
  bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',

  cash_drawer_sessions: 'id, store_id, branch_id, opened_by, opened_at, closed_at, status, [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted',
  cash_drawer_accounts: 'id, store_id, branch_id, currency, created_at, updated_at, [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted',
  missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, updated_at, [store_id+branch_id], _synced, _deleted',

  public_access_tokens: 'id, customer_id, token, expires_at, created_at, _synced, _deleted',

  notifications: 'id, store_id, type, title, message, read, priority, created_at, expires_at, [store_id+read]',

  notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',

  reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',

  employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',

  journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, posted_date, bill_id, reversal_of_journal_entry_id, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+account_code], [transaction_id], [bill_id], [reversal_of_journal_entry_id], _synced, _deleted',
  balance_snapshots: 'id, store_id, branch_id, account_code, entity_id, balance_usd, balance_lbp, snapshot_date, snapshot_type, verified, created_at, [store_id+branch_id], [store_id+account_code+entity_id+snapshot_date], [store_id+account_code+entity_id], [store_id+snapshot_date+snapshot_type], [store_id+snapshot_date], _synced, _deleted',
  entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
  chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',

  role_permissions: 'id, [role+operation], role, updated_at, _synced, _deleted',
  user_permissions: 'id, [user_id+store_id], [user_id+store_id+operation], user_id, store_id, updated_at, _synced, _deleted',

  sync_metadata: 'id, table_name, last_synced_at',
  pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
  sync_state: 'branch_id, last_seen_event_version, updated_at',

  subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
  license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at',

  localPasswords: 'userId, passwordHash',
  localCredentials: 'userId, email, supabaseUserId',
} as const;

export const V55_STORES = {
  sync_metadata: 'id, table_name, last_synced_at, last_synced_version, store_id',
  pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count, status',
} as const;

export const V56_STORES = {
  inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, is_archived, [store_id+branch_id], _synced, _deleted',
} as const;

/** v57: ISO country + accepted_currencies on store rows; inventory_items.currency back-fill (014-country-currency-schema). */
export const V57_STORES = {
  stores:
    'id, name, country, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
} as const;

/**
 * v58 (008-multi-currency-country Phase 10 / Task 17d):
 * Adds the per-currency `exchange_rates` JSONB map on store rows. Not indexed —
 * Dexie does not range-query JSON blobs, and reads always go through
 * `currencyService` which decodes the map into its in-memory rates table.
 *
 * Schema row is identical to v57 (Dexie indexes by primary key + listed
 * scalars; non-indexed columns travel transparently). The version bump
 * exists so the upgrade hook below can back-fill the new column for
 * stores that synced down before the column existed.
 */
export const V58_STORES = {
  stores:
    'id, name, country, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
} as const;

/**
 * v59 (008-multi-currency-country Phase 11 / Tasks 16a + 16g):
 * Adds the self-describing `amounts` JSONB map on `journal_entries` and the
 * `balances` JSONB map on `balance_snapshots`. The deprecated USD/LBP scalar
 * columns are kept for the dual-write transition (Phase 11d will drop them).
 *
 * Neither map is indexed (Dexie cannot range-query JSON), so the schema
 * row for both tables is identical to v54 — the upgrade hook is the only
 * thing that matters for v59.
 */
export const V59_STORES = {
  journal_entries:
    'id, store_id, branch_id, transaction_id, entity_id, account_code, posted_date, bill_id, reversal_of_journal_entry_id, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+account_code], [transaction_id], [bill_id], [reversal_of_journal_entry_id], _synced, _deleted',
  balance_snapshots:
    'id, store_id, branch_id, account_code, entity_id, balance_usd, balance_lbp, snapshot_date, snapshot_type, verified, created_at, [store_id+branch_id], [store_id+account_code+entity_id+snapshot_date], [store_id+account_code+entity_id], [store_id+snapshot_date+snapshot_type], [store_id+snapshot_date], _synced, _deleted',
} as const;

export const V60_STORES = {
  journal_entries:
    'id, store_id, branch_id, transaction_id, entity_id, account_code, posted_date, bill_id, reversal_of_journal_entry_id, transfer_group_id, created_at, [store_id+branch_id], [store_id+account_code], [store_id+transfer_group_id], [entity_id+account_code], [transaction_id], [bill_id], [reversal_of_journal_entry_id], _synced, _deleted',
} as const;

export async function upgradeV54(_tx: DexieTransaction): Promise<void> {
  console.log('🔧 Initializing database schema v54');
  console.log('   ✅ Database schema initialized');
}

export async function upgradeV55(tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v54 → v55 (sync checkpoints + outbox)');
  await tx
    .table('sync_metadata')
    .toCollection()
    .modify((row: SyncMetadata) => {
      if (row.last_synced_version === undefined) row.last_synced_version = 0;
      if (row.store_id === undefined) row.store_id = null;
      if (row.hydration_complete === undefined) row.hydration_complete = false;
    });
  await tx
    .table('pending_syncs')
    .toCollection()
    .modify((row: PendingSync) => {
      if (row.idempotency_key === undefined) row.idempotency_key = uuidv4();
      if (row.status === undefined) row.status = 'pending';
    });
  console.log('   ✅ v55 migration complete');
}

export async function upgradeV56(tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v55 → v56 (inventory_items archive support)');
  await tx
    .table('inventory_items')
    .toCollection()
    .modify((row: any) => {
      if (row.is_archived === undefined) row.is_archived = false;
    });
  console.log('   ✅ v56 migration complete');
}

export async function upgradeV57(tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v56 → v57 (store country, accepted_currencies, inventory currency)');
  await tx.table('stores').toCollection().modify((store: Record<string, unknown>) => {
    if (!store.country) {
      store.country = 'LB';
    }
    const preferred = store.preferred_currency as string | undefined;
    const acc = store.accepted_currencies as string[] | undefined;
    if (!acc || acc.length === 0) {
      store.accepted_currencies = preferred === 'USD' ? ['USD'] : [preferred ?? 'LBP', 'USD'];
    }
  });
  const stores = await tx.table('stores').toArray();
  const storesById = new Map(stores.map((s: { id: string }) => [s.id, s]));
  await tx.table('inventory_items').toCollection().modify((item: Record<string, unknown>) => {
    if (!item.currency) {
      const parent = storesById.get(item.store_id as string) as { preferred_currency?: string } | undefined;
      item.currency = parent?.preferred_currency ?? 'USD';
    }
  });
  console.log('   ✅ v57 migration complete');
}

/**
 * v58 (Phase 10): back-fill `exchange_rates` JSONB map on store rows.
 * For legacy rows the map is reconstructed from the scalar `exchange_rate`
 * keyed by `preferred_currency` (USD itself is implicit and omitted).
 */
export async function upgradeV58(tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v57 → v58 (store exchange_rates JSONB map)');
  await tx
    .table('stores')
    .toCollection()
    .modify((store: Record<string, unknown>) => {
      const existing = store.exchange_rates as Record<string, number> | undefined;
      if (existing && typeof existing === 'object' && Object.keys(existing).length > 0) return;

      const preferred = store.preferred_currency as string | undefined;
      const legacy = store.exchange_rate as number | undefined;
      const map: Record<string, number> = {};
      if (preferred && preferred !== 'USD' && typeof legacy === 'number' && legacy > 0) {
        map[preferred] = legacy;
      }
      store.exchange_rates = map;
    });
  console.log('   ✅ v58 migration complete');
}

/**
 * v59 (Phase 11a / 16g): back-fill `amounts` map on journal_entries and
 * `balances` map on balance_snapshots from the deprecated USD/LBP scalar
 * columns. Rows that already carry a non-empty map are left alone.
 *
 * Only currency entries with at least one non-zero side are written to
 * keep the map shape minimal.
 */
export async function upgradeV59(tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v58 → v59 (accounting amounts/balances JSONB maps)');

  await tx
    .table('journal_entries')
    .toCollection()
    .modify((row: Record<string, unknown>) => {
      const existing = row.amounts as Record<string, { debit: number; credit: number }> | undefined;
      if (existing && typeof existing === 'object' && Object.keys(existing).length > 0) return;

      const amounts: Record<string, { debit: number; credit: number }> = {};
      const debitUsd = Number(row.debit_usd ?? 0) || 0;
      const creditUsd = Number(row.credit_usd ?? 0) || 0;
      const debitLbp = Number(row.debit_lbp ?? 0) || 0;
      const creditLbp = Number(row.credit_lbp ?? 0) || 0;
      if (debitUsd !== 0 || creditUsd !== 0) amounts.USD = { debit: debitUsd, credit: creditUsd };
      if (debitLbp !== 0 || creditLbp !== 0) amounts.LBP = { debit: debitLbp, credit: creditLbp };
      row.amounts = amounts;
    });

  await tx
    .table('balance_snapshots')
    .toCollection()
    .modify((row: Record<string, unknown>) => {
      const existing = row.balances as Record<string, number> | undefined;
      if (existing && typeof existing === 'object' && Object.keys(existing).length > 0) return;

      const balances: Record<string, number> = {};
      const usd = Number(row.balance_usd ?? 0) || 0;
      const lbp = Number(row.balance_lbp ?? 0) || 0;
      if (usd !== 0) balances.USD = usd;
      if (lbp !== 0) balances.LBP = lbp;
      row.balances = balances;
    });

  console.log('   ✅ v59 migration complete');
}

export async function upgradeV60(_tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v59 → v60 (journal transfer_group_id index)');
  console.log('   ✅ v60 migration complete');
}
