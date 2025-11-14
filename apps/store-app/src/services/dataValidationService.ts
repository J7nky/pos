// Centralized validation service to eliminate redundancy across syncService and OfflineDataContext
import { db } from '../lib/db';

interface ValidationCache {
  products: Set<string>;
  suppliers: Set<string>;
  customers: Set<string>;
  users: Set<string>;
  batches: Set<string>;
  bills: Set<string>;
  lastUpdated: Date | null;
  storeId: string | null;
  // Delta tracking for incremental updates
  lastSyncTimestamps: Record<string, string>;
  recordCounts: Record<string, number>;
}

interface ValidationResult {
  isValid: boolean;
  errors: Array<{ record: any; reason: string }>;
}

interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'uuid';
  min?: number;
  max?: number;
  enum?: any[];
  foreignKey?: { table: string; cacheKey: keyof ValidationCache };
}

// Table-specific validation rules configuration
const VALIDATION_RULES: Record<string, ValidationRule[]> = {
  inventory_items: [
    { field: 'quantity', required: true, type: 'number', min: 0 },
    { field: 'product_id', required: true, type: 'uuid', foreignKey: { table: 'products', cacheKey: 'products' } },
    // supplier_id REMOVED: now resolved via inventory_bills -> batch_id
    { field: 'batch_id', type: 'uuid', foreignKey: { table: 'inventory_bills', cacheKey: 'batches' } },
  ],
  bills: [
    { field: 'bill_number', required: true, type: 'string' },
    { field: 'total_amount', required: true, type: 'number', min: 0 },
    { field: 'payment_method', required: true, enum: ['cash', 'card', 'credit'] },
    { field: 'created_by', required: true, type: 'uuid', foreignKey: { table: 'users', cacheKey: 'users' } },
    { field: 'customer_id', type: 'uuid', foreignKey: { table: 'customers', cacheKey: 'customers' } },
  ],
  bill_line_items: [
    { field: 'bill_id', required: true, type: 'uuid', foreignKey: { table: 'bills', cacheKey: 'bills' } },
    { field: 'product_id', required: true, type: 'uuid', foreignKey: { table: 'products', cacheKey: 'products' } },
    { field: 'supplier_id', required: true, type: 'uuid', foreignKey: { table: 'suppliers', cacheKey: 'suppliers' } },
    { field: 'quantity', required: true, type: 'number', min: 0 },
  ],
  bill_audit_logs: [
    { field: 'bill_id', required: true, type: 'uuid', foreignKey: { table: 'bills', cacheKey: 'bills' } },
    { field: 'action', required: true, type: 'string' },
    { field: 'changed_by', required: true, type: 'uuid', foreignKey: { table: 'users', cacheKey: 'users' } },
  ],
  cash_drawer_accounts: [
    { field: 'store_id', required: true, type: 'uuid' },
    { field: 'account_code', required: true, type: 'string' },
    { field: 'name', required: true, type: 'string' },
    { field: 'currency', required: true, enum: ['USD', 'LBP'] },
    { field: 'current_balance', type: 'number' },
  ],
  cash_drawer_sessions: [
    { field: 'store_id', required: true, type: 'uuid' },
    { field: 'account_id', required: true, type: 'uuid' },
    { field: 'opened_by', required: true, type: 'uuid' },
    { field: 'opened_at', required: true, type: 'string' },
    { field: 'status', required: true, enum: ['open', 'closed'] },
    { field: 'opening_amount', type: 'number', min: 0 },
    { field: 'expected_amount', type: 'number' },
    { field: 'actual_amount', type: 'number' },
  ],
};

export class DataValidationService {
  private cache: ValidationCache = {
    products: new Set(),
    suppliers: new Set(),
    customers: new Set(),
    users: new Set(),
    batches: new Set(),
    bills: new Set(),
    lastUpdated: null,
    storeId: null,
    lastSyncTimestamps: {},
    recordCounts: {},
  };

  private cacheExpiry = 900000; // 15 minutes
  private isRefreshing = false; // Prevent concurrent refreshes
  private refreshPromise: Promise<void> | null = null;

