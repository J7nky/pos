// Entity Query Service - Phase 4 of Accounting Foundation Migration
// Unified query layer using entities table and journal-based balance queries.
// Currency-agnostic: every per-currency total is exposed as a `byCurrency`
// map; legacy `*_usd` / `*_lbp` fields are kept as shortcuts.

import { getDB } from '../lib/db';
import { Entity } from '../types/accounting';
import { snapshotService } from './snapshotService';
import { QueryHelpers } from '../utils/queryHelpers';
import { entityBalanceService } from './entityBalanceService';
import { getTodayLocalDate } from '../utils/dateUtils';
import type { CurrencyCode } from '@pos-platform/shared';

type CurrencyTotals = Partial<Record<CurrencyCode, number>>;

export interface EntityWithBalance extends Entity {
  /** Per-currency current balance map (primary surface). */
  current_balance_by_currency: CurrencyTotals;
  /** Legacy USD shortcut. */
  current_balance_usd: number;
  /** Legacy LBP shortcut. */
  current_balance_lbp: number;
  historical_balance?: {
    date: string;
    by_currency: CurrencyTotals;
    balance_usd: number;
    balance_lbp: number;
  };
}

export interface EntityQueryOptions {
  includeInactive?: boolean;
  includeSystemEntities?: boolean;
  includeCurrentBalance?: boolean;
  includeHistoricalBalance?: {
    asOfDate: string;
    accountCode?: string;
  };
  branchId?: string | null;
  searchTerm?: string;
  limit?: number;
  offset?: number;
}

export interface EntityBalanceReport {
  entityId: string;
  entityName: string;
  entityType: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
  /** Per-currency total across all accounts (primary surface). */
  currentBalanceByCurrency: CurrencyTotals;
  /** Legacy USD shortcut. */
  currentBalanceUSD: number;
  /** Legacy LBP shortcut. */
  currentBalanceLBP: number;
  accountBalances: Array<{
    accountCode: string;
    accountName: string;
    byCurrency: CurrencyTotals;
    balanceUSD: number;
    balanceLBP: number;
  }>;
  lastTransactionDate: string | null;
}

function addInto(target: CurrencyTotals, source: CurrencyTotals): void {
  for (const code of Object.keys(source) as CurrencyCode[]) {
    target[code] = (target[code] ?? 0) + (source[code] ?? 0);
  }
}

function maxAbs(map: CurrencyTotals): number {
  let max = 0;
  for (const v of Object.values(map)) {
    if (typeof v === 'number') max = Math.max(max, Math.abs(v));
  }
  return max;
}

/**
 * Unified query service for entities with performance optimizations
 * Replaces direct customer/supplier table queries
 */
export class EntityQueryService {
  
  /**
   * Get all customers using entities table
   */
  async getCustomers(storeId: string, options: EntityQueryOptions = {}): Promise<EntityWithBalance[]> {
    return this.getEntitiesByType(storeId, 'customer', options);
  }
  
  /**
   * Get all suppliers using entities table
   */
  async getSuppliers(storeId: string, options: EntityQueryOptions = {}): Promise<EntityWithBalance[]> {
    return this.getEntitiesByType(storeId, 'supplier', options);
  }
  
  /**
   * Get all employees using entities table
   */
  async getEmployees(storeId: string, options: EntityQueryOptions = {}): Promise<EntityWithBalance[]> {
    return this.getEntitiesByType(storeId, 'employee', options);
  }
  
