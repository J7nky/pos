import { getDB } from '../lib/db';

export const SYNC_CONFIG = {
  batchSize: 100,
  maxRetries: 2,
  /** Page size for version-cursor incremental downloads (`downloadTablePaged` / `downloadTier`). */
  cursorPageSize: 500,
  // syncInterval: REMOVED - no periodic sync in fully event-driven mode
  maxRecordsPerSync: 1000,
  queryTimeout: 30000, // Query timeout for individual queries (30s)
  // Deletion detection - optimized
  // EventStreamService already propagates real-time deletes via Supabase Realtime,
  // so this full-table scan is only a safety net for records deleted directly in
  // the database. Running it every 5 min generated ~24-48 extra requests per sync
  // cycle; 30 min is a good trade-off (once per typical session, not 6×).
  enableDeletionDetection: true, // Enable detection of remote deletions
  deletionDetectionInterval: 1_800_000, // Run full deletion check every 30 minutes (was 5 min)
  // Minimum delay before the FIRST deletion check after a cold app start.
  // Prevents the very first sync from immediately issuing 24+ paginated
  // ID-scan queries before the user even sees the UI.
  deletionDetectionStartupGrace: 300_000, // 5-minute startup grace period
  deletionUseHashComparison: true, // Use hash-based comparison for large tables
  // Pagination for large-table remote ID scans (deletion detection)
  largeTablePaginationSize: 500,
  largeTableThreshold: 1000, // Tables with more records are considered "large"
};

// Table sync order (respects foreign key dependencies)
export const SYNC_TABLES = [
  'stores',
  'branches',
  'products',
  // 'suppliers', // REMOVED - migrated to entities table
  // 'customers', // REMOVED - migrated to entities table
  'users', // Employees with auth accounts - synced to Supabase
  'cash_drawer_accounts',
  // NEW: Accounting foundation tables (sync early for dependencies)
  'chart_of_accounts', // Must sync before journal_entries
  'entities', // Must sync before journal_entries and balance_snapshots (replaces customers/suppliers)
  'inventory_bills',
  'inventory_items',
  'transactions',
  'bills', // Must sync before journal_entries (journal entries have bill_id foreign key)
  'journal_entries', // Must sync after entities, chart_of_accounts, and bills
  'balance_snapshots', // Must sync after entities
  'bill_line_items',
  'bill_audit_logs',
  'cash_drawer_sessions',
  'missed_products',
  'reminders',
  // RBAC tables (Role-Based Access Control) - sync for cross-device permissions
  'role_permissions', // Default permissions per role (operations + module access)
  'user_permissions' // User-specific permission overrides (operations + module access)
] as const;

export type SyncTable = typeof SYNC_TABLES[number];

/** Tiered hydration groups (see `specs/010-incremental-sync-redesign/data-model.md`). */
export type DataTierName = 'tier1' | 'tier2' | 'tier3';

export const SYNC_TIERS: Record<DataTierName, readonly SyncTable[]> = {
  tier1: [
    'stores',
    'branches',
    'products',
    'users',
    'cash_drawer_accounts',
    'chart_of_accounts',
    'entities',
    'cash_drawer_sessions',
    'role_permissions',
    'user_permissions',
  ],
  tier2: [
    'inventory_bills',
    'inventory_items',
    'transactions',
    'bills',
    'journal_entries',
    'balance_snapshots',
    'bill_line_items',
    'bill_audit_logs',
  ],
  tier3: ['missed_products', 'reminders'],
} as const;