  /**
   * Refresh validation cache from Supabase
   * OPTIMIZED: Uses delta-based refresh and pagination for large datasets
   */
  async refreshCache(storeId: string, supabase: any, force: boolean = false): Promise<void> {
    // If already refreshing, wait for that operation to complete
    if (this.isRefreshing && this.refreshPromise) {
      console.log(`⏳ Cache refresh already in progress, waiting...`);
      return this.refreshPromise;
    }

    const cacheAge = this.cache.lastUpdated 
      ? Date.now() - this.cache.lastUpdated.getTime() 
      : Infinity;

    // Skip refresh if cache is still valid and not forced
    if (!force && cacheAge < this.cacheExpiry && this.cache.storeId === storeId) {
      console.log(`💾 Using cached validation data (age: ${Math.round(cacheAge / 1000)}s)`);
      return;
    }

    // Start refresh
    this.isRefreshing = true;
    const refreshStart = performance.now();
    
    this.refreshPromise = (async () => {
      try {
        const isFirstRefresh = !this.cache.lastUpdated || this.cache.storeId !== storeId;
        
        if (isFirstRefresh) {
          console.log(`🔄 Full validation cache refresh for store: ${storeId}`);
          await this.fullCacheRefresh(storeId, supabase);
        } else {
          console.log(`⚡ Delta validation cache refresh for store: ${storeId}`);
          const deltaSuccess = await this.deltaCacheRefresh(storeId, supabase);
          
          // Fallback to full refresh if delta fails
          if (!deltaSuccess) {
            console.log(`⚠️ Delta refresh failed, falling back to full refresh`);
            await this.fullCacheRefresh(storeId, supabase);
          }
        }
        
        this.cache.lastUpdated = new Date();
        this.cache.storeId = storeId;
        
        const refreshTime = performance.now() - refreshStart;
        console.log(`✅ Validation cache updated in ${refreshTime.toFixed(2)}ms: ${this.cache.products.size} products, ${this.cache.suppliers.size} suppliers, ${this.cache.users.size} users`);
      } catch (error) {
        console.warn('Failed to refresh validation cache:', error);
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();
    
    return this.refreshPromise;
  }

  /**
   * Full cache refresh with pagination for large tables
   */
  private async fullCacheRefresh(storeId: string, supabase: any): Promise<void> {
    const tables = [
      { name: 'products', cacheKey: 'products', filter: `store_id.eq.${storeId},is_global.eq.true`, useOr: true },
      { name: 'suppliers', cacheKey: 'suppliers', filter: 'store_id', value: storeId },
      { name: 'customers', cacheKey: 'customers', filter: 'store_id', value: storeId },
      { name: 'users', cacheKey: 'users', filter: 'store_id', value: storeId },
      { name: 'inventory_bills', cacheKey: 'batches', filter: 'store_id', value: storeId },
      { name: 'bills', cacheKey: 'bills', filter: 'store_id', value: storeId },
    ];

    for (const table of tables) {
      const ids = await this.fetchAllIds(supabase, table.name, table.filter, table.value, table.useOr);
      (this.cache as any)[table.cacheKey] = new Set(ids);
      this.cache.recordCounts[table.cacheKey] = ids.length;
    }
  }

  /**
   * Delta-based cache refresh - only fetch changes since last update
   */
  private async deltaCacheRefresh(storeId: string, supabase: any): Promise<boolean> {
    try {
      const tables = [
        { name: 'products', cacheKey: 'products', hasUpdatedAt: true },
        { name: 'suppliers', cacheKey: 'suppliers', hasUpdatedAt: true },
        { name: 'customers', cacheKey: 'customers', hasUpdatedAt: true },
        { name: 'users', cacheKey: 'users', hasUpdatedAt: true },
        { name: 'inventory_bills', cacheKey: 'batches', hasUpdatedAt: false },
        { name: 'bills', cacheKey: 'bills', hasUpdatedAt: true },
      ];

      for (const table of tables) {
        const lastTimestamp = this.cache.lastSyncTimestamps[table.cacheKey] || '1970-01-01T00:00:00.000Z';
        const timestampField = table.hasUpdatedAt ? 'updated_at' : 'created_at';
        
        // Fetch only records updated since last refresh
        let query = supabase
          .from(table.name)
          .select('id')
          .gte(timestampField, lastTimestamp);
        
        if (table.name === 'products') {
          query = query.or(`store_id.eq.${storeId},is_global.eq.true`);
        } else {
          query = query.eq('store_id', storeId);
        }
        
        const { data, error } = await query.limit(5000);
        
        if (error) {
          console.warn(`Delta refresh failed for ${table.name}:`, error);
          return false;
        }
        
        // Update cache with new/updated IDs
        if (data && data.length > 0) {
          const cacheSet = (this.cache as any)[table.cacheKey] as Set<string>;
          data.forEach((record: any) => cacheSet.add(record.id));
          console.log(`  ⚡ ${table.name}: Added ${data.length} new/updated IDs to cache`);
        }
        
        this.cache.lastSyncTimestamps[table.cacheKey] = new Date().toISOString();
      }
      
      return true;
    } catch (error) {
      console.warn('Delta cache refresh error:', error);
      return false;
    }
  }

  /**
   * Fetch all IDs with pagination to avoid memory issues
   */
  private async fetchAllIds(
    supabase: any,
    tableName: string,
    filter: string,
    value?: string,
    useOr: boolean = false
  ): Promise<string[]> {
    const allIds: string[] = [];
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase.from(tableName).select('id');
      
      if (useOr) {
        query = query.or(filter);
      } else if (value) {
        query = query.eq(filter, value);
      }
      
      query = query.range(offset, offset + pageSize - 1);
      
      const { data, error } = await query;
      
      if (error) {
        console.warn(`Error fetching ${tableName} IDs:`, error);
        break;
      }
      
      if (data && data.length > 0) {
        allIds.push(...data.map((r: any) => r.id));
        hasMore = data.length === pageSize;
        offset += pageSize;
      } else {
        hasMore = false;
      }
      
      // Safety limit
      if (offset > 50000) {
        console.warn(`⚠️ ${tableName}: Reached pagination limit (50k records)`);
        break;
      }
    }
    
    return allIds;
  }

  /**
   * Invalidate specific cache entries (event-driven)
   */
  invalidateCacheEntry(cacheKey: keyof ValidationCache, id: string): void {
    if (this.cache[cacheKey] instanceof Set) {
      (this.cache[cacheKey] as Set<string>).delete(id);
    }
  }

  /**
   * Add entry to cache (event-driven)
   */
  addCacheEntry(cacheKey: keyof ValidationCache, id: string): void {
    if (this.cache[cacheKey] instanceof Set) {
      (this.cache[cacheKey] as Set<string>).add(id);
    }
  }

  /**
   * Validate records for a specific table
   */
  async validateRecords(tableName: string, records: any[], storeId: string): Promise<ValidationResult> {
    const rules = VALIDATION_RULES[tableName];
    if (!rules) {
      return { isValid: true, errors: [] };
    }

    const validRecords: any[] = [];
    const invalidRecords: Array<{ record: any; reason: string }> = [];

    for (const record of records) {
      const validationErrors = await this.validateRecord(record, rules, storeId);
      
      if (validationErrors.length > 0) {
        invalidRecords.push({
          record,
          reason: validationErrors.join(', ')
        });
      } else {
        validRecords.push(record);
      }
    }

    return {
      isValid: invalidRecords.length === 0,
      errors: invalidRecords
    };
  }

  /**
   * Validate a single record against rules
   */
  private async validateRecord(record: any, rules: ValidationRule[], storeId: string): Promise<string[]> {
    const errors: string[] = [];

    for (const rule of rules) {
      const value = record[rule.field];

      // Check required fields
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`Missing required field: ${rule.field}`);
        continue;
      }

      // Skip validation if field is not required and not present
      if (!rule.required && (value === undefined || value === null)) {
        continue;
      }

      // Type validation
      if (rule.type === 'number' && isNaN(Number(value))) {
        errors.push(`Invalid ${rule.field}: must be a number`);
        continue;
      }

      // Range validation
      if (rule.type === 'number' && rule.min !== undefined && Number(value) < rule.min) {
        errors.push(`Invalid ${rule.field}: must be >= ${rule.min}`);
      }

      if (rule.type === 'number' && rule.max !== undefined && Number(value) > rule.max) {
        errors.push(`Invalid ${rule.field}: must be <= ${rule.max}`);
      }

      // Enum validation
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push(`Invalid ${rule.field}: must be one of ${rule.enum.join(', ')}`);
      }

      // Foreign key validation
      if (rule.foreignKey && value) {
        const cacheSet = this.cache[rule.foreignKey.cacheKey];
        
        // Also check local database (especially important for users table which might not filter by store_id)
        let localExists = null;
        try {
          localExists = await (db as any)[rule.foreignKey.table].get(value);
        } catch (error) {
          console.warn(`Could not check local ${rule.foreignKey.table} for ${value}:`, error);
        }
        
        if (!cacheSet.has(value) && !localExists) {
          console.warn(`⚠️ Foreign key validation failed for ${rule.field}: ${value} not found in cache (${cacheSet.size} items) or local ${rule.foreignKey.table}`);
          errors.push(`Invalid ${rule.field}: referenced ${rule.foreignKey.table} not found`);
        } else if (localExists && !cacheSet.has(value)) {
          console.log(`✅ ${rule.field} ${value} found in local ${rule.foreignKey.table} (not in cache)`);
        }
      }
    }

