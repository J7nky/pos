/**
 * Canonical Balance Calculation
 * 
 * This is the SINGLE SOURCE OF TRUTH for balance calculations.
 * All balance queries MUST use this logic.
 * 
 * Rule: Balances are DERIVED from journal entries, not stored values.
 * Entity balance fields (usd_balance, lb_balance) have been removed.
 * All balances are calculated from journal entries using the base currency schema.
 */

import { getDB } from '../lib/db';
import type { JournalEntry } from '../types/accounting';

/**
 * The canonical balance calculation algorithm
 * This logic is NON-NEGOTIABLE per accounting principles
 * 
 * @param entries - Journal entries to calculate balance from
 * @param currency - Currency to calculate balance for ('USD' or 'LBP')
 * @returns Balance (positive = entity owes you, negative = you owe entity)
 */
export function calculateBalance(entries: JournalEntry[], currency: 'USD' | 'LBP'): number {
  return entries.reduce((sum, e) => {
    if (currency === 'USD') {

      return sum + (e.debit_usd || 0) - (e.credit_usd || 0);
    } else {
      
      return sum + (e.debit_lbp || 0) - (e.credit_lbp || 0);
    }
    
  }, 0);
  
}

/**
 * Calculate both USD and LBP balances from the same journal entries
 * More efficient than calling calculateBalance twice
 * 
 * @param entries - Journal entries to calculate balance from
 * @returns Object with USD and LBP balances
 */
export function calculateBothCurrencies(entries: JournalEntry[]): { USD: number; LBP: number } {
  return entries.reduce(
    (acc, e) => {
      acc.USD += (e.debit_usd || 0) - (e.credit_usd || 0);
      acc.LBP += (e.debit_lbp || 0) - (e.credit_lbp || 0);
      return acc;
    },
    { USD: 0, LBP: 0 }
  );
}

/**
 * Calculate both USD and LBP balances for LIABILITY accounts (credit - debit)
 * For liability accounts like Salaries Payable (2200):
 * - Credits increase liability (we owe more) → positive balance
 * - Debits decrease liability (we pay) → negative balance
 * 
 * @param entries - Journal entries to calculate balance from
 * @returns Object with USD and LBP balances
 */
export function calculateBothCurrenciesLiability(entries: JournalEntry[]): { USD: number; LBP: number } {
  return entries.reduce(
    (acc, e) => {
      // For liabilities: credit - debit (opposite of assets)
      acc.USD += e.credit_usd - e.debit_usd;
      acc.LBP += e.credit_lbp - e.debit_lbp;
      return acc;
    },
    { USD: 0, LBP: 0 }
  );
}

/**
 * Calculate employee balance from journal entries (TRUTH)
 * 
 * Employees can have entries in TWO accounts:
 * 1. Account 1200 (Accounts Receivable) - for credit sales (Dr 1200 Cr 4100)
 * 2. Account 2200 (Salaries Payable) - for salary payments (Dr 2200 Cr 1100)
 * 
 * Combined balance = Account 1200 balance - Account 2200 balance
 * - Positive = they owe us more than we owe them (net receivable)
 * - Negative = we owe them more than they owe us (net payable)
 * 
 * @param employeeId - Employee ID (same as user ID)
 * @param currency - Currency to filter by
 * @returns True balance from journal entries (combined from both accounts)
 */
