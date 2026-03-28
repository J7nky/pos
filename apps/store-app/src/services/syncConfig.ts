import { getDB } from '../lib/db';

export const SYNC_CONFIG = {
  batchSize: 100,
  maxRetries: 2,
  // syncInterval: REMOVED - no periodic sync in fully event-driven mode
  maxRecordsPerSync: 1000,
  queryTimeout: 30000, // Query timeout for individual queries (30s)
  // Deletion detection - optimized
  enableDeletionDetection: true, // Enable detection of remote deletions
  deletionDetectionInterval: 300000, // Run full deletion check every 5 minutes
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

export interface SyncResult {
  success: boolean;
  errors: string[];
  synced: {
    uploaded: number;
    downloaded: number;
  };
  conflicts: number;
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
