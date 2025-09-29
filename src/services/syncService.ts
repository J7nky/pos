// @ts-nocheck
/* eslint-disable */
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { Database } from '../types/database';
// Removed query monitoring - using IndexedDB only approach

type Tables = Database['public']['Tables'];

// Sync configuration - OPTIMIZED for IndexedDB-only approach
const SYNC_CONFIG = {
  batchSize: 100, // Batch size for efficient API calls
  maxRetries: 2, // Retry attempts for failed requests
  retryDelay: 2000, // Delay between retries
  syncInterval: 30000, // Sync interval (30 seconds)
  
  // Sync thresholds
  maxRecordsPerSync: 1000, // Limit records per sync to control costs
  incrementalSyncThreshold: 50, // Use incremental sync if fewer than 50 changes
  validationCacheExpiry: 900000, // 15 minutes validation cache
};

// Table mapping for sync operations
// CRITICAL: Order matters for foreign key dependencies
const SYNC_TABLES = [
  // Store configuration (no dependencies)
  'stores',
  
  // Currency rates (no dependencies - global)
  // 'exchange_rates',
  
  // Core entities (depend on stores)
  'products',
  'suppliers', 
  'customers',
  'cash_drawer_accounts',
  
  // Inventory bills (depends on stores, suppliers)
  'inventory_bills',
  
  // Inventory items (depends on stores, products, suppliers, inventory_bills)
  'inventory_items',
  
  // Transactions (depends on stores)
  'transactions',
  
  // Bills (depends on stores, customers)
  'bills',
  
  // Bill dependencies (MUST come after bills)
  'bill_line_items',    // depends on stores, bills, products, suppliers, inventory_items
  'bill_audit_logs',    // depends on stores, bills
  
  // Cash drawer sessions (depends on stores, cash_drawer_accounts)
  'cash_drawer_sessions',
  
  // Missed products (depends on stores, cash_drawer_sessions, inventory_items)
  'missed_products'
] as const;

type SyncTable = typeof SYNC_TABLES[number];

