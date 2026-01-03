// Centralized validation service to eliminate redundancy across syncService and OfflineDataContext
import { getDB } from '../lib/db';

// Get singleton database instance
const db = getDB();

interface ValidationCache {
  products: Set<string>;
  suppliers: Set<string>; // Entity IDs with entity_type = 'supplier'
  customers: Set<string>; // Entity IDs with entity_type = 'customer'
  entities: Set<string>; // All entity IDs (for general entity validation)
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
  foreignKey?: { table: string; cacheKey: keyof ValidationCache; entityType?: 'customer' | 'supplier' };
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
    // total_amount, subtotal, amount_due REMOVED - computed dynamically
    { field: 'payment_method', required: true, enum: ['cash', 'card', 'credit'] },
    { field: 'amount_paid', required: true, type: 'number', min: 0 },
    { field: 'created_by', required: true, type: 'uuid', foreignKey: { table: 'users', cacheKey: 'users' } },
    { field: 'customer_id', type: 'uuid', foreignKey: { table: 'entities', cacheKey: 'customers', entityType: 'customer' } },
  ],
  bill_line_items: [
    { field: 'bill_id', required: true, type: 'uuid', foreignKey: { table: 'bills', cacheKey: 'bills' } },
    { field: 'product_id', required: true, type: 'uuid', foreignKey: { table: 'products', cacheKey: 'products' } },
    // supplier_id, supplier_name, product_name, payment_method, customer_id, created_by REMOVED
    { field: 'quantity', required: true, type: 'number', min: 0 },
    { field: 'unit_price', required: true, type: 'number', min: 0 },
    { field: 'line_total', required: true, type: 'number', min: 0 },
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
  inventory_bills: [
    { field: 'store_id', required: true, type: 'uuid' },
    { field: 'supplier_id', required: true, type: 'uuid', foreignKey: { table: 'entities', cacheKey: 'suppliers', entityType: 'supplier' } },
    { field: 'created_by', required: true, type: 'uuid', foreignKey: { table: 'users', cacheKey: 'users' } },
  ],
};

