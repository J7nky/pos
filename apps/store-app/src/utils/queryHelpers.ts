/**
 * QUERY HELPERS UTILITY
 * 
 * Consolidates repetitive query patterns used across the codebase.
 * Replaces 69+ instances of `.where('store_id').equals(storeId)` pattern
 * 
 * Benefits:
 * - More readable code
 * - Consistent query patterns
 * - Easier to modify (change once, affects all)
 * - Better TypeScript inference
 */

import { Table } from 'dexie';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
  includeInactive?: boolean;
}

export interface DateRangeOptions {
  startDate?: string;
  endDate?: string;
}

export class QueryHelpers {
  /**
   * Query by store ID
   * 
   * Usage: QueryHelpers.byStore(db.transactions, storeId)
   */
  static byStore<T>(table: Table<T, any>, storeId: string) {
    return table.where('store_id').equals(storeId);
  }

  /**
   * Query by store ID and branch ID
   * 
   * Usage: QueryHelpers.byStoreBranch(db.cash_drawer_sessions, storeId, branchId)
   */
  static byStoreBranch<T>(table: Table<T, any>, storeId: string, branchId: string) {
    return table.where(['store_id', 'branch_id']).equals([storeId, branchId]);
  }

  /**
   * Query by entity (customer or supplier)
   * 
   * Usage: QueryHelpers.byEntity(db.transactions, 'customer', customerId)
   */
  static byEntity<T>(
    table: Table<T, any>,
    entityType: 'customer' | 'supplier' | 'employee',
    entityId: string
  ) {
    const fieldName = `${entityType}_id`;
    return table.where(fieldName).equals(entityId);
  }

  /**
   * Apply standard filters (deleted, inactive)
   */
  static applyFilters<T extends { _deleted?: boolean; is_active?: boolean }>(
    query: Dexie.Collection<T, any>,
    options: QueryOptions = {}
  ): Dexie.Collection<T, any> {
    if (!options.includeDeleted) {
      query = query.filter(item => !item._deleted);
    }
    
    if (!options.includeInactive && 'is_active' in ({} as T)) {
      query = query.filter(item => item.is_active !== false);
    }
    
    return query;
  }

  /**
   * Apply pagination
   */
  static applyPagination<T>(
    query: Dexie.Collection<T, any>,
    options: QueryOptions = {}
  ): Dexie.Collection<T, any> {
    if (options.offset) {
      query = query.offset(options.offset);
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    return query;
  }

  /**
   * Apply date range filter
   */
  static applyDateRange<T extends { created_at: string }>(
    query: Dexie.Collection<T, any>,
    options: DateRangeOptions = {}
  ): Dexie.Collection<T, any> {
    const { startDate, endDate } = options;
    
    if (startDate) {
      query = query.filter(item => new Date(item.created_at) >= new Date(startDate));
    }
    
    if (endDate) {
      query = query.filter(item => new Date(item.created_at) <= new Date(endDate));
    }
    
    return query;
  }

  /**
   * Combined query helper - most common pattern
   * 
   * Usage:
   * const data = await QueryHelpers.query(db.transactions, {
   *   storeId: 'store-123',
   *   branchId: 'branch-456',
   *   includeDeleted: false,
   *   limit: 100
   * });
   */
  static async query<T extends { _deleted?: boolean; is_active?: boolean; created_at?: string }>(
    table: Table<T, any>,
    params: {
      storeId?: string;
      branchId?: string;
      entityType?: 'customer' | 'supplier' | 'employee';
      entityId?: string;
      startDate?: string;
      endDate?: string;
    } & QueryOptions
  ): Promise<T[]> {
    let query: Dexie.Collection<T, any>;
    
    // Start with appropriate index
    if (params.storeId && params.branchId) {
      query = this.byStoreBranch(table, params.storeId, params.branchId);
    } else if (params.storeId) {
      query = this.byStore(table, params.storeId);
    } else if (params.entityType && params.entityId) {
      query = this.byEntity(table, params.entityType, params.entityId);
    } else {
      query = table.toCollection();
    }
    
    // Apply filters
    query = this.applyFilters(query, params);
    
    // Apply date range
    if (params.startDate || params.endDate) {
      query = this.applyDateRange(query as Dexie.Collection<T & { created_at: string }, any>, {
        startDate: params.startDate,
        endDate: params.endDate
      });
    }
    
    // Apply pagination
    query = this.applyPagination(query, params);
    
    return query.toArray();
  }

  /**
   * Count query helper
   */
  static async count<T>(
    table: Table<T, any>,
    params: {
      storeId?: string;
      branchId?: string;
      includeDeleted?: boolean;
    }
  ): Promise<number> {
    let query: Dexie.Collection<T, any>;
    
    if (params.storeId && params.branchId) {
      query = this.byStoreBranch(table, params.storeId, params.branchId);
    } else if (params.storeId) {
      query = this.byStore(table, params.storeId);
    } else {
      query = table.toCollection();
    }
    
    if (!params.includeDeleted) {
      query = query.filter((item: any) => !item._deleted);
    }
    
    return query.count();
  }
}

/**
 * Date filter utilities
 */
export class DateFilters {
  /**
   * Check if date is in range
   */
  static inRange(date: string, startDate?: string, endDate?: string): boolean {
    const itemDate = new Date(date);
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    return itemDate >= start && itemDate <= end;
  }

  /**
   * Filter array by date range
   */
  static filterByDateRange<T extends { created_at: string }>(
    items: T[],
    startDate?: string,
    endDate?: string
  ): T[] {
    if (!startDate && !endDate) return items;
    return items.filter(item => this.inRange(item.created_at, startDate, endDate));
  }

  /**
   * Group by date (day/week/month)
   */
  static groupByPeriod<T extends { created_at: string }>(
    items: T[],
    period: 'day' | 'week' | 'month' = 'day'
  ): Map<string, T[]> {
    const grouped = new Map<string, T[]>();
    
    for (const item of items) {
      const date = new Date(item.created_at);
      let key: string;
      
      if (period === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (period === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else { // month
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
      
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    }
    
    return grouped;
  }
}

