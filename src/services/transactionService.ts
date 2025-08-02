import { currencyService } from './currencyService';
import { 
  Transaction, 
  AccountsReceivable, 
  AccountsPayable, 
  Customer, 
  Supplier 
} from '../types';

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
      
      // Get customer data (this would come from your data context)
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

      const balanceBefore = customer.balance || 0; // Updated to use balance field with null safety
      const balanceAfter = Math.max(0, balanceBefore - amountInUSD);

      // Update customer balance if requested
      if (options.updateCustomerBalance !== false) {
        const updatedCustomers = customers.map((c: Customer) => 
          c.id === customerId 
            ? { ...c, balance: balanceAfter } // Updated to use balance field
            : c
        );
        localStorage.setItem('erp_customers', JSON.stringify(updatedCustomers));
      }

      // Update accounts receivable
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
            receivable.lastPaymentDate = new Date().toISOString();
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
      
      // Get supplier data
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

      // Calculate current balance owed to supplier
      const payables = JSON.parse(localStorage.getItem('erp_accounts_payable') || '[]');
      const supplierPayables = payables.filter((ap: AccountsPayable) => 
        ap.supplierId === supplierId && ap.status !== 'paid'
      );
      
      const balanceBefore = supplierPayables.reduce((sum: number, ap: AccountsPayable) => 
        sum + ap.amountDue, 0
      );

      // Update accounts payable
      if (options.createPayable !== false) {
        let remainingPayment = amountInUSD;
        const updatedPayables = [...payables];

        // Pay down existing payables first
        for (const payable of supplierPayables) {
          if (remainingPayment <= 0) break;
          
          const paymentAmount = Math.min(remainingPayment, payable.amountDue);
          payable.amountPaid += paymentAmount;
          payable.amountDue -= paymentAmount;
          remainingPayment -= paymentAmount;
          
          if (payable.amountDue === 0) {
            payable.status = 'paid';
            payable.lastPaymentDate = new Date().toISOString();
          } else {
            payable.status = 'partial';
          }
        }

        // If there's remaining payment, create a credit entry
        if (remainingPayment > 0) {
          const creditPayable: AccountsPayable = {
            id: Date.now().toString(),
            supplierId,
            supplierName: supplier.name,
            invoiceNumber: `CREDIT-${Date.now()}`,
            amount: remainingPayment,
            amountPaid: remainingPayment,
            amountDue: -remainingPayment, // Negative indicates credit
            dueDate: new Date().toISOString().split('T')[0],
            status: 'paid',
            description: `Payment credit to ${supplier.name}`,
            createdAt: new Date().toISOString()
          };
          updatedPayables.push(creditPayable);
        }

        localStorage.setItem('erp_accounts_payable', JSON.stringify(updatedPayables));
      }

      const balanceAfter = Math.max(0, balanceBefore - amountInUSD);

      // Create transaction record
      const transaction: Transaction = {
        id: Date.now().toString(),
        type: 'expense',
        category: 'Supplier Payment',
        amount: amountInUSD,
        currency: 'USD',
        description: `${description} (Originally ${currency} ${amount})`,
        reference: `SUP-PAY-${Date.now()}`,
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
    const transactions = JSON.parse(localStorage.getItem('erp_transactions') || '[]');
    
    let filtered = transactions;

    if (entityId) {
      // Filter by entity if needed
      filtered = filtered.filter((t: Transaction) => 
        t.description.includes(entityId)
      );
    }

    if (startDate) {
      filtered = filtered.filter((t: Transaction) => 
        new Date(t.createdAt) >= new Date(startDate)
      );
    }

    if (endDate) {
      filtered = filtered.filter((t: Transaction) => 
        new Date(t.createdAt) <= new Date(endDate)
      );
    }

    return filtered.sort((a: Transaction, b: Transaction) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

export const transactionService = TransactionService.getInstance(); 