export async function calculateEmployeeBalance(
  employeeId: string,
  currency: 'USD' | 'LBP'
): Promise<number> {
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
    console.warn('Compound index not available, using fallback query:', error);
    const allEntries = await getDB().journal_entries
      .where('entity_id')
      .equals(employeeId)
      .and(e => e.is_posted === true)
      .toArray();
    
    entries1200 = allEntries.filter(e => e.account_code === '1200');
    entries2200 = allEntries.filter(e => e.account_code === '2200');
  }

  // Calculate balance for account 1200 (AR - asset): debit - credit
  const balance1200 = entries1200.reduce((sum, e) => {
    if (currency === 'USD') {
      return sum + (e.debit_usd || 0) - (e.credit_usd || 0);
    } else {
      return sum + (e.debit_lbp || 0) - (e.credit_lbp || 0);
    }
  }, 0);

  // Calculate balance for account 2200 (Salaries Payable - liability): credit - debit
  const balance2200 = entries2200.reduce((sum, e) => {
    if (currency === 'USD') {
      return sum + (e.credit_usd || 0) - (e.debit_usd || 0);
    } else {
      return sum + (e.credit_lbp || 0) - (e.debit_lbp || 0);
    }
  }, 0);

  // Combined balance: AR - Salaries Payable
  return balance1200 - balance2200;
}

/**
 * Calculate entity balance from journal entries (TRUTH)
 * 
 * For customers (AR account 1200):
 * - Positive balance = customer owes you
 * - Negative balance = you owe customer
 * 
 * For suppliers (AP account 2100):
 * - Positive balance = you owe supplier  
 * - Negative balance = supplier owes you
 * 
 * @param entityId - Entity to calculate balance for
 * @param currency - Currency to filter by
 * @param accountCode - Account code (1200 for AR, 2100 for AP)
 * @returns True balance from journal entries
 */
export async function calculateEntityBalance(
  entityId: string,
  currency: 'USD' | 'LBP',
  accountCode: '1200' | '2100' = '1200'
): Promise<number> {
  try {
    // Get all journal entries for this entity and account (both currencies in same entries)
    const entries = await getDB().journal_entries
      .where('[entity_id+account_code]')
      .equals([entityId, accountCode])
      .and(e => e.is_posted === true)
      .toArray();

    return calculateBalance(entries, currency);
  } catch (error) {
    // Fallback: If compound index doesn't exist, filter manually
    // This happens during migration or if schema upgrade hasn't run yet
    console.warn('Compound index not available, using fallback query:', error);
    
    const entries = await getDB().journal_entries
      .where('entity_id')
      .equals(entityId)
      .and(e => e.account_code === accountCode && e.is_posted === true)
      .toArray();

    return calculateBalance(entries, currency);
  }
}

/**
 * Calculate cash drawer balance from journal entries (TRUTH)
 * 
 * Cash drawer balance = sum of all cash account (1100) journal entries
 * for the specific branch and currency.
 * 
 * @param storeId - Store ID
 * @param branchId - Branch ID  
 * @param currency - Currency
 * @returns True cash drawer balance from journal entries
 */
export async function calculateCashDrawerBalance(
  storeId: string,
  branchId: string,
  currency: 'USD' | 'LBP'
): Promise<number> {
  try {
    // Get all cash journal entries for this store and branch (both currencies in same entries)
    const entries = await getDB().journal_entries
      .where('[store_id+account_code]')
      .equals([storeId, '1100'])
      .and(e => e.is_posted === true && e.branch_id === branchId)
      .toArray();

    return calculateBalance(entries, currency);
  } catch (error) {
    // Fallback: If compound index doesn't exist, use simpler index and filter manually
    console.warn('Compound index [store_id+account_code] not available, using fallback query');
    
    // Use store_id+branch_id index for exact match
    const entries = await getDB().journal_entries
      .where('[store_id+branch_id]')
      .equals([storeId, branchId])
      .and(e => 
        e.account_code === '1100' &&
        e.is_posted === true
      )
      .toArray();

    return calculateBalance(entries, currency);
  }
}

/**
 * Calculate expected cash drawer amount during a session
 * 
 * Expected = Opening Amount + Cash Inflows - Cash Outflows
 * 
 * Where inflows/outflows come from journal entries between
 * session open and close times.
 * 
 * @param sessionId - Cash drawer session ID
 * @returns Expected cash amount based on journal entries
 */
