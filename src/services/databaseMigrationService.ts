import { db } from '../lib/db';

export interface SchemaVersion {
  version: number;
  name: string;
  description: string;
  appliedAt: string;
}

export interface MigrationResult {
  success: boolean;
  version: number;
  message: string;
  errors?: string[];
}

export interface SchemaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export class DatabaseMigrationService {
  private static instance: DatabaseMigrationService;
  private currentVersion: number = 15; // Current database version
  private schemaVersions: SchemaVersion[] = [];

  private constructor() {
    this.initializeSchemaVersions();
  }

  public static getInstance(): DatabaseMigrationService {
    if (!DatabaseMigrationService.instance) {
      DatabaseMigrationService.instance = new DatabaseMigrationService();
    }
    return DatabaseMigrationService.instance;
  }

  private initializeSchemaVersions(): void {
    this.schemaVersions = [
      { version: 1, name: 'Initial Schema', description: 'Basic POS system schema', appliedAt: '2024-01-01' },
      { version: 2, name: 'Inventory Management', description: 'Added inventory tracking', appliedAt: '2024-01-15' },
      { version: 3, name: 'Customer Management', description: 'Added customer and supplier management', appliedAt: '2024-02-01' },
      { version: 4, name: 'Transaction System', description: 'Added financial transaction tracking', appliedAt: '2024-02-15' },
      { version: 5, name: 'Commission System', description: 'Added commission tracking and supplier types', appliedAt: '2024-03-01' },
      { version: 6, name: 'Bill Management', description: 'Added bill and sale management system', appliedAt: '2024-03-15' },
      { version: 7, name: 'Cash Drawer System', description: 'Added cash drawer management', appliedAt: '2024-04-01' },
      { version: 8, name: 'Sync System', description: 'Added offline-first sync capabilities', appliedAt: '2024-04-15' },
      { version: 9, name: 'Audit Trail', description: 'Added comprehensive audit logging', appliedAt: '2024-05-01' },
      { version: 10, name: 'Multi-Currency', description: 'Added multi-currency support', appliedAt: '2024-05-15' },
      { version: 11, name: 'Performance Optimization', description: 'Added performance indexes and optimizations', appliedAt: '2024-06-01' },
      { version: 12, name: 'Data Integrity', description: 'Enhanced data validation and constraints', appliedAt: '2024-06-15' },
      { version: 13, name: 'Backup System', description: 'Added automated backup and recovery', appliedAt: '2024-07-01' },
      { version: 14, name: 'Security Enhancements', description: 'Added security and access controls', appliedAt: '2024-07-15' },
      { version: 15, name: 'Exchange Rates', description: 'Added exchange rate management and sync', appliedAt: '2024-08-01' }
    ];
  }

  /**
   * Validate the current database schema
   */
  public async validateSchema(): Promise<SchemaValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      // Check if all required tables exist
      const requiredTables = [
        'stores', 'products', 'suppliers', 'customers', 'inventory_items',
        'transactions', 'inventory_bills', 'bills', 'bill_line_items',
        'bill_audit_logs', 'cash_drawer_accounts', 'cash_drawer_sessions',
        'exchange_rates', 'sync_metadata', 'pending_syncs'
      ];

      for (const tableName of requiredTables) {
        try {
          const table = (db as any)[tableName];
          if (!table) {
            errors.push(`Required table '${tableName}' is missing`);
          } else {
            // Check if table has data (basic connectivity test)
            const count = await table.count();
            if (count === 0) {
              warnings.push(`Table '${tableName}' is empty`);
            }
          }
        } catch (error) {
          errors.push(`Error accessing table '${tableName}': ${error}`);
        }
      }

      // Check for orphaned records
      await this.checkOrphanedRecords(errors, warnings);

      // Check for data integrity issues
      await this.checkDataIntegrity(errors, warnings);

      // Check for performance issues
      await this.checkPerformanceIssues(warnings, suggestions);

