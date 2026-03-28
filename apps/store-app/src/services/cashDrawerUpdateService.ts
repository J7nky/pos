import { getDB } from '../lib/db';
import { currencyService } from './currencyService';
import { QueryHelpers, DateFilters } from '../utils/queryHelpers';
import { CacheManager, CacheKeys } from '../utils/cacheManager';
import { PerformanceMonitor } from '../utils/performanceMonitor';
import { BranchAccessValidationService } from './branchAccessValidationService';

/**
 * CASH DRAWER UPDATE SERVICE
 * 
 * Responsibilities:
 * - Cash drawer session management (open/close)
 * - Balance queries and reconciliation
 * - Account management
 * 
 * NOTE: All transaction creation MUST go through transactionService.ts
 * This service only handles session lifecycle and balance queries
 */

export interface CashDrawerUpdateResult {
  success: boolean;
  previousBalance: number;
  newBalance: number;
  transactionId?: string;
  error?: string;
}

export class CashDrawerUpdateService {
  
  private static instance: CashDrawerUpdateService;
  private operationLocks: Map<string, Promise<any>> = new Map();

  private constructor() {}

  public static getInstance(): CashDrawerUpdateService {
    if (!CashDrawerUpdateService.instance) {
      CashDrawerUpdateService.instance = new CashDrawerUpdateService();
    }
    return CashDrawerUpdateService.instance;
  }

  /**
   * Acquire lock for store operations to prevent race conditions
   */
  private async acquireOperationLock<T>(storeId: string, operation: () => Promise<T>): Promise<T> {
    const lockKey = `cash_drawer_${storeId}`;
    
    // Wait for any existing operation on this store to complete
    if (this.operationLocks.has(lockKey)) {
      try {
        await this.operationLocks.get(lockKey);
      } catch (error) {
        // Previous operation failed, but we can proceed
        console.warn('Previous operation failed, proceeding with new operation:', error);
      }
    }
    
    // Create new operation promise
    const operationPromise = operation();
    this.operationLocks.set(lockKey, operationPromise);
    
    try {
      const result = await operationPromise;
      return result;
    } finally {
      // Clean up lock after operation completes
      this.operationLocks.delete(lockKey);
    }
  }

  /**
   * Open cash drawer session explicitly
   */
  public async openCashDrawerSession(
    storeId: string,
    branchId: string,
    openingAmount: number,
    openedBy: string,
    _notes?: string
  ): Promise<{
    success: boolean;
    sessionId?: string;
    error?: string;
  }> {
    console.log('Opening cash drawer session');
    
    // ✅ Validate branch access before opening session
    try {
      await BranchAccessValidationService.validateBranchAccess(
        openedBy,
        storeId,
        branchId
      );
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Access denied to this branch'
      };
    }
    
    // Use operation lock to prevent concurrent session operations
    return this.acquireOperationLock(storeId, async () => {
      try {
        // Check if there's already an active session
        const existingSession = await getDB().getCurrentCashDrawerSession(storeId, branchId);
        if (existingSession && existingSession.status === 'open') {
          return {
            success: false,
            error: `Cash drawer session already open (opened by ${existingSession.opened_by} at ${new Date(existingSession.opened_at).toLocaleString()})`
          };
        }

        // Get cash drawer account (no auto-create)
        const account = await this.getCashDrawerAccount(storeId, branchId);

        if (!account) {
          return {
            success: false,
            error: 'No cash drawer account exists. Please create one before opening a session.'
          };
        }

        // Open new session using database method
        const sessionId = await getDB().openCashDrawerSession(storeId, branchId, account.id, openingAmount, openedBy);
        
        console.log(`💰 Cash drawer session opened: ${sessionId} with opening amount: $${openingAmount.toFixed(2)}`);
        
        return {
          success: true,
          sessionId
        };
      } catch (error) {
        console.error('Error opening cash drawer session:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
      }
    });
  }