export async function calculateExpectedCashInSession(
  sessionId: string
): Promise<{
  openingAmount: number;
  inflows: number;
  outflows: number;
  expectedAmount: number;
}> {
  // Get session
  const session = await getDB().cash_drawer_sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const openingAmount = (session as any).opening_amount || 0;
  const openedAt = new Date(session.opened_at);
  const closedAt = session.closed_at ? new Date(session.closed_at) : new Date();

  // Get all cash (1100) journal entries during this session
  const entries = await getDB().journal_entries
    .where('account_code')
    .equals('1100')
    .and(e => {
      const entryDate = new Date(e.created_at);
      return (
        e.is_posted === true &&
        entryDate >= openedAt &&
        entryDate <= closedAt &&
        e.store_id === (session as any).store_id
      );
    })
    .toArray();

  // Calculate inflows (debits to cash) and outflows (credits from cash)
  // Note: This function needs currency parameter, but for now we'll use USD as default
  // TODO: Update this function signature to accept currency parameter
  const inflows = entries.reduce((sum, e) => sum + (e.debit_usd || 0), 0);
  const outflows = entries.reduce((sum, e) => sum + (e.credit_usd || 0), 0);
  const expectedAmount = openingAmount + inflows - outflows;

  return {
    openingAmount,
    inflows,
    outflows,
    expectedAmount
  };
}

/**
 * @deprecated This function is no longer needed - balances are always calculated from journal entries
 * There are no cached balance fields to verify against.
 * Use calculateEntityBalance() directly to get the balance.
 * 
 * This function is kept for backward compatibility but always returns true
 * since there are no cached balances to verify.
 */
export async function verifyCachedBalance(
  entityId: string,
  currency: 'USD' | 'LBP'
): Promise<{
  isValid: boolean;
  cachedBalance: number;
  journalBalance: number;
  difference: number;
}> {
  // Balances are now always calculated from journal entries (source of truth)
  // There are no cached balance fields to verify against
  const entity = await getDB().entities.get(entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  // Get journal-derived balance (TRUTH)
  const accountCode = entity.entity_type === 'supplier' ? '2100' : '1200';
  const journalBalance = await calculateEntityBalance(
    entityId,
    currency,
    accountCode as '1200' | '2100'
  );

  // Always valid since there's no cached balance to compare against
  return {
    isValid: true,
    cachedBalance: journalBalance, // No cached balance, use journal balance
    journalBalance,
    difference: 0
  };
}

/**
 * Get balance for display (calculated from journal entries)
 * 
 * NOTE: This function now calculates balance from journal entries.
 * For better performance, use entityBalanceService.getEntityBalance() with snapshot optimization.
 * 
 * @param entityId - Entity ID
 * @param currency - Currency
 * @returns Balance calculated from journal entries
 */
export async function getDisplayBalance(
  entityId: string,
  currency: 'USD' | 'LBP'
): Promise<number> {
  const entity = await getDB().entities.get(entityId);
  if (!entity) return 0;

  // Calculate balance from journal entries (no cached balance fields)
  const accountCode = entity.entity_type === 'supplier' ? '2100' : '1200';
  return await calculateEntityBalance(
    entityId,
    currency,
    accountCode as '1200' | '2100'
  );
}

/**
 * Get balance with verification (slower but safer)
 * 
 * Use this when accuracy is critical (e.g., financial reports).
 * 
 * @param entityId - Entity ID  
 * @param currency - Currency
 * @returns Journal-derived balance (TRUTH)
 */
export async function getTrueBalance(
  entityId: string,
  currency: 'USD' | 'LBP'
): Promise<number> {
  const entity = await getDB().entities.get(entityId);
  if (!entity) return 0;

  const accountCode = entity.entity_type === 'supplier' ? '2100' : '1200';
  return await calculateEntityBalance(
    entityId,
    currency,
    accountCode as '1200' | '2100'
  );
}

