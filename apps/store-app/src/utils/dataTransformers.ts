/**
 * Standardized Data Transformation Utilities
 * Prevents type errors and ensures consistent data structure across the application
 */

// Base sync interface for all entities
export interface SyncableEntity {
   sync_status: string;
  sync_updated_at: string;
  _synced?: boolean;
  _deleted?: boolean;
}

// Raw database entity (snake_case from Supabase)
export interface RawDbEntity {
  id: string;
  created_at: string;
  updated_at?: string;
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// Frontend entity (camelCase for React)
export interface FrontendEntity extends SyncableEntity {
  id: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Base transformer utility - handles common transformations
 */

export class BaseTransformer {
  /**
   * Adds consistent sync properties to any entity
   */
  static addSyncProperties<T>(entity: Record<string, unknown>): T & SyncableEntity {
    return {
      ...entity,
      _synced: entity._synced ?? true,
      _lastSyncedAt: entity._lastSyncedAt,
      _deleted: entity._deleted ?? false,
    };
  }

  /**
   * Transforms snake_case database fields to camelCase frontend fields
   */
  static transformBaseFields(raw: RawDbEntity): FrontendEntity {
    return this.addSyncProperties({
      ...raw,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    });
  }

  /**
   * Validates required properties exist
   */
  static validateRequired<T>(entity: T, requiredFields: (keyof T)[]): T {
    const missing = requiredFields.filter(field => {
      const value = entity[field];
      return value === undefined || value === null;
    });
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    
    return entity;
  }

  /**
   * Safe property mapping with fallbacks
   */
  static mapProperty<T, K extends keyof T>(
    source: Record<string, unknown>, 
    sourceKey: string, 
    fallback?: T[K]
  ): T[K] {
    return source[sourceKey] ?? fallback;
  }
}

/**
 * Transaction-specific transformer
 */

export class TransactionTransformer extends BaseTransformer {
  static fromRaw(raw: Record<string, unknown>, currentBranchId?: string): import('../types').Transaction {
    // NOTE: Transaction interface uses snake_case, not camelCase like other entities
    // This is inconsistent with the frontend pattern but matches the current interface
    const transaction = this.addSyncProperties({
      ...raw,
      // Keep snake_case to match Transaction interface
      id: raw.id,
      type: raw.type,
      category: raw.category,
      amount: raw.amount,
      currency: raw.currency || 'USD',
      description: raw.description,
      reference: raw.reference,
      store_id: raw.store_id,
      branch_id: raw.branch_id || currentBranchId || '',
      created_by: raw.created_by,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      supplier_id: raw.supplier_id,
      customer_id: raw.customer_id,
      employee_id: raw.employee_id,
      metadata: raw.metadata,
    });

    // Validate required fields
    return this.validateRequired(transaction, [
      'id', 'type', 'category', 'amount', 'currency', 
      'description', 'store_id', 'branch_id', 'created_by'
    ]);
  }

