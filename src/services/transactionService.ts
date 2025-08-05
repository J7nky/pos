import { currencyService } from './currencyService';
import { Customer, Supplier, Transaction, AccountsReceivable, AccountsPayable } from '../types';

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  balanceBefore: number;
  balanceAfter: number;
  affectedRecords: string[];
}

export interface PaymentProcessingOptions {
  updateCustomerBalance?: boolean;
  updateSupplierBalance?: boolean;
  createReceivable?: boolean;
  createPayable?: boolean;
  updateCashDrawer?: boolean;
}

export class TransactionService {
  private static instance: TransactionService;

  private constructor() {}

  public static getInstance(): TransactionService {
    if (!TransactionService.instance) {
      TransactionService.instance = new TransactionService();
    }
    return TransactionService.instance;
  }

  public async processCustomerPayment(
    customerId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    createdBy: string,
    options: PaymentProcessingOptions = {}
  ): Promise<TransactionResult> {
    try {
      // Validate input
      if (!currencyService.validateCurrencyAmount(amount, currency)) {
        return {
          success: false,
          error: 'Invalid amount',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      const amountInUSD = currencyService.convertCurrency(amount, currency, 'USD');
      
      // Get customer data from localStorage
      const customers = JSON.parse(localStorage.getItem('erp_customers') || '[]');
      const customer = customers.find((c: Customer) => c.id === customerId);
      
      if (!customer) {
        return {
          success: false,
          error: 'Customer not found',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      const balanceBefore = customer.balance || 0;
      const balanceAfter = balanceBefore - amountInUSD; // Payment reduces debt

      // Update customer balance in localStorage
      if (options.updateCustomerBalance !== false) {
        const updatedCustomers = customers.map((c: Customer) => 
          c.id === customerId 
            ? { ...c, balance: balanceAfter } // Updated to use balance field
            : c
        );
        localStorage.setItem('erp_customers', JSON.stringify(updatedCustomers));
      }

      // Update accounts receivable in localStorage
      if (options.createReceivable !== false) {
        const receivables = JSON.parse(localStorage.getItem('erp_accounts_receivable') || '[]');
        const pendingReceivables = receivables.filter((ar: AccountsReceivable) => 
          ar.customerId === customerId && ar.status !== 'paid'
        );

        let remainingAmount = amountInUSD;
        const updatedReceivables = [...receivables];

        for (const receivable of pendingReceivables) {
          if (remainingAmount <= 0) break;
          
          const paymentAmount = Math.min(remainingAmount, receivable.amountDue);
          receivable.amountPaid += paymentAmount;
          receivable.amountDue -= paymentAmount;
          remainingAmount -= paymentAmount;
          
          if (receivable.amountDue === 0) {
            receivable.status = 'paid';
          } else {
            receivable.status = 'partial';
          }
        }

        localStorage.setItem('erp_accounts_receivable', JSON.stringify(updatedReceivables));
      }

      // Create transaction record
      const transaction: Transaction = {
        id: Date.now().toString(),
        type: 'income',
        category: 'Customer Payment',
        amount: amountInUSD,
        currency: 'USD',
        description: `${description} (Originally ${currency} ${amount})`,
        reference: `PAY-${Date.now()}`,
        createdAt: new Date().toISOString(),
        createdBy
      };

      const transactions = JSON.parse(localStorage.getItem('erp_transactions') || '[]');
      transactions.push(transaction);
      localStorage.setItem('erp_transactions', JSON.stringify(transactions));

      return {
        success: true,
        transactionId: transaction.id,
        balanceBefore,
        balanceAfter,
        affectedRecords: [customerId]
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };
    }
  }

  public async processSupplierPayment(
    supplierId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    createdBy: string,
    options: PaymentProcessingOptions = {}
  ): Promise<TransactionResult> {
    try {
      // Validate input
      if (!currencyService.validateCurrencyAmount(amount, currency)) {
        return {
          success: false,
          error: 'Invalid amount',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      const amountInUSD = currencyService.convertCurrency(amount, currency, 'USD');
      
      // Get supplier data from localStorage
      const suppliers = JSON.parse(localStorage.getItem('erp_suppliers') || '[]');
      const supplier = suppliers.find((s: Supplier) => s.id === supplierId);
      
      if (!supplier) {
        return {
          success: false,
          error: 'Supplier not found',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      const balanceBefore = supplier.balance || 0;
      const balanceAfter = balanceBefore - amountInUSD; // Payment reduces debt

      // Update supplier balance in localStorage
      if (options.updateSupplierBalance !== false) {
        const updatedSuppliers = suppliers.map((s: Supplier) => 
          s.id === supplierId 
            ? { ...s, balance: balanceAfter }
            : s
        );
        localStorage.setItem('erp_suppliers', JSON.stringify(updatedSuppliers));
      }

      // Update accounts payable in localStorage
      if (options.createPayable !== false) {
        const payables = JSON.parse(localStorage.getItem('erp_accounts_payable') || '[]');
        const pendingPayables = payables.filter((ap: AccountsPayable) => 
          ap.supplierId === supplierId && ap.status !== 'paid'
        );

        let remainingAmount = amountInUSD;
        const updatedPayables = [...payables];

        for (const payable of pendingPayables) {
          if (remainingAmount <= 0) break;
          
          const paymentAmount = Math.min(remainingAmount, payable.amountDue);
          payable.amountPaid += paymentAmount;
          payable.amountDue -= paymentAmount;
          remainingAmount -= paymentAmount;
          
          if (payable.amountDue === 0) {
            payable.status = 'paid';
          } else {
            payable.status = 'partial';
          }
        }

        localStorage.setItem('erp_accounts_payable', JSON.stringify(updatedPayables));
      }

      // Create transaction record
      const transaction: Transaction = {
        id: Date.now().toString(),
        type: 'expense',
        category: 'Supplier Payment',
        amount: amountInUSD,
        currency: 'USD',
        description: `${description} (Originally ${currency} ${amount})`,
        reference: `PAY-${Date.now()}`,
        createdAt: new Date().toISOString(),
        createdBy
      };

      const transactions = JSON.parse(localStorage.getItem('erp_transactions') || '[]');
      transactions.push(transaction);
      localStorage.setItem('erp_transactions', JSON.stringify(transactions));

      return {
        success: true,
        transactionId: transaction.id,
        balanceBefore,
        balanceAfter,
        affectedRecords: [supplierId]
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };
    }
  }

  public async processExpense(
    amount: number,
    currency: 'USD' | 'LBP',
    category: string,
    description: string,
    createdBy: string
  ): Promise<TransactionResult> {
    try {
      // Validate input
      if (!currencyService.validateCurrencyAmount(amount, currency)) {
        return {
          success: false,
          error: 'Invalid amount',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      const amountInUSD = currencyService.convertCurrency(amount, currency, 'USD');

      // Create transaction record
      const transaction: Transaction = {
        id: Date.now().toString(),
        type: 'expense',
        category,
        amount: amountInUSD,
        currency: 'USD',
        description: `${description} (Originally ${currency} ${amount})`,
        reference: `EXP-${Date.now()}`,
        createdAt: new Date().toISOString(),
        createdBy
      };

      const transactions = JSON.parse(localStorage.getItem('erp_transactions') || '[]');
      transactions.push(transaction);
      localStorage.setItem('erp_transactions', JSON.stringify(transactions));

      return {
        success: true,
        transactionId: transaction.id,
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };
    }
  }

  public getTransactionHistory(
    entityId?: string,
    startDate?: string,
    endDate?: string
  ): Transaction[] {
    try {
      const transactions = JSON.parse(localStorage.getItem('erp_transactions') || '[]');
      
      let filteredTransactions = transactions;

      // Filter by entity if provided
      if (entityId) {
        // For now, we'll return all transactions since we don't have entity linking
        // This can be enhanced later to filter by customer/supplier transactions
        filteredTransactions = transactions;
      }

      // Filter by date range if provided
      if (startDate || endDate) {
        filteredTransactions = filteredTransactions.filter((t: Transaction) => {
          if (!t.createdAt) return false;
          const transactionDate = new Date(t.createdAt);
          const start = startDate ? new Date(startDate) : new Date(0);
          const end = endDate ? new Date(endDate) : new Date();
          
          return transactionDate >= start && transactionDate <= end;
        });
      }

      return filteredTransactions
        .filter((t: Transaction) => t.createdAt)
        .sort((a: Transaction, b: Transaction) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

    } catch (error) {
      console.error('Error getting transaction history:', error);
      return [];
    }
  }
}

export const transactionService = TransactionService.getInstance(); 