const SYNC_DEPENDENCIES: Record<SyncTable, SyncTable[]> = {
  'products': [],
  'stores': [],
  'branches': ['stores'], // Branches belong to stores
  // 'suppliers': [], // REMOVED - migrated to entities
  // 'customers': [], // REMOVED - migrated to entities
  'users': ['stores'],
  'cash_drawer_accounts': [],
  // NEW: Accounting foundation dependencies
  'chart_of_accounts': ['stores'], // Chart of accounts belongs to stores
  'entities': ['stores'], // Entities belong to stores (replaces customers/suppliers)
  'bills': ['entities'], // customer_id references entity.id
  'journal_entries': ['stores', 'entities', 'chart_of_accounts', 'bills', 'cash_drawer_sessions'], // Sessions before entries so session window exists after sync
  'balance_snapshots': ['stores', 'entities'], // Balance snapshots reference entities
  'inventory_bills': ['entities'], // supplier_id references entity.id
  // supplier_id was removed from inventory_items; depend on batch linkage only
  'inventory_items': ['products', 'inventory_bills'],
  'transactions': [],
  'bill_line_items': ['bills', 'products', 'entities', 'inventory_items'], // supplier_id references entity.id
  'bill_audit_logs': ['bills'],
  'cash_drawer_sessions': ['cash_drawer_accounts'],
  'missed_products': ['cash_drawer_sessions', 'inventory_items'],
  'reminders': ['users'], // Reminders reference users (created_by, completed_by)
  'role_permissions': [], // RBAC: Role permissions are GLOBAL (no store_id, no dependencies)
  'user_permissions': ['stores', 'users'] // RBAC: User permissions reference stores and users
};

/** Topologically order tables within a tier using `SYNC_DEPENDENCIES` (dependencies first). */
export function getTablesInTierOrdered(tier: DataTierName): SyncTable[] {
  const tierTables = SYNC_TIERS[tier];
  const inTier = new Set<SyncTable>(tierTables);
  const visited = new Set<SyncTable>();
  const sorted: SyncTable[] = [];

  const visit = (t: SyncTable) => {
    if (!inTier.has(t) || visited.has(t)) return;
    const deps = SYNC_DEPENDENCIES[t] ?? [];
    for (const d of deps) {
      if (inTier.has(d)) visit(d);
    }
    visited.add(t);
    sorted.push(t);
  };

  for (const t of tierTables) visit(t);
  return sorted;
}

export interface SyncResult {
  success: boolean;
  errors: string[];
  synced: {
    uploaded: number;
    downloaded: number;
  };
  conflicts: number;
}

/** Result of a paged version-cursor download for one table (last page + running totals). */
export interface DownloadPageResult {
  tableName: SyncTable;
  recordsReceived: number;
  lastVersion: number;
  isComplete: boolean;
  totalRecordsDownloaded: number;
}

/** Checkpoint returned by `getCheckpoint` / updated by `saveCheckpoint`. */
export interface SyncCheckpoint {
  tableName: SyncTable;
  storeId: string;
  lastSyncedVersion: number;
  hydrationComplete: boolean;
  lastSyncedAt: string;
}

// Deletion state tracking for incremental deletion detection
export interface DeletionState {
  table_name: string;
  last_check_at: string;
  record_count: number;
  checksum?: string; // Optional hash for quick comparison
}

export async function validateDependencies(tableName: SyncTable, _storeId: string): Promise<boolean> {
  const dependencies = SYNC_DEPENDENCIES[tableName];

  if (dependencies.length === 0) {
    return true;
  }

  try {
    const hasAnySyncMetadata = await getDB().sync_metadata.count() > 0;

    if (!hasAnySyncMetadata) {
      const tableIndex = (SYNC_TABLES as readonly string[]).indexOf(tableName);
      const dependencyIndices = dependencies.map(dep => (SYNC_TABLES as readonly string[]).indexOf(dep));
      return dependencyIndices.every(depIndex => depIndex < tableIndex);
    }

    const dependencyChecks = await Promise.all(
      dependencies.map(async (depTable) => {
        const lastSynced = await getDB().sync_metadata
          .where('table_name')
          .equals(depTable)
          .first();
        return !!lastSynced;
      })
    );

    return dependencyChecks.every(check => check);
  } catch (error) {
    console.error(`Error validating dependencies for ${tableName}:`, error);
    return false;
  }
}
