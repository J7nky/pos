/**
 * Entity Balance Service
 * 
 * Provides unified API for entity balance queries using journal-entry-based calculations.
 * Uses snapshot optimization for performance while maintaining journal entries as source of truth.
 * 
 * This service replaces direct access to entities.usd_balance and entities.lb_balance fields.
 */

import { getDB } from '../lib/db';
import { calculateEntityBalance, calculateBothCurrencies, calculateEmployeeBalance } from '../utils/balanceCalculation';
import { snapshotService } from './snapshotService';
import { getLocalDateString } from '../utils/dateUtils';

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
    const entity = await getDB().entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    // Get all journal entries for this entity and account
    const entries = await getDB().journal_entries
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
    const entity = await getDB().entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const today = getLocalDateString(new Date().toISOString());
    
    // Try to get most recent snapshot
    const snapshot = await snapshotService.getHistoricalBalance(
      entity.store_id,
      accountCode,
      entityId,
      today
    );

    // If snapshot is from a prior day, use it as opening balance and add
    // entries posted after it. snapshotService now never returns an exact-today
    // snapshot when asOfDate is today (see comment in entityBalanceService.ts:
    // getBalancesWithSnapshot), so we always go through the incremental path
    // when asOfDate is the current day.
    if (snapshot) {
      const snapshotDate = new Date(snapshot.snapshotDate);
      snapshotDate.setHours(23, 59, 59, 999); // End of snapshot day
      
      const incrementalEntries = await getDB().journal_entries
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
    const entity = await getDB().entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const today = getLocalDateString(new Date().toISOString());
    
    // Try to get most recent snapshot
    const snapshot = await snapshotService.getHistoricalBalance(
      entity.store_id,
      accountCode,
      entityId,
      today
    );

    // If snapshot is from a prior day, get incremental entries since the snapshot.
    // Note: snapshotService now always returns a snapshot dated *strictly before
    // today* when asOfDate is today (so post-snapshot entries from today are
    // included via the journal-entry sum below). The old "snapshotDate === today"
    // short-circuit was a stale-balance bug — payments arriving after the
    // snapshot was taken were not reflected until full page reload.
    if (snapshot) {
      const snapshotDate = new Date(snapshot.snapshotDate);
      snapshotDate.setHours(23, 59, 59, 999); // End of snapshot day

      const incrementalEntries = await getDB().journal_entries
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
    const entries = await getDB().journal_entries
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

  /**
   * Get employee balance for a specific currency
   * Uses account 2200 (Salaries Payable) for calculation
   * 
   * For employees:
   * - Positive balance = we owe employee (unpaid salary)
   * - Negative balance = employee overpaid (we paid more than owed)
   * 
   * @param employeeId - Employee ID (same as user ID)
   * @param currency - Currency ('USD' or 'LBP')
   * @param useSnapshot - Whether to use snapshot optimization (default: true)
   * @returns Balance amount
   */
  async getEmployeeBalance(
    employeeId: string,
    currency: 'USD' | 'LBP',
    useSnapshot: boolean = true
  ): Promise<number> {
    if (useSnapshot) {
      try {
        return await this.getEmployeeBalanceWithSnapshot(employeeId, currency);
      } catch (error) {
        console.warn('Snapshot lookup failed for employee balance, falling back to direct calculation:', error);
        // Fall through to direct calculation
      }
    }

    // Direct calculation from journal entries (source of truth)
    return await calculateEmployeeBalance(employeeId, currency);
  }

  /**
   * Get both USD and LBP balances for an employee
   * More efficient than calling getEmployeeBalance twice
   * 
   * @param employeeId - Employee ID (same as user ID)
   * @param useSnapshot - Whether to use snapshot optimization (default: true)
   * @returns Object with USD and LBP balances
   */
  async getEmployeeBalances(
    employeeId: string,
    useSnapshot: boolean = true
  ): Promise<EntityBalance> {
    if (useSnapshot) {
      try {
        const balances = await this.getEmployeeBalancesWithSnapshot(employeeId);
        return {
          ...balances,
          source: 'snapshot'
        };
      } catch (error) {
        console.warn('Snapshot lookup failed for employee balances, falling back to direct calculation:', error);
        // Fall through to direct calculation
      }
    }

    // Direct calculation from journal entries (source of truth)
    // Employees can have entries in TWO accounts:
    // 1. Account 1200 (Accounts Receivable) - for credit sales (Dr 1200 Cr 4100)
    // 2. Account 2200 (Salaries Payable) - for salary payments (Dr 2200 Cr 1100)
    // We need to fetch BOTH and combine them
    
    let entries1200: any[] = [];
    let entries2200: any[] = [];
    
    try {
      // Fetch account 1200 entries (Accounts Receivable - asset account)
      entries1200 = await getDB().journal_entries
        .where('[entity_id+account_code]')
        .equals([employeeId, '1200'])
        .and(e => e.is_posted === true)
        .toArray();
      
      // Fetch account 2200 entries (Salaries Payable - liability account)
      entries2200 = await getDB().journal_entries
        .where('[entity_id+account_code]')
        .equals([employeeId, '2200'])
        .and(e => e.is_posted === true)
        .toArray();
    } catch (error) {
      // Fallback: If compound index doesn't exist, filter manually
      console.warn('Compound index [entity_id+account_code] not available, using fallback query:', error);
      const allEntries = await getDB().journal_entries
        .where('entity_id')
        .equals(employeeId)
        .and(e => e.is_posted === true)
        .toArray();
      
      entries1200 = allEntries.filter(e => e.account_code === '1200');
      entries2200 = allEntries.filter(e => e.account_code === '2200');
    }

    console.log(`[ENTITY_BALANCE_SERVICE] Found ${entries1200.length} journal entries for employee ${employeeId}, account 1200`);
    console.log(`[ENTITY_BALANCE_SERVICE] Found ${entries2200.length} journal entries for employee ${employeeId}, account 2200`);

    // Calculate balances for each account
    // Account 1200 (AR - asset): balance = debit - credit (positive = they owe us)
    const { calculateBothCurrencies } = await import('../utils/balanceCalculation');
    const balance1200 = calculateBothCurrencies(entries1200);
    
    // Account 2200 (Salaries Payable - liability): balance = credit - debit (positive = we owe them)
    const { calculateBothCurrenciesLiability } = await import('../utils/balanceCalculation');
    const balance2200 = calculateBothCurrenciesLiability(entries2200);

    // Combine balances: Net = AR balance - Salaries Payable balance
    // Positive = they owe us more than we owe them (net receivable)
    // Negative = we owe them more than they owe us (net payable)
    const combinedBalances = {
      USD: balance1200.USD - balance2200.USD,
      LBP: balance1200.LBP - balance2200.LBP
    };

    console.log(`[ENTITY_BALANCE_SERVICE] Combined balances for employee ${employeeId}:`, {
      account1200: balance1200,
      account2200: balance2200,
      combined: combinedBalances
    });

    return {
      ...combinedBalances,
      lastCalculated: new Date().toISOString(),
      source: 'journal'
    };
  }

  /**
   * Get employee balance using snapshot + incremental entries
   * 
   * @param employeeId - Employee ID
   * @param currency - Currency
   * @returns Balance amount
   */
  private async getEmployeeBalanceWithSnapshot(
    employeeId: string,
    currency: 'USD' | 'LBP'
  ): Promise<number> {
    // Employees have entries in TWO accounts (1200 and 2200)
    // Use the combined balances method and extract the requested currency
    const balances = await this.getEmployeeBalancesWithSnapshot(employeeId);
    return currency === 'USD' ? balances.USD : balances.LBP;
  }

  /**
   * Get both employee balances using snapshot + incremental entries
   * 
   * @param employeeId - Employee ID
   * @returns Object with USD and LBP balances
   */
  private async getEmployeeBalancesWithSnapshot(
    employeeId: string
  ): Promise<{ USD: number; LBP: number; lastCalculated: string }> {
    // Employees have entries in TWO accounts (1200 and 2200)
    // Snapshots are account-specific, so combining them is complex
    // For now, fall back to direct calculation which handles both accounts correctly
    // TODO: Optimize with snapshots for both accounts if performance becomes an issue
    
    // Get employee entity to determine store_id
    const entity = await getDB().entities.get(employeeId);
    if (!entity) {
      // Fall back to direct calculation if entity doesn't exist
      // This will be handled by the main getEmployeeBalances method
      throw new Error(`Entity not found: ${employeeId}`);
    }

    // Fetch both accounts directly (same logic as getEmployeeBalances)
    let entries1200: any[] = [];
    let entries2200: any[] = [];
    
    try {
      entries1200 = await getDB().journal_entries
        .where('[entity_id+account_code]')
        .equals([employeeId, '1200'])
        .and(e => e.is_posted === true)
        .toArray();
      
      entries2200 = await getDB().journal_entries
        .where('[entity_id+account_code]')
        .equals([employeeId, '2200'])
        .and(e => e.is_posted === true)
        .toArray();
    } catch (error) {
      // Fallback: If compound index doesn't exist, filter manually
      const allEntries = await getDB().journal_entries
        .where('entity_id')
        .equals(employeeId)
        .and(e => e.is_posted === true)
        .toArray();
      
      entries1200 = allEntries.filter(e => e.account_code === '1200');
      entries2200 = allEntries.filter(e => e.account_code === '2200');
    }

    // Calculate balances for each account
    const { calculateBothCurrencies, calculateBothCurrenciesLiability } = await import('../utils/balanceCalculation');
    const balance1200 = calculateBothCurrencies(entries1200); // Asset: debit - credit
    const balance2200 = calculateBothCurrenciesLiability(entries2200); // Liability: credit - debit

    // Combine balances: Net = AR balance - Salaries Payable balance
    const combinedBalances = {
      USD: balance1200.USD - balance2200.USD,
      LBP: balance1200.LBP - balance2200.LBP
    };

    return {
      ...combinedBalances,
      lastCalculated: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const entityBalanceService = EntityBalanceService.getInstance();

