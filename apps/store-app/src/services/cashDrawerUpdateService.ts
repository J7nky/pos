import { db } from '../lib/db';
import { currencyService } from './currencyService';
import { BalanceCalculator } from '../utils/balanceCalculator';
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
        const existingSession = await db.getCurrentCashDrawerSession(storeId, branchId);
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
        const sessionId = await db.openCashDrawerSession(storeId, branchId, account.id, openingAmount, openedBy);
        
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
    const session = await db.cash_drawer_sessions.get(sessionId);
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
        await db.closeCashDrawerSession(sessionId, actualAmount, closedBy, notes);
        
        // Get the updated session to return details
        const session = await db.cash_drawer_sessions.get(sessionId);
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
   * Get current cash drawer balance - SINGLE SOURCE OF TRUTH
   * This method calculates balance from transactions to ensure accuracy
   * 🚀 CACHED for 5 seconds to improve performance
   */
  public async getCurrentCashDrawerBalance(storeId: string, branchId: string): Promise<number> {

    return PerformanceMonitor.withTracking(
      'cashDrawer:getBalance',
      async () => {
        const cacheKey = CacheKeys.balance(storeId, branchId);
        
        return CacheManager.withCache(
          cacheKey,
          CacheManager.TTL.MEDIUM, // 5 seconds
          async () => {
            try {
              // Get cash drawer account
              const account = await this.getCashDrawerAccount(storeId, branchId);
              if (!account) {
                console.warn('No cash drawer account exists for store', storeId);
                return 0;
              }

              // SINGLE SOURCE OF TRUTH: Calculate balance from transactions
              const calculatedBalance = await this.calculateBalanceFromTransactions(storeId, branchId);
              const storedBalance = Number((account as any)?.current_balance || 0);

              // If calculated balance differs from stored balance, reconcile
              if (Math.abs(calculatedBalance - storedBalance) > 0.01) {
                console.warn(`💰 Balance discrepancy detected: Stored: $${storedBalance.toFixed(2)}, Calculated: $${calculatedBalance.toFixed(2)}`);
                
                // Update stored balance to match calculated balance
                await db.cash_drawer_accounts.update(account?.id as string, {
                  current_balance: calculatedBalance as any,
                  updated_at: new Date().toISOString(),
                  _synced: false
                });
                
                console.log(`💰 Balance reconciled: $${storedBalance.toFixed(2)} → $${calculatedBalance.toFixed(2)}`);
                return calculatedBalance;
              }

              return calculatedBalance;
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
   * Calculate balance from current session and transactions - AUTHORITATIVE SOURCE
   * Uses BalanceCalculator utility for consistent calculation logic
   * 🚀 Performance monitored for optimization
   */
  private async calculateBalanceFromTransactions(storeId: string, branchId: string): Promise<number> {
    return PerformanceMonitor.withTracking(
      'cashDrawer:calculateBalance',
      async () => {
    console.log("verify open session",branchId,storeId)

        try {
          // Get the current active session
          const currentSession = await db.getCurrentCashDrawerSession(storeId, branchId);
          
          if (!currentSession) {
            console.log('💰 No active session found, balance is 0');
            return 0;
          }

          // Get all cash drawer transactions since session opened
          const cashTransactions = await QueryHelpers.byStore(db.transactions, storeId)
            .filter(trans => 
              trans.category.startsWith('cash_drawer_') &&
              new Date(trans.created_at) >= new Date(currentSession.opened_at)
            )
            .toArray();

          // Use BalanceCalculator for consistent balance calculation
          const result = BalanceCalculator.calculateRunningBalance(
            cashTransactions,
            currentSession.opening_amount || 0
          );

          console.log(`💰 Balance calculated: ${result.balance} (${result.transactionCount} transactions)`);
          return result.balance;
        } catch (error) {
          console.error('Error calculating balance from transactions:', error);
          return 0;
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
              const transactions = await QueryHelpers.byStore(db.transactions, storeId)
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
  private async getCashDrawerAccount(storeId: string, branchId: string) {
    // Validate inputs before making database call
    if (!storeId || !branchId) {
      console.warn(`⚠️ Invalid parameters for getCashDrawerAccount: storeId=${storeId}, branchId=${branchId}`);
      return null;
    }
    try {
      const account = await db.getCashDrawerAccount(storeId, branchId);
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
    
    let session = await db.getCurrentCashDrawerSession(storeId, branchId);
    
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
        session = await db.getCurrentCashDrawerSession(storeId, branchId);
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
        const allAccounts = await db.cash_drawer_accounts
          .where(['store_id', 'branch_id'])
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
          await db.cash_drawer_sessions
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
        await db.cash_drawer_accounts.update(accountToKeep.id, {
          current_balance: totalBalance,
          is_active: true,
          updated_at: new Date().toISOString(),
          _synced: false
        });

        // Delete the duplicate accounts
        for (const duplicateId of duplicateAccountIds) {
          await db.cash_drawer_accounts.delete(duplicateId);
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