  /**
   * Get entities by type with enhanced query capabilities
   */
  async getEntitiesByType(
    storeId: string, 
    entityType: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal',
    options: EntityQueryOptions = {}
  ): Promise<EntityWithBalance[]> {
    try {
      let query = getDB().entities
        .where('[store_id+entity_type]')
        .equals([storeId, entityType]);
      
      // Apply filters
      if (options.branchId !== undefined) {
        query = query.filter(entity => entity.branch_id === options.branchId);
      }
      
      if (!options.includeInactive) {
        query = query.filter(entity => entity.is_active);
      }
      
      if (!options.includeSystemEntities) {
        query = query.filter(entity => !entity.is_system_entity);
      }
      
      if (options.searchTerm) {
        const searchLower = options.searchTerm.toLowerCase();
        query = query.filter(entity => 
          entity.name.toLowerCase().includes(searchLower) ||
          entity.entity_code.toLowerCase().includes(searchLower) ||
          (entity.phone && entity.phone.includes(options.searchTerm))
        );
      }
      
      // Apply pagination using QueryHelpers
      query = QueryHelpers.applyPagination(query, {
        offset: options.offset,
        limit: options.limit
      });
      
      const entities = await query.toArray();
      
      // Enhance with balance information if requested
      const entitiesWithBalance: EntityWithBalance[] = [];
      
      for (const entity of entities) {
        // Calculate balances from journal entries (source of truth)
        let byCurrency: CurrencyTotals = {};

        if (options.includeCurrentBalance !== false) {
          try {
            const accountCode = entityType === 'supplier' ? '2100' :
                              entityType === 'customer' ? '1200' : '1200';

            if (entityType === 'customer' || entityType === 'supplier') {
              const balances = await entityBalanceService.getEntityBalances(
                entity.id,
                accountCode as '1200' | '2100',
                true // Use snapshot optimization
              );
              byCurrency = { ...balances.byCurrency };
            }
          } catch (error) {
            console.warn(`Failed to calculate balance for entity ${entity.id}:`, error);
          }
        }

        const entityWithBalance: EntityWithBalance = {
          ...entity,
          current_balance_by_currency: byCurrency,
          current_balance_usd: byCurrency.USD ?? 0,
          current_balance_lbp: byCurrency.LBP ?? 0
        };

        // Add historical balance using snapshots
        if (options.includeHistoricalBalance) {
          try {
            const accountCode = options.includeHistoricalBalance.accountCode || '1200'; // Default to AR
            const historicalBalance = await snapshotService.getHistoricalBalance(
              storeId,
              accountCode,
              entity.id,
              options.includeHistoricalBalance.asOfDate
            );

            entityWithBalance.historical_balance = {
              date: historicalBalance.snapshotDate,
              by_currency: { ...historicalBalance.byCurrency },
              balance_usd: historicalBalance.byCurrency.USD ?? 0,
              balance_lbp: historicalBalance.byCurrency.LBP ?? 0
            };
          } catch (error) {
            console.warn(`Failed to get historical balance for entity ${entity.id}:`, error);
          }
        }

        entitiesWithBalance.push(entityWithBalance);
      }
      
      return entitiesWithBalance;
      
    } catch (error) {
      console.error(`Failed to get ${entityType} entities:`, error);
      throw error;
    }
  }
  
  /**
   * Get single entity by ID with balance information
   */
  async getEntityById(
    storeId: string, 
    entityId: string, 
    options: EntityQueryOptions = {}
  ): Promise<EntityWithBalance | null> {
    try {
      const entity = await getDB().entities
        .where('[store_id+id]')
        .equals([storeId, entityId])
        .first();
      
      if (!entity) {
        return null;
      }
      
      // Calculate current balance from journal entries
      let byCurrency: CurrencyTotals = {};

      if (entity.entity_type === 'customer' || entity.entity_type === 'supplier') {
        try {
          const accountCode = entity.entity_type === 'supplier' ? '2100' : '1200';
          const balances = await entityBalanceService.getEntityBalances(
            entity.id,
            accountCode as '1200' | '2100',
            true // Use snapshot optimization
          );
          byCurrency = { ...balances.byCurrency };
        } catch (error) {
          console.warn(`Failed to calculate balance for entity ${entity.id}:`, error);
        }
      }

      const entityWithBalance: EntityWithBalance = {
        ...entity,
        current_balance_by_currency: byCurrency,
        current_balance_usd: byCurrency.USD ?? 0,
        current_balance_lbp: byCurrency.LBP ?? 0
      };

      // Add historical balance if requested
      if (options.includeHistoricalBalance) {
        try {
          const accountCode = options.includeHistoricalBalance.accountCode ||
            (entity.entity_type === 'customer' ? '1200' : '2100'); // AR for customers, AP for suppliers

          const historicalBalance = await snapshotService.getHistoricalBalance(
            storeId,
            accountCode,
            entity.id,
            options.includeHistoricalBalance.asOfDate
          );

          entityWithBalance.historical_balance = {
            date: historicalBalance.snapshotDate,
            by_currency: { ...historicalBalance.byCurrency },
            balance_usd: historicalBalance.byCurrency.USD ?? 0,
            balance_lbp: historicalBalance.byCurrency.LBP ?? 0
          };
        } catch (error) {
          console.warn(`Failed to get historical balance for entity ${entity.id}:`, error);
        }
      }

      return entityWithBalance;
      
    } catch (error) {
      console.error(`Failed to get entity ${entityId}:`, error);
      throw error;
    }
  }
  
