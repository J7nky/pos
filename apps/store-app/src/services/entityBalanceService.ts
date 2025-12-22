/**
 * Entity Balance Service
 * 
 * Provides unified API for entity balance queries using journal-entry-based calculations.
 * Uses snapshot optimization for performance while maintaining journal entries as source of truth.
 * 
 * This service replaces direct access to entities.usd_balance and entities.lb_balance fields.
 */

import { db } from '../lib/db';
import { calculateEntityBalance, calculateBothCurrencies } from '../utils/balanceCalculation';
import { snapshotService } from './snapshotService';

export interface EntityBalance {
  USD: number;
  LBP: number;
  lastCalculated: string;
  source: 'journal' | 'snapshot';
}

/**
 * Service for querying entity balances
 * All balances are calculated from journal entries (source of truth)
 */
export class EntityBalanceService {
  private static instance: EntityBalanceService;

  public static getInstance(): EntityBalanceService {
    if (!EntityBalanceService.instance) {
      EntityBalanceService.instance = new EntityBalanceService();
    }
    return EntityBalanceService.instance;
  }

  /**
   * Get entity balance for a specific currency
   * Uses snapshot optimization when available
   * 
   * @param entityId - Entity ID
   * @param currency - Currency ('USD' or 'LBP')
   * @param accountCode - Account code (1200 for AR, 2100 for AP)
   * @param useSnapshot - Whether to use snapshot optimization (default: true)
   * @returns Balance amount
   */
  async getEntityBalance(
    entityId: string,
    currency: 'USD' | 'LBP',
    accountCode: '1200' | '2100' = '1200',
    useSnapshot: boolean = true
  ): Promise<number> {
    if (useSnapshot) {
      try {
        return await this.getBalanceWithSnapshot(entityId, currency, accountCode);
      } catch (error) {
        console.warn('Snapshot lookup failed, falling back to direct calculation:', error);
        // Fall through to direct calculation
      }
    }

    // Direct calculation from journal entries (source of truth)
    return await calculateEntityBalance(entityId, currency, accountCode);
  }

  /**
   * Get both USD and LBP balances for an entity
   * More efficient than calling getEntityBalance twice
   * 
   * @param entityId - Entity ID
   * @param accountCode - Account code (1200 for AR, 2100 for AP)
   * @param useSnapshot - Whether to use snapshot optimization (default: true)
   * @returns Object with USD and LBP balances
   */
  async getEntityBalances(
    entityId: string,
    accountCode: '1200' | '2100' = '1200',
    useSnapshot: boolean = true
  ): Promise<EntityBalance> {
    if (useSnapshot) {
      try {
        const balances = await this.getBalancesWithSnapshot(entityId, accountCode);
        return {
          ...balances,
          source: 'snapshot'
        };
      } catch (error) {
        console.warn('Snapshot lookup failed, falling back to direct calculation:', error);
        // Fall through to direct calculation
      }
    }

    // Direct calculation from journal entries (source of truth)
    const entity = await db.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    // Get all journal entries for this entity and account
    const entries = await db.journal_entries
      .where('[entity_id+account_code]')
      .equals([entityId, accountCode])
      .and(e => e.is_posted === true)
      .toArray();

    const balances = calculateBothCurrencies(entries);

    return {
      ...balances,
      lastCalculated: new Date().toISOString(),
      source: 'journal'
    };
  }