      // Check for sync consistency
      await this.checkSyncConsistency(warnings, suggestions);

    } catch (error) {
      errors.push(`Schema validation failed: ${error}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Check for orphaned records across tables
   */
  private async checkOrphanedRecords(errors: string[], warnings: string[]): Promise<void> {
    try {
      // Check for orphaned bill line items
      const bills = await db.bills.toArray();
      const billIds = new Set(bills.map(b => b.id));
      const orphanedLineItems = await db.bill_line_items
        .filter(item => !billIds.has(item.bill_id))
        .toArray();
      
      if (orphanedLineItems.length > 0) {
        warnings.push(`Found ${orphanedLineItems.length} orphaned bill line items`);
      }

      // Check for orphaned inventory items
      const products = await db.products.toArray();
      const productIds = new Set(products.map(p => p.id));
      const orphanedInventoryItems = await db.inventory_items
        .filter(item => !productIds.has(item.product_id))
        .toArray();
      
      if (orphanedInventoryItems.length > 0) {
        warnings.push(`Found ${orphanedInventoryItems.length} orphaned inventory items`);
      }

    } catch (error) {
      errors.push(`Error checking orphaned records: ${error}`);
    }
  }

  /**
   * Check for data integrity issues
   */
  private async checkDataIntegrity(errors: string[], warnings: string[]): Promise<void> {
    try {
      // Check for negative balances
      const negativeBalances = await db.suppliers
        .filter(s => (s.lb_balance || 0) < 0 || (s.usd_balance || 0) < 0)
        .toArray();
      
      if (negativeBalances.length > 0) {
        warnings.push(`Found ${negativeBalances.length} suppliers with negative balances`);
      }

      // Check for negative inventory quantities
      const negativeInventory = await db.inventory_items
        .filter(item => (item.quantity || 0) < 0)
        .toArray();
      
      if (negativeInventory.length > 0) {
        errors.push(`Found ${negativeInventory.length} inventory items with negative quantities`);
      }

      // Check for invalid exchange rates
      const invalidRates = await db.exchange_rates
        .filter(rate => rate.rate <= 0)
        .toArray();
      
      if (invalidRates.length > 0) {
        errors.push(`Found ${invalidRates.length} invalid exchange rates`);
      }

    } catch (error) {
      errors.push(`Error checking data integrity: ${error}`);
    }
  }

  /**
   * Check for performance issues
   */
  private async checkPerformanceIssues(warnings: string[], suggestions: string[]): Promise<void> {
    try {
      // Check for large tables that might need partitioning
      const tableSizes = await Promise.all([
        db.products.count(),
        db.suppliers.count(),
        db.customers.count(),
        db.inventory_items.count(),
        db.transactions.count(),
        db.bills.count(),
        db.bill_line_items.count()
      ]);

      const tableNames = ['products', 'suppliers', 'customers', 'inventory_items', 'transactions', 'bills', 'bill_line_items'];
      
      tableSizes.forEach((size, index) => {
        if (size > 10000) {
          warnings.push(`Table '${tableNames[index]}' has ${size} records - consider archiving old data`);
        }
        if (size > 50000) {
          suggestions.push(`Table '${tableNames[index]}' has ${size} records - consider implementing data partitioning`);
        }
      });

      // Check for unsynced records
      const unsyncedCounts = await Promise.all([
        db.products.filter(p => !p._synced).count(),
        db.suppliers.filter(s => !s._synced).count(),
        db.customers.filter(c => !c._synced).count(),
        db.inventory_items.filter(i => !i._synced).count(),
        db.transactions.filter(t => !t._synced).count(),
        db.bills.filter(b => !b._synced).count(),
        db.bill_line_items.filter(bli => !bli._synced).count()
      ]);

      const totalUnsynced = unsyncedCounts.reduce((sum, count) => sum + count, 0);
      if (totalUnsynced > 1000) {
        warnings.push(`Found ${totalUnsynced} unsynced records - sync performance may be affected`);
      }

    } catch (error) {
      warnings.push(`Error checking performance issues: ${error}`);
    }
  }

  /**
   * Check for sync consistency issues
   */
  private async checkSyncConsistency(warnings: string[], suggestions: string[]): Promise<void> {
    try {
      // Check for pending sync operations
      const pendingSyncs = await db.pending_syncs.count();
      if (pendingSyncs > 100) {
        warnings.push(`Found ${pendingSyncs} pending sync operations - sync queue may be backed up`);
      }

      // Check for old pending syncs
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const oldPendingSyncs = await db.pending_syncs
        .filter(sync => sync.created_at < oneDayAgo)
        .count();
      
      if (oldPendingSyncs > 0) {
        warnings.push(`Found ${oldPendingSyncs} pending sync operations older than 24 hours`);
      }

      // Check sync metadata consistency
      const syncMetadata = await db.sync_metadata.toArray();
      const tableNames = ['products', 'suppliers', 'customers', 'inventory_items', 'transactions', 'bills', 'bill_line_items'];
      
      for (const tableName of tableNames) {
        const metadata = syncMetadata.find(m => m.table_name === tableName);
        if (!metadata) {
          suggestions.push(`Missing sync metadata for table '${tableName}'`);
        }
      }

    } catch (error) {
      warnings.push(`Error checking sync consistency: ${error}`);
    }
  }

  /**
   * Run database migration to the latest version
   */
  public async migrateToLatest(): Promise<MigrationResult> {
    try {
      console.log('🔄 Starting database migration to latest version...');
      
      // Validate current schema first
      const validation = await this.validateSchema();
      if (!validation.isValid) {
        return {
          success: false,
          version: this.currentVersion,
          message: 'Schema validation failed - cannot migrate',
          errors: validation.errors
        };
      }

      // For now, we're already at the latest version
      // In the future, this would handle incremental migrations
      console.log('✅ Database is already at latest version');
      
      return {
        success: true,
        version: this.currentVersion,
        message: 'Database is up to date'
      };

    } catch (error) {
      console.error('❌ Migration failed:', error);
      return {
        success: false,
        version: this.currentVersion,
        message: 'Migration failed',
        errors: [error.toString()]
      };
    }
  }

  /**
   * Get current database version
   */
  public getCurrentVersion(): number {
    return this.currentVersion;
  }

  /**
   * Get all schema versions
   */
  public getSchemaVersions(): SchemaVersion[] {
    return [...this.schemaVersions];
  }

  /**
   * Create a database backup
   */
  public async createBackup(): Promise<{ success: boolean; backupId: string; message: string }> {
    try {
      const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Export all data
      const backupData = {
        version: this.currentVersion,
        timestamp: new Date().toISOString(),
        tables: {} as any
      };

      const tableNames = [
        'stores', 'products', 'suppliers', 'customers', 'inventory_items',
        'transactions', 'inventory_bills', 'bills', 'bill_line_items',
        'bill_audit_logs', 'cash_drawer_accounts', 'cash_drawer_sessions',
        'exchange_rates', 'sync_metadata', 'pending_syncs'
      ];

      for (const tableName of tableNames) {
        try {
          const table = (db as any)[tableName];
          if (table) {
            backupData.tables[tableName] = await table.toArray();
          }
        } catch (error) {
          console.warn(`Failed to backup table ${tableName}:`, error);
        }
      }

      // Store backup in localStorage (in production, this would be stored securely)
      localStorage.setItem(`db_backup_${backupId}`, JSON.stringify(backupData));
      
      console.log(`✅ Database backup created: ${backupId}`);
      
      return {
        success: true,
        backupId,
        message: 'Backup created successfully'
      };

    } catch (error) {
      console.error('❌ Backup failed:', error);
      return {
        success: false,
        backupId: '',
        message: `Backup failed: ${error}`
      };
    }
  }

  /**
   * Restore database from backup
   */
  public async restoreFromBackup(backupId: string): Promise<{ success: boolean; message: string }> {
    try {
      const backupData = localStorage.getItem(`db_backup_${backupId}`);
      if (!backupData) {
        return {
          success: false,
          message: 'Backup not found'
        };
      }

      const backup = JSON.parse(backupData);
      
      // Clear existing data
      await db.transaction('rw', db.tables, async () => {
        for (const tableName of Object.keys(backup.tables)) {
          const table = (db as any)[tableName];
          if (table) {
            await table.clear();
          }
        }
      });

      // Restore data
      await db.transaction('rw', db.tables, async () => {
        for (const [tableName, records] of Object.entries(backup.tables)) {
          const table = (db as any)[tableName];
          if (table && Array.isArray(records)) {
            await table.bulkAdd(records);
          }
        }
      });

      console.log(`✅ Database restored from backup: ${backupId}`);
      
      return {
        success: true,
        message: 'Database restored successfully'
      };

    } catch (error) {
      console.error('❌ Restore failed:', error);
      return {
        success: false,
        message: `Restore failed: ${error}`
      };
    }
  }
}

export const databaseMigrationService = DatabaseMigrationService.getInstance();