  /**
   * Search entities across all types
   * Optimized using QueryHelpers utility
   */
  async searchEntities(
    storeId: string,
    searchTerm: string,
    options: EntityQueryOptions = {}
  ): Promise<EntityWithBalance[]> {
    try {
      let query = QueryHelpers.byStore(getDB().entities, storeId);
      
      // Apply filters using QueryHelpers
      query = QueryHelpers.applyFilters(query, {
        includeInactive: options.includeInactive,
        includeDeleted: false
      });
      
      if (!options.includeSystemEntities) {
        query = query.filter(entity => !entity.is_system_entity);
      }
      
      if (options.branchId !== undefined) {
        query = query.filter(entity => entity.branch_id === options.branchId);
      }
      
      // Apply search
      const searchLower = searchTerm.toLowerCase();
      query = query.filter(entity => 
        entity.name.toLowerCase().includes(searchLower) ||
        entity.entity_code.toLowerCase().includes(searchLower) ||
        (entity.phone && entity.phone.includes(searchTerm))
      );
      
      // Apply pagination using QueryHelpers
      query = QueryHelpers.applyPagination(query, { limit: options.limit });
      
      const entities = await query.toArray();
      
      // Convert to EntityWithBalance format with calculated balances
      const entitiesWithBalance: EntityWithBalance[] = [];
      
      for (const entity of entities) {
        let byCurrency: CurrencyTotals = {};

        if (entity.entity_type === 'customer' || entity.entity_type === 'supplier') {
          try {
            const accountCode = entity.entity_type === 'supplier' ? '2100' : '1200';
            const balances = await entityBalanceService.getEntityBalances(
              entity.id,
              accountCode as '1200' | '2100',
              true // Use snapshot optimization
            );
            byCurrency = { ...balances.byCurrency };
          } catch (error) {
            console.warn(`Failed to calculate balance for entity ${entity.id}:`, error);
          }
        }

        entitiesWithBalance.push({
          ...entity,
          current_balance_by_currency: byCurrency,
          current_balance_usd: byCurrency.USD ?? 0,
          current_balance_lbp: byCurrency.LBP ?? 0
        });
      }

      return entitiesWithBalance;

    } catch (error) {
      console.error('Failed to search entities:', error);
      throw error;
    }
  }
  
