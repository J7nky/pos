import { db } from '../lib/db';
import { createId } from '../lib/db';
// Removed React hook import to avoid invalid hook usage in a service context
import { currencyService } from './currencyService';

export interface CashTransactionData {
  type: 'sale' | 'payment' | 'expense' | 'refund';
  amount: number;
  currency: 'USD' | 'LBP';
  description: string;
  reference: string;
  storeId: string;
  createdBy: string;
  sessionId?: string;
  customerId?: string;
  supplierId?: string;
  preferredCurrency?: 'USD' | 'LBP';
  allowAutoSessionOpen?: boolean; // Allow automatic session opening for hooks
}


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
    openingAmount: number,
    openedBy: string,
    notes?: string
  ): Promise<{
    success: boolean;
    sessionId?: string;
    error?: string;
  }> {
    console.log('Opening cash drawer session');
    
    // Use operation lock to prevent concurrent session operations
    return this.acquireOperationLock(storeId, async () => {
      try {
      // Check if there's already an active session
      const existingSession = await db.getCurrentCashDrawerSession(storeId);
      if (existingSession && existingSession.status === 'open') {
        return {
          success: false,
          error: `Cash drawer session already open (opened by ${existingSession.openedBy} at ${new Date(existingSession.openedAt).toLocaleString()})`
        };
      }

      // Get or create cash drawer account (use the private method for proper duplicate prevention)
      const account = await this.getOrCreateCashDrawerAccount(storeId, 'USD');
      if (!account) {
        return {
          success: false,
          error: 'Failed to create or retrieve cash drawer account'
        };
      }

      // Open new session using database method
      const sessionId = await db.openCashDrawerSession(storeId, account.id, openingAmount, openedBy);
      
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
    
    // Get session to determine store ID for locking
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
        expectedAmount: session.expectedAmount || 0,
        actualAmount: session.actualAmount || 0,
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
   * Automatically update cash drawer when a cash transaction occurs
   * Protected against race conditions with operation locking
   */
  public async updateCashDrawerForTransaction(
    transactionData: CashTransactionData
  ): Promise<CashDrawerUpdateResult> {
    
    // Validate input data
    if (!this.validateTransactionData(transactionData)) {
      return {
        success: false,
        previousBalance: 0,
        newBalance: 0,
        error: 'Invalid transaction data provided'
      };
    }

    // Use operation lock to prevent race conditions
    return this.acquireOperationLock(transactionData.storeId, async () => {
      try {
        // Get store's preferred currency from cash drawer account
        const storeCurrency = await this.getStorePreferredCurrency(transactionData.storeId);
        
        // Normalize amount to store's preferred currency
        const normalizedAmount = this.normalizeAmountToStoreCurrency(
          transactionData.amount, 
          storeCurrency, 
          storeCurrency
        );

        // Get or create cash drawer account
        const account = await this.getOrCreateCashDrawerAccount(transactionData.storeId, storeCurrency);
        if (!account) {
          return {
            success: false,
            previousBalance: 0,
            newBalance: 0,
            error: 'Failed to create or retrieve cash drawer account'
          };
        }

        // Get current cash drawer session
        const session = await this.getOrCreateCashDrawerSession(transactionData, account);
        if (!session) {
          return {
            success: false,
            previousBalance: 0,
            newBalance: 0,
            error: 'No active cash drawer session and auto-opening not allowed'
          };
        }

        // Get current balance and calculate changes
        const previousBalance = Number(account.current_balance ?? 0) || 0;
        const balanceChange = this.calculateBalanceChange(transactionData.type, normalizedAmount);
        
        if (balanceChange === null) {
          return {
            success: false,
            previousBalance,
            newBalance: previousBalance,
            error: `Unsupported transaction type: ${transactionData.type}`
          };
        }

        // Validate balance change
        if (balanceChange < 0 && Math.abs(balanceChange) > previousBalance) {
          return {
            success: false,
            previousBalance,
            newBalance: previousBalance,
            error: `Insufficient funds in cash drawer. Required: $${Math.abs(balanceChange).toFixed(2)}, Available: $${previousBalance.toFixed(2)}`
          };
        }

        // Update cash drawer account balance with transaction rollback on failure
        const newBalance = Number(previousBalance) + Number(balanceChange);
        const transactionId = createId();
        
        try {
          // Use database transaction to ensure atomicity
          await db.transaction('rw', [db.cash_drawer_accounts, db.transactions], async () => {
            // Update cash drawer account balance
            await db.cash_drawer_accounts.update(account.id, {
              current_balance: newBalance as any,
              updated_at: new Date().toISOString(),
              _synced: false
            } as any);

            // Create transaction record for cash drawer tracking
            await db.transactions.add({
              id: transactionId,
              type: balanceChange > 0 ? 'income' : 'expense',
              category: `cash_drawer_${transactionData.type}`,
              amount: Math.abs(balanceChange),
              currency: storeCurrency,
              description: `${transactionData.description} - Cash Drawer Update`,
              reference: transactionData.reference,
              store_id: transactionData.storeId,
              created_by: transactionData.createdBy,
              created_at: new Date().toISOString(),
              _synced: false
            });
          });
        } catch (dbError) {
          console.error('Database transaction failed, rolling back cash drawer update:', dbError);
          throw new Error(`Failed to update cash drawer: ${dbError instanceof Error ? dbError.message : 'Database error'}`);
        }

        console.log(`💰 Cash drawer updated: ${transactionData.type} - $${balanceChange.toFixed(2)} (Balance: $${previousBalance.toFixed(2)} → $${newBalance.toFixed(2)})`);

        // Notify UI listeners about cash drawer change
        this.notifyCashDrawerUpdate(transactionData.storeId, newBalance, transactionId);

        return {
          success: true,
          previousBalance,
          newBalance,
          transactionId
        };

      } catch (error) {
        console.error('Error updating cash drawer for transaction:', error);
        return {
          success: false,
          previousBalance: 0,
          newBalance: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });
  }

  /**
   * Update cash drawer for a cash sale
   */
  public async updateCashDrawerForSale(
    saleData: {
      
      amount: number;
      currency: 'USD' | 'LBP';
      paymentMethod: string;
      storeId: string;
      createdBy: string;
      customerId?: string;
      billNumber?: string;

    }
  ): Promise<CashDrawerUpdateResult> {
    // Only update for cash sales
    if (saleData.paymentMethod !== 'cash') {
      return {
        success: true,
        previousBalance: 0,
        newBalance: 0
      };
    }

    return this.updateCashDrawerForTransaction({
      type: 'sale',
      amount: saleData.amount,
      currency: saleData.currency,
      description: `Cash sale${saleData.customerId ? ' to customer' : ''}`,
      reference: saleData.billNumber || `SALE-${Date.now()}`,
      storeId: saleData.storeId,
      createdBy: saleData.createdBy,
      customerId: saleData.customerId
    });
  }

  /**
   * Update cash drawer for a customer payment
   */
  public async updateCashDrawerForCustomerPayment(
    paymentData: {
      amount: number;
      currency: 'USD' | 'LBP';
      storeId: string;
      createdBy: string;
      customerId: string;
      description?: string;
      allowAutoSessionOpen?: boolean;
    }
  ): Promise<CashDrawerUpdateResult> {
    return this.updateCashDrawerForTransaction({
      type: 'payment',
      amount: paymentData.amount,
      currency: paymentData.currency,
      description: paymentData.description || `Customer payment`,
      reference: `PAY-${Date.now()}`,
      storeId: paymentData.storeId,
      createdBy: paymentData.createdBy,
      customerId: paymentData.customerId,
      allowAutoSessionOpen: paymentData.allowAutoSessionOpen
    });
  }

  /**
   * Update cash drawer for an expense
   */
  public async updateCashDrawerForExpense(
    expenseData: {
      amount: number;
      currency: 'USD' | 'LBP';
      storeId: string;
      createdBy: string;
      description: string;
      category: string;
      allowAutoSessionOpen?: boolean;
    }
  ): Promise<CashDrawerUpdateResult> {
    return this.updateCashDrawerForTransaction({
      type: 'expense',
      amount: expenseData.amount,
      currency: expenseData.currency,
      description: `${expenseData.category}: ${expenseData.description}`,
      reference: `EXP-${Date.now()}`,
      storeId: expenseData.storeId,
      createdBy: expenseData.createdBy,
      allowAutoSessionOpen: expenseData.allowAutoSessionOpen
    });
  }

  /**
   * Update cash drawer for a refund
   */
  public async updateCashDrawerForRefund(
    refundData: {
      amount: number;
      currency: 'USD' | 'LBP';
      storeId: string;
      createdBy: string;
      description: string;
      originalTransactionId?: string;
    }
  ): Promise<CashDrawerUpdateResult> {
    return this.updateCashDrawerForTransaction({
      type: 'refund',
      amount: refundData.amount,
      currency: refundData.currency,
      description: `Refund: ${refundData.description}`,
      reference: refundData.originalTransactionId || `REFUND-${Date.now()}`,
      storeId: refundData.storeId,
      createdBy: refundData.createdBy
    });
  }

  /**
   * Get current cash drawer balance - SINGLE SOURCE OF TRUTH
   * This method calculates balance from transactions to ensure accuracy
   */
  public async getCurrentCashDrawerBalance(storeId: string): Promise<number> {
    try {
      let account = await db.getCashDrawerAccount(storeId);
      if (!account) {
        // Use the private method for proper duplicate prevention
        account = await this.getOrCreateCashDrawerAccount(storeId, 'USD');
        if (!account) {
          console.error(`💰 Failed to create cash drawer account for store: ${storeId}`);
          return 0;
        }
        return 0;
      }

      // SINGLE SOURCE OF TRUTH: Calculate balance from transactions
      const calculatedBalance = await this.calculateBalanceFromTransactions(storeId);
      const storedBalance = Number((account as any)?.current_balance || 0);

      // If calculated balance differs from stored balance, reconcile
      if (Math.abs(calculatedBalance - storedBalance) > 0.01) {
        console.warn(`💰 Balance discrepancy detected: Stored: $${storedBalance.toFixed(2)}, Calculated: $${calculatedBalance.toFixed(2)}`);
        
        // Update stored balance to match calculated balance
        await db.cash_drawer_accounts.update(account.id, {
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

  /**
   * Calculate balance from all cash drawer transactions - AUTHORITATIVE SOURCE
   */
  private async calculateBalanceFromTransactions(storeId: string): Promise<number> {
    try {
      // Get all cash drawer transactions
      const cashTransactions = await db.transactions
        .filter(trans => 
          trans.store_id === storeId &&
          trans.category.startsWith('cash_drawer_')
        )
        .toArray();

      // Get all cash drawer sessions to get opening amounts
      const sessions = await db.cash_drawer_sessions
        .where('store_id')
        .equals(storeId)
        .toArray();

      // Start with all session opening amounts
      let totalBalance = sessions.reduce((sum, session) => sum + (session.openingAmount || 0), 0);

      // Add all income transactions and subtract all expense transactions
      for (const trans of cashTransactions) {
        if (trans.type === 'income') {
          totalBalance += trans.amount;
        } else if (trans.type === 'expense') {
          totalBalance -= trans.amount;
        }
      }

      return totalBalance;
    } catch (error) {
      console.error('Error calculating balance from transactions:', error);
      return 0;
    }
  }

  /**
   * Get store's preferred currency from stores table
   */
  public async getStorePreferredCurrency(storeId: string): Promise<'USD' | 'LBP'> {
    try {
      // Import SupabaseService dynamically to avoid circular dependencies
      const { SupabaseService } = await import('./supabaseService');
      const store = await SupabaseService.getStore(storeId);
      
      if (store && store.preferred_currency) {
        console.log(`💰 Store ${storeId} preferred currency: ${store.preferred_currency}`);
        return store.preferred_currency;
      }
      
      console.warn(`💰 Store ${storeId} has no preferred_currency set, using USD as default`);
      // Fallback to default currency
      return 'LBP';
    } catch (error) {
      console.warn(`💰 Could not determine store currency from stores table for store ${storeId}, using USD as default:`, error);
      return 'LBP';
    }
  }

  /**
   * Get cash drawer transaction history
   */
  public async getCashDrawerTransactionHistory(
    storeId: string,
    startDate?: string,
    endDate?: string
  ): Promise<any[]> {
    try {
      const transactions = await db.transactions
        .where('store_id')
        .equals(storeId)
        .filter(trans => trans.category.startsWith('cash_drawer_'))
        .toArray();

      let filteredTransactions = transactions;

      // Apply date filters if provided
      if (startDate || endDate) {
        filteredTransactions = filteredTransactions.filter(trans => {
          const transactionDate = new Date(trans.created_at);
          const start = startDate ? new Date(startDate) : new Date(0);
          const end = endDate ? new Date(endDate) : new Date();
          
          return transactionDate >= start && transactionDate <= end;
        });
      }

      return filteredTransactions.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } catch (error) {
      console.error('Error getting cash drawer transaction history:', error);
      return [];
    }
  }

  /**
   * Validate transaction data before processing
   */
  private validateTransactionData(data: CashTransactionData): boolean {
    if (!data.storeId || !data.createdBy || !data.reference) {
      console.error('Missing required transaction data:', { storeId: data.storeId, createdBy: data.createdBy, reference: data.reference });
      return false;
    }

    if (typeof data.amount !== 'number' || data.amount <= 0) {
      console.error('Invalid amount:', data.amount);
      return false;
    }

    if (!['sale', 'payment', 'expense', 'refund'].includes(data.type)) {
      console.error('Invalid transaction type:', data.type);
      return false;
    }

    if (!data.currency || !['USD', 'LBP'].includes(data.currency)) {
      console.error('Invalid currency:', data.currency);
      return false;
    }

    return true;
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
      return amount; // Fallback to original amount
    }
  }

  /**
   * Get or create cash drawer account with proper duplicate prevention
   */
  private async getOrCreateCashDrawerAccount(storeId: string, storeCurrency: 'USD' | 'LBP') {
    try {
      let account = await db.getCashDrawerAccount(storeId);
      if (!account) {
        // Double-check for race conditions - another process might have created an account
        account = await db.getCashDrawerAccount(storeId);
        if (account) {
          console.log(`💰 Found existing cash drawer account after race condition check: ${account.id}`);
          return account;
        }
        
        // Get the store's preferred currency from the stores table
        const actualStoreCurrency = await this.getStorePreferredCurrency(storeId);
        
        account = {
          id: createId(),
          store_id: storeId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _synced: false,
          accountCode: '1001',
          name: 'Cash Drawer',
          current_balance: 0,
          currency: actualStoreCurrency,
          isActive: true
        };
        
        try {
          await db.cash_drawer_accounts.add(account);
          console.log(`💰 Created cash drawer account for store: ${storeId} with currency: ${actualStoreCurrency}`);
        } catch (addError) {
          // If add fails due to duplicate key, try to get the existing account
          console.warn('Account creation failed, checking for existing account:', addError);
          const existingAccount = await db.getCashDrawerAccount(storeId);
          if (existingAccount) {
            console.log(`💰 Using existing account found after creation failure: ${existingAccount.id}`);
            return existingAccount;
          }
          throw addError;
        }
      }
      return account;
    } catch (error) {
      console.error('Error creating/retrieving cash drawer account:', error);
      return null;
    }
  }

  /**
   * Get or create cash drawer session based on transaction requirements
   */
  private async getOrCreateCashDrawerSession(
    transactionData: CashTransactionData, 
    account: any
  ): Promise<any> {
    let session = await db.getCurrentCashDrawerSession(transactionData.storeId);
    
    if (!session || session.status !== 'open') {
      // If auto-open is allowed (for hooks), try to open a session
      if (transactionData.allowAutoSessionOpen) {
        console.log('💰 No active session found, auto-opening for transaction hook');
        
        const sessionResult = await this.openCashDrawerSession(
          transactionData.storeId,
          0, // Start with 0 opening amount
          transactionData.createdBy,
          `Auto-opened for ${transactionData.type}`
        );
        
        if (!sessionResult.success) {
          console.error('Failed to auto-open session:', sessionResult.error);
          return null;
        }
        
        // Get the newly opened session
        session = await db.getCurrentCashDrawerSession(transactionData.storeId);
      } else {
        console.warn('No active cash drawer session and auto-opening not allowed');
        return null;
      }
    }
    
    return session;
  }

  /**
   * Calculate balance change based on transaction type
   */
  private calculateBalanceChange(transactionType: string, amount: number): number | null {
    switch (transactionType) {
      case 'sale':
      case 'payment':
        // Cash sales and customer payments increase cash drawer
        return amount;
      case 'expense':
      case 'refund':
        // Expenses and refunds decrease cash drawer
        return -amount;
      default:
        return null;
    }
  }

  /**
   * Notify UI listeners about cash drawer changes
   */
  private notifyCashDrawerUpdate(storeId: string, newBalance: number, transactionId: string): void {
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