  static toRaw(transaction: import('../types').Transaction): Record<string, unknown> {
    return {
      id: transaction.id,
      type: transaction.type,
      category: transaction.category,
      amount: transaction.amount,
      currency: transaction.currency,
      description: transaction.description,
      reference: transaction.reference,
      store_id: transaction.store_id,
      branch_id: transaction.branch_id,
      created_by: transaction.created_by,
      created_at: transaction.created_at, // Fixed: Transaction interface uses snake_case
      updated_at: transaction.updated_at, // Fixed: Transaction interface uses snake_case
      supplier_id: transaction.supplier_id,
      customer_id: transaction.customer_id,
      employee_id: transaction.employee_id,
      metadata: transaction.metadata,
      _synced: transaction._synced,
      _lastSyncedAt: transaction._lastSyncedAt,
      _deleted: transaction._deleted,
    };
  }
}

/**
 * Customer-specific transformer
 */
export class CustomerTransformer extends BaseTransformer {
  static fromRaw(raw: Record<string, unknown>): import('../types').Customer {
    const base = this.transformBaseFields(raw);
    
    const customer = {
      ...base,
      name: raw.name,
      phone: raw.phone,
      email: raw.email,
      address: raw.address,
      lb_balance: raw.lb_balance || 0,
      usd_balance: raw.usd_balance || 0,
      lb_max_balance: raw.lb_max_balance,
      usd_max_balance: raw.usd_max_balance,
      is_active: raw.is_active ?? true,
      // Legacy compatibility
      isActive: raw.is_active ?? true,
      balance: raw.lb_balance || 0, // For backward compatibility
    };

    return this.validateRequired(customer, [
      'id', 'name', 'phone', 'lb_balance', 'usd_balance', 'is_active'
    ]);
  }
}

/**
 * Supplier-specific transformer
 */
export class SupplierTransformer extends BaseTransformer {
  static fromRaw(raw: Record<string, unknown>): import('../types').Supplier {
    const base = this.transformBaseFields(raw);
    
    const supplier = {
      ...base,
      name: raw.name,
      phone: raw.phone,
      email: raw.email,
      address: raw.address,
      lb_balance: raw.lb_balance || 0,
      usd_balance: raw.usd_balance || 0,
      advance_lb_balance: raw.advance_lb_balance || 0,
      advance_usd_balance: raw.advance_usd_balance || 0,
    };

    return this.validateRequired(supplier, [
      'id', 'name', 'phone', 'address'
    ]);
  }
}

/**
 * Generic collection transformer
 */
export class CollectionTransformer {
  /**
   * Transform an array of raw entities using the specified transformer
   */
  static transform<TRaw, TTransformed>(
    rawEntities: TRaw[],
    transformer: (raw: TRaw, ...args: unknown[]) => TTransformed,
    ...transformerArgs: unknown[]
  ): TTransformed[] {
    return rawEntities.map(raw => {
      try {
        return transformer(raw, ...transformerArgs);
      } catch (error) {
        console.error('Transformation error:', error, 'Raw entity:', raw);
        throw new Error(`Failed to transform entity ${(raw as Record<string, unknown>)?.id}: ${error.message}`);
      }
    });
  }

  /**
   * Transform with error recovery - skips invalid entities instead of failing
   */
  static transformSafe<TRaw, TTransformed>(
    rawEntities: TRaw[],
    transformer: (raw: TRaw, ...args: unknown[]) => TTransformed,
    ...transformerArgs: unknown[]
  ): { 
    transformed: TTransformed[], 
    errors: Array<{ entity: TRaw, error: Error }> 
  } {
    const transformed: TTransformed[] = [];
    const errors: Array<{ entity: TRaw, error: Error }> = [];

    rawEntities.forEach(raw => {
      try {
        transformed.push(transformer(raw, ...transformerArgs));
      } catch (error) {
        console.warn('Skipping invalid entity:', error, raw);
        errors.push({ entity: raw, error: error as Error });
      }
    });

    return { transformed, errors };
  }
}

/**
 * Validation utilities
 */
export class ValidationUtils {
  /**
   * Check if entity has all required sync properties
   */
  static hasSyncProperties(entity: Record<string, unknown>): entity is SyncableEntity {
    return typeof entity._synced === 'boolean' && 
           typeof entity._deleted === 'boolean';
  }

  /**
   * Validate entity structure at runtime
   */
  static validateEntityStructure<T>(
    entity: T, 
    schema: Record<keyof T, 'string' | 'number' | 'boolean' | 'object' | 'optional'>
  ): T {
    Object.entries(schema).forEach(([key, expectedType]) => {
      const value = (entity as Record<string, unknown>)[key];
      
      if (expectedType === 'optional' && (value === undefined || value === null)) {
        return; // Optional field can be undefined/null
      }
      
      if (expectedType !== 'optional' && (value === undefined || value === null)) {
        throw new Error(`Required field '${key}' is missing`);
      }
      
      if (expectedType !== 'optional' && typeof value !== expectedType) {
        throw new Error(`Field '${key}' should be ${expectedType}, got ${typeof value}`);
      }
    });
    
    return entity;
  }
}