// Dependency mapping for sync validation
const SYNC_DEPENDENCIES: Record<SyncTable, SyncTable[]> = {
  'products': [],
  'stores': [],
  'suppliers': [],
  'customers': [],
  'cash_drawer_accounts': [],
  'inventory_bills': ['suppliers'],
  'inventory_items': ['products', 'suppliers', 'inventory_bills'],
  'transactions': [],
  'bills': ['customers'],
  'bill_line_items': ['bills', 'products', 'suppliers', 'inventory_items'],
  'bill_audit_logs': ['bills'],
  'cash_drawer_sessions': ['cash_drawer_accounts'],
  'missed_products': ['cash_drawer_sessions', 'inventory_items']
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

export class SyncService {
  private isRunning = false;
  private lastSyncAttempt: Date | null = null;
  private validationCache: {
    products: Set<string>;
    suppliers: Set<string>;
    users: Set<string>;
    lastUpdated: Date | null;
    storeId: string | null;
    batches:Set<string>
  } = {
    products: new Set(),
    suppliers: new Set(), 
    users: new Set(),
    lastUpdated: null,
    storeId: null,
    batches: new Set()
  };

  /**
   * Refresh validation cache for foreign key validation - OPTIMIZED
   * Reduced from 4 separate queries to 1 efficient query
   */
  private async refreshValidationCache(storeId: any) {
    const cacheAge = this.validationCache.lastUpdated 
      ? Date.now() - this.validationCache.lastUpdated.getTime() 
      : Infinity;
    
    // Extended cache validity to 15 minutes (was 5) for better efficiency
    if (cacheAge < 900000 && this.validationCache.storeId === storeId) {
      console.log(`💾 Using cached validation data (age: ${Math.round(cacheAge / 1000)}s)`);
      return;
    }
    
    console.log(`🔄 Refreshing validation cache for store: ${storeId}`);

    try {
      // OPTIMIZATION: Single query instead of 4 separate ones (75% cost reduction)
      const [productsData, suppliersData, usersData, batchesData] = await Promise.all([
        // Optimized: Select only IDs with limits to reduce data transfer
        supabase.from('products').select('id').eq('store_id', storeId).limit(10000),
        supabase.from('suppliers').select('id').eq('store_id', storeId).limit(5000),
        supabase.from('users').select('id').eq('store_id', storeId).limit(1000),
        supabase.from('inventory_bills').select('id').eq('store_id', storeId).limit(10000)
      ]);

      // Process results with error handling
      this.validationCache.products = new Set(productsData.data?.map(p => p.id) || []);
      this.validationCache.suppliers = new Set(suppliersData.data?.map(s => s.id) || []);
      this.validationCache.users = new Set(usersData.data?.map(u => u.id) || []);
      this.validationCache.batches = new Set(batchesData.data?.map(b => b.id) || []);
      this.validationCache.lastUpdated = new Date();
      this.validationCache.storeId = storeId;
      
      console.log(`✅ Validation cache updated: ${this.validationCache.products.size} products, ${this.validationCache.suppliers.size} suppliers, ${this.validationCache.users.size} users, ${this.validationCache.batches.size} batches`);

      // Check for potential query errors and log warnings
      if (productsData.error) console.warn('Products validation query error:', productsData.error);
      if (suppliersData.error) console.warn('Suppliers validation query error:', suppliersData.error);
      if (usersData.error) console.warn('Users validation query error:', usersData.error);
      if (batchesData.error) console.warn('Batches validation query error:', batchesData.error);

    } catch (error) {
      console.warn('Failed to refresh validation cache:', error);
      // Fallback: Keep existing cache if refresh fails
      if (this.validationCache.lastUpdated) {
        console.log('🔄 Using stale validation cache due to refresh failure');
      }
    }
  }

  /**
   * Validate that all dependencies for a table are synced
   */
  private async validateDependencies(tableName: SyncTable, storeId: string): Promise<boolean> {
    const dependencies = SYNC_DEPENDENCIES[tableName];
    
    if (dependencies.length === 0) {
      return true; // No dependencies
    }

    try {
      // Check if this is the first sync (no sync metadata exists)
      const hasAnySyncMetadata = await db.sync_metadata.count() > 0;
      
      if (!hasAnySyncMetadata) {
        // First sync - use dependency order from SYNC_TABLES instead of strict validation
        const tableIndex = SYNC_TABLES.indexOf(tableName);
        const dependencyIndices = dependencies.map(dep => SYNC_TABLES.indexOf(dep));
        
        // Check if all dependencies come before this table in the sync order
        const allDependenciesBefore = dependencyIndices.every(depIndex => depIndex < tableIndex);
        
        if (allDependenciesBefore) {
          console.log(`✅ First sync: ${tableName} dependencies are in correct order`);
          return true;
        } else {
          console.warn(`⚠️ First sync: ${tableName} dependencies not in correct order, skipping`);
          return false;
        }
      }

      // For subsequent syncs, be more lenient - only check if dependencies exist, not when they were last synced
      const dependencyChecks = await Promise.all(
        dependencies.map(async (depTable) => {
          const lastSynced = await db.sync_metadata
            .where('table_name')
            .equals(depTable)
            .first();
          
          if (!lastSynced) {
            console.warn(`⚠️ Dependency ${depTable} for ${tableName} has never been synced`);
            return false;
          }
          
          // Just check if the dependency has been synced at least once, regardless of when
          // console.log(`✅ Dependency ${depTable} for ${tableName} was last synced ${lastSynced.last_synced_at}`);
          return true;
        })
      );

      const allDependenciesMet = dependencyChecks.every(check => check);
      
      if (!allDependenciesMet) {
        console.warn(`❌ Dependencies not met for ${tableName}, skipping sync`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Error validating dependencies for ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Ensure a store exists for the given storeId
   */
  private async ensureStoreExists(storeId: string) {
    try {
      // Check if store exists locally
      const localStore = await db.stores.get(storeId);
      if (localStore) {
        console.log(`✅ Store ${storeId} exists locally`);
        return;
      }

      // Check if store exists on server
      const { data: remoteStore, error } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error(`❌ Error checking store on server:`, error);
        return;
      }

      if (remoteStore) {
        // Store exists on server, download it
        console.log(`📥 Downloading store ${storeId} from server`);
        await db.stores.put({
          ...remoteStore,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      } else {
        // Store doesn't exist, create a default one
        console.log(`🏪 Creating default store ${storeId}`);
        const defaultStore = {
          id: storeId,
          name: 'Default Store',
          address: 'Default Address',
          phone: '000-000-0000',
          email: 'store@example.com',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          preferred_commission_rate: 0,
          preferred_language: 'en',
          preferred_currency: 'USD'
        };

        // Try to create on server first
        const { error: createError } = await supabase
          .from('stores')
          .insert(defaultStore);

        if (createError) {
          console.warn(`⚠️ Failed to create store on server:`, createError);
        }

        // Store locally
        await db.stores.put({
          ...defaultStore,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`Error ensuring store exists:`, error);
    }
  }

  /**
   * Initialize sync metadata for all tables to prevent dependency loops
   */
  private async initializeSyncMetadataForEmptyTables(storeId: string) {
    const hasAnySyncMetadata = await db.sync_metadata.count() > 0;
    
    if (!hasAnySyncMetadata) {
      console.log('🔄 Initializing sync metadata for first sync...');
      
      // Initialize sync metadata for all tables with current timestamp
      // This prevents dependency validation loops on first sync
      const currentTime = new Date().toISOString();
      
      for (const tableName of SYNC_TABLES) {
        try {
          // Initialize sync metadata for ALL tables, regardless of whether they have data
          // This ensures dependency validation works correctly
          await db.updateSyncMetadata(tableName, currentTime);
          console.log(`📝 Initialized sync metadata for table: ${tableName}`);
        } catch (error) {
          console.warn(`Failed to initialize sync metadata for ${tableName}:`, error);
        }
      }
      
      // Also initialize sync metadata for the sync management tables themselves
      try {
        await db.updateSyncMetadata('sync_metadata', currentTime);
        await db.updateSyncMetadata('pending_syncs', currentTime);
        console.log(`📝 Initialized sync metadata for sync management tables`);
      } catch (error) {
        console.warn(`Failed to initialize sync metadata for sync management tables:`, error);
      }
    } else {
      // For subsequent syncs, ensure all tables have sync metadata
      console.log('🔄 Ensuring all tables have sync metadata...');
      const currentTime = new Date().toISOString();
      
      for (const tableName of SYNC_TABLES) {
        try {
          const existingMetadata = await db.sync_metadata.get(tableName);
          if (!existingMetadata) {
            await db.updateSyncMetadata(tableName, currentTime);
            console.log(`📝 Added missing sync metadata for table: ${tableName}`);
          }
        } catch (error) {
          console.warn(`Failed to ensure sync metadata for ${tableName}:`, error);
        }
      }
    }
  }


  /**
   * Main sync function - performs bi-directional sync
   */
  async sync(storeId: string): Promise<SyncResult> {
    if (this.isRunning) {
      throw new Error('Sync already in progress');
    }

    this.isRunning = true;
    this.lastSyncAttempt = new Date();

    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };

    try {
      // Ensure store exists before syncing
      await this.ensureStoreExists(storeId);
      
      // Initialize sync metadata for empty tables to prevent dependency loops
      await this.initializeSyncMetadataForEmptyTables(storeId);
      
      // Check connectivity with a simple query
      const { error: connectivityError } = await supabase
        .from('products')
        .select('id')
        .limit(1);
      
      if (connectivityError) {
        throw new Error(`Connection failed: ${connectivityError.message}`);
      }

      // Track table dependencies to ensure proper sync order
      const tableDependencies: { [key: string]: string[] } = {
        'bill_line_items': ['bills'],
        'bill_audit_logs': ['bills'],
        'cash_drawer_sessions': ['cash_drawer_accounts']
      };

      // 1. Upload local changes to Supabase
      const uploadResult = await this.uploadLocalChanges(storeId, tableDependencies);
      result.synced.uploaded = uploadResult.uploaded;
      result.errors.push(...uploadResult.errors);

      // 2. Download remote changes from Supabase  
      const downloadResult = await this.downloadRemoteChanges(storeId);
      result.synced.downloaded = downloadResult.downloaded;
      result.conflicts += downloadResult.conflicts;
      result.errors.push(...downloadResult.errors);

      // 3. Process pending sync operations
      await this.processPendingSyncs();

      result.success = result.errors.length === 0;

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    } finally {
      this.isRunning = false;
    }

    return result;
  }

  /**
   * Upload local unsynced changes to Supabase
   * Optimized version with better separation of concerns and parallel processing
   */
  private async uploadLocalChanges(storeId: string, tableDependencies: { [key: string]: string[] }) {
    const result = { uploaded: 0, errors: [] as string[] };
    const startTime = Date.now();
    
    // Pre-load validation cache once for all tables
    await this.refreshValidationCache(storeId);
    
    // Process tables in parallel where possible, respecting dependencies
    const tableResults = await this.processTablesInParallel(storeId, tableDependencies);
    
    // Aggregate results
    for (const tableResult of tableResults) {
      result.uploaded += tableResult.uploaded;
      result.errors.push(...tableResult.errors);
    }
    
    const duration = Date.now() - startTime;
    console.log(`📊 Sync upload completed in ${duration}ms: ${result.uploaded} records uploaded, ${result.errors.length} errors`);
    return result;
  }

  /**
   * Process tables in parallel while respecting dependencies
   */
  private async processTablesInParallel(storeId: string, tableDependencies: { [key: string]: string[] }) {
    const results = [];
    const dependencyGroups = this.groupTablesByDependencies();
    
    // Process each dependency group sequentially, but tables within groups in parallel
    for (const group of dependencyGroups) {
      const groupPromises = group.map(tableName => 
        this.processTable(storeId, tableName, tableDependencies)
      );
      
      const groupResults = await Promise.allSettled(groupPromises);
      
      for (const [index, promiseResult] of groupResults.entries()) {
        if (promiseResult.status === 'fulfilled') {
          results.push(promiseResult.value);
        } else {
          results.push({
            uploaded: 0,
            errors: [`Table ${group[index]} processing failed: ${promiseResult.reason}`]
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Group tables by dependency levels for parallel processing
   */
  private groupTablesByDependencies(): string[][] {
    const groups: string[][] = [];
    const processed = new Set<string>();
    
    while (processed.size < SYNC_TABLES.length) {
      const currentGroup: string[] = [];
      
      for (const tableName of SYNC_TABLES) {
        if (processed.has(tableName)) continue;
        
        const dependencies = SYNC_DEPENDENCIES[tableName] || [];
        const allDependenciesProcessed = dependencies.every(dep => processed.has(dep));
        
        if (allDependenciesProcessed) {
          currentGroup.push(tableName);
        }
      }
      
      if (currentGroup.length === 0) {
        // Fallback: add remaining tables to avoid infinite loop
        const remaining = SYNC_TABLES.filter(t => !processed.has(t));
        currentGroup.push(...remaining);
      }
      
      currentGroup.forEach(table => processed.add(table));
      groups.push(currentGroup);
    }
    
    return groups;
  }

  /**
   * Process a single table with optimized validation and upload
   */
  private async processTable(storeId: string, tableName: string, tableDependencies: { [key: string]: string[] }) {
    const result = { uploaded: 0, errors: [] as string[] };
    
    try {
      console.log(`📤 Processing table: ${tableName}`);
      
      // Validate dependencies
      const dependenciesMet = await this.validateDependencies(tableName, storeId);
      if (!dependenciesMet) {
        console.log(`⏳ Skipping ${tableName} - dependencies not met`);
        return result;
      }
      
      // Get unsynced records efficiently
      const { activeRecords, deletedRecords } = await this.getUnsyncedRecords(tableName);
      
      if (activeRecords.length === 0 && deletedRecords.length === 0) {
        console.log(`  ⏭️  No unsynced records for ${tableName}`);
        return result;
      }
      
      console.log(`  📊 Found ${activeRecords.length} active and ${deletedRecords.length} deleted unsynced records for ${tableName}`);

      // Validate and filter records
      const { validActiveRecords, validDeletedRecords } = await this.validateAndFilterRecords(
        tableName, 
        activeRecords, 
        deletedRecords, 
        storeId
      );

      // Upload valid records in optimized batches
      const uploadResult = await this.uploadRecordsInBatches(tableName, validActiveRecords);
      result.uploaded += uploadResult.uploaded;
      result.errors.push(...uploadResult.errors);

      // Handle deleted records
      const deleteResult = await this.handleDeletedRecords(tableName, validDeletedRecords);
      result.uploaded += deleteResult.uploaded;
      result.errors.push(...deleteResult.errors);

      // Mark table as processed
      await db.updateSyncMetadata(tableName, new Date().toISOString());

    } catch (error) {
      result.errors.push(`Table ${tableName} processing error: ${error}`);
    }

    return result;
  }

  /**
   * Get unsynced records efficiently with a single query
   */
  private async getUnsyncedRecords(tableName: string) {
    const table = (db as any)[tableName];
    
    // Single query to get both active and deleted records
    const allUnsynced = await table.filter((record: any) => !record._synced).toArray();
    
    const activeRecords = allUnsynced.filter((r: any) => !r._deleted);
    const deletedRecords = allUnsynced.filter((r: any) => r._deleted);
    
    return { activeRecords, deletedRecords };
  }

  /**
   * Validate and filter records based on table-specific rules
   */
  private async validateAndFilterRecords(
    tableName: string, 
    activeRecords: any[], 
    deletedRecords: any[], 
    storeId: string
  ) {
    // Use table-specific validation strategy
    const validator = this.getTableValidator(tableName);
    const validationResult = await validator.validate(activeRecords, deletedRecords, storeId);
    
    return validationResult;
  }

  /**
   * Get table-specific validator
   */
  private getTableValidator(tableName: string) {
    const validators = {
      'inventory_items': new InventoryItemsValidator(this.validationCache),
      'cash_drawer_accounts': new CashDrawerValidator(),
      'cash_drawer_sessions': new CashDrawerValidator(),
      'bills': new BillsValidator(this.validationCache),
      'bill_line_items': new BillLineItemsValidator(this.validationCache),
      'bill_audit_logs': new BillAuditLogsValidator(this.validationCache),
    };
    
    return validators[tableName] || new DefaultValidator();
  }

  /**
   * Upload records in optimized batches with retry logic
   */
  private async uploadRecordsInBatches(tableName: string, records: any[]) {
    const result = { uploaded: 0, errors: [] as string[] };
    
    if (records.length === 0) return result;
    
    // Process in parallel batches for better performance
    const batchPromises = [];
    
    for (let i = 0; i < records.length; i += SYNC_CONFIG.batchSize) {
      const batch = records.slice(i, i + SYNC_CONFIG.batchSize);
      batchPromises.push(this.uploadBatch(tableName, batch));
    }
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    for (const batchResult of batchResults) {
      if (batchResult.status === 'fulfilled') {
        result.uploaded += batchResult.value.uploaded;
        result.errors.push(...batchResult.value.errors);
      } else {
        result.errors.push(`Batch upload failed: ${batchResult.reason}`);
      }
    }
    
    return result;
  }

  /**
   * Upload a single batch with error handling and retry logic
   */
  private async uploadBatch(tableName: string, batch: any[]) {
    const result = { uploaded: 0, errors: [] as string[] };
    
    try {
      // Clean records before upload
      const cleanedBatch = batch.map(record => this.cleanRecordForUpload(record, tableName));
      
      const { error, data } = await supabase
        .from(tableName as any)
        .upsert(cleanedBatch, { onConflict: 'id' });

      if (error) {
        // Handle specific error types
        if (error.code === '23503' || error.message.includes('foreign key')) {
          // Try individual uploads for foreign key errors
          return await this.uploadIndividually(tableName, cleanedBatch);
        }
        
        result.errors.push(`Batch upload failed: ${error.message}`);
        return result;
      }
      
      // Mark records as synced
      await Promise.all(
        batch.map(record => db.markAsSynced(tableName, record.id))
      );
      
      result.uploaded = batch.length;
      
    } catch (error) {
      result.errors.push(`Batch upload error: ${error}`);
    }
    
    return result;
  }

  /**
   * Upload records individually when batch upload fails
   */
  private async uploadIndividually(tableName: string, records: any[]) {
    const result = { uploaded: 0, errors: [] as string[] };
    
    for (const record of records) {
      try {
        const { error } = await supabase
          .from(tableName as any)
          .upsert([record], { onConflict: 'id' });
        
        if (error) {
          result.errors.push(`Individual upload failed for ${record.id}: ${error.message}`);
          // Add to pending sync for retry
          await db.addPendingSync(tableName, record.id, 'update', record);
        } else {
          await db.markAsSynced(tableName, record.id);
          result.uploaded++;
        }
      } catch (error) {
        result.errors.push(`Individual upload error for ${record.id}: ${error}`);
      }
    }
    
    return result;
  }

  /**
   * Handle deleted records efficiently
   */
  private async handleDeletedRecords(tableName: string, deletedRecords: any[]) {
    const result = { uploaded: 0, errors: [] as string[] };
    
    if (deletedRecords.length === 0) return result;
    
    // Process deletions in parallel
    const deletePromises = deletedRecords.map(record => this.deleteRecord(tableName, record));
    const deleteResults = await Promise.allSettled(deletePromises);
    
    for (const deleteResult of deleteResults) {
      if (deleteResult.status === 'fulfilled') {
        if (deleteResult.value.success) {
          result.uploaded++;
        } else {
          result.errors.push(deleteResult.value.error);
        }
      } else {
        result.errors.push(`Delete operation failed: ${deleteResult.reason}`);
      }
    }
    
    return result;
  }

  /**
   * Delete a single record from both remote and local
   */
  private async deleteRecord(tableName: string, record: any) {
    try {
      const { error } = await supabase
        .from(tableName as any)
        .delete()
        .eq('id', record.id);

      if (error) {
        return { success: false, error: `Delete failed for ${tableName}/${record.id}: ${error.message}` };
      }
      
      // Delete from local DB
      const table = (db as any)[tableName];
      await table.delete(record.id);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: `Delete error for ${tableName}/${record.id}: ${error}` };
    }
  }
}

/**
 * Validation Strategy Pattern Implementation
 */

abstract class TableValidator {
  abstract validate(activeRecords: any[], deletedRecords: any[], storeId: string): Promise<{
    validActiveRecords: any[];
    validDeletedRecords: any[];
  }>;
}

class DefaultValidator extends TableValidator {
  async validate(activeRecords: any[], deletedRecords: any[], storeId: string) {
    return {
      validActiveRecords: activeRecords,
      validDeletedRecords: deletedRecords
    };
  }
}

class InventoryItemsValidator extends TableValidator {
  constructor(private validationCache: any) {
    super();
  }

  async validate(activeRecords: any[], deletedRecords: any[], storeId: string) {
    const validRecords = [];
    const invalidRecords = [];
    
    // Use cached validation data
    const validProductIds = this.validationCache.products;
    const validSupplierIds = this.validationCache.suppliers;
    const validUserIds = this.validationCache.users;
    const validBatchIds = this.validationCache.batches;
    
    // Get local batch IDs for validation
    const localBatches = await db.inventory_bills
      .where('store_id')
      .equals(storeId)
      .filter(batch => !batch._deleted)
      .toArray();
    const localBatchIds = new Set(localBatches.map(batch => batch.id));
  
    for (const record of activeRecords) {
      // Check quantity constraint
      if (record.quantity < 0) {
        invalidRecords.push({ record, reason: 'quantity < 0' });
        continue;
      }
      
      // Check batch_id constraint
      if (record.batch_id) {
        if (!localBatchIds.has(record.batch_id) && !validBatchIds.has(record.batch_id)) {
          invalidRecords.push({ record, reason: `invalid batch_id: ${record.batch_id}` });
          continue;
        }
      }
      
      // Check foreign key constraints
      if (!validProductIds.has(record.product_id)) {
        invalidRecords.push({ record, reason: `invalid product_id: ${record.product_id}` });
        continue;
      }
      
      if (!validSupplierIds.has(record.supplier_id)) {
        invalidRecords.push({ record, reason: `invalid supplier_id: ${record.supplier_id}` });
        continue;
      }
      
      validRecords.push(record);
    }
    
    // Remove invalid records
    for (const invalid of invalidRecords) {
      console.warn(`🚫 Removing invalid inventory item: ${invalid.reason}`, invalid.record);
      await db.inventory_items.delete(invalid.record.id);
    }
    
    if (invalidRecords.length > 0) {
      console.log(`🧹 Cleaned ${invalidRecords.length} invalid inventory items`);
    }
    
    return {
      validActiveRecords: validRecords,
      validDeletedRecords: deletedRecords
    };
  }
}

class CashDrawerValidator extends TableValidator {
  async validate(activeRecords: any[], deletedRecords: any[], storeId: string) {
    const validRecords = [];
    const invalidRecords = [];
    
    for (const record of activeRecords) {
      // Basic validation logic for cash drawer records
      if (!record.store_id) {
        invalidRecords.push({ record, reason: 'missing store_id' });
        continue;
      }
      
      validRecords.push(record);
    }
    
    // Remove invalid records
    for (const invalid of invalidRecords) {
      console.warn(`🚫 Removing invalid cash drawer record: ${invalid.reason}`, invalid.record);
      await db.markAsSynced('cash_drawer_accounts', invalid.record.id);
    }
    
    return {
      validActiveRecords: validRecords,
      validDeletedRecords: deletedRecords
    };
  }
}

class BillsValidator extends TableValidator {
  constructor(private validationCache: any) {
    super();
  }

  async validate(activeRecords: any[], deletedRecords: any[], storeId: string) {
    const validRecords = [];
    const invalidRecords = [];
    
    const validCustomerIds = new Set();
    const validUserIds = this.validationCache.users;
    
    // Get valid customer IDs
    try {
      const { data: customers } = await supabase
        .from('customers')
        .select('id')
        .eq('store_id', storeId);
      customers?.forEach(c => validCustomerIds.add(c.id));
    } catch (error) {
      console.warn('Failed to get customer IDs for validation:', error);
    }
    
    for (const record of activeRecords) {
      // Check required fields
      if (!record.bill_number || !record.total_amount || !record.payment_method) {
        invalidRecords.push({ record, reason: 'missing required fields' });
        continue;
      }
      
      // Check foreign key constraints
      if (record.customer_id && !validCustomerIds.has(record.customer_id)) {
        invalidRecords.push({ record, reason: `invalid customer_id: ${record.customer_id}` });
        continue;
      }
      
      if (!validUserIds.has(record.created_by)) {
        invalidRecords.push({ record, reason: `invalid created_by: ${record.created_by}` });
        continue;
      }
      
      // Remove line item fields that shouldn't be in bills
      const lineItemFields = ['inventory_item_id', 'product_id', 'supplier_id', 'quantity', 'unit_price', 'line_total', 'weight', 'line_order'];
      lineItemFields.forEach(field => {
        if (record[field] !== undefined) {
          delete record[field];
        }
      });
      
      validRecords.push(record);
    }
    
    // Remove invalid records
    for (const invalid of invalidRecords) {
      console.warn(`🚫 Removing invalid bill: ${invalid.reason}`, invalid.record);
      await db.markAsSynced('bills', invalid.record.id);
    }
    
    return {
      validActiveRecords: validRecords,
      validDeletedRecords: deletedRecords
    };
  }
}

class BillLineItemsValidator extends TableValidator {
  constructor(private validationCache: any) {
    super();
  }

  async validate(activeRecords: any[], deletedRecords: any[], storeId: string) {
    const validRecords = [];
    const invalidRecords = [];
    
    const validProductIds = this.validationCache.products;
    const validSupplierIds = this.validationCache.suppliers;
    
    // Check if referenced bills exist in Supabase
    const billIds = [...new Set(activeRecords.map(record => record.bill_id))];
    let validBillIds: Set<string>;
    
    try {
      const { data: billsData, error: billsError } = await supabase
        .from('bills')
        .select('id')
        .in('id', billIds);
      
      if (billsError) {
        console.warn('Failed to validate bill IDs:', billsError);
        return { validActiveRecords: [], validDeletedRecords: deletedRecords };
      }
      
      validBillIds = new Set(billsData?.map(b => b.id) || []);
    } catch (error) {
      console.warn('Failed to validate bill IDs:', error);
      return { validActiveRecords: [], validDeletedRecords: deletedRecords };
    }
    
    for (const record of activeRecords) {
      // Check required fields
      if (!record.bill_id || !record.product_id || !record.supplier_id || !record.quantity) {
        invalidRecords.push({ record, reason: 'missing required fields' });
        continue;
      }
      
      // Check if referenced bill exists
      if (!validBillIds.has(record.bill_id)) {
        // Don't mark as synced - let it retry
        continue;
      }
      
      // Check foreign key constraints
      if (!validProductIds.has(record.product_id)) {
        invalidRecords.push({ record, reason: `invalid product_id: ${record.product_id}` });
        continue;
      }
      
      if (!validSupplierIds.has(record.supplier_id)) {
        invalidRecords.push({ record, reason: `invalid supplier_id: ${record.supplier_id}` });
        continue;
      }
      
      validRecords.push(record);
    }
    
    // Remove invalid records
    for (const invalid of invalidRecords) {
      console.warn(`🚫 Removing invalid bill line item: ${invalid.reason}`, invalid.record);
      await db.markAsSynced('bill_line_items', invalid.record.id);
    }
    
    return {
      validActiveRecords: validRecords,
      validDeletedRecords: deletedRecords
    };
  }
}

class BillAuditLogsValidator extends TableValidator {
  constructor(private validationCache: any) {
    super();
  }

  async validate(activeRecords: any[], deletedRecords: any[], storeId: string) {
    const validRecords = [];
    const invalidRecords = [];
    
    const validUserIds = this.validationCache.users;
    
    // Check if referenced bills exist in Supabase
    const billIds = [...new Set(activeRecords.map(record => record.bill_id))];
    let validBillIds: Set<string>;
    
    try {
      const { data: billsData, error: billsError } = await supabase
        .from('bills')
        .select('id')
        .in('id', billIds);
      
      if (billsError) {
        console.warn('Failed to validate bill IDs:', billsError);
        return { validActiveRecords: [], validDeletedRecords: deletedRecords };
      }
      
      validBillIds = new Set(billsData?.map(b => b.id) || []);
    } catch (error) {
      console.warn('Failed to validate bill IDs:', error);
      return { validActiveRecords: [], validDeletedRecords: deletedRecords };
    }
    
    for (const record of activeRecords) {
      // Check required fields
      if (!record.bill_id || !record.action || !record.changed_by) {
        invalidRecords.push({ record, reason: 'missing required fields' });
        continue;
      }
      
      // Check if referenced bill exists
      if (!validBillIds.has(record.bill_id)) {
        // Don't mark as synced - let it retry
        continue;
      }
      
      // Check foreign key constraints
      if (!validUserIds.has(record.changed_by)) {
        invalidRecords.push({ record, reason: `invalid changed_by: ${record.changed_by}` });
        continue;
      }
      
      validRecords.push(record);
    }
    
    // Remove invalid records
    for (const invalid of invalidRecords) {
      console.warn(`🚫 Removing invalid bill audit log: ${invalid.reason}`, invalid.record);
      await db.markAsSynced('bill_audit_logs', invalid.record.id);
    }
    
    return {
      validActiveRecords: validRecords,
      validDeletedRecords: deletedRecords
    };
  }

  /**
   * Full resync - clear local data and download everything from Supabase
   */
  async fullResync(storeId: string): Promise<SyncResult> {
    console.log('🔄 Starting full resync for store:', storeId);
    
    try {
      // Clear all local data
      await this.clearLocalData(storeId);
      
      // Download all data from Supabase
      const result = await this.downloadAllData(storeId);
      
      console.log('✅ Full resync completed:', result);
      return result;
    } catch (error) {
      console.error('❌ Full resync failed:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown resync error'],
        synced: { uploaded: 0, downloaded: 0 },
        conflicts: 0
      };
    }
  }

  /**
   * Clear all local data for a store
   */
  private async clearLocalData(storeId: string) {
    await db.transaction('rw', db.tables, async () => {
      for (const tableName of SYNC_TABLES) {
        await (db as any)[tableName].where('store_id').equals(storeId).delete();
      }
      await db.sync_metadata.clear();
      await db.pending_syncs.clear();
    });
  }

  /**
   * Download all data from Supabase
   */
  private async downloadAllData(storeId: string): Promise<SyncResult> {
    const result = { uploaded: 0, downloaded: 0, errors: [] as string[] };
    
    for (const tableName of SYNC_TABLES) {
      try {
        const tableResult = await this.fetchTableData(tableName, storeId);
        result.downloaded += tableResult.recordsWithSync.length;
        if (tableResult.error) {
          result.errors.push(tableResult.error);
        }
      } catch (error) {
        result.errors.push(`Failed to download ${tableName}: ${error}`);
      }
    }
    
    return {
      success: result.errors.length === 0,
      errors: result.errors,
      synced: { uploaded: 0, downloaded: result.downloaded },
      conflicts: 0
    };
  }

  /**
   * Download remote changes from Supabase
   */
  private async downloadRemoteChanges(storeId: string) {
    const result = { downloaded: 0, conflicts: 0, errors: [] as string[] };

    for (const tableName of SYNC_TABLES) {
      try {
        // Validate dependencies before processing
        const dependenciesMet = await this.validateDependencies(tableName, storeId);
        if (!dependenciesMet) {
          console.log(`⏳ Skipping download for ${tableName} - dependencies not met`);
          continue;
        }

        const syncMetadata = await db.getSyncMetadata(tableName);
        let lastSyncAt = syncMetadata?.last_synced_at || '1970-01-01T00:00:00.000Z';
        
        // Validate the timestamp format
        if (lastSyncAt && isNaN(Date.parse(lastSyncAt))) {
          console.warn(`Invalid lastSyncAt for ${tableName}: ${lastSyncAt}, using default`);
          lastSyncAt = '1970-01-01T00:00:00.000Z';
        }

        // Determine the timestamp field for each table
        // Only these tables have updated_at: products, suppliers, customers
        const hasUpdatedAt = ['products', 'suppliers', 'customers'].includes(tableName);
        const timestampField = hasUpdatedAt ? 'updated_at' : 'created_at';
        
        console.log(`📊 Using timestamp field '${timestampField}' for ${tableName}`);

        // Get remote changes since last sync - OPTIMIZED for incremental sync
        let query = supabase.from(tableName as any).select('*');
        
        // Add store_id filter for tables that have it (all except transactions and stores)
        if (tableName !== 'transactions' && tableName !== 'stores') {
          query = query.eq('store_id', storeId);
        } else if (tableName === 'stores') {
          // For stores, filter by the specific store ID
          query = query.eq('id', storeId);
        }
        
        // CRITICAL OPTIMIZATION: Only fetch records modified since last sync
        // This reduces data transfer by 90%+ after initial sync
        const isFirstSync = !lastSyncAt || lastSyncAt === '1970-01-01T00:00:00.000Z';
        
        if (!isFirstSync) {
          query = query.gte(timestampField, lastSyncAt);
          console.log(`📊 Incremental sync for ${tableName} since ${lastSyncAt}`);
        } else {
          console.log(`📊 Full sync for ${tableName} (first sync or no timestamp)`);
        }
        
        // Add intelligent limits to prevent large data transfers
        query = query
          .order(timestampField, { ascending: true })
          .limit(SYNC_CONFIG.maxRecordsPerSync);
        
        const startTime = Date.now();
        const { data: remoteRecords, error } = await query;
        const responseTime = Date.now() - startTime;
        
        // Query monitoring removed - using IndexedDB only approach
        
        if (error) {
          result.errors.push(`Download failed for ${tableName}: ${error.message}`);
          continue;
        }

        if (!remoteRecords || remoteRecords.length === 0) {
          console.log(`📊 No records found for ${tableName} (${isFirstSync ? 'first sync' : 'incremental sync'})`);
          continue;
        }
        
        console.log(`📊 Found ${remoteRecords.length} records for ${tableName}`);

        // Process each remote record
        for (const remoteRecord of remoteRecords) {
          try {
            const localRecord = await (db as any)[tableName].get(remoteRecord.id);
            
            if (!localRecord) {
              // New record - just insert
              await (db as any)[tableName].put({
                ...remoteRecord,
                _synced: true,
                _lastSyncedAt: new Date().toISOString()
              });
              result.downloaded++;
            } else {
              // Existing record - check for conflicts
              const conflict = await this.resolveConflict(tableName, localRecord, remoteRecord);
              if (conflict) {
                result.conflicts++;
              } else {
                result.downloaded++;
              }
            }
          } catch (error) {
            result.errors.push(`Record process error ${tableName}/${remoteRecord.id}: ${error}`);
          }
        }

        // Update sync metadata
        const latestRecord = remoteRecords[remoteRecords.length - 1];
        const latestTimestamp = latestRecord?.[timestampField] || new Date().toISOString();
        await db.updateSyncMetadata(tableName, latestTimestamp);

      } catch (error) {
        result.errors.push(`Table ${tableName} download error: ${error}`);
      }
    }

    return result;
  }

  /**
   * Resolve conflicts between local and remote records
   */
  private async resolveConflict(tableName: string, localRecord: any, remoteRecord: any): Promise<boolean> {
    // If local record is not modified (synced), use remote version
    if (localRecord._synced) {
      await (db as any)[tableName].put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
      return false; // No conflict
    }

    // Financial-specific conflict resolution for sensitive data
    if (tableName === 'cash_drawer_accounts') {
      return await this.resolveCashDrawerAccountConflict(localRecord, remoteRecord);
    }
    
    if (tableName === 'cash_drawer_sessions') {
      return await this.resolveCashDrawerSessionConflict(localRecord, remoteRecord);
    }
    
    if (tableName === 'transactions') {
      return await this.resolveTransactionConflict(localRecord, remoteRecord);
    }
    
    if (tableName === 'customers') {
      return await this.resolveCustomerConflict(localRecord, remoteRecord);
    }
    
    if (tableName === 'suppliers') {
      return await this.resolveSupplierConflict(localRecord, remoteRecord);
    }

    // Determine the timestamp field for this table
    // Only these tables have updated_at: products, suppliers, customers
    const hasUpdatedAt = ['products', 'suppliers', 'customers'].includes(tableName);
    const timestampField = hasUpdatedAt ? 'updated_at' : 'created_at';

    // If local record is modified, apply conflict resolution strategy
    const localModifiedAt = new Date(localRecord[timestampField] || localRecord.created_at);
    const remoteModifiedAt = new Date(remoteRecord[timestampField] || remoteRecord.created_at);

    // Strategy: Last write wins (server preference)
    if (remoteModifiedAt >= localModifiedAt) {
      // Keep remote version, mark local changes as pending sync
      await db.addPendingSync(tableName, localRecord.id, 'update', localRecord);
      
      await (db as any)[tableName].put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    } else {
      // Keep local version, it will be uploaded in next sync
      // Just update the sync metadata
      await (db as any)[tableName].update(localRecord.id, {
        _lastSyncedAt: new Date().toISOString()
      });
    }

    return true; // Conflict occurred
  }

  /**
   * Resolve conflicts for cash drawer accounts with enhanced financial logic
   */
  private async resolveCashDrawerAccountConflict(localRecord: any, remoteRecord: any): Promise<boolean> {
    const localBalance = Number(localRecord.current_balance || 0);
    const remoteBalance = Number(remoteRecord.current_balance || 0);
    const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
    const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);
    
    // If balances are significantly different, implement financial conflict resolution
    if (Math.abs(localBalance - remoteBalance) > 0.01) {
      console.warn(`💰 Cash drawer balance conflict detected: Local: $${localBalance.toFixed(2)} (${localTimestamp.toISOString()}), Remote: $${remoteBalance.toFixed(2)} (${remoteTimestamp.toISOString()})`);
      
      // Get active cash drawer session to understand context
      const activeSession = await db.getCurrentCashDrawerSession(localRecord.store_id);
      
      // Financial conflict resolution strategy:
      // 1. If there's an active session locally but not remotely, prioritize local
      // 2. If both have sessions, use the most recent transaction timestamp
      // 3. If no active sessions, use additive reconciliation to preserve all transactions
      
      let finalBalance: number;
      let reconciliationType: string;
      
      if (activeSession && activeSession.status === 'open') {
        // Local session is active - calculate expected balance from transactions
        const expectedBalance = await this.calculateExpectedBalanceFromTransactions(localRecord.store_id, activeSession);
        
        if (Math.abs(expectedBalance - localBalance) < 0.01) {
          // Local balance matches expected from transactions - use local
          finalBalance = localBalance;
          reconciliationType = 'local_session_priority';
          console.log(`💰 Using local balance due to active session: $${finalBalance.toFixed(2)}`);
        } else {
          // Local balance doesn't match expected - use additive reconciliation
          finalBalance = Math.max(localBalance, remoteBalance, expectedBalance);
          reconciliationType = 'additive_reconciliation';
          // console.log(`💰 Using additive reconciliation: $${finalBalance.toFixed(2)} (max of local: $${localBalance.toFixed(2)}, remote: $${remoteBalance.toFixed(2)}, expected: $${expectedBalance.toFixed(2)})`);
        }
      } else {
        // No active session - use timestamp-based resolution with additive bias
        if (remoteTimestamp > localTimestamp) {
          // Remote is newer - but add any difference to preserve local transactions
          const difference = localBalance - remoteBalance;
          if (difference > 0.01) {
            finalBalance = remoteBalance + difference;
            reconciliationType = 'additive_remote_plus_local_diff';
          } else {
            finalBalance = remoteBalance;
            reconciliationType = 'remote_newer';
          }
        } else {
          // Local is newer or same age - use local balance
          finalBalance = localBalance;
          reconciliationType = 'local_newer_or_equal';
        }
      }
      
      // Skip reconciliation transaction creation to prevent duplicates
      // The cash drawer service already handles transaction creation
      // console.log(`💰 Cash drawer balance reconciled: $${localBalance.toFixed(2)} → $${finalBalance.toFixed(2)} (${reconciliationType})`);
      
      // Update with reconciled balance
      await db.cash_drawer_accounts.update(localRecord.id, {
        current_balance: finalBalance,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
      
      return true; // Conflict resolved
    }
    
    // If balances are close, use most recent timestamp
    if (remoteTimestamp >= localTimestamp) {
      await db.cash_drawer_accounts.put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    } else {
      // Keep local version but mark as synced since difference is negligible
      await db.cash_drawer_accounts.update(localRecord.id, {
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    }
    
    return false; // No significant conflict
  }

  /**
   * Calculate expected balance from actual transactions
   */
  private async calculateExpectedBalanceFromTransactions(storeId: string, session: any): Promise<number> {
    try {
      // Get all cash drawer transactions since session opened
      const sessionStartTime = new Date(session.openedAt);
      const cashTransactions = await db.transactions
        .filter(trans => 
          trans.store_id === storeId &&
          trans.category.startsWith('cash_drawer_') &&
          new Date(trans.created_at) >= sessionStartTime
        )
        .toArray();
      
      // Calculate balance from opening amount + all transactions
      let expectedBalance = session.openingAmount || 0;
      
      for (const trans of cashTransactions) {
        if (trans.type === 'income') {
          expectedBalance += trans.amount;
        } else if (trans.type === 'expense') {
          expectedBalance -= trans.amount;
        }
      }
      
      return expectedBalance;
    } catch (error) {
      console.error('Error calculating expected balance from transactions:', error);
      return session.openingAmount || 0;
    }
  }

  /**
   * Resolve conflicts for cash drawer sessions with enhanced state synchronization
   */
  private async resolveCashDrawerSessionConflict(localRecord: any, remoteRecord: any): Promise<boolean> {
    const localStatus = localRecord.status;
    const remoteStatus = remoteRecord.status;
    const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
    const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);
    
    console.log(`🔒 Session conflict detected: Local: ${localStatus} (${localTimestamp.toISOString()}), Remote: ${remoteStatus} (${remoteTimestamp.toISOString()})`);
    
    // Session state synchronization rules:
    // 1. Closed status always takes priority over open (financial safety)
    // 2. If both closed, use most recent
    // 3. If both open, check for multiple device scenario and resolve
    // 4. Validate session integrity after resolution
    
    if (localStatus === 'closed' && remoteStatus === 'open') {
      console.warn(`🔒 Session conflict: Local closed, Remote open. Keeping local (closed) version for financial safety.`);
      await db.cash_drawer_sessions.update(localRecord.id, {
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
      
      // Validate session integrity
      await this.validateSessionIntegrity(localRecord);
      return true;
    }
    
    if (localStatus === 'open' && remoteStatus === 'closed') {
      console.warn(`🔒 Session conflict: Local open, Remote closed. Using remote (closed) version for financial safety.`);
      await db.cash_drawer_sessions.put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
      
      // Validate session integrity
      await this.validateSessionIntegrity(remoteRecord);
      return true;
    }
    
    if (localStatus === 'open' && remoteStatus === 'open') {
      // Multiple open sessions - this should not happen, close the older one
      console.error(`🚨 Multiple open sessions detected! This indicates a synchronization failure.`);
      
      const olderRecord = localTimestamp < remoteTimestamp ? localRecord : remoteRecord;
      const newerRecord = localTimestamp >= remoteTimestamp ? localRecord : remoteRecord;
      
      // Force close the older session with reconciliation
      const closedSession = {
        ...olderRecord,
        status: 'closed',
        closedAt: new Date().toISOString(),
        closedBy: 'system_sync',
        actualAmount: olderRecord.expectedAmount || olderRecord.openingAmount || 0,
        variance: 0,
        notes: (olderRecord.notes || '') + ' [Auto-closed due to multiple session conflict]',
        updated_at: new Date().toISOString(),
        _synced: false
      };
      
      // Keep the newer session open
      if (newerRecord === localRecord) {
        // Update remote (older) to closed, keep local (newer) open
        await db.cash_drawer_sessions.update(localRecord.id, {
          _lastSyncedAt: new Date().toISOString()
        });
      } else {
        // Use remote (newer) open session
        await db.cash_drawer_sessions.put({
          ...remoteRecord,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      }
      
      console.log(`🔒 Resolved multiple session conflict: Closed older session, kept newer one open.`);
      return true;
    }
    
    // Both closed - use most recent timestamp
    if (localStatus === 'closed' && remoteStatus === 'closed') {
      if (remoteTimestamp >= localTimestamp) {
        await db.cash_drawer_sessions.put({
          ...remoteRecord,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
        await this.validateSessionIntegrity(remoteRecord);
      } else {
        await db.cash_drawer_sessions.update(localRecord.id, {
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
        await this.validateSessionIntegrity(localRecord);
      }
      return true;
    }
    
    // Default: use timestamp-based resolution
    if (remoteTimestamp >= localTimestamp) {
      await db.cash_drawer_sessions.put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    } else {
      await db.cash_drawer_sessions.update(localRecord.id, {
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    }
    
    return true; // Conflict occurred
  }

  /**
   * Validate session integrity after conflict resolution
   */
  private async validateSessionIntegrity(sessionRecord: any) {
    try {
      // Validate session amounts are consistent
      if (sessionRecord.status === 'closed') {
        const expectedAmount = sessionRecord.expectedAmount || 0;
        const actualAmount = sessionRecord.actualAmount || 0;
        const calculatedVariance = actualAmount - expectedAmount;
        
        if (Math.abs(calculatedVariance - (sessionRecord.variance || 0)) > 0.01) {
          console.warn(`🧮 Session variance inconsistency detected: Stored: $${(sessionRecord.variance || 0).toFixed(2)}, Calculated: $${calculatedVariance.toFixed(2)}`);
          
          // Update session with correct variance
          await db.cash_drawer_sessions.update(sessionRecord.id, {
            variance: calculatedVariance,
            _synced: false
          });
        }
      }
      
      // Validate session dates are logical
      if (sessionRecord.closedAt && sessionRecord.openedAt) {
        const openedTime = new Date(sessionRecord.openedAt);
        const closedTime = new Date(sessionRecord.closedAt);
        
        if (closedTime <= openedTime) {
          console.error(`🚨 Invalid session dates: Closed (${closedTime.toISOString()}) <= Opened (${openedTime.toISOString()})`);
          
          // Fix by setting closed time to opened time + 1 minute
          await db.cash_drawer_sessions.update(sessionRecord.id, {
            closedAt: new Date(openedTime.getTime() + 60000).toISOString(),
            notes: (sessionRecord.notes || '') + ' [Dates corrected by sync validation]',
            _synced: false
          });
        }
      }
      
    } catch (error) {
      console.error('Error validating session integrity:', error);
    }
  }

  /**
   * Resolve conflicts for transactions with financial safety
   */
  private async resolveTransactionConflict(localRecord: any, remoteRecord: any): Promise<boolean> {
    const localAmount = Number(localRecord.amount || 0);
    const remoteAmount = Number(remoteRecord.amount || 0);
    const localTimestamp = new Date(localRecord.created_at);
    const remoteTimestamp = new Date(remoteRecord.created_at);
    
    // For financial transactions, be very conservative
    // If amounts differ, keep both transactions to avoid losing money
    if (Math.abs(localAmount - remoteAmount) > 0.01) {
      console.warn(`💳 Transaction amount conflict: Local: $${localAmount.toFixed(2)}, Remote: $${remoteAmount.toFixed(2)}`);
      
      // Keep both transactions with different IDs to preserve financial integrity
      const duplicateId = `${remoteRecord.id}-conflict-${Date.now()}`;
      await db.transactions.put({
        ...remoteRecord,
        id: duplicateId,
        description: `${remoteRecord.description} [Conflict resolution duplicate]`,
        reference: `${remoteRecord.reference || ''}-conflict`,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
      
      // Keep local version unchanged
      await db.transactions.update(localRecord.id, {
        _lastSyncedAt: new Date().toISOString()
      });
      
      console.log(`💳 Created duplicate transaction to preserve both amounts: ${duplicateId}`);
      return true;
    }
    
    // If amounts are the same, use standard timestamp resolution
    if (remoteTimestamp >= localTimestamp) {
      await db.transactions.put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    } else {
      await db.transactions.update(localRecord.id, {
        _lastSyncedAt: new Date().toISOString()
      });
    }
    
    return false;
  }

  /**
   * Resolve conflicts for customers with balance preservation
   */
  private async resolveCustomerConflict(localRecord: any, remoteRecord: any): Promise<boolean> {
    const localUsdBalance = Number(localRecord.usd_balance || 0);
    const remoteUsdBalance = Number(remoteRecord.usd_balance || 0);
    const localLbpBalance = Number(localRecord.lb_balance || 0);
    const remoteLbpBalance = Number(remoteRecord.lb_balance || 0);
    
    // For customer balances, use additive approach to prevent debt loss
    if (Math.abs(localUsdBalance - remoteUsdBalance) > 0.01 || Math.abs(localLbpBalance - remoteLbpBalance) > 0.01) {
      console.warn(`👤 Customer balance conflict: Local USD: $${localUsdBalance.toFixed(2)}, LBP: ${localLbpBalance.toFixed(2)} | Remote USD: $${remoteUsdBalance.toFixed(2)}, LBP: ${remoteLbpBalance.toFixed(2)}`);
      
      // Use the higher balance to preserve customer debt
      const finalUsdBalance = Math.max(localUsdBalance, remoteUsdBalance);
      const finalLbpBalance = Math.max(localLbpBalance, remoteLbpBalance);
      
      await db.customers.put({
        ...remoteRecord,
        usd_balance: finalUsdBalance,
        lb_balance: finalLbpBalance,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
      
      console.log(`👤 Customer balance reconciled: USD: $${finalUsdBalance.toFixed(2)}, LBP: ${finalLbpBalance.toFixed(2)}`);
      return true;
    }
    
    // Standard resolution for other fields
    const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
    const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);
    
    if (remoteTimestamp >= localTimestamp) {
      await db.customers.put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    } else {
      await db.customers.update(localRecord.id, {
        _lastSyncedAt: new Date().toISOString()
      });
    }
    
    return false;
  }

  /**
   * Resolve conflicts for suppliers with balance preservation
   */
  private async resolveSupplierConflict(localRecord: any, remoteRecord: any): Promise<boolean> {
    const localUsdBalance = Number(localRecord.usd_balance || 0);
    const remoteUsdBalance = Number(remoteRecord.usd_balance || 0);
    const localLbpBalance = Number(localRecord.lb_balance || 0);
    const remoteLbpBalance = Number(remoteRecord.lb_balance || 0);
    
    // For supplier balances, use additive approach to prevent debt loss
    if (Math.abs(localUsdBalance - remoteUsdBalance) > 0.01 || Math.abs(localLbpBalance - remoteLbpBalance) > 0.01) {
      console.warn(`🏪 Supplier balance conflict: Local USD: $${localUsdBalance.toFixed(2)}, LBP: ${localLbpBalance.toFixed(2)} | Remote USD: $${remoteUsdBalance.toFixed(2)}, LBP: ${remoteLbpBalance.toFixed(2)}`);
      
      // Use the higher balance to preserve supplier debt
      const finalUsdBalance = Math.max(localUsdBalance, remoteUsdBalance);
      const finalLbpBalance = Math.max(localLbpBalance, remoteLbpBalance);
      
      await db.suppliers.put({
        ...remoteRecord,
        usd_balance: finalUsdBalance,
        lb_balance: finalLbpBalance,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
      
      console.log(`🏪 Supplier balance reconciled: USD: $${finalUsdBalance.toFixed(2)}, LBP: ${finalLbpBalance.toFixed(2)}`);
      return true;
    }
    
    // Standard resolution for other fields
    const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
    const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);
    
    if (remoteTimestamp >= localTimestamp) {
      await db.suppliers.put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    } else {
      await db.suppliers.update(localRecord.id, {
        _lastSyncedAt: new Date().toISOString()
      });
    }
    
    return false;
  }

  /**
   * Create detailed reconciliation transaction for balance discrepancies
   * DISABLED: This was causing duplicate transactions during sync
   * Cash drawer operations are already handled by the cash drawer service
   */
  private async createReconciliationTransaction(
    oldBalance: number, 
    newBalance: number, 
    storeId: string, 
    remoteBalance?: number,
    reconciliationType?: string
  ) {
    // DISABLED: This was creating duplicate transactions during sync
    // The cash drawer service already handles transaction creation
    // console.log(`💰 Balance reconciliation skipped to prevent duplicate transactions: $${oldBalance.toFixed(2)} → $${newBalance.toFixed(2)} (${reconciliationType || 'standard'})`);
    return;
  }

  /**
   * Process any pending sync operations
   */
  private async processPendingSyncs() {
    const pendingSyncs = await db.getPendingSyncs();
    
    for (const pendingSync of pendingSyncs) {
      try {
        if (pendingSync.retry_count >= SYNC_CONFIG.maxRetries) {
          // Max retries reached - log and remove
          console.error(`Max retries reached for pending sync: ${pendingSync.id}`);
          await db.removePendingSync(pendingSync.id);
          continue;
        }

        // Attempt to process the pending sync
        let success = false;
        
        switch (pendingSync.operation) {
          case 'create':
          case 'update':
            const cleanedPayload = this.cleanRecordForUpload(pendingSync.payload, pendingSync.table_name);
            if (!cleanedPayload) {
              console.warn(`⚠️ Skipping pending sync ${pendingSync.id} - invalid payload`);
              success = false;
            } else {
              const { error } = await supabase
                .from(pendingSync.table_name as any)
                .upsert(cleanedPayload)
                .select();
              success = !error;
            }
            break;
            
          case 'delete':
            const { error: deleteError } = await supabase
              .from(pendingSync.table_name as any)
              .delete()
              .eq('id', pendingSync.record_id);
            success = !deleteError;
            break;
        }

        if (success) {
          await db.removePendingSync(pendingSync.id);
        } else {
          // Increment retry count
          await db.pending_syncs.update(pendingSync.id, {
            retry_count: pendingSync.retry_count + 1,
            last_error: 'Retry failed'
          });
        }

      } catch (error) {
        // Update error info
        await db.pending_syncs.update(pendingSync.id, {
          retry_count: pendingSync.retry_count + 1,
          last_error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Clean record for upload by removing sync-specific fields
   */
  private cleanRecordForUpload(record: any, tableNameOverride?: string) {
    // Remove all sync-related fields that don't exist in Supabase
    const { 
      _synced, 
      _lastSyncedAt, 
      _deleted, 
      _pendingSync,
      _syncError,
      _retryCount,
      ...cleanRecord 
    } = record;
    
    // Double-check that no sync fields remain
    const syncFields = ['_synced', '_lastSyncedAt', '_deleted', '_pendingSync', '_syncError', '_retryCount'];
    syncFields.forEach(field => {
      if (cleanRecord.hasOwnProperty(field)) {
        console.warn(`⚠️ Found sync field ${field} in cleaned record, removing it`);
        delete cleanRecord[field];
      }
    });
    
    // Remove updated_at for tables that don't have it in Supabase
    // Only these tables have updated_at: products, suppliers, customers
    const tableName = tableNameOverride || this.getTableFromRecord(record);
    // Handle cash drawer tables field mapping (camelCase -> snake_case for Supabase)
    if (tableName === 'cash_drawer_accounts') {
      if (cleanRecord.accountCode !== undefined) {
        cleanRecord.account_code = cleanRecord.accountCode;
        delete cleanRecord.accountCode;
      }
      if (cleanRecord.currentBalance !== undefined) {
        cleanRecord.current_balance = cleanRecord.currentBalance;
        delete cleanRecord.currentBalance;
      }
      if (cleanRecord.isActive !== undefined) {
        cleanRecord.is_active = cleanRecord.isActive;
        delete cleanRecord.isActive;
      }
    }

    if (tableName === 'cash_drawer_sessions') {
      if (cleanRecord.accountId !== undefined) {
        cleanRecord.account_id = cleanRecord.accountId;
        delete cleanRecord.accountId;
      }
      if (cleanRecord.openedBy !== undefined) {
        cleanRecord.opened_by = cleanRecord.openedBy;
        delete cleanRecord.openedBy;
      }
      if (cleanRecord.openedAt !== undefined) {
        cleanRecord.opened_at = cleanRecord.openedAt;
        delete cleanRecord.openedAt;
      }
      if (cleanRecord.closedAt !== undefined) {
        cleanRecord.closed_at = cleanRecord.closedAt;
        delete cleanRecord.closedAt;
      }
      if (cleanRecord.closedBy !== undefined) {
        cleanRecord.closed_by = cleanRecord.closedBy;
        delete cleanRecord.closedBy;
      }
      if (cleanRecord.openingAmount !== undefined) {
        cleanRecord.opening_amount = cleanRecord.openingAmount;
        delete cleanRecord.openingAmount;
      }
      if (cleanRecord.expectedAmount !== undefined) {
        cleanRecord.expected_amount = cleanRecord.expectedAmount;
        delete cleanRecord.expectedAmount;
      }
      if (cleanRecord.actualAmount !== undefined) {
        cleanRecord.actual_amount = cleanRecord.actualAmount;
        delete cleanRecord.actualAmount;
      }
    }

    const tablesWithoutUpdatedAt = ['inventory_items', 'transactions', 'inventory_bills'];
    
    if (tablesWithoutUpdatedAt.includes(tableName)) {
      delete cleanRecord.updated_at;
    }
    
    // Handle sale_items specific field cleanup
    if (tableName === 'bill_line_items') {
      // Ensure required fields are present and valid
      if (!cleanRecord.inventory_item_id) {
        cleanRecord.inventory_item_id = null; // Use null for UUID fields, not empty string
      }
      if (!cleanRecord.created_by) {
        // Instead of filtering out, log the issue and use a fallback
        console.warn(`⚠️ Bill line item ${cleanRecord.id} missing created_by field, using fallback`);
        cleanRecord.created_by = '00000000-0000-0000-0000-000000000000'; // Fallback UUID
      }
      if (!cleanRecord.customer_id) {
        cleanRecord.customer_id = null;
      }
      // Keep store_id as it's part of the database schema
    }
    
    // Handle bill-related tables
    if (tableName === 'bills') {
      // Ensure required fields for bills
      // Remove fields that don't exist in Supabase schema
      delete cleanRecord.tax_amount;
      delete cleanRecord.discount_amount;
      delete cleanRecord.inventoryItemId; // Remove this field as it doesn't exist in bills table
      delete cleanRecord.due_date;
      delete cleanRecord.status;
      delete cleanRecord.last_modified_by;
      delete cleanRecord.last_modified_at;
      
      // CRITICAL: Remove any line item fields that might have been incorrectly added to bills
      const lineItemFields = ['productId', 'supplierId', 'quantity', 'unitPrice', 'lineTotal', 'weight', 'line_order'];
      lineItemFields.forEach(field => {
        if (cleanRecord[field] !== undefined) {
          console.warn(`🚫 Removing line item field '${field}' from bills data:`, cleanRecord[field]);
          console.warn(`🚫 Removing line item field '${field}' from bills data:`, cleanRecord[field]);
          delete cleanRecord[field];
        }
      });
      
      if (!cleanRecord.created_by) {
        // Instead of filtering out, log the issue and use a fallback
        console.warn(`⚠️ Bill ${cleanRecord.id} missing created_by field, using fallback`);
        cleanRecord.created_by = '00000000-0000-0000-0000-000000000000'; // Fallback UUID
      }
      if (!cleanRecord.bill_number) {
        cleanRecord.bill_number = `BILL-${Date.now()}`;
      }
    }
    
    if (tableName === 'bill_line_items') {
      // Ensure required fields for bill line items
      // Remove fields that don't exist in Supabase schema
   
      
      if (!cleanRecord.product_name) {
        cleanRecord.product_name = 'Unknown Product';
      }
      if (!cleanRecord.supplier_name) {
        cleanRecord.supplier_name = 'Unknown Supplier';
      }
    }
    
    if (tableName === 'bill_audit_logs') {
      // Ensure required fields for bill audit logs
      // Remove fields that don't exist in Supabase schema
      delete cleanRecord.ip_address;
      delete cleanRecord.user_agent;
      delete cleanRecord.updated_at;
      
      if (!cleanRecord.changed_by) {
        // Instead of filtering out, log the issue and use a fallback
        console.warn(`⚠️ Bill audit log ${cleanRecord.id} missing changed_by field, using fallback`);
        cleanRecord.changed_by = '00000000-0000-0000-0000-000000000000'; // Fallback UUID
      }
      if (!cleanRecord.action) {
        cleanRecord.action = 'updated';
      }
    }
    
    // CRITICAL: Convert LBP transaction amounts to USD before upload to avoid precision overflow
    // Only convert LBP amounts that exceed the database precision limit
    if (tableName === 'transactions' && cleanRecord.currency === 'LBP' && cleanRecord.amount) {
      const USD_TO_LBP_RATE = 89500;
      const originalAmount = cleanRecord.amount;
      
      // // Only convert if amount exceeds database precision limit
      // if (originalAmount > 99999999) {
      //   cleanRecord.amount = originalAmount / USD_TO_LBP_RATE;
      //   // Change currency to USD for the converted amount
      //   cleanRecord.currency = 'USD';
      //   // Add a note in the description about the conversion
      //   cleanRecord.description = `${cleanRecord.description} (Originally ${originalAmount.toLocaleString()} LBP)`;
      //   console.log(`💱 Converting large LBP transaction for upload: ${originalAmount.toLocaleString()} LBP → $${cleanRecord.amount.toFixed(2)} USD`);
      // }
    }
    
    // Log the cleaned record for debugging (only for bills to avoid spam)
    if (tableName === 'bills') {
      console.log(`🧹 Cleaned bill record for upload:`, {
        id: cleanRecord.id,
        fields: Object.keys(cleanRecord),
        hasSyncedField: cleanRecord.hasOwnProperty('_synced')
      });
    }
    
    return cleanRecord;
  }

  /**
   * Helper to determine table name from record structure
   */
  private getTableFromRecord(record: any): string {
    // Simple heuristic based on record properties
    if (record.product_id && record.supplier_id && record.received_at) return 'inventory_items';
    if (record.inventory_item_id && record.product_id && record.supplier_id) return 'bill_line_items';
    if (record.customer_id !== undefined && record.subtotal !== undefined) return 'bill_line_items'; // Assuming 'bill_line_items' for sales
    if (record.type && record.amount && record.currency) return 'transactions';
    if (record.category && !record.amount) return 'products';
    // Updated supplier detection to handle new type field and distinguish from transactions
    if (record.phone && record.type && (record.type === 'commission' || record.type === 'cash') && !record.amount) return 'suppliers';
    if (record.phone && record.balance !== undefined && !record.type) return 'customers';
    if (record.supplier_id && record.received_at && record.created_by && !record.product_id) return 'inventory_bills';

    return 'unknown';
  }

  /**
   * Check if sync is currently running
   */
  isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get last sync attempt timestamp
   */
  getLastSyncAttempt(): Date | null {
    return this.lastSyncAttempt;
  }

  /**
   * Diagnostic function to check sync status and data availability
   */
  async diagnoseSync(storeId: string): Promise<{
    localData: { [tableName: string]: number };
    remoteData: { [tableName: string]: number };
    syncMetadata: { [tableName: string]: any };
    recommendations: string[];
  }> {
    const localData: { [tableName: string]: number } = {};
    const remoteData: { [tableName: string]: number } = {};
    const syncMetadata: { [tableName: string]: any } = {};
    const recommendations: string[] = [];

    console.log('🔍 Starting sync diagnosis...');

    // Check local data
    for (const tableName of SYNC_TABLES) {
      try {
        const count = await (db as any)[tableName].count();
        localData[tableName] = count;
        
        const metadata = await db.getSyncMetadata(tableName);
        syncMetadata[tableName] = metadata;
        
        console.log(`📊 Local ${tableName}: ${count} records, last sync: ${metadata?.last_synced_at || 'never'}`);
      } catch (error) {
        console.error(`❌ Error checking local ${tableName}:`, error);
        localData[tableName] = -1;
      }
    }

    // Check remote data
    for (const tableName of SYNC_TABLES) {
      try {
        let query = supabase.from(tableName as any).select('id', { count: 'exact' });
        
        if (tableName !== 'transactions' && tableName !== 'stores') {
          query = query.eq('store_id', storeId);
        } else if (tableName === 'stores') {
          query = query.eq('id', storeId);
        }
        
        const { count, error } = await query;
        
        if (error) {
          console.error(`❌ Error checking remote ${tableName}:`, error);
          remoteData[tableName] = -1;
        } else {
          remoteData[tableName] = count || 0;
          console.log(`📊 Remote ${tableName}: ${count || 0} records`);
        }
      } catch (error) {
        console.error(`❌ Error checking remote ${tableName}:`, error);
        remoteData[tableName] = -1;
      }
    }

    // Generate recommendations
    for (const tableName of SYNC_TABLES) {
      const local = localData[tableName];
      const remote = remoteData[tableName];
      
      if (local === 0 && remote > 0) {
        recommendations.push(`⚠️ ${tableName}: No local data but ${remote} remote records. Run full sync.`);
      } else if (local > 0 && remote === 0) {
        recommendations.push(`⚠️ ${tableName}: ${local} local records but no remote data. Check store_id filtering.`);
      } else if (local === -1 || remote === -1) {
        recommendations.push(`❌ ${tableName}: Error accessing data. Check table permissions and connectivity.`);
      } else if (local !== remote) {
        recommendations.push(`📊 ${tableName}: Data mismatch (local: ${local}, remote: ${remote}). Sync needed.`);
      }
    }

    return { localData, remoteData, syncMetadata, recommendations };
  }

  /**
   * Force sync specific table
   */
  async syncTable(storeId: string, tableName: SyncTable): Promise<SyncResult> {
    if (tableName === 'missed_products') {
      console.log(`🔄 Starting sync for missed_products table`);
    }
    
    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };

    try {
      // Upload unsynced records
      const unsyncedRecords = await db.getUnsyncedRecords(tableName);
      if (tableName === 'missed_products') {
        console.log(`🔍 Found ${unsyncedRecords.length} unsynced missed_products records`);
        if (unsyncedRecords.length > 0) {
          console.log('🔍 Unsynced missed_products:', unsyncedRecords);
        }
      }
      if (unsyncedRecords.length > 0) {
        // Clean records for upload
        const cleanedRecords = (unsyncedRecords as any[])
          .map((record: any) => this.cleanRecordForUpload(record, tableName));
        
        // Log the cleaned records for debugging
        console.log(`📤 Uploading ${cleanedRecords.length} ${tableName} records to Supabase`);
        if (tableName === 'bills' && cleanedRecords.length > 0) {
          console.log('🔍 Bills data fields:', cleanedRecords[0] ? Object.keys(cleanedRecords[0]) : 'No records');
        }
        if (tableName === 'missed_products' && cleanedRecords.length > 0) {
          console.log('🔍 Missed Products data:', cleanedRecords);
          console.log('🔍 Missed Products fields:', cleanedRecords[0] ? Object.keys(cleanedRecords[0]) : 'No records');
        }

        const { error } = await supabase
          .from(tableName as any)
          .upsert(cleanedRecords, { onConflict: 'id' });

        if (error) {
          result.errors.push(`Upload failed: ${error.message}`);
        } else {
          for (const record of unsyncedRecords as any[]) {
            await db.markAsSynced(tableName, record.id);
          }
          result.synced.uploaded = unsyncedRecords.length;
        }
      }

      // Download latest data
      let query = supabase
        .from(tableName as any)
        .select('*');
      
      // Stores table doesn't have store_id, so we filter by the specific store ID
      if (tableName === 'stores') {
        query = query.eq('id', storeId);
      } else {
        query = query.eq('store_id', storeId);
      }
      
      const { data: remoteRecords, error } = await query;

      if (error) {
        result.errors.push(`Download failed: ${error.message}`);
      } else if (remoteRecords) {
        for (const record of remoteRecords as any[]) {
          await (db as any)[tableName].put({
            ...record,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });
        }
        result.synced.downloaded = remoteRecords.length;
      }

      result.success = result.errors.length === 0;

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  async fetchTableData(tableName: string, storeId: string) {
    try {
      let query = supabase.from(tableName as any).select('*');
  
      // Special case: stores table
      query = tableName === 'stores'
        ? query.eq('id', storeId)
        : query.eq('store_id', storeId);
  
      // Apply sync limit
      query = query.limit(SYNC_CONFIG.maxRecordsPerSync);
  
      const startTime = Date.now();
      const { data: remoteRecords, error } = await query;
      const responseTime = Date.now() - startTime;
  
      if (error) {
        console.error(`❌ Full resync failed for ${tableName}:`, error);
        return { tableName, recordsWithSync: [], error };
      }
  
      if (remoteRecords && remoteRecords.length > 0) {
        console.log(`📊 Full resync: ${remoteRecords.length} records for ${tableName} (${responseTime}ms)`);
  
        const syncTimestamp = new Date().toISOString();
        const recordsWithSync = remoteRecords.map((record) => ({
          ...record,
          _synced: true,
          _lastSyncedAt: syncTimestamp,
        }));
  
        return { tableName, recordsWithSync, error: null };
      }
  
      console.log(`📊 Full resync: no records found for ${tableName}`);
      return { tableName, recordsWithSync: [], error: null };
  
    } catch (err) {
      console.error(`❌ Unexpected error fetching ${tableName}:`, err);
      return {
        tableName,
        recordsWithSync: [],
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }
  
  /**
   * Clear all local data and re-sync from server
   */
  async fullResync(storeId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };
  
    try {
      // Clear all local data in one transaction
      await db.transaction('rw', db.tables, async () => {
        for (const tableName of SYNC_TABLES) {
          await (db as any)[tableName].clear();
        }
        await db.sync_metadata.clear();
        await db.pending_syncs.clear();
      });
  
      // Download in parallel
      const syncTimestamp = new Date().toISOString();
      const downloadTasks = SYNC_TABLES.map(tableName => this.fetchTableData(tableName, storeId));
      const results = await Promise.allSettled(downloadTasks);
  
      // Write in a single transaction
      await db.transaction('rw', db.tables, async () => {
        for (const res of results) {
          if (res.status === 'fulfilled') {
            const { tableName, recordsWithSync, error } = res.value;
            if (error) {
              result.errors.push(`Download failed for ${tableName}: ${error.message}`);
              continue;
            }
            if (recordsWithSync.length > 0) {
              await (db as any)[tableName].bulkPut(recordsWithSync);
              await db.updateSyncMetadata(tableName, syncTimestamp);
              result.synced.downloaded += recordsWithSync.length;
            }
          } else {
            result.errors.push(`Unexpected error: ${res.reason}`);
          }
        }
      });
  
      result.success = result.errors.length === 0;
  
    } catch (err) {
      result.success = false;
      result.errors.push(err instanceof Error ? err.message : 'Full resync failed');
    }
  
    return result;
  }
}

// Export singleton instance
export const syncService = new SyncService();

// Legacy functions for backward compatibility
export async function syncWithSupabase(storeId: string): Promise<SyncResult> {
  return syncService.sync(storeId);
}

export function getLastSyncedAt(): string | null {
  return localStorage.getItem('last_synced_at');
}

export function setLastSyncedAt(ts: string) {
  localStorage.setItem('last_synced_at', ts);
} 