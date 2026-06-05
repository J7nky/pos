import type { Transaction as DexieTransaction } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import type { SyncMetadata, PendingSync } from '../types';

export const CURRENT_DB_VERSION = 69;

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

/**
 * v61 (018-currency-dehardcode, Layer 7): back-fill `balances` /
 * `advance_balances` / `max_balances` JSONB maps on entities from the
 * deprecated lb_balance/usd_balance/advance_*_balance scalar columns.
 * Entities table has no new indexes — JSONB lookups are not range-queried.
 */
export const V61_STORES = {} as const;

/**
 * v62 (018-currency-dehardcode, Layer 8 finalization): drop the deprecated
 * USD/LBP scalar columns from journal_entries and balance_snapshots, and
 * remove balance_usd/balance_lbp from the balance_snapshots index. The
 * JSONB `amounts` and `balances` maps are now the only source of
 * per-currency data. Sister cleanup on entities scalar balance fields.
 */
export const V62_STORES = {
  balance_snapshots:
    'id, store_id, branch_id, account_code, entity_id, snapshot_date, snapshot_type, verified, created_at, [store_id+branch_id], [store_id+account_code+entity_id+snapshot_date], [store_id+account_code+entity_id], [store_id+snapshot_date+snapshot_type], [store_id+snapshot_date], _synced, _deleted',
} as const;

/**
 * v63: local-only offline cache for product images. `product.image` keeps
 * the canonical URL (often a remote Supabase Storage link); on first render
 * the URL is fetched once, converted to a data URI, and stashed here so
 * subsequent table renders, edits, and deletes never hit the network.
 *
 * This table is NOT synced to Supabase — it is a per-device blob cache.
 * `source_url` lets us invalidate the cache when the upstream URL changes.
 */
export const V63_STORES = {
  product_image_cache: 'product_id, source_url, cached_at',
} as const;

/**
 * v64: configurable, store-scoped taxonomies — product categories and units of
 * measure replace the hardcoded TypeScript literal unions on `products.category`
 * and `inventory_items.unit`. Both tables are multilingual (`name` is a
 * JSONB { en, ar, fr } map), tier-1-synced, and seeded per `stores.tenant_type`
 * (`produce_market` for existing stores).
 *
 * Re-indexes `products` (adds `category_id`), `inventory_items` (adds `unit_id`),
 * and `stores` (adds `tenant_type`). Legacy `products.category` and
 * `inventory_items.unit` text fields remain readable during the transition and
 * are dual-written by services.
 */
export const V64_STORES = {
  product_categories:
    'id, store_id, code, is_active, is_system, sort_order, updated_at, [store_id+code], [store_id+is_active], _synced, _deleted',
  units_of_measure:
    'id, store_id, code, system_role, is_active, is_system, sort_order, updated_at, [store_id+code], [store_id+is_active], _synced, _deleted',
  products:
    'id, store_id, branch_id, name, category, category_id, is_global, updated_at, _synced, _deleted',
  inventory_items:
    'id, store_id, branch_id, product_id, unit, unit_id, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, is_archived, [store_id+branch_id], _synced, _deleted',
  stores:
    'id, name, country, tenant_type, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
} as const;

/**
 * v65: tenant-scoped globals — adds `products.tenant_type` so a global
 * product (is_global=true) can be tagged with a specific tenant_type. The
 * store-app's `getAvailableProducts` filters globals where the tag is
 * non-NULL and does not match the calling store's tenant_type — preventing
 * legacy produce globals from leaking into Electronics / Pharmacy stores.
 *
 * Schema change: index `tenant_type` on products so filtered globals queries
 * can use a where-clause if we add one later. (Today the filter uses a JS
 * predicate, but indexing is cheap and future-proof.)
 */
export const V65_STORES = {
  products:
    'id, store_id, branch_id, name, category, category_id, tenant_type, is_global, updated_at, _synced, _deleted',
} as const;

/**
 * v66 (Plan A — Fiscal Year): introduces the `fiscal_periods` table. One row
 * per (store, fiscal year) tracking the FY range, closing state, and (later,
 * via Plan C) the archive manifest URL.
 *
 * New columns on `stores` (`fiscal_year_start_month`, `fiscal_year_start_day`)
 * are not indexed — they travel transparently in the JSON blob. Only the
 * indexed surface of `stores` is unchanged; the schema row is not bumped.
 *
 * See OFFLINE_HISTORY_ARCHITECTURE.md §5.1.
 */
