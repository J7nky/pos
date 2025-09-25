import { paymentService, PaymentFilter } from '../paymentService';
import { PAYMENT_CATEGORIES, PAYMENT_TYPES } from '../../constants/paymentCategories';
import { Transaction } from '../../types';

// Mock transaction data for testing
const mockTransactions: Transaction[] = [
  {
    id: '1',
    type: PAYMENT_TYPES.INCOME,
    category: PAYMENT_CATEGORIES.CUSTOMER_PAYMENT,
    amount: 100,
    currency: 'USD',
    description: 'Payment received from Customer A',
    reference: 'PAY-001',
    store_id: 'store-1',
    created_by: 'user-1',
    created_at: '2024-01-15T10:00:00Z',
    customer_id: 'customer-1',
    supplier_id: null
  },
  {
    id: '2',
    type: PAYMENT_TYPES.EXPENSE,
    category: PAYMENT_CATEGORIES.SUPPLIER_PAYMENT,
    amount: 50,
    currency: 'USD',
    description: 'Payment sent to Supplier B',
    reference: 'PAY-002',
    store_id: 'store-1',
    created_by: 'user-1',
    created_at: '2024-01-15T11:00:00Z',
    customer_id: null,
    supplier_id: 'supplier-1'
  },
  {
    id: '3',
    type: PAYMENT_TYPES.INCOME,
    category: 'Cash Sale',
    amount: 25,
    currency: 'USD',
    description: 'Cash sale transaction',
    reference: 'CASH-001',
    store_id: 'store-1',
    created_by: 'user-1',
    created_at: '2024-01-15T12:00:00Z',
    customer_id: null,
    supplier_id: null
  }
];

describe('PaymentService', () => {
  describe('filterPaymentTransactions', () => {
    it('should filter payment transactions correctly', () => {
      const result = paymentService.filterPaymentTransactions(mockTransactions);
      
      expect(result).toHaveLength(2); // Only customer and supplier payments
      expect(result[0].paymentDirection).toBe('received');
      expect(result[1].paymentDirection).toBe('paid');
    });

    it('should filter by entity type', () => {
      const customerFilter: PaymentFilter = { entityType: 'customer' };
      const result = paymentService.filterPaymentTransactions(mockTransactions, customerFilter);
      
      expect(result).toHaveLength(1);
      expect(result[0].entityType).toBe('customer');
    });

    it('should filter by entity ID', () => {
      const entityFilter: PaymentFilter = { entityId: 'customer-1' };
      const result = paymentService.filterPaymentTransactions(mockTransactions, entityFilter);
      
      expect(result).toHaveLength(1);
      expect(result[0].customer_id).toBe('customer-1');
    });

    it('should filter by direction', () => {
      const receivedFilter: PaymentFilter = { direction: 'received' };
      const result = paymentService.filterPaymentTransactions(mockTransactions, receivedFilter);
      
      expect(result).toHaveLength(1);
      expect(result[0].paymentDirection).toBe('received');
    });

    it('should filter by currency', () => {
      const currencyFilter: PaymentFilter = { currency: 'USD' };
      const result = paymentService.filterPaymentTransactions(mockTransactions, currencyFilter);
      
      expect(result).toHaveLength(2);
      result.forEach(transaction => {
        expect(transaction.currency).toBe('USD');
      });
    });
  });

  describe('getTodaysPayments', () => {
    it('should get payments for today', () => {
      const today = '2024-01-15';
      const result = paymentService.getTodaysPayments(mockTransactions, today);
      
      expect(result).toHaveLength(2);
    });

    it('should return empty array for different day', () => {
      const differentDay = '2024-01-16';
      const result = paymentService.getTodaysPayments(mockTransactions, differentDay);
      
      expect(result).toHaveLength(0);
    });
  });

  describe('calculatePaymentSummary', () => {
    it('should calculate payment summary correctly', () => {
      const summary = paymentService.calculatePaymentSummary(mockTransactions, 'USD');
      
      expect(summary.totalReceived).toBe(100);
      expect(summary.totalPaid).toBe(50);
      expect(summary.netAmount).toBe(50);
      expect(summary.receivedCount).toBe(1);
      expect(summary.paidCount).toBe(1);
      expect(summary.currency).toBe('USD');
    });
  });

  describe('getCustomerPayments', () => {
    it('should get customer payments', () => {
      const result = paymentService.getCustomerPayments(mockTransactions);
      
      expect(result).toHaveLength(1);
      expect(result[0].entityType).toBe('customer');
    });

    it('should get payments for specific customer', () => {
      const result = paymentService.getCustomerPayments(mockTransactions, 'customer-1');
      
      expect(result).toHaveLength(1);
      expect(result[0].customer_id).toBe('customer-1');
    });
  });

  describe('getSupplierPayments', () => {
    it('should get supplier payments', () => {
      const result = paymentService.getSupplierPayments(mockTransactions);
      
      expect(result).toHaveLength(1);
      expect(result[0].entityType).toBe('supplier');
    });

    it('should get payments for specific supplier', () => {
      const result = paymentService.getSupplierPayments(mockTransactions, 'supplier-1');
      
      expect(result).toHaveLength(1);
      expect(result[0].supplier_id).toBe('supplier-1');
    });
  });

  describe('validatePaymentTransaction', () => {
    it('should validate correct payment transaction', () => {
      const validTransaction = {
        type: PAYMENT_TYPES.INCOME,
        category: PAYMENT_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD' as const,
        customer_id: 'customer-1'
      };

      const result = paymentService.validatePaymentTransaction(validTransaction);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid payment transaction', () => {
      const invalidTransaction = {
        type: 'invalid',
        category: 'invalid',
        amount: -10,
        currency: 'invalid' as any
      };

      const result = paymentService.validatePaymentTransaction(invalidTransaction);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
