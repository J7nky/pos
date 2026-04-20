import type { Transaction as DexieTransaction } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import type { SyncMetadata, PendingSync } from '../types';

export const CURRENT_DB_VERSION = 56;

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