export const V66_STORES = {
  fiscal_periods:
    'id, store_id, fy_label, start_date, end_date, is_closed, created_at, updated_at, [store_id+fy_label], [store_id+is_closed], [store_id+start_date], _synced, _deleted',
} as const;

/**
 * v67 (Plan B — Snapshot Correctness): adds `stale`, `is_closing`, `source`
 * columns to `balance_snapshots`. None are indexed — Dexie cannot range-query
 * them efficiently and the existing compound indexes on (store_id +
 * account_code + entity_id + snapshot_date) already locate candidate rows;
 * the new columns are filtered in memory on the small result set.
 *
 * Upgrade-only version (no schema row) — see `upgradeV67` for the backfill.
 *
 * See OFFLINE_HISTORY_ARCHITECTURE.md §5.2 and the Plan B hybrid offline
 * strategy: existing local snapshots are attributed `source='client'` so the
 * server-driven generator (Plan B / B3) can later replace them on conflict.
 */

/**
 * v68 (audit-logging-service, Phase 0): introduces the general-purpose
 * `audit_logs` table — one row per state-changing business action, scoped to a
 * store branch (see audit_log_design_decisions).
 *
 * Append-only by design: the app only ever INSERTs. There is no `updated_at`
 * (the table is excluded from TABLES_WITH_UPDATED_AT and syncs on `created_at`,
 * like journal_entries). `changes` is a JSONB array and is not indexed — Dexie
 * cannot range-query JSON. Indexed surface targets the three read patterns:
 * per-record history [store_id+entity_type+entity_id], branch activity feed
 * [store_id+branch_id] / [store_id+created_at], and by-actor [changed_by+created_at].
 *
 * New empty table — `upgradeV68` has no backfill (no production data; see
 * project_no_production_data_yet).
 */
export const V68_STORES = {
  audit_logs:
    'id, store_id, branch_id, entity_type, entity_id, action, changed_by, created_at, [store_id+branch_id], [store_id+entity_type+entity_id], [changed_by+created_at], [store_id+created_at], _synced, _deleted',
} as const;