    return errors;
  }

  /**
   * Auto-fix common validation issues
   */
  async autoFixRecord(tableName: string, record: any, storeId: string): Promise<any | null> {
    if (tableName === 'inventory_items') {
      // Fix negative quantity
      if (record.quantity < 0) {
        record.quantity = 0;
      }

      // Fix missing product - use first available (include global products)
      if (!await db.products.get(record.product_id)) {
        // Try store-specific products first
        let validProduct = await db.products
          .where('store_id')
          .equals(storeId)
          .filter(p => !p._deleted)
          .first();
        
        // If no store products, try global products
        if (!validProduct) {
          validProduct = await db.products
            .where('is_global')
            .equals(1)
            .filter(p => !p._deleted)
            .first();
        }
        
        if (validProduct) {
          record.product_id = validProduct.id;
        } else {
          return null; // Cannot fix
        }
      }

      // supplier_id REMOVED from inventory_items - now accessed via inventory_bills -> batch_id
      // Remove supplier_id if present (legacy data cleanup)
      if (record.supplier_id) {
        delete record.supplier_id;
      }

      // Fix invalid batch reference
      if (record.batch_id && !await db.inventory_bills.get(record.batch_id)) {
        record.batch_id = null;
      }
    }

    return record;
  }

  /**
   * Clean record for Supabase upload - remove sync fields and invalid columns
   */
  cleanRecordForUpload(record: any, tableName: string): any {
    // Remove all sync-related fields
    const { 
      _synced, 
      _lastSyncedAt, 
      _deleted, 
      _pendingSync,
      _syncError,
      _retryCount,
      ...cleanRecord 
    } = record;

    // Table-specific cleaning
    if (tableName === 'bills') {
      delete cleanRecord.tax_amount;
      delete cleanRecord.discount_amount;
      delete cleanRecord.inventoryItemId;
      delete cleanRecord.due_date;
      delete cleanRecord.status;
      delete cleanRecord.last_modified_by;
      delete cleanRecord.last_modified_at;
      
      // Remove any line item fields from bills
      const lineItemFields = ['productId', 'supplierId', 'quantity', 'unitPrice', 'lineTotal', 'weight', 'line_order', 'inventory_item_id', 'product_id', 'supplier_id', 'unit_price', 'line_total'];
      lineItemFields.forEach(field => delete cleanRecord[field]);
    }

    if (tableName === 'bill_line_items') {
      cleanRecord.product_name = cleanRecord.product_name || 'Unknown Product';
      cleanRecord.supplier_name = cleanRecord.supplier_name || 'Unknown Supplier';
      cleanRecord.inventory_item_id = cleanRecord.inventory_item_id || null;
      cleanRecord.customer_id = cleanRecord.customer_id || null;
    }

    if (tableName === 'bill_audit_logs') {
      // Remove fields that don't exist in database schema
      delete cleanRecord.ip_address;
      delete cleanRecord.user_agent;
      // Keep updated_at - it exists in the schema
    }

    if (tableName === 'transactions') {
      delete cleanRecord.status; // Remove status field that doesn't exist in Supabase schema
    }

    if (tableName === 'inventory_bills') {
      // Ensure required fields have default values
      if (!cleanRecord.status) {
        cleanRecord.status = 'Created';
      }
      if (!cleanRecord.type) {
        cleanRecord.type = 'commission';
      }
      // Remove local-only currency field (not in Supabase schema)
      delete (cleanRecord as any).currency;
      // Remove fields that don't exist in the database schema
      delete cleanRecord.plastic_count;
      delete cleanRecord.plastic_price;
    }

    if (tableName === 'inventory_items') {
      // Remove local-only currency field (not in Supabase schema)
      delete (cleanRecord as any).currency;
      // CRITICAL: Remove supplier_id from inventory_items - it was removed from schema
      // Supplier is now accessed via inventory_bills -> batch_id
      delete cleanRecord.supplier_id;
    }

    // Remove updated_at for tables without it
    const tablesWithoutUpdatedAt = ['inventory_items', 'transactions', 'inventory_bills', 'bill_line_items', 'bill_audit_logs'];
    if (tablesWithoutUpdatedAt.includes(tableName)) {
      delete cleanRecord.updated_at;
    }

    // Ensure users table balance fields are properly handled
    // lbp_balance and usd_balance are preserved during sync (not removed)
    if (tableName === 'users') {
      // Convert empty strings to null for numeric fields to prevent Supabase errors
      if (cleanRecord.lbp_balance === undefined || cleanRecord.lbp_balance === '') {
        cleanRecord.lbp_balance = null;
      }
      if (cleanRecord.usd_balance === undefined || cleanRecord.usd_balance === '') {
        cleanRecord.usd_balance = null;
      }
      // Clean other optional text fields
      if (cleanRecord.phone === '') cleanRecord.phone = null;
      if (cleanRecord.address === '') cleanRecord.address = null;
      if (cleanRecord.monthly_salary === '') cleanRecord.monthly_salary = null;
      if (cleanRecord.working_hours_start === '') cleanRecord.working_hours_start = null;
      if (cleanRecord.working_hours_end === '') cleanRecord.working_hours_end = null;
      if (cleanRecord.working_days === '') cleanRecord.working_days = null;
      
      // Ensure role is properly set (not using role value as a field)
      if (!cleanRecord.role || typeof cleanRecord.role !== 'string') {
        console.error('❌ Invalid role in user record:', cleanRecord);
        // Try to fix: if there's a 'cashier' or 'manager' or 'admin' field, use it as role
        if (cleanRecord.cashier !== undefined) {
          cleanRecord.role = 'cashier';
          delete cleanRecord.cashier;
        } else if (cleanRecord.manager !== undefined) {
          cleanRecord.role = 'manager';
          delete cleanRecord.manager;
        } else if (cleanRecord.admin !== undefined) {
          cleanRecord.role = 'admin';
          delete cleanRecord.admin;
        }
      }
      
      // Clean up any role-value fields that shouldn't be there
      delete cleanRecord.cashier;
      delete cleanRecord.manager;
      delete cleanRecord.admin;
      
      console.log('🧹 Cleaned user record for upload:', cleanRecord);
    }

    // Handle cash drawer field mapping (camelCase -> snake_case)
    if (tableName === 'cash_drawer_accounts' || tableName === 'cash_drawer_sessions') {
      const fieldMappings: Record<string, string> = {
        accountCode: 'account_code',
        currentBalance: 'current_balance',
        isActive: 'is_active',
        accountId: 'account_id',
        openedBy: 'opened_by',
        openedAt: 'opened_at',
        closedAt: 'closed_at',
        closedBy: 'closed_by',
        openingAmount: 'opening_amount',
        expectedAmount: 'expected_amount',
        actualAmount: 'actual_amount',
      };

      Object.entries(fieldMappings).forEach(([camel, snake]) => {
        if (cleanRecord[camel] !== undefined) {
          cleanRecord[snake] = cleanRecord[camel];
          delete cleanRecord[camel];
        }
      });
    }

    return cleanRecord;
  }
}

export const dataValidationService = new DataValidationService();