  /**
   * Close cash drawer session with actual amount count
   */
  public async closeCashDrawer(
    sessionId: string,
    actualAmount: number,
    closedBy: string,
    notes?: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    expectedAmount: number;
    actualAmount: number;
    variance: number;
    error?: string;
  }> {
    
    // Get session to determine store ID and branch ID for validation
    const session = await getDB().cash_drawer_sessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        sessionId,
        expectedAmount: 0,
        actualAmount: 0,
        variance: 0,
        error: 'Session not found'
      };
    }
    
    // ✅ Validate branch access before closing session
    try {
      await BranchAccessValidationService.validateBranchAccess(
        closedBy,
        session.store_id,
        session.branch_id
      );
    } catch (error) {
      return {
        success: false,
        sessionId,
        expectedAmount: 0,
        actualAmount: 0,
        variance: 0,
        error: error instanceof Error ? error.message : 'Access denied to this branch'
      };
    }
    
    // Use operation lock to prevent concurrent session operations
    return this.acquireOperationLock(session.store_id, async () => {
      try {
        // Close the cash drawer session using the database method
        await getDB().closeCashDrawerSession(sessionId, actualAmount, closedBy, notes);
        
        // Get the updated session to return details
        const session = await getDB().cash_drawer_sessions.get(sessionId);
        if (!session) {
          throw new Error('Session not found after closing');
        }

        return {
          success: true,
          sessionId,
          expectedAmount: session.expected_amount || 0,
          actualAmount: session.actual_amount || 0,
          variance: session.variance || 0
        };
      } catch (error) {
        console.error('Error closing cash drawer:', error);
        return {
          success: false,
          sessionId,
          expectedAmount: 0,
          actualAmount: 0,
          variance: 0,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
      }
    });
  }

  /**
   * Get current cash drawer balance - PURE GETTER
   *
   * Session-scoped: same formula as `getCurrentCashDrawerBalances` (opening + net 1100 journals in open session).
   * Delegates to `getCurrentCashDrawerBalances` so all callers share one canonical model.
   * Cached separately under `CacheKeys.balance` with TTL.SHORT (1s).
   */
  public async getCurrentCashDrawerBalance(storeId: string, branchId: string): Promise<number> {
    return PerformanceMonitor.withTracking(
      'cashDrawer:getBalance',
      async () => {
        const cacheKey = CacheKeys.balance(storeId, branchId);
        return CacheManager.withCache(
          cacheKey,
          CacheManager.TTL.SHORT,
          async () => {
            try {
              const account = await this.getCashDrawerAccount(storeId, branchId);
              if (!account) {
                console.warn('No cash drawer account exists for store', storeId, 'branch', branchId);
                return 0;
              }
              const currency = (account as any)?.currency || 'LBP';
              const balances = await this.getCurrentCashDrawerBalances(storeId, branchId);
              return currency === 'LBP' ? balances.LBP : balances.USD;
            } catch (error) {
              console.error('Error getting cash drawer balance:', error);
              return 0;
            }
          }
        );
      },
      { storeId, branchId }
    );
  }

  /**
   * Get current cash drawer balances for both USD and LBP - PURE GETTER
   * 
   * ✅ Calculates balances from journal entries (account_code = 1100) - single source of truth
   * ✅ Only includes journal entries from the current active session
   * ✅ Adds opening amount from session based on account currency
   * ✅ Uses calculateBothCurrencies() for efficient single-query calculation
   * ✅ Zero side effects - never writes to database
   * ✅ Fast and safe - no database writes during reads
   * 
   * Journal entries are the ONLY source of truth. Balance cache fields are never read or written.
   *
   * Cached with TTL.SHORT (1s) under `balance_${storeId}_${branchId}_both`.
   *
   * @param storeId - Store ID
   * @param branchId - Branch ID
   * @returns Object with USD and LBP balances (returns zeros if no active session)
   */
  public async getCurrentCashDrawerBalances(storeId: string, branchId: string): Promise<{ USD: number; LBP: number }> {
    return PerformanceMonitor.withTracking(
      'cashDrawer:getBalances',
      async () => {
        const cacheKey = `${CacheKeys.balance(storeId, branchId)}_both`;
        
        return CacheManager.withCache(
          cacheKey,
          CacheManager.TTL.SHORT,
          async () => {
            try {
              // Get current active session
              const session = await getDB().getCurrentCashDrawerSession(storeId, branchId);
              
              // If no active session exists, return zeros (UI handles closed status separately)
              if (!session || session.status !== 'open') {
                return { USD: 0, LBP: 0 };
              }

              // Verify cash drawer account exists
              const account = await this.getCashDrawerAccount(storeId, branchId);
              if (!account) {
                console.warn('No cash drawer account exists for store', storeId, 'branch', branchId);
                return { USD: 0, LBP: 0 };
              }

              // Get account currency to determine which currency the opening amount applies to
              const accountCurrency = (account as any)?.currency || 'USD';

              // ✅ OPTIMIZED: Calculate balances from journal entries within session time range
              // Uses compound index [store_id+account_code] for fast lookup, then filters by branch and date
              const openedAt = new Date(session.opened_at);
              const closedAt = session.closed_at ? new Date(session.closed_at) : new Date();
              
              // ✅ IMPROVEMENT: Use most efficient index path - [store_id+account_code] is optimal for cash drawer queries
              let entries;
              try {
                // Primary path: Use compound index [store_id+account_code] for account_code='1100' (cash)
                // This is the fastest path since we're querying a specific account code
                entries = await getDB().journal_entries
                  .where('[store_id+account_code]')
                  .equals([storeId, '1100'])
                  .and(e => {
                    // Filter by branch and posted status first (cheaper checks)
                    if (e.is_posted !== true || e.branch_id !== branchId) {
                      return false;
                    }
                    // Then filter by session time range (more expensive date comparison)
                    const entryDate = new Date(e.created_at);
                    return entryDate >= openedAt && entryDate <= closedAt;
                  })
                  .toArray();
              } catch (error) {
                // Fallback: Use [store_id+branch_id] index if compound index doesn't exist
                console.warn('Compound index [store_id+account_code] not available, using fallback:', error);
                entries = await getDB().journal_entries
                  .where('[store_id+branch_id]')
                  .equals([storeId, branchId])
                  .and(e => {
                    // Filter by account code and posted status first
                    if (e.account_code !== '1100' || e.is_posted !== true) {
                      return false;
                    }
                    // Then filter by session time range
                    const entryDate = new Date(e.created_at);
                    return entryDate >= openedAt && entryDate <= closedAt;
                  })
                  .toArray();
              }

              // Calculate net change from journal entries
              const { calculateBothCurrencies } = await import('../utils/balanceCalculation');
              const netChange = calculateBothCurrencies(entries);

              // Add opening amount based on account currency
              const openingAmount = session.opening_amount || 0;
              const balances = {
                USD: netChange.USD + (accountCurrency === 'USD' ? openingAmount : 0),
                LBP: netChange.LBP + (accountCurrency === 'LBP' ? openingAmount : 0)
              };

              return balances;
            } catch (error) {
              console.error('Error getting cash drawer balances:', error);
              return { USD: 0, LBP: 0 };
            }
          }
        );
      },
      { storeId, branchId }
    );
  }

  /**
   * Reconcile cash drawer balance from journal entries - READ-ONLY VERIFICATION
   * 
   * ✅ Calculates TRUE balance from journal entries (account_code = 1100) - single source of truth
   * ✅ Returns reconciliation result for auditability (balance is computed, not stored)
   * ✅ Logs the reconciliation for auditability
   * ✅ Read-only verification - never updates cache fields
   * ✅ Should be called explicitly: end-of-day, session close, admin reconcile, sync repair
   * 
   * Note: Balance cache fields are never updated. This method is for verification/audit only.
   * 
   * @param storeId - Store ID
   * @param branchId - Branch ID
   * @param reason - Reason for reconciliation (for audit log)
   * @returns Reconciliation result with calculated balances (for audit purposes)
   */
  public async reconcileCashDrawerBalance(
    storeId: string,
    branchId: string,
    reason: string = 'Manual reconciliation'
  ): Promise<{
    success: boolean;
    oldBalance: number;
    newBalance: number;
    discrepancy: number;
    error?: string;
  }> {
    return PerformanceMonitor.withTracking(
      'cashDrawer:reconcile',
      async () => {
        try {
          // Verify cash drawer account exists
          const account = await this.getCashDrawerAccount(storeId, branchId);
          if (!account) {
            return {
              success: false,
              oldBalance: 0,
              newBalance: 0,
              discrepancy: 0,
              error: 'No cash drawer account found'
            };
          }

          // ✅ Calculate TRUE balances from journal entries (account_code = 1100) for both currencies
          // This is the SINGLE SOURCE OF TRUTH - balance cache fields are never read or written
          const { calculateBothCurrencies } = await import('../utils/balanceCalculation');
          
          // Get all cash journal entries
          let entries;
          try {
            entries = await getDB().journal_entries
              .where('[store_id+account_code]')
              .equals([storeId, '1100'])
              .and(e => e.is_posted === true && e.branch_id === branchId)
              .toArray();
          } catch (error) {
            // Fallback if compound index doesn't exist
            entries = await getDB().journal_entries
              .where('[store_id+branch_id]')
              .equals([storeId, branchId])
              .and(e => e.account_code === '1100' && e.is_posted === true)
              .toArray();
          }
          
          const trueBalances = calculateBothCurrencies(entries);
          
          // For backward compatibility, return LBP balance as the primary balance
          const newBalance = trueBalances.LBP;
          const oldBalance = 0; // No cached balance to compare against
          const discrepancy = 0; // No discrepancy since we don't compare with cache

          // Log reconciliation for audit purposes
          console.log(`💰 Cash drawer balance reconciliation (read-only):`, {
            storeId,
            branchId,
            usdBalance: trueBalances.USD,
            lbpBalance: trueBalances.LBP,
            reason,
            timestamp: new Date().toISOString(),
            note: 'Balance calculated from journal entries - cache fields are never updated'
          });

          return {
            success: true,
            oldBalance,
            newBalance,
            discrepancy
          };
        } catch (error) {
          console.error('Error reconciling cash drawer balance:', error);
          return {
            success: false,
            oldBalance: 0,
            newBalance: 0,
            discrepancy: 0,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      },
      { storeId, branchId }
    );
  }

  /**
   * Get cash drawer transaction history
   * Optimized using QueryHelpers and DateFilters utilities
   * 🚀 CACHED for 5 seconds, with unique keys for date ranges
   */
  public async getCashDrawerTransactionHistory(
    storeId: string,
    startDate?: string,
    endDate?: string,
    limit?: number
  ): Promise<any[]> {
    return PerformanceMonitor.withTracking(
      'cashDrawer:getTransactionHistory',
      async () => {
        const cacheKey = CacheKeys.transactions(
          storeId, 
          `${startDate || 'all'}_${endDate || 'all'}_${limit || 'all'}`
        );
        
        return CacheManager.withCache(
          cacheKey,
          CacheManager.TTL.MEDIUM, // 5 seconds
          async () => {
            try {
              // Get cash drawer transactions using optimized query
              const transactions = await QueryHelpers.byStore(getDB().transactions, storeId)
                .filter(trans => trans.category.startsWith('cash_drawer_'))
                .toArray();

              // Apply date filtering using utility
              const filtered = DateFilters.filterByDateRange(transactions, startDate, endDate);

              // Sort by date descending
              const sorted = filtered.sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              );

              // Apply limit
              return limit && limit > 0 ? sorted.slice(0, limit) : sorted;
            } catch (error) {
              console.error('Error getting cash drawer transaction history:', error);
              return [];
            }
          }
        );
      },
      { storeId, startDate, endDate, limit }
    );
  }

  /**
   * Normalize amount to store's preferred currency
   */
  public normalizeAmountToStoreCurrency(
    amount: number, 
    transactionCurrency: 'USD' | 'LBP', 
    storeCurrency: 'USD' | 'LBP'
  ): number {
    if (transactionCurrency === storeCurrency) {
      return amount;
    }
    
    try {
      return currencyService.convertCurrency(amount, transactionCurrency, storeCurrency);
    } catch (error) {
      console.error('Currency conversion failed, using original amount:', error);
      return amount;
    }
  }

  /**
   * Get cash drawer account (doesn't create - name was misleading before)
   * Returns null if none exists.
   */
  public async getCashDrawerAccount(storeId: string, branchId: string) {
    // Validate inputs before making database call
    if (!storeId || !branchId) {
      console.warn(`⚠️ Invalid parameters for getCashDrawerAccount: storeId=${storeId}, branchId=${branchId}`);
      return null;
    }
    try {
      const account = await getDB().getCashDrawerAccount(storeId, branchId);
      if (!account ) {
        console.warn(`❌ No cash drawer account exists for store ${storeId}, branch ${branchId}`);
        return null;
      }
      return account;
    } catch (error) {
      console.error('Error retrieving cash drawer account:', error);
      return null;
    }
  }

  /**
   * Get or create cash drawer session based on transaction requirements
   */
  private async getOrCreateCashDrawerSession(
    storeId: string,
    branchId: string,
    allowAutoSessionOpen: boolean,
    createdBy: string,
    transactionType: string
  ): Promise<any> {
    // ✅ Validate branch access before getting/creating session
    try {
      await BranchAccessValidationService.validateBranchAccess(
        createdBy,
        storeId,
        branchId
      );
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Access denied to this branch'
      );
    }
    
    let session = await getDB().getCurrentCashDrawerSession(storeId, branchId);
    
    if (!session || session.status !== 'open') {
      // If auto-open is allowed (for hooks), try to open a session
      if (allowAutoSessionOpen) {
        console.log('💰 No active session found, auto-opening for transaction hook');
        
        const sessionResult = await this.openCashDrawerSession(
          storeId,
          branchId,
          0, // Start with 0 opening amount
          createdBy,
          `Auto-opened for ${transactionType}`
        );
        
        if (!sessionResult.success) {
          console.error('Failed to auto-open session:', sessionResult.error);
          return null;
        }
        
        // Get the newly opened session
        session = await getDB().getCurrentCashDrawerSession(storeId, branchId);
      } else {
        console.warn('No active cash drawer session and auto-opening not allowed');
        return null;
      }
    }
    
    return session;
  }

  /**
   * Verify that a cash drawer session is open before transaction
   * Returns session if open, null otherwise
   */
  public async verifySessionOpen(
    storeId: string,
    branchId: string,
    allowAutoOpen?: boolean,
    createdBy?: string,
    transactionType?: string
  ): Promise<any> {
    return this.getOrCreateCashDrawerSession(
      storeId, 
      branchId, 
      allowAutoOpen || false, 
      createdBy || 'system',
      transactionType || 'transaction'
    );
  }

  /**
   * Clean up duplicate cash drawer accounts for a branch
   * This method should be called during app initialization to fix existing duplicates
   * NOTE: Multiple accounts per store are now valid (one per branch)
   * This only cleans up duplicates within the same branch
   */
  public async cleanupDuplicateAccounts(storeId: string, branchId: string): Promise<{
    success: boolean;
    duplicatesRemoved: number;
    error?: string;
  }> {
    return this.acquireOperationLock(`cleanup_${storeId}_${branchId}`, async () => {
      try {
        // Get all accounts for this store AND branch
        const allAccounts = await getDB().cash_drawer_accounts
          .where('[store_id+branch_id]')
          .equals([storeId, branchId])
          .toArray();

        if (allAccounts.length <= 1) {
          return {
            success: true,
            duplicatesRemoved: 0
          };
        }

        console.log(`🧹 Found ${allAccounts.length} cash drawer accounts for store ${storeId}, branch ${branchId}, cleaning up duplicates...`);

        // Find the best account to keep (most recent, active, with transactions)
        let accountToKeep = allAccounts[0];
        
        // Prefer active accounts
        const activeAccounts = allAccounts.filter(acc => (acc as any).is_active !== false);
        if (activeAccounts.length > 0) {
          accountToKeep = activeAccounts[0];
        }

        // Prefer accounts with the most recent activity
        accountToKeep = allAccounts.reduce((best, current) => {
          return new Date(current.updated_at) > new Date(best.updated_at) ? current : best;
        });

        // Get all sessions that reference the duplicate accounts
        const duplicateAccountIds = allAccounts
          .filter(acc => acc.id !== accountToKeep.id)
          .map(acc => acc.id);

        // Update all sessions to reference the account we're keeping
        for (const duplicateId of duplicateAccountIds) {
          await getDB().cash_drawer_sessions
            .where('account_id')
            .equals(duplicateId)
            .modify({
              account_id: accountToKeep.id,
              _synced: false
            });
        }

        // Calculate the combined balance from all accounts
        const totalBalance = allAccounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0);

        // Update the kept account with the combined balance
        await getDB().cash_drawer_accounts.update(accountToKeep.id, {
          current_balance: totalBalance,
          is_active: true,
          updated_at: new Date().toISOString(),
          _synced: false
        });

        // Delete the duplicate accounts
        for (const duplicateId of duplicateAccountIds) {
          await getDB().cash_drawer_accounts.delete(duplicateId);
        }

        const duplicatesRemoved = duplicateAccountIds.length;
        console.log(`✅ Cleaned up ${duplicatesRemoved} duplicate cash drawer accounts for store ${storeId}, branch ${branchId}`);
        console.log(`💰 Consolidated balance: $${totalBalance.toFixed(2)} in account ${accountToKeep.id}`);

        return {
          success: true,
          duplicatesRemoved
        };

      } catch (error) {
        console.error('Error cleaning up duplicate accounts:', error);
        return {
          success: false,
          duplicatesRemoved: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });
  }

  /**
   * Notify UI listeners about cash drawer changes
   */
  public notifyCashDrawerUpdate(storeId: string, newBalance: number, transactionId: string): void {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cash-drawer-updated', { 
          detail: {
            storeId,
            newBalance,
            transactionId,
            timestamp: new Date().toISOString()
          }
        }));
      }
    } catch (error) {
      // Silently fail in non-browser environments or if event dispatch fails
      console.debug('Could not dispatch cash drawer update event:', error);
    }
  }
}

export const cashDrawerUpdateService = CashDrawerUpdateService.getInstance();