/** v69 — drop the legacy `bill_audit_logs` store (null = delete table). */
export const V69_STORES = {
  bill_audit_logs: null,
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

export async function upgradeV61(tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v60 → v61 (entity balances/advance/max JSONB maps)');

  await tx
    .table('entities')
    .toCollection()
    .modify((row: Record<string, unknown>) => {
      const existingBalances = row.balances as Record<string, number> | undefined;
      if (!existingBalances || Object.keys(existingBalances).length === 0) {
        const balances: Record<string, number> = {};
        const usd = Number(row.usd_balance ?? 0) || 0;
        const lbp = Number(row.lb_balance ?? 0) || 0;
        if (usd !== 0) balances.USD = usd;
        if (lbp !== 0) balances.LBP = lbp;
        row.balances = balances;
      }

      const existingAdvances = row.advance_balances as Record<string, number> | undefined;
      if (!existingAdvances || Object.keys(existingAdvances).length === 0) {
        const advances: Record<string, number> = {};
        const advUsd = Number(row.advance_usd_balance ?? 0) || 0;
        const advLbp = Number(row.advance_lb_balance ?? 0) || 0;
        if (advUsd !== 0) advances.USD = advUsd;
        if (advLbp !== 0) advances.LBP = advLbp;
        row.advance_balances = advances;
      }

      const existingMax = row.max_balances as Record<string, number> | undefined;
      if (!existingMax || Object.keys(existingMax).length === 0) {
        const maxes: Record<string, number> = {};
        const maxUsd = Number(row.usd_max_balance ?? 0) || 0;
        const maxLbp = Number(row.lb_max_balance ?? 0) || 0;
        if (maxUsd !== 0) maxes.USD = maxUsd;
        if (maxLbp !== 0) maxes.LBP = maxLbp;
        row.max_balances = maxes;
      }
    });

  console.log('   ✅ v61 migration complete');
}

export async function upgradeV62(tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v61 → v62 (drop legacy USD/LBP scalar columns)');

  // Strip legacy scalar fields from journal_entries — `amounts` JSONB
  // (populated in v59) is now the only carrier.
  await tx
    .table('journal_entries')
    .toCollection()
    .modify((row: Record<string, unknown>) => {
      delete row.debit_usd;
      delete row.credit_usd;
      delete row.debit_lbp;
      delete row.credit_lbp;
    });

  // Strip legacy scalar fields from balance_snapshots — `balances` JSONB
  // (populated in v59) is now the only carrier. The Dexie store-spec
  // for V62 also drops the now-unused balance_usd/balance_lbp indexes.
  await tx
    .table('balance_snapshots')
    .toCollection()
    .modify((row: Record<string, unknown>) => {
      delete row.balance_usd;
      delete row.balance_lbp;
    });

  // Sister cleanup on entities — scalar mirrors of the JSONB balance maps
  // populated in v61. Removing them now since no production data exists.
  await tx
    .table('entities')
    .toCollection()
    .modify((row: Record<string, unknown>) => {
      delete row.lb_balance;
      delete row.usd_balance;
      delete row.advance_lb_balance;
      delete row.advance_usd_balance;
      delete row.lb_max_balance;
      delete row.usd_max_balance;
    });

  console.log('   ✅ v62 migration complete');
}

export async function upgradeV63(_tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v62 → v63 (product_image_cache local-only table)');
  console.log('   ✅ v63 migration complete');
}

/** Default tenant type assigned to every legacy store on v64 upgrade. */
export const DEFAULT_TENANT_TYPE = 'produce_market';

/** Multilingual labels for the legacy produce-market category superset. */
const PRODUCE_MARKET_CATEGORY_SEED: Array<{
  code: string;
  name: { en: string; ar: string; fr: string };
  sort_order: number;
}> = [
  { code: 'fruits',          name: { en: 'Fruits',          ar: 'فواكه',          fr: 'Fruits' },         sort_order: 10 },
  { code: 'tropical_fruits', name: { en: 'Tropical Fruits', ar: 'فواكه استوائية', fr: 'Fruits tropicaux' }, sort_order: 20 },
  { code: 'vegetables',      name: { en: 'Vegetables',      ar: 'خضروات',         fr: 'Légumes' },        sort_order: 30 },
  { code: 'herbs',           name: { en: 'Herbs/ Leafy',    ar: 'حشائش',          fr: 'Herbes' },         sort_order: 40 },
  { code: 'grains',          name: { en: 'Grains',          ar: 'حبوب',           fr: 'Céréales' },       sort_order: 50 },
  { code: 'nuts',            name: { en: 'Nuts',            ar: 'مكسرات',         fr: 'Noix' },           sort_order: 60 },
  { code: 'others',          name: { en: 'Others',          ar: 'أخرى',           fr: 'Autres' },         sort_order: 70 },
];

/** Multilingual labels + system_role for the legacy produce-market unit set. */
const PRODUCE_MARKET_UNIT_SEED: Array<{
  code: string;
  name: { en: string; ar: string; fr: string };
  system_role: 'mass' | 'count' | 'volume' | 'length' | 'pack';
  sort_order: number;
}> = [
  { code: 'kg',     name: { en: 'Kilogram', ar: 'كيلوغرام', fr: 'Kilogramme' }, system_role: 'mass',  sort_order: 10 },
  { code: 'piece',  name: { en: 'Piece',    ar: 'قطعة',     fr: 'Pièce' },      system_role: 'count', sort_order: 20 },
  { code: 'box',    name: { en: 'Box',      ar: 'صندوق',    fr: 'Boîte' },      system_role: 'pack',  sort_order: 30 },
  { code: 'bag',    name: { en: 'Bag',      ar: 'كيس',      fr: 'Sac' },        system_role: 'pack',  sort_order: 40 },
  { code: 'bundle', name: { en: 'Bundle',   ar: 'حزمة',     fr: 'Botte' },      system_role: 'pack',  sort_order: 50 },
  { code: 'dozen',  name: { en: 'Dozen',    ar: 'دزينة',    fr: 'Douzaine' },   system_role: 'count', sort_order: 60 },
];

/**
 * Maps legacy category strings (including drifted variants stored in real
 * product rows) to the seeded category `code`. Unknown values fall back to
 * `others`.
 */
function legacyCategoryToCode(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return 'others';
  const norm = raw.trim().toLowerCase();
  if (norm === 'fruits') return 'fruits';
  if (norm === 'tropical fruits' || norm === 'tropical_fruits') return 'tropical_fruits';
  if (norm === 'vegetables') return 'vegetables';
  if (norm === 'herbs' || norm === 'herbs/leafy' || norm === 'herbs/ leafy' || norm === 'leafy') return 'herbs';
  if (norm === 'grains') return 'grains';
  if (norm === 'nuts') return 'nuts';
  if (norm === 'others') return 'others';
  return 'others';
}

function legacyUnitToCode(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return 'piece';
  const norm = raw.trim().toLowerCase();
  if (norm === 'kg' || norm === 'kilogram' || norm === 'kilogram (kg)') return 'kg';
  if (norm === 'piece' || norm === 'pieces' || norm === 'pc') return 'piece';
  if (norm === 'box' || norm === 'boxes') return 'box';
  if (norm === 'bag' || norm === 'bags') return 'bag';
  if (norm === 'bundle' || norm === 'bundles') return 'bundle';
  if (norm === 'dozen' || norm === 'dozens') return 'dozen';
  return 'piece';
}

/**
 * Build a deterministic UUIDv5-shaped id from (storeId, kind, code) so that
 * re-running the migration on a device that previously synced down rows does
 * not create duplicates. Pure local — Supabase rows get their own gen_random_uuid.
 */
function deterministicId(storeId: string, kind: 'cat' | 'unit', code: string): string {
  const seed = `${storeId}:${kind}:${code}`;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const a = toHex(h1);
  const b = toHex(h2);
  const c = toHex(Math.imul(h1, 16807));
  const d = toHex(Math.imul(h2, 48271));
  // 8-4-4-4-12 layout; force version nibble to 5 + variant nibble to 8 so the
  // string passes basic UUID validators that may inspect it.
  return `${a}-${b.slice(0, 4)}-5${b.slice(4, 7)}-8${c.slice(0, 3)}-${c.slice(3, 8)}${d.slice(0, 7)}`;
}

/**
 * v64 (configurable categories + units):
 * 1. Default tenant_type=produce_market on every store row.
 * 2. Idempotently seed produce_market categories and units per store.
 * 3. Backfill products.category_id from the legacy category text.
 * 4. Backfill inventory_items.unit_id from the legacy unit text.
 * Legacy text columns (`products.category`, `inventory_items.unit`) are left
 * intact for one transition cycle so older readers keep working.
 */
export async function upgradeV64(tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v63 → v64 (configurable categories + units)');

  // (1) Default tenant_type on stores
  await tx
    .table('stores')
    .toCollection()
    .modify((store: Record<string, unknown>) => {
      if (!store.tenant_type) store.tenant_type = DEFAULT_TENANT_TYPE;
    });

  const stores = await tx.table('stores').toArray();
  const nowIso = new Date().toISOString();

  // (2) Seed categories + units per store (idempotent on [store_id+code])
  for (const store of stores) {
    const storeId = store.id as string;
    if (!storeId) continue;

    for (const seed of PRODUCE_MARKET_CATEGORY_SEED) {
      const existing = await tx
        .table('product_categories')
        .where('[store_id+code]')
        .equals([storeId, seed.code])
        .first();
      if (existing) continue;

      await tx.table('product_categories').add({
        id: deterministicId(storeId, 'cat', seed.code),
        store_id: storeId,
        code: seed.code,
        name: seed.name,
        sort_order: seed.sort_order,
        is_active: true,
        is_system: true,
        created_at: nowIso,
        updated_at: nowIso,
        _synced: false,
        _deleted: false,
      });
    }

    for (const seed of PRODUCE_MARKET_UNIT_SEED) {
      const existing = await tx
        .table('units_of_measure')
        .where('[store_id+code]')
        .equals([storeId, seed.code])
        .first();
      if (existing) continue;

      await tx.table('units_of_measure').add({
        id: deterministicId(storeId, 'unit', seed.code),
        store_id: storeId,
        code: seed.code,
        name: seed.name,
        system_role: seed.system_role,
        sort_order: seed.sort_order,
        is_active: true,
        is_system: true,
        created_at: nowIso,
        updated_at: nowIso,
        _synced: false,
        _deleted: false,
      });
    }
  }

  // (3) Backfill products.category_id from legacy text
  await tx
    .table('products')
    .toCollection()
    .modify((product: Record<string, unknown>) => {
      if (product.category_id) return;
      const storeId = product.store_id as string;
      if (!storeId) return;
      const code = legacyCategoryToCode(product.category);
      product.category_id = deterministicId(storeId, 'cat', code);
      product._synced = false;
    });

  // (4) Backfill inventory_items.unit_id from legacy text
  await tx
    .table('inventory_items')
    .toCollection()
    .modify((item: Record<string, unknown>) => {
      if (item.unit_id) return;
      const storeId = item.store_id as string;
      if (!storeId) return;
      const code = legacyUnitToCode(item.unit);
      item.unit_id = deterministicId(storeId, 'unit', code);
      item._synced = false;
    });

  console.log('   ✅ v64 migration complete');
}

/**
 * v67 (Plan B — Snapshot Correctness): backfill `stale`, `is_closing`, and
 * `source` on existing balance_snapshots rows. All existing rows were
 * written by the client scheduler, so attribute them `source='client'`.
 * Server-generated snapshots will arrive via paged sync once B3 is live.
 */
export async function upgradeV67(tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v66 → v67 (balance_snapshots stale/source/is_closing)');
  await tx
    .table('balance_snapshots')
    .toCollection()
    .modify((row: Record<string, unknown>) => {
      if (row.source === undefined || row.source === null || row.source === '') {
        row.source = 'client';
      }
      if (row.stale === undefined || row.stale === null) {
        row.stale = false;
      }
      if (row.is_closing === undefined || row.is_closing === null) {
        row.is_closing = false;
      }
    });
  console.log('   ✅ v67 migration complete');
}

/**
 * v66 (Plan A — Fiscal Year): default `fiscal_year_start_month` / `_day` on
 * legacy local store rows to (1, 1) so the UI never reads undefined. New
 * `fiscal_periods` table starts empty; rows arrive via paged sync (A5) or
 * via the year-end close action (Plan C).
 */
export async function upgradeV66(tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v65 → v66 (fiscal year config + fiscal_periods)');
  await tx
    .table('stores')
    .toCollection()
    .modify((store: Record<string, unknown>) => {
      if (store.fiscal_year_start_month === undefined || store.fiscal_year_start_month === null) {
        store.fiscal_year_start_month = 1;
      }
      if (store.fiscal_year_start_day === undefined || store.fiscal_year_start_day === null) {
        store.fiscal_year_start_day = 1;
      }
    });
  console.log('   ✅ v66 migration complete');
}

/**
 * v65 (tenant-scoped globals): backfill existing global products in the
 * local Dexie copy with `tenant_type='produce_market'`. Mirrors the SQL
 * migration. Idempotent.
 */
export async function upgradeV65(tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v64 → v65 (products.tenant_type for tenant-scoped globals)');
  await tx
    .table('products')
    .toCollection()
    .modify((p: Record<string, unknown>) => {
      const isGlobal =
        p.is_global === true || p.is_global === 1 || p.is_global === '1' || p.is_global === 'true';
      if (isGlobal && !p.tenant_type) {
        p.tenant_type = 'produce_market';
      }
    });
  console.log('   ✅ v65 migration complete');
}

/**
 * v68 (audit-logging-service Phase 0): creates the `audit_logs` table. The
 * Dexie store definition in V68_STORES does all the work; there is nothing to
 * backfill on a fresh, empty table.
 */
export async function upgradeV68(_tx: DexieTransaction): Promise<void> {
  console.log('🔧 Migrating database schema v67 → v68 (audit_logs table)');
  console.log('   ✅ v68 migration complete');
}

export async function upgradeV69(_tx: DexieTransaction): Promise<void> {
  // Drops the legacy `bill_audit_logs` table — superseded by the general
  // `audit_logs` service (bills now audited semantically at the operation layer).
  console.log('🔧 Migrating database schema v68 → v69 (drop legacy bill_audit_logs)');
  console.log('   ✅ v69 migration complete');
}
