import { Transaction } from '../types';
import { 
  PAYMENT_CATEGORIES, 
  PAYMENT_TYPES, 
  isPaymentTransaction, 
  isCustomerPayment, 
  isSupplierPayment,
  getPaymentDirection,
  getPaymentEntityType
} from '../constants/paymentCategories';

export interface PaymentFilter {
  entityType?: 'customer' | 'supplier';
  entityId?: string;
  direction?: 'received' | 'paid';
  currency?: 'USD' | 'LBP';
  startDate?: string;
  endDate?: string;
  storeId?: string;
}

export interface PaymentSummary {
  totalReceived: number;
  totalPaid: number;
  netAmount: number;
  receivedCount: number;
  paidCount: number;
  currency: 'USD' | 'LBP';
}

export interface PaymentTransaction extends Transaction {
  paymentDirection: 'received' | 'paid';
  entityType: 'customer' | 'supplier' | 'unknown';
  entityName?: string;
}

export class PaymentService {
  private static instance: PaymentService;

  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Filter transactions to get only payment transactions
   */
  public filterPaymentTransactions(
    transactions: Transaction[], 
    filter: PaymentFilter = {}
  ): PaymentTransaction[] {

    let filteredTransactions = transactions.filter(isPaymentTransaction);

    // Apply entity type filter
    if (filter.entityType) {
      if (filter.entityType === 'customer') {
        filteredTransactions = filteredTransactions.filter(isCustomerPayment);
      } else if (filter.entityType === 'supplier') {
        filteredTransactions = filteredTransactions.filter(isSupplierPayment);
      }
    }

    // Apply entity ID filter
    if (filter.entityId) {
      filteredTransactions = filteredTransactions.filter(t => 
        t.customer_id === filter.entityId || t.supplier_id === filter.entityId
      );
    }

    // Apply direction filter
    if (filter.direction) {
      filteredTransactions = filteredTransactions.filter(t => 
        getPaymentDirection(t) === filter.direction
      );
    }

    // Apply currency filter
    if (filter.currency) {
      filteredTransactions = filteredTransactions.filter(t => 
        t.currency === filter.currency
      );
    }

    // Apply date range filter
    if (filter.startDate || filter.endDate) {
      filteredTransactions = filteredTransactions.filter(t => {
        if (!t.created_at) return false;
        const transactionDate = new Date(t.created_at);
        const start = filter.startDate ? new Date(filter.startDate) : new Date(0);
        const end = filter.endDate ? new Date(filter.endDate) : new Date();
        return transactionDate >= start && transactionDate <= end;
      });
    }

    // Apply store filter
    if (filter.storeId) {
      filteredTransactions = filteredTransactions.filter(t => 
        t.store_id === filter.storeId
      );
    }

    // Enhance transactions with payment-specific data
    return filteredTransactions.map(t => ({
      ...t,
      paymentDirection: getPaymentDirection(t),
      entityType: getPaymentEntityType(t)
    }));
  }

  /**
   * Get payment transactions for a specific day
   */
  public getTodaysPayments(
    transactions: Transaction[], 
    today: string,
    filter: Omit<PaymentFilter, 'startDate' | 'endDate'> = {}
  ): PaymentTransaction[] {
    return this.filterPaymentTransactions(transactions, {
      ...filter,
      startDate: today,
      endDate: today
    });
  }

  /**
   * Get customer payments
   */
  public getCustomerPayments(
    transactions: Transaction[],
    customerId?: string,
    filter: Omit<PaymentFilter, 'entityType' | 'entityId'> = {}
  ): PaymentTransaction[] {
    return this.filterPaymentTransactions(transactions, {
      ...filter,
      entityType: 'customer',
      entityId: customerId
    });
  }

  /**
   * Get supplier payments
   */
  public getSupplierPayments(
    transactions: Transaction[],
    supplierId?: string,
    filter: Omit<PaymentFilter, 'entityType' | 'entityId'> = {}
  ): PaymentTransaction[] {
    return this.filterPaymentTransactions(transactions, {
      ...filter,
      entityType: 'supplier',
      entityId: supplierId
    });
  }

