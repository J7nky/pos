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
import { amountsFromLegacyEntry, getDebit, getCredit } from './accountingCurrencyHelpers';
import type { CurrencyCode } from '@pos-platform/shared';

export interface EntityBalance {
  /** Per-currency balance map (primary surface). */
  byCurrency: Partial<Record<CurrencyCode, number>>;
  /** Legacy USD shortcut, equal to `byCurrency.USD ?? 0`. */
  USD: number;
  /** Legacy LBP shortcut, equal to `byCurrency.LBP ?? 0`. */
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
    currency: CurrencyCode,
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

    const { calculateAllCurrencies } = await import('../utils/balanceCalculation');
    const byCurrency = calculateAllCurrencies(entries);

    return {
      byCurrency,
      USD: byCurrency.USD ?? 0,
      LBP: byCurrency.LBP ?? 0,
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
    currency: CurrencyCode,
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

      const openingBalance = snapshot.byCurrency[currency] ?? 0;
      const incrementalBalance = incrementalEntries.reduce((sum, e) => {
        const map = amountsFromLegacyEntry(e as Parameters<typeof amountsFromLegacyEntry>[0]);
        return sum + getDebit(map, currency) - getCredit(map, currency);
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
  ): Promise<{
    byCurrency: Partial<Record<CurrencyCode, number>>;
    USD: number;
    LBP: number;
    lastCalculated: string;
  }> {
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

    const { calculateAllCurrencies } = await import('../utils/balanceCalculation');

    // If snapshot is from a prior day, get incremental entries since the snapshot.
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

      const incremental = calculateAllCurrencies(incrementalEntries);

      const byCurrency: Partial<Record<CurrencyCode, number>> = { ...snapshot.byCurrency };
      for (const code of Object.keys(incremental) as CurrencyCode[]) {
        byCurrency[code] = (byCurrency[code] ?? 0) + (incremental[code] ?? 0);
      }

      return {
        byCurrency,
        USD: byCurrency.USD ?? 0,
        LBP: byCurrency.LBP ?? 0,
        lastCalculated: new Date().toISOString()
      };
    }

    // No snapshot available, fall back to full calculation
    const entries = await getDB().journal_entries
      .where('[entity_id+account_code]')
      .equals([entityId, accountCode])
      .and(e => e.is_posted === true)
      .toArray();

    const byCurrency = calculateAllCurrencies(entries);

    return {
      byCurrency,
      USD: byCurrency.USD ?? 0,
      LBP: byCurrency.LBP ?? 0,
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
    currency: CurrencyCode,
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
    currency: CurrencyCode,
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

    // Calculate balances per currency for each account.
    const { calculateAllCurrencies, calculateAllCurrenciesLiability } = await import('../utils/balanceCalculation');
    const balance1200 = calculateAllCurrencies(entries1200);          // Asset: debit - credit
    const balance2200 = calculateAllCurrenciesLiability(entries2200); // Liability: credit - debit

    // Combine balances per currency: Net = AR - Salaries Payable.
    const codes = new Set<CurrencyCode>([
      ...(Object.keys(balance1200) as CurrencyCode[]),
      ...(Object.keys(balance2200) as CurrencyCode[]),
    ]);
    const byCurrency: Partial<Record<CurrencyCode, number>> = {};
    for (const code of codes) {
      byCurrency[code] = (balance1200[code] ?? 0) - (balance2200[code] ?? 0);
    }

    console.log(`[ENTITY_BALANCE_SERVICE] Combined balances for employee ${employeeId}:`, {
      account1200: balance1200,
      account2200: balance2200,
      combined: byCurrency
    });

    return {
      byCurrency,
      USD: byCurrency.USD ?? 0,
      LBP: byCurrency.LBP ?? 0,
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
    currency: CurrencyCode
  ): Promise<number> {
    // Employees have entries in TWO accounts (1200 and 2200).
    // Use the combined balances method and extract the requested currency.
    const balances = await this.getEmployeeBalancesWithSnapshot(employeeId);
    return balances.byCurrency[currency] ?? 0;
  }

  /**
   * Get both employee balances using snapshot + incremental entries
   * 
   * @param employeeId - Employee ID
   * @returns Object with USD and LBP balances
   */
  private async getEmployeeBalancesWithSnapshot(
    employeeId: string
  ): Promise<{
    byCurrency: Partial<Record<CurrencyCode, number>>;
    USD: number;
    LBP: number;
    lastCalculated: string;
  }> {
    // Employees have entries in TWO accounts (1200 and 2200) — snapshots are
    // account-specific, so we just compute directly. TODO: optimize with
    // snapshots for both accounts if performance becomes an issue.

    const entity = await getDB().entities.get(employeeId);
    if (!entity) {
      throw new Error(`Entity not found: ${employeeId}`);
    }

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
      const allEntries = await getDB().journal_entries
        .where('entity_id')
        .equals(employeeId)
        .and(e => e.is_posted === true)
        .toArray();

      entries1200 = allEntries.filter(e => e.account_code === '1200');
      entries2200 = allEntries.filter(e => e.account_code === '2200');
    }

    const { calculateAllCurrencies, calculateAllCurrenciesLiability } = await import('../utils/balanceCalculation');
    const balance1200 = calculateAllCurrencies(entries1200);
    const balance2200 = calculateAllCurrenciesLiability(entries2200);

    const codes = new Set<CurrencyCode>([
      ...(Object.keys(balance1200) as CurrencyCode[]),
      ...(Object.keys(balance2200) as CurrencyCode[]),
    ]);
    const byCurrency: Partial<Record<CurrencyCode, number>> = {};
    for (const code of codes) {
      byCurrency[code] = (balance1200[code] ?? 0) - (balance2200[code] ?? 0);
    }

    return {
      byCurrency,
      USD: byCurrency.USD ?? 0,
      LBP: byCurrency.LBP ?? 0,
      lastCalculated: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const entityBalanceService = EntityBalanceService.getInstance();