export class DataValidationService {
  private cache: ValidationCache = {
    products: new Set(),
    suppliers: new Set(), // Entity IDs with entity_type = 'supplier'
    customers: new Set(), // Entity IDs with entity_type = 'customer'
    entities: new Set(), // All entity IDs
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
        console.log(`✅ Validation cache updated in ${refreshTime.toFixed(2)}ms: ${this.cache.products.size} products, ${this.cache.suppliers.size} suppliers, ${this.cache.customers.size} customers, ${this.cache.entities.size} entities, ${this.cache.users.size} users`);
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
   * UPDATED: Uses entities table instead of customers/suppliers tables
   */
  private async fullCacheRefresh(storeId: string, supabase: any): Promise<void> {
    // Fetch products (store-specific + global)
    const productIds = await this.fetchAllIds(supabase, 'products', `store_id.eq.${storeId},is_global.eq.true`, undefined, true);
    this.cache.products = new Set(productIds);
    this.cache.recordCounts['products'] = productIds.length;

    // Fetch entities and split by type (offline-first: check local first, then Supabase)
    const allEntityIds: string[] = [];
    const supplierIds: string[] = [];
    const customerIds: string[] = [];

    // First, try to get from local IndexedDB (offline-first)
    try {
      const localEntities = await getDB().entities
        .where('store_id')
        .equals(storeId)
        .toArray();
      
      localEntities.forEach(entity => {
        allEntityIds.push(entity.id);
        if (entity.entity_type === 'supplier') {
          supplierIds.push(entity.id);
        } else if (entity.entity_type === 'customer') {
          customerIds.push(entity.id);
        }
      });
    } catch (error) {
      console.warn('Could not fetch entities from local DB:', error);
    }

    // Then fetch from Supabase to ensure we have all entities
    try {
      const supabaseEntityIds = await this.fetchAllIds(supabase, 'entities', 'store_id', storeId);
      supabaseEntityIds.forEach(id => {
        if (!allEntityIds.includes(id)) {
          allEntityIds.push(id);
        }
      });

      // Fetch entity types from Supabase to categorize
      const { data: entitiesData, error } = await supabase
        .from('entities')
        .select('id, entity_type')
        .eq('store_id', storeId);

      if (!error && entitiesData) {
        entitiesData.forEach((entity: any) => {
          if (entity.entity_type === 'supplier' && !supplierIds.includes(entity.id)) {
            supplierIds.push(entity.id);
          } else if (entity.entity_type === 'customer' && !customerIds.includes(entity.id)) {
            customerIds.push(entity.id);
          }
        });
      }
    } catch (error) {
      console.warn('Could not fetch entities from Supabase:', error);
    }

    this.cache.entities = new Set(allEntityIds);
    this.cache.suppliers = new Set(supplierIds);
    this.cache.customers = new Set(customerIds);
    this.cache.recordCounts['entities'] = allEntityIds.length;
    this.cache.recordCounts['suppliers'] = supplierIds.length;
    this.cache.recordCounts['customers'] = customerIds.length;

    // Fetch other tables
    const otherTables = [
      { name: 'users', cacheKey: 'users', filter: 'store_id', value: storeId },
      { name: 'inventory_bills', cacheKey: 'batches', filter: 'store_id', value: storeId },
      { name: 'bills', cacheKey: 'bills', filter: 'store_id', value: storeId },
    ];

    for (const table of otherTables) {
      const ids = await this.fetchAllIds(supabase, table.name, table.filter, table.value, false);
      (this.cache as any)[table.cacheKey] = new Set(ids);
      this.cache.recordCounts[table.cacheKey] = ids.length;
    }
  }

  /**
   * Delta-based cache refresh - only fetch changes since last update
   * UPDATED: Uses entities table instead of customers/suppliers tables
   */
  private async deltaCacheRefresh(storeId: string, supabase: any): Promise<boolean> {
    try {
      // Handle products
      const productsLastTimestamp = this.cache.lastSyncTimestamps['products'] || '1970-01-01T00:00:00.000Z';
      let productsQuery = supabase
        .from('products')
        .select('id')
        .gte('updated_at', productsLastTimestamp)
        .or(`store_id.eq.${storeId},is_global.eq.true`)
        .limit(5000);
      
      const { data: productsData, error: productsError } = await productsQuery;
      if (productsError) {
        console.warn('Delta refresh failed for products:', productsError);
        return false;
      }
      if (productsData && productsData.length > 0) {
        productsData.forEach((record: any) => this.cache.products.add(record.id));
        console.log(`  ⚡ products: Added ${productsData.length} new/updated IDs to cache`);
      }
      this.cache.lastSyncTimestamps['products'] = new Date().toISOString();

      // Handle entities (replaces customers and suppliers)
      const entitiesLastTimestamp = this.cache.lastSyncTimestamps['entities'] || '1970-01-01T00:00:00.000Z';
      const { data: entitiesData, error: entitiesError } = await supabase
        .from('entities')
        .select('id, entity_type')
        .eq('store_id', storeId)
        .gte('updated_at', entitiesLastTimestamp)
        .limit(5000);
      
      if (entitiesError) {
        console.warn('Delta refresh failed for entities:', entitiesError);
        return false;
      }
      
      if (entitiesData && entitiesData.length > 0) {
        entitiesData.forEach((entity: any) => {
          this.cache.entities.add(entity.id);
          if (entity.entity_type === 'supplier') {
            this.cache.suppliers.add(entity.id);
          } else if (entity.entity_type === 'customer') {
            this.cache.customers.add(entity.id);
          }
        });
        console.log(`  ⚡ entities: Added ${entitiesData.length} new/updated IDs to cache`);
      }
      this.cache.lastSyncTimestamps['entities'] = new Date().toISOString();

      // Handle other tables
      const otherTables = [
        { name: 'users', cacheKey: 'users', hasUpdatedAt: true },
        { name: 'inventory_bills', cacheKey: 'batches', hasUpdatedAt: false },
        { name: 'bills', cacheKey: 'bills', hasUpdatedAt: true },
      ];

      for (const table of otherTables) {
        const lastTimestamp = this.cache.lastSyncTimestamps[table.cacheKey] || '1970-01-01T00:00:00.000Z';
        const timestampField = table.hasUpdatedAt ? 'updated_at' : 'created_at';
        
        const { data, error } = await supabase
          .from(table.name)
          .select('id')
          .eq('store_id', storeId)
          .gte(timestampField, lastTimestamp)
          .limit(5000);
        
        if (error) {
          console.warn(`Delta refresh failed for ${table.name}:`, error);
          return false;
        }
        
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
        // Handle case where table doesn't exist (e.g., customers/suppliers migrated to entities)
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log(`ℹ️ Table ${tableName} does not exist (may have been migrated). Skipping...`);
          return []; // Return empty array - validation will fall back to local IndexedDB
        }
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
        
        // For entities table, also validate entity_type if specified
        let localExists = null;
        try {
          if (rule.foreignKey.table === 'entities') {
            // Check local entities table with entity_type filter if specified
            const entity = await getDB().entities.get(value);
            if (entity) {
              // Validate entity_type matches if specified
              if (rule.foreignKey.entityType && entity.entity_type !== rule.foreignKey.entityType) {
                errors.push(`Invalid ${rule.field}: entity ${value} is not of type '${rule.foreignKey.entityType}' (found: '${entity.entity_type}')`);
                continue;
              }
              localExists = entity;
            }
          } else {
            localExists = await (db as any)[rule.foreignKey.table].get(value);
          }
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
      if (!await getDB().products.get(record.product_id)) {
        // Try store-specific products first
        let validProduct = await getDB().products
          .where('store_id')
          .equals(storeId)
          .filter(p => !p._deleted)
          .first();
        
        // If no store products, try global products
        if (!validProduct) {
          validProduct = await getDB().products
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
      if (record.batch_id && !await getDB().inventory_bills.get(record.batch_id)) {
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
    if (tableName === 'branches') {
      // Ensure is_active is set (default to true if not present)
      if (cleanRecord.is_active === undefined || cleanRecord.is_active === null) {
        cleanRecord.is_active = true;
      }
    }
    if (tableName === 'bills') {
      // Remove deprecated computed fields
      delete cleanRecord.subtotal;
      delete cleanRecord.total_amount;
      delete cleanRecord.amount_due;
      delete cleanRecord.last_modified_at;
      
      // Remove other invalid fields
      delete cleanRecord.tax_amount;
      delete cleanRecord.discount_amount;
      delete cleanRecord.inventoryItemId;
      delete cleanRecord.due_date;
      // Keep status field - it's needed for soft delete (cancelled bills)
      // delete cleanRecord.status;
      delete cleanRecord.last_modified_by;
      
      // Remove any line item fields from bills
      const lineItemFields = ['productId', 'supplierId', 'quantity', 'unitPrice', 'lineTotal', 'weight', 'line_order', 'inventory_item_id', 'product_id', 'supplier_id', 'unit_price', 'line_total'];
      lineItemFields.forEach(field => delete cleanRecord[field]);
    }

    if (tableName === 'bill_line_items') {
      // Remove deprecated denormalized fields
      delete cleanRecord.supplier_id;
      delete cleanRecord.supplier_name;
      delete cleanRecord.product_name;
      delete cleanRecord.payment_method;
      delete cleanRecord.customer_id;
      delete cleanRecord.created_by;
      
      // Ensure inventory_item_id is null if not set
      cleanRecord.inventory_item_id = cleanRecord.inventory_item_id || null;
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
      // Remove fields that don't exist in the database schema
      delete cleanRecord.plastic_count;
      delete cleanRecord.plastic_price;
      
      // Remove P&L fields - these are calculated locally and don't need to be synced
      // They can be recalculated on the server if needed
      delete cleanRecord.total_revenue;
      delete cleanRecord.revenue_cash;
      delete cleanRecord.revenue_card;
      delete cleanRecord.revenue_credit;
      delete cleanRecord.total_cogs;
      delete cleanRecord.gross_profit;
      delete cleanRecord.gross_profit_margin;
    }

    if (tableName === 'inventory_items') {
      // CRITICAL: Remove supplier_id from inventory_items - it was removed from schema
      // Supplier is now accessed via inventory_bills -> batch_id
      delete cleanRecord.supplier_id;
    }

    // Remove updated_at for tables without it
    const tablesWithoutUpdatedAt = ['inventory_items', 'transactions', 'inventory_bills', 'bill_line_items', 'bill_audit_logs'];
    if (tablesWithoutUpdatedAt.includes(tableName)) {
      delete cleanRecord.updated_at;
    }

    // Remove lb_balance and usd_balance from entities table - these fields don't exist in Supabase schema
    if (tableName === 'entities') {
      delete cleanRecord.lb_balance;
      delete cleanRecord.usd_balance;
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

      // CRITICAL: Ensure store_id and branch_id are preserved and valid for RLS policies
      if (tableName === 'cash_drawer_accounts') {
        // Validate required fields for RLS policy compliance
        if (!cleanRecord.store_id) {
          console.error('❌ cash_drawer_accounts record missing store_id:', cleanRecord);
          // Return null to signal this record should be skipped
          return null;
        }
        if (!cleanRecord.branch_id) {
          console.error('❌ cash_drawer_accounts record missing branch_id:', cleanRecord);
          // Return null to signal this record should be skipped
          return null;
        }
        // Ensure account_code is set (required for FK constraint)
        if (!cleanRecord.account_code) {
          console.warn('⚠️ cash_drawer_accounts record missing account_code, defaulting to 1100');
          cleanRecord.account_code = '1100';
        }
        // Ensure currency is set (required field)
        if (!cleanRecord.currency) {
          console.warn('⚠️ cash_drawer_accounts record missing currency, defaulting to USD');
          cleanRecord.currency = 'USD';
        }
        // Ensure is_active is set (default to true)
        if (cleanRecord.is_active === undefined || cleanRecord.is_active === null) {
          cleanRecord.is_active = true;
        }
        // Ensure name is set (required field)
        if (!cleanRecord.name) {
          cleanRecord.name = 'Main Cash Drawer';
        }
        // Note: current_balance is optional - balance is computed from journal entries
        // No default needed as it's deprecated
        
        // Log the record being uploaded for debugging RLS issues
        console.log(`📤 Uploading cash_drawer_accounts: store_id=${cleanRecord.store_id}, branch_id=${cleanRecord.branch_id}, account_code=${cleanRecord.account_code}`);
      }
    }

    return cleanRecord;
  }
}

export const dataValidationService = new DataValidationService();