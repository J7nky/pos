/**
 * Canonical Balance Calculation
 * 
 * This is the SINGLE SOURCE OF TRUTH for balance calculations.
 * All balance queries MUST use this logic.
 * 
 * Rule: Balances are DERIVED from journal entries, not stored values.
 * Stored values (entities.usd_balance) are CACHE for performance only.
 */

import { db } from '../lib/db';
import type { JournalEntry } from '../types';

/**
 * The canonical balance calculation algorithm
 * This logic is NON-NEGOTIABLE per accounting principles
 * 
 * @param entries - Journal entries to calculate balance from
 * @returns Balance (positive = entity owes you, negative = you owe entity)
 */
export function calculateBalance(entries: JournalEntry[]): number {
  return entries.reduce(
    (sum, e) => sum + (e.debit - e.credit),
    0
  );
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
    // Try to use compound index for optimal performance
    const entries = await db.journal_entries
      .where('[entity_id+currency+account_code]')
      .equals([entityId, currency, accountCode])
      .and(e => e.is_posted === true)
      .toArray();

    return calculateBalance(entries);
  } catch (error) {
    // Fallback: If compound index doesn't exist, filter manually
    // This happens during migration or if schema upgrade hasn't run yet
    console.warn('Compound index not available, using fallback query:', error);
    
    const entries = await db.journal_entries
      .where('entity_id')
      .equals(entityId)
      .and(e => e.currency === currency && e.account_code === accountCode && e.is_posted === true)
      .toArray();

    return calculateBalance(entries);
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
    // Try to use compound index for optimal performance
    const entries = await db.journal_entries
      .where('[store_id+currency+account_code]')
      .equals([storeId, currency, '1100'])
      .and(e => e.is_posted === true && (!e.branch_id || e.branch_id === branchId))
      .toArray();

    return calculateBalance(entries);
  } catch (error) {
    // Fallback: If compound index doesn't exist, use simpler index and filter manually
    console.warn('Compound index [store_id+currency+account_code] not available, using fallback query');
    
    // Use store_id+branch_id index first to narrow down results
    const entries = await db.journal_entries
      .where('[store_id+branch_id]')
      .equals([storeId, branchId])
      .and(e => 
        e.account_code === '1100' &&
        e.currency === currency && 
        e.is_posted === true
      )
      .toArray();

    return calculateBalance(entries);
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
  const session = await db.cash_drawer_sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const openingAmount = (session as any).opening_amount || 0;
  const openedAt = new Date(session.opened_at);
  const closedAt = session.closed_at ? new Date(session.closed_at) : new Date();

  // Get all cash (1100) journal entries during this session
  const entries = await db.journal_entries
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
  const inflows = entries.reduce((sum, e) => sum + e.debit, 0);
  const outflows = entries.reduce((sum, e) => sum + e.credit, 0);
  const expectedAmount = openingAmount + inflows - outflows;

  return {
    openingAmount,
    inflows,
    outflows,
    expectedAmount
  };
}

/**
 * Verify that cached balance matches journal-derived balance
 * 
 * This is a safety check to ensure data integrity.
 * Cached balances should ALWAYS match journal truth.
 * 
 * @param entityId - Entity to verify
 * @param currency - Currency to check
 * @returns Verification result
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
  const entity = await db.entities.get(entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  // Get cached balance
  const cachedBalance = currency === 'USD' 
    ? (entity.usd_balance || 0)
    : (entity.lb_balance || 0);

  // Get journal-derived balance (TRUTH)
  const accountCode = entity.entity_type === 'supplier' ? '2100' : '1200';
  const journalBalance = await calculateEntityBalance(
    entityId,
    currency,
    accountCode as '1200' | '2100'
  );

  const difference = Math.abs(cachedBalance - journalBalance);
  const isValid = difference < 0.01; // Allow tiny rounding errors

  return {
    isValid,
    cachedBalance,
    journalBalance,
    difference
  };
}

/**
 * Get balance for display (uses cache for performance)
 * 
 * NOTE: This returns the CACHED balance for UI performance.
 * The cached balance should be kept in sync with journal truth
 * by the accounting service.
 * 
 * Use calculateEntityBalance() if you need the absolute truth.
 * 
 * @param entityId - Entity ID
 * @param currency - Currency
 * @returns Cached balance (fast)
 */
export async function getDisplayBalance(
  entityId: string,
  currency: 'USD' | 'LBP'
): Promise<number> {
  const entity = await db.entities.get(entityId);
  if (!entity) return 0;

  return currency === 'USD' 
    ? (entity.usd_balance || 0)
    : (entity.lb_balance || 0);
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
  const entity = await db.entities.get(entityId);
  if (!entity) return 0;

  const accountCode = entity.entity_type === 'supplier' ? '2100' : '1200';
  return await calculateEntityBalance(
    entityId,
    currency,
    accountCode as '1200' | '2100'
  );
}

