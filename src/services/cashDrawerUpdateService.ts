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
      // Determine preferred storage currency and normalize amount to it
      const currency = transactionData.preferredCurrency || transactionData.currency || 'LBP';
      const normalizedAmount = transactionData.currency === currency
        ? transactionData.amount
        : currencyService.convertCurrency(transactionData.amount, transactionData.currency, currency);

      // Get or create cash drawer account (single consolidated check)
      let account = await db.getCashDrawerAccount(transactionData.storeId);
      if (!account) {
        try {
          account = {
            id: createId(),
            store_id: transactionData.storeId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            _synced: false,
            accountCode: '1001',
            name: 'Cash Drawer',
            current_balance: 0,
            currency: currency,
            isActive: true
          };
          await db.cash_drawer_accounts.add(account);
          console.log('💰 Created cash drawer account for store:', transactionData.storeId);
        } catch (error) {
          console.error('Error creating a new cash account:', error);
        }
      }
      if (!account) {
        return {
          success: false,
          previousBalance: 0,
          newBalance: 0,
          error: 'Cash drawer account not found'
        };
      }

      // Get current cash drawer session
      let session = await db.getCurrentCashDrawerSession(transactionData.storeId);
      if (!session) {
       session={
        id: createId(),
        store_id: transactionData.storeId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _synced: false,
        accountId: account?.id||'',
        openedBy: transactionData.createdBy || '',
        openedAt: new Date().toISOString(),
        openingAmount: 0,
        expectedAmount: 0,
        actualAmount: 0,
        variance: 0,
        status: 'open' ,
        notes: ''
       }
       await db.cash_drawer_sessions.add(session);
       console.log('💰 Created cash drawer session for store:', transactionData.storeId);
      }

      const previousBalance = Number((account as any).current_balance ?? 0) || 0;
      let balanceChange = 0;

      // Calculate balance change based on transaction type
      switch (transactionData.type) {
        case 'sale':
          // Cash sales increase cash drawer
          balanceChange = normalizedAmount;
          break;
        case 'payment':
          // Customer payments increase cash drawer
          balanceChange = normalizedAmount;
          break;
        case 'expense':
          // Expenses decrease cash drawer
          balanceChange = -normalizedAmount;
          break;
        case 'refund':
          // Refunds decrease cash drawer
          balanceChange = -normalizedAmount;
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
      const newBalance = Number(previousBalance) + Number(balanceChange);
      await db.cash_drawer_accounts.update(account.id, {
        current_balance: newBalance as any,
        updated_at: new Date().toISOString(),
        _synced: false
      } as any);

      // Create transaction record for cash drawer tracking
      const transactionId = createId();
      await db.transactions.add({
        id: transactionId,
        type: balanceChange > 0 ? 'income' : 'expense',
        category: `cash_drawer_${transactionData.type}`,
        amount: Math.abs(balanceChange),
        currency: currency,
        description: `${transactionData.description} - Cash Drawer Update`,
        reference: transactionData.reference,
        store_id: transactionData.storeId,
        created_by: transactionData.createdBy,
        created_at: new Date().toISOString(),
        _synced: false
      });

      console.log(`💰 Cash drawer updated: ${transactionData.type} - $${balanceChange.toFixed(2)} (Balance: $${previousBalance.toFixed(2)} → $${newBalance.toFixed(2)})`);

      // Notify UI listeners about cash drawer change
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cash-drawer-updated', { detail: {
            storeId: transactionData.storeId,
            newBalance,
            transactionId
          }}));
        }
      } catch (e) {
        // no-op in non-browser environments
      }

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
          current_balance: 0,
          currency: 'USD',
          isActive: true
        };
        await db.cash_drawer_accounts.add(account);
        console.log('💰 Created default cash drawer account for store:', storeId);
      }
      return (account as any)?.current_balance || 0;
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