  /**
   * Calculate payment summary for a set of transactions
   */
  public calculatePaymentSummary(
    transactions: Transaction[],
    currency: 'USD' | 'LBP' = 'USD'
  ): PaymentSummary {
    const paymentTransactions = this.filterPaymentTransactions(transactions, { currency });
    
    const receivedPayments = paymentTransactions.filter(t => t.paymentDirection === 'received');
    const paidPayments = paymentTransactions.filter(t => t.paymentDirection === 'paid');

    const totalReceived = receivedPayments.reduce((sum, t) => sum + t.amount, 0);
    const totalPaid = paidPayments.reduce((sum, t) => sum + t.amount, 0);

    return {
      totalReceived,
      totalPaid,
      netAmount: totalReceived - totalPaid,
      receivedCount: receivedPayments.length,
      paidCount: paidPayments.length,
      currency
    };
  }

  /**
   * Get payment transactions grouped by entity
   */
  public getPaymentsByEntity(
    transactions: Transaction[],
    filter: PaymentFilter = {}
  ): Record<string, PaymentTransaction[]> {
    const paymentTransactions = this.filterPaymentTransactions(transactions, filter);
    const grouped: Record<string, PaymentTransaction[]> = {};

    paymentTransactions.forEach(transaction => {
      const entityId = transaction.customer_id || transaction.supplier_id;
      if (entityId) {
        if (!grouped[entityId]) {
          grouped[entityId] = [];
        }
        grouped[entityId].push(transaction);
      }
    });

    return grouped;
  }

  /**
   * Get payment statistics for a date range
   */
  public getPaymentStatistics(
    transactions: Transaction[],
    startDate: string,
    endDate: string,
    currency: 'USD' | 'LBP' = 'USD'
  ): {
    dailyPayments: Record<string, PaymentSummary>;
    totalSummary: PaymentSummary;
  } {
    const dateRangeTransactions = this.filterPaymentTransactions(transactions, {
      startDate,
      endDate,
      currency
    });

    const dailyPayments: Record<string, PaymentSummary> = {};
    const totalSummary = this.calculatePaymentSummary(dateRangeTransactions, currency);

    // Group by date
    dateRangeTransactions.forEach(transaction => {
      if (transaction.created_at) {
        const date = transaction.created_at.split('T')[0];
        if (!dailyPayments[date]) {
          dailyPayments[date] = {
            totalReceived: 0,
            totalPaid: 0,
            netAmount: 0,
            receivedCount: 0,
            paidCount: 0,
            currency
          };
        }

        if (transaction.paymentDirection === 'received') {
          dailyPayments[date].totalReceived += transaction.amount;
          dailyPayments[date].receivedCount++;
        } else if (transaction.paymentDirection === 'paid') {
          dailyPayments[date].totalPaid += transaction.amount;
          dailyPayments[date].paidCount++;
        }
      }
    });

    // Calculate net amounts for each day
    Object.keys(dailyPayments).forEach(date => {
      const daySummary = dailyPayments[date];
      daySummary.netAmount = daySummary.totalReceived - daySummary.totalPaid;
    });

    return { dailyPayments, totalSummary };
  }

  /**
   * Validate payment transaction data
   */
  public validatePaymentTransaction(transaction: Partial<Transaction>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!transaction.type) {
      errors.push('Transaction type is required');
    } else if (!Object.values(PAYMENT_TYPES).includes(transaction.type as any)) {
      errors.push('Invalid transaction type');
    }

    if (!transaction.category) {
      errors.push('Transaction category is required');
    } else if (!Object.values(PAYMENT_CATEGORIES).includes(transaction.category as any)) {
      errors.push('Invalid payment category');
    }

    if (!transaction.amount || transaction.amount <= 0) {
      errors.push('Valid amount is required');
    }

    if (!transaction.currency) {
      errors.push('Currency is required');
    } else if (!Object.values(PAYMENT_CURRENCIES).includes(transaction.currency as any)) {
      errors.push('Invalid currency');
    }

    if (!transaction.customer_id && !transaction.supplier_id) {
      errors.push('Either customer_id or supplier_id is required for payment transactions');
    }

    if (transaction.customer_id && transaction.supplier_id) {
      errors.push('Payment transaction cannot have both customer_id and supplier_id');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const paymentService = PaymentService.getInstance();
