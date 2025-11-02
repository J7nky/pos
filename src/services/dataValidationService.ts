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
  };

  private cacheExpiry = 900000; // 15 minutes

  /**
   * Refresh validation cache from Supabase
   */
  async refreshCache(storeId: string, supabase: any): Promise<void> {
    const cacheAge = this.cache.lastUpdated 
      ? Date.now() - this.cache.lastUpdated.getTime() 
      : Infinity;

    if (cacheAge < this.cacheExpiry && this.cache.storeId === storeId) {
      console.log(`💾 Using cached validation data (age: ${Math.round(cacheAge / 1000)}s)`);
      return;
    }

    console.log(`🔄 Refreshing validation cache for store: ${storeId}`);

    try {
      const [productsData, suppliersData, customersData, usersData, batchesData, billsData] = await Promise.all([
        supabase.from('products').select('id').eq('store_id', storeId).limit(10000),
        supabase.from('suppliers').select('id').eq('store_id', storeId).limit(5000),
        supabase.from('customers').select('id').eq('store_id', storeId).limit(5000),
        supabase.from('users').select('id').eq('store_id', storeId).limit(1000),
        supabase.from('inventory_bills').select('id').eq('store_id', storeId).limit(10000),
        supabase.from('bills').select('id').eq('store_id', storeId).limit(10000),
      ]);

      this.cache.products = new Set(productsData.data?.map((p: any) => p.id) || []);
      this.cache.suppliers = new Set(suppliersData.data?.map((s: any) => s.id) || []);
      this.cache.customers = new Set(customersData.data?.map((c: any) => c.id) || []);
      this.cache.users = new Set(usersData.data?.map((u: any) => u.id) || []);
      this.cache.batches = new Set(batchesData.data?.map((b: any) => b.id) || []);
      this.cache.bills = new Set(billsData.data?.map((b: any) => b.id) || []);
      this.cache.lastUpdated = new Date();
      this.cache.storeId = storeId;

      console.log(`✅ Validation cache updated: ${this.cache.products.size} products, ${this.cache.suppliers.size} suppliers, ${this.cache.users.size} users`);
    } catch (error) {
      console.warn('Failed to refresh validation cache:', error);
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

      // Fix missing product - use first available
      if (!await db.products.get(record.product_id)) {
        const validProduct = await db.products
          .where('store_id')
          .equals(storeId)
          .filter(p => !p._deleted)
          .first();
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
      delete cleanRecord.ip_address;
      delete cleanRecord.user_agent;
      delete cleanRecord.updated_at;
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
    }

    // Remove updated_at for tables without it
    const tablesWithoutUpdatedAt = ['inventory_items', 'transactions', 'inventory_bills', 'bill_line_items', 'bill_audit_logs'];
    if (tablesWithoutUpdatedAt.includes(tableName)) {
      delete cleanRecord.updated_at;
    }

    // CRITICAL: Remove supplier_id from inventory_items - it was removed from schema
    // Supplier is now accessed via inventory_bills -> batch_id
    if (tableName === 'inventory_items') {
      delete cleanRecord.supplier_id;
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