  /**
   * Get entity balance report with account-level details
   */
  async getEntityBalanceReport(
    storeId: string,
    entityId: string,
    asOfDate?: string
  ): Promise<EntityBalanceReport | null> {
    try {
      const entity = await getDB().entities
        .where('[store_id+id]')
        .equals([storeId, entityId])
        .first();
      
      if (!entity) {
        return null;
      }
      
      const targetDate = asOfDate || getTodayLocalDate();
      
      // Get all accounts that this entity has balances in
      const relevantAccounts = await getDB().chart_of_accounts
        .where('store_id')
        .equals(storeId)
        .filter(account => account.requires_entity && account.is_active)
        .toArray();
      
      const accountBalances: EntityBalanceReport['accountBalances'] = [];
      const total: CurrencyTotals = {};

      // Get balance for each relevant account
      for (const account of relevantAccounts) {
        try {
          const balance = await snapshotService.getHistoricalBalance(
            storeId,
            account.account_code,
            entityId,
            targetDate
          );

          if (maxAbs(balance.byCurrency) > 0) {
            accountBalances.push({
              accountCode: account.account_code,
              accountName: account.account_name,
              byCurrency: { ...balance.byCurrency },
              balanceUSD: balance.byCurrency.USD ?? 0,
              balanceLBP: balance.byCurrency.LBP ?? 0
            });

            addInto(total, balance.byCurrency);
          }
        } catch (error) {
          console.warn(`Failed to get balance for account ${account.account_code}:`, error);
        }
      }

      // Get last transaction date
      const lastTransaction = await getDB().journal_entries
        .where('[store_id+entity_id]')
        .equals([storeId, entityId])
        .reverse()
        .first();

      return {
        entityId: entity.id,
        entityName: entity.name,
        entityType: entity.entity_type,
        currentBalanceByCurrency: total,
        currentBalanceUSD: total.USD ?? 0,
        currentBalanceLBP: total.LBP ?? 0,
        accountBalances,
        lastTransactionDate: lastTransaction?.posted_date || null
      };
      
    } catch (error) {
      console.error(`Failed to get balance report for entity ${entityId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get entities with outstanding balances
   */
  async getEntitiesWithBalances(
    storeId: string,
    entityType?: 'customer' | 'supplier' | 'employee',
    options: {
      minimumBalance?: number;
      currency?: CurrencyCode;
      asOfDate?: string;
    } = {}
  ): Promise<EntityWithBalance[]> {
    try {
      let query = getDB().entities.where('store_id').equals(storeId);

      if (entityType) {
        query = query.filter(entity => entity.entity_type === entityType);
      }

      query = query.filter(entity => entity.is_active && !entity.is_system_entity);

      const entities = await query.toArray();
      const entitiesWithBalances: EntityWithBalance[] = [];

      const minimumBalance = options.minimumBalance || 0.01;
      const currency: CurrencyCode = options.currency || 'USD';

      for (const entity of entities) {
        let byCurrency: CurrencyTotals = {};

        if (entity.entity_type === 'customer' || entity.entity_type === 'supplier') {
          try {
            const accountCode = entity.entity_type === 'supplier' ? '2100' : '1200';
            const balances = await entityBalanceService.getEntityBalances(
              entity.id,
              accountCode as '1200' | '2100',
              true // Use snapshot optimization
            );
            byCurrency = { ...balances.byCurrency };
          } catch (error) {
            console.warn(`Failed to calculate balance for entity ${entity.id}:`, error);
          }
        }

        const currentBalance = byCurrency[currency] ?? 0;

        if (Math.abs(currentBalance) >= minimumBalance) {
          entitiesWithBalances.push({
            ...entity,
            current_balance_by_currency: byCurrency,
            current_balance_usd: byCurrency.USD ?? 0,
            current_balance_lbp: byCurrency.LBP ?? 0
          });
        }
      }

      // Sort by balance descending in the requested currency.
      entitiesWithBalances.sort((a, b) => {
        const balanceA = a.current_balance_by_currency[currency] ?? 0;
        const balanceB = b.current_balance_by_currency[currency] ?? 0;
        return Math.abs(balanceB) - Math.abs(balanceA);
      });

      return entitiesWithBalances;

    } catch (error) {
      console.error('Failed to get entities with balances:', error);
      throw error;
    }
  }
  
  /**
   * Get entity statistics
   */
  async getEntityStatistics(storeId: string): Promise<{
    totalCustomers: number;
    activeCustomers: number;
    totalSuppliers: number;
    activeSuppliers: number;
    totalEmployees: number;
    activeEmployees: number;
    customersWithBalance: number;
    suppliersWithBalance: number;
    totalOutstandingAR: number;
    totalOutstandingAP: number;
  }> {
    try {
      const entities = await getDB().entities.where('store_id').equals(storeId).toArray();
      
      const stats = {
        totalCustomers: 0,
        activeCustomers: 0,
        totalSuppliers: 0,
        activeSuppliers: 0,
        totalEmployees: 0,
        activeEmployees: 0,
        customersWithBalance: 0,
        suppliersWithBalance: 0,
        totalOutstandingAR: 0,
        totalOutstandingAP: 0
      };
      
      for (const entity of entities) {
        if (entity.is_system_entity) continue;
        
        switch (entity.entity_type) {
          case 'customer':
            stats.totalCustomers++;
            if (entity.is_active) stats.activeCustomers++;
            // Calculate balance from journal entries
            try {
              const balances = await entityBalanceService.getEntityBalances(
                entity.id,
                '1200', // AR account
                true // Use snapshot optimization
              );
              if (Math.abs(balances.USD) > 0.01) {
                stats.customersWithBalance++;
                stats.totalOutstandingAR += balances.USD;
              }
            } catch (error) {
              console.warn(`Failed to calculate balance for customer ${entity.id}:`, error);
            }
            break;
            
          case 'supplier':
            stats.totalSuppliers++;
            if (entity.is_active) stats.activeSuppliers++;
            // Calculate balance from journal entries
            try {
              const balances = await entityBalanceService.getEntityBalances(
                entity.id,
                '2100', // AP account
                true // Use snapshot optimization
              );
              if (Math.abs(balances.USD) > 0.01) {
                stats.suppliersWithBalance++;
                stats.totalOutstandingAP += Math.abs(balances.USD);
              }
            } catch (error) {
              console.warn(`Failed to calculate balance for supplier ${entity.id}:`, error);
            }
            break;
            
          case 'employee':
            stats.totalEmployees++;
            if (entity.is_active) stats.activeEmployees++;
            break;
        }
      }
      
      return stats;
      
    } catch (error) {
      console.error('Failed to get entity statistics:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const entityQueryService = new EntityQueryService();