  /**
   * Get balance using snapshot + incremental entries
   * This is the optimized path for performance
   * 
   * @param entityId - Entity ID
   * @param currency - Currency
   * @param accountCode - Account code
   * @returns Balance amount
   */
  private async getBalanceWithSnapshot(
    entityId: string,
    currency: 'USD' | 'LBP',
    accountCode: '1200' | '2100'
  ): Promise<number> {
    // Get entity to determine store_id
    const entity = await db.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Try to get most recent snapshot
    const snapshot = await snapshotService.getHistoricalBalance(
      entity.store_id,
      accountCode,
      entityId,
      today
    );

    // If snapshot exists, use it as opening balance and add today's entries
    if (snapshot && snapshot.snapshotDate === today) {
      // Snapshot is current, return it directly
      return currency === 'USD' ? snapshot.balanceUSD : snapshot.balanceLBP;
    }

    // If snapshot is from yesterday or earlier, get entries since snapshot date
    if (snapshot) {
      const snapshotDate = new Date(snapshot.snapshotDate);
      snapshotDate.setHours(23, 59, 59, 999); // End of snapshot day
      
      const incrementalEntries = await db.journal_entries
        .where('[entity_id+account_code]')
        .equals([entityId, accountCode])
        .and(e => {
          const entryDate = new Date(e.posted_date);
          return e.is_posted === true && entryDate > snapshotDate;
        })
        .toArray();

      const openingBalance = currency === 'USD' ? snapshot.balanceUSD : snapshot.balanceLBP;
      const incrementalBalance = incrementalEntries.reduce((sum, e) => {
        if (currency === 'USD') {
          return sum + (e.debit_usd - e.credit_usd);
        } else {
          return sum + (e.debit_lbp - e.credit_lbp);
        }
      }, 0);

      return openingBalance + incrementalBalance;
    }

    // No snapshot available, fall back to full calculation
    return await calculateEntityBalance(entityId, currency, accountCode);
  }

  /**
   * Get both balances using snapshot + incremental entries
   * 
   * @param entityId - Entity ID
   * @param accountCode - Account code
   * @returns Object with USD and LBP balances
   */
  private async getBalancesWithSnapshot(
    entityId: string,
    accountCode: '1200' | '2100'
  ): Promise<{ USD: number; LBP: number; lastCalculated: string }> {
    // Get entity to determine store_id
    const entity = await db.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Try to get most recent snapshot
    const snapshot = await snapshotService.getHistoricalBalance(
      entity.store_id,
      accountCode,
      entityId,
      today
    );

    // If snapshot exists and is current, return it directly
    if (snapshot && snapshot.snapshotDate === today) {
      return {
        USD: snapshot.balanceUSD,
        LBP: snapshot.balanceLBP,
        lastCalculated: snapshot.snapshotDate
      };
    }

    // If snapshot is from yesterday or earlier, get entries since snapshot date
    if (snapshot) {
      const snapshotDate = new Date(snapshot.snapshotDate);
      snapshotDate.setHours(23, 59, 59, 999); // End of snapshot day
      
      const incrementalEntries = await db.journal_entries
        .where('[entity_id+account_code]')
        .equals([entityId, accountCode])
        .and(e => {
          const entryDate = new Date(e.posted_date);
          return e.is_posted === true && entryDate > snapshotDate;
        })
        .toArray();

      const incremental = calculateBothCurrencies(incrementalEntries);

      return {
        USD: snapshot.balanceUSD + incremental.USD,
        LBP: snapshot.balanceLBP + incremental.LBP,
        lastCalculated: new Date().toISOString()
      };
    }

    // No snapshot available, fall back to full calculation
    const entries = await db.journal_entries
      .where('[entity_id+account_code]')
      .equals([entityId, accountCode])
      .and(e => e.is_posted === true)
      .toArray();

    const balances = calculateBothCurrencies(entries);

    return {
      ...balances,
      lastCalculated: new Date().toISOString()
    };
  }

  /**
   * Calculate balance directly from journal entries (source of truth)
   * Use this when you need absolute accuracy and don't care about performance
   * 
   * @param entityId - Entity ID
   * @param currency - Currency
   * @param accountCode - Account code
   * @returns Balance amount
   */
  async calculateBalanceFromJournals(
    entityId: string,
    currency: 'USD' | 'LBP',
    accountCode: '1200' | '2100' = '1200'
  ): Promise<number> {
    return await calculateEntityBalance(entityId, currency, accountCode);
  }
}

// Export singleton instance
export const entityBalanceService = EntityBalanceService.getInstance();

