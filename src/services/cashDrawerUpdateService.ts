import { db } from '../lib/db';
import { createId } from '../lib/db';

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

  private constructor() {}

  public static getInstance(): CashDrawerUpdateService {
    if (!CashDrawerUpdateService.instance) {
      CashDrawerUpdateService.instance = new CashDrawerUpdateService();
    }
    return CashDrawerUpdateService.instance;
  }

  /**
   * Automatically update cash drawer when a cash transaction occurs
   */
  public async updateCashDrawerForTransaction(
    transactionData: CashTransactionData
  ): Promise<CashDrawerUpdateResult> {
    try {
      // Only process cash transactions
      if (transactionData.currency !== 'USD') {
        return {
          success: false,
          previousBalance: 0,
          newBalance: 0,
          error: 'Only USD transactions are supported for cash drawer updates'
        };
      }

      // Get current cash drawer account
      let account = await db.getCashDrawerAccount(transactionData.storeId);
      if (!account) {
        // Create default account if it doesn't exist
        account = {
          id: createId(),
          store_id: transactionData.storeId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _synced: false,
          accountCode: '1001',
          name: 'Cash Drawer',
          currentBalance: 0,
          currency: 'USD',
          isActive: true
        };
        await db.cash_drawer_accounts.add(account);
        console.log('💰 Created default cash drawer account for store:', transactionData.storeId);
      }

      // Get current cash drawer session
      const session = await db.getCurrentCashDrawerSession(transactionData.storeId);
      if (!session) {
        return {
          success: false,
          previousBalance: account.currentBalance,
          newBalance: account.currentBalance,
          error: 'No active cash drawer session'
        };
      }

      const previousBalance = account.currentBalance;
      let balanceChange = 0;

      // Calculate balance change based on transaction type
      switch (transactionData.type) {
        case 'sale':
          // Cash sales increase cash drawer
          balanceChange = transactionData.amount;
          break;
        case 'payment':
          // Customer payments increase cash drawer
          balanceChange = transactionData.amount;
          break;
        case 'expense':
          // Expenses decrease cash drawer
          balanceChange = -transactionData.amount;
          break;
        case 'refund':
          // Refunds decrease cash drawer
          balanceChange = -transactionData.amount;
          break;
        default:
          return {
            success: false,
            previousBalance,
            newBalance: previousBalance,
            error: `Unsupported transaction type: ${transactionData.type}`
          };
      }

      // Update cash drawer account balance
      const newBalance = previousBalance + balanceChange;
      await db.cash_drawer_accounts.update(account.id, {
        currentBalance: newBalance,
        updated_at: new Date().toISOString(),
        _synced: false
      });

      // Create transaction record for cash drawer tracking
      const transactionId = createId();
      await db.transactions.add({
        id: transactionId,
        type: balanceChange > 0 ? 'income' : 'expense',
        category: `cash_drawer_${transactionData.type}`,
        amount: Math.abs(balanceChange),
        currency: 'USD',
        description: `${transactionData.description} - Cash Drawer Update`,
        reference: transactionData.reference,
        store_id: transactionData.storeId,
        created_by: transactionData.createdBy,
        created_at: new Date().toISOString(),
        _synced: false
      });

      console.log(`💰 Cash drawer updated: ${transactionData.type} - $${balanceChange.toFixed(2)} (Balance: $${previousBalance.toFixed(2)} → $${newBalance.toFixed(2)})`);

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
      customerId: paymentData.customerId
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
    }
  ): Promise<CashDrawerUpdateResult> {
    return this.updateCashDrawerForTransaction({
      type: 'expense',
      amount: expenseData.amount,
      currency: expenseData.currency,
      description: `${expenseData.category}: ${expenseData.description}`,
      reference: `EXP-${Date.now()}`,
      storeId: expenseData.storeId,
      createdBy: expenseData.createdBy
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
   * Get current cash drawer balance
   */
  public async getCurrentCashDrawerBalance(storeId: string): Promise<number> {
    try {
      let account = await db.getCashDrawerAccount(storeId);
      if (!account) {
        // Create default account if it doesn't exist
        account = {
          id: createId(),
          store_id: storeId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _synced: false,
          accountCode: '1001',
          name: 'Cash Drawer',
          currentBalance: 0,
          currency: 'USD',
          isActive: true
        };
        await db.cash_drawer_accounts.add(account);
        console.log('💰 Created default cash drawer account for store:', storeId);
      }
      return account?.currentBalance || 0;
    } catch (error) {
      console.error('Error getting cash drawer balance:', error);
      return 0;
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
}

export const cashDrawerUpdateService = CashDrawerUpdateService.getInstance();
