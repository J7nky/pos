/**
 * Unit Tests for Transaction Service (Refactored)
 * Phase 1 - Foundation Testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { transactionService, TransactionContext } from '../transactionService';
import { TRANSACTION_CATEGORIES } from '../../constants/transactionCategories';
import { db } from '../../lib/db';

// Mock dependencies
vi.mock('../../lib/db', () => ({
  db: {
    transactions: {
      add: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([])),
          and: vi.fn(() => ({
            toArray: vi.fn(() => Promise.resolve([]))
          }))
        }))
      }))
    },
    customers: {
      get: vi.fn(),
      update: vi.fn()
    },
    suppliers: {
      get: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock('../currencyService', () => ({
  currencyService: {
    convertCurrency: vi.fn((amount, from, to) => {
      if (from === 'LBP' && to === 'USD') return amount / 89500;
      if (from === 'USD' && to === 'LBP') return amount * 89500;
      return amount;
    }),
    validateCurrencyAmount: vi.fn(() => true),
    formatCurrency: vi.fn((amount, currency) => `${currency} ${amount}`)
  }
}));

vi.mock('../auditLogService', () => ({
  auditLogService: {
    log: vi.fn(() => Promise.resolve('audit-log-123'))
  }
}));

describe('TransactionService - Phase 1 Foundation', () => {
  let context: TransactionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    
    context = {
      userId: 'user-123',
      userEmail: 'test@example.com',
      userName: 'Test User',
      storeId: 'store-456',
      module: 'test-module',
      source: 'web'
    };

    // Setup default mocks
    (db.customers.get as any).mockResolvedValue({
      id: 'customer-789',
      name: 'Test Customer',
      usd_balance: 100,
      lb_balance: 8950000
    });

    (db.suppliers.get as any).mockResolvedValue({
      id: 'supplier-789',
      name: 'Test Supplier',
      usd_balance: 200,
      lb_balance: 17900000
    });
  });

  // ============================================================================
  // VALIDATION TESTS
  // ============================================================================

  describe('Validation', () => {
    it('should reject invalid category', async () => {
      const result = await transactionService.createTransaction({
        category: 'Invalid Category' as any,
        amount: 100,
        currency: 'USD',
        description: 'Test',
        context,
        customerId: 'customer-789'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid category');
    });

    it('should reject zero or negative amount', async () => {
      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 0,
        currency: 'USD',
        description: 'Test',
        context,
        customerId: 'customer-789'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Amount must be greater than 0');
    });

    it('should reject invalid currency', async () => {
      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'EUR' as any,
        description: 'Test',
        context,
        customerId: 'customer-789'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Currency must be USD or LBP');
    });

    it('should reject empty description', async () => {
      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: '',
        context,
        customerId: 'customer-789'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Description is required');
    });

    it('should reject missing context', async () => {
      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test',
        context: null as any,
        customerId: 'customer-789'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('context');
    });

    it('should reject transactions requiring entity without entity ID', async () => {
      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test',
        context
        // No customerId provided
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('entity ID');
    });

    it('should allow cash drawer transactions without entity ID', async () => {
      (db.transactions.add as any).mockResolvedValue(undefined);

      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CASH_DRAWER_SALE,
        amount: 100,
        currency: 'USD',
        description: 'Cash sale',
        context,
        updateCashDrawer: false // Disable to avoid cash drawer service call
      });

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // CORE TRANSACTION CREATION TESTS
  // ============================================================================

  describe('Core Transaction Creation', () => {
    beforeEach(() => {
      (db.transactions.add as any).mockResolvedValue(undefined);
      (db.customers.update as any).mockResolvedValue(undefined);
      (db.suppliers.update as any).mockResolvedValue(undefined);
    });

    it('should create a valid transaction', async () => {
      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test payment',
        context,
        customerId: 'customer-789',
        updateCashDrawer: false
      });

      expect(result.success).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.balanceBefore).toBe(100); // From mock customer
      expect(result.affectedRecords).toContain(result.transactionId);
      expect(db.transactions.add).toHaveBeenCalled();
    });

    it('should generate transaction ID', async () => {
      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test payment',
        context,
        customerId: 'customer-789',
        updateCashDrawer: false
      });

      expect(result.transactionId).toMatch(/^txn-\d+-[a-z0-9]+$/);
    });

    it('should generate correlation ID', async () => {
      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test payment',
        context,
        customerId: 'customer-789',
        updateCashDrawer: false
      });

      expect(result.correlationId).toMatch(/^corr-\d+-[a-z0-9]+$/);
    });

    it('should use provided correlation ID', async () => {
      const customCorrelationId = 'custom-corr-123';
      
      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test payment',
        context: { ...context, correlationId: customCorrelationId },
        customerId: 'customer-789',
        updateCashDrawer: false
      });

      expect(result.correlationId).toBe(customCorrelationId);
    });

    it('should generate reference if not provided', async () => {
      await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test payment',
        context,
        customerId: 'customer-789',
        updateCashDrawer: false
      });

      const addCall = (db.transactions.add as any).mock.calls[0][0];
      expect(addCall.reference).toMatch(/^PAY-\d+$/);
    });

    it('should use provided reference', async () => {
      const customReference = 'CUSTOM-REF-123';
      
      await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test payment',
        context,
        customerId: 'customer-789',
        reference: customReference,
        updateCashDrawer: false
      });

      const addCall = (db.transactions.add as any).mock.calls[0][0];
      expect(addCall.reference).toBe(customReference);
    });

    it('should store metadata', async () => {
      const metadata = { invoiceNumber: 'INV-123', customField: 'value' };
      
      await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test payment',
        context,
        customerId: 'customer-789',
        metadata,
        updateCashDrawer: false
      });

      const addCall = (db.transactions.add as any).mock.calls[0][0];
      expect(addCall.metadata.invoiceNumber).toBe('INV-123');
      expect(addCall.metadata.customField).toBe('value');
      expect(addCall.metadata.correlationId).toBeDefined();
      expect(addCall.metadata.source).toBe('web');
      expect(addCall.metadata.module).toBe('test-module');
    });
  });

  // ============================================================================
  // CONVENIENCE METHOD TESTS
  // ============================================================================

  describe('Convenience Methods', () => {
    beforeEach(() => {
      (db.transactions.add as any).mockResolvedValue(undefined);
      (db.customers.update as any).mockResolvedValue(undefined);
      (db.suppliers.update as any).mockResolvedValue(undefined);
    });

    it('should create customer payment', async () => {
      const result = await transactionService.createCustomerPayment(
        'customer-789',
        100,
        'USD',
        'Customer payment',
        context,
        { updateCashDrawer: false }
      );

      expect(result.success).toBe(true);
      const addCall = (db.transactions.add as any).mock.calls[0][0];
      expect(addCall.category).toBe(TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT);
      expect(addCall.customer_id).toBe('customer-789');
    });

    it('should create supplier payment', async () => {
      const result = await transactionService.createSupplierPayment(
        'supplier-789',
        200,
        'USD',
        'Supplier payment',
        context,
        { updateCashDrawer: false }
      );

      expect(result.success).toBe(true);
      const addCall = (db.transactions.add as any).mock.calls[0][0];
      expect(addCall.category).toBe(TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT);
      expect(addCall.supplier_id).toBe('supplier-789');
    });

    it('should create customer credit sale', async () => {
      const result = await transactionService.createCustomerCreditSale(
        'customer-789',
        150,
        'USD',
        'Credit sale',
        context
      );

      expect(result.success).toBe(true);
      const addCall = (db.transactions.add as any).mock.calls[0][0];
      expect(addCall.category).toBe(TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE);
    });

    it('should create employee payment', async () => {
      const result = await transactionService.createEmployeePayment(
        'employee-123',
        500,
        'USD',
        'Salary payment',
        context,
        { updateCashDrawer: false }
      );

      expect(result.success).toBe(true);
      const addCall = (db.transactions.add as any).mock.calls[0][0];
      expect(addCall.category).toBe(TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT);
      expect(addCall.employee_id).toBe('employee-123');
    });

    it('should create cash drawer sale', async () => {
      const result = await transactionService.createCashDrawerSale(
        50,
        'USD',
        'Cash sale',
        context,
        { updateCashDrawer: false }
      );

      expect(result.success).toBe(true);
      const addCall = (db.transactions.add as any).mock.calls[0][0];
      expect(addCall.category).toBe(TRANSACTION_CATEGORIES.CASH_DRAWER_SALE);
    });

    it('should create cash drawer expense', async () => {
      const result = await transactionService.createCashDrawerExpense(
        30,
        'USD',
        'Office supplies',
        context,
        { updateCashDrawer: false, category: 'supplies' }
      );

      expect(result.success).toBe(true);
      const addCall = (db.transactions.add as any).mock.calls[0][0];
      expect(addCall.category).toBe(TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE);
      expect(addCall.metadata.expenseCategory).toBe('supplies');
    });

    it('should create accounts receivable', async () => {
      const result = await transactionService.createAccountsReceivable(
        'customer-789',
        300,
        'USD',
        'AR entry',
        context
      );

      expect(result.success).toBe(true);
      const addCall = (db.transactions.add as any).mock.calls[0][0];
      expect(addCall.category).toBe(TRANSACTION_CATEGORIES.ACCOUNTS_RECEIVABLE);
      expect(addCall.reference).toMatch(/^AR-\d+$/);
    });

    it('should create accounts payable', async () => {
      const result = await transactionService.createAccountsPayable(
        'supplier-789',
        400,
        'USD',
        'AP entry',
        context
      );

      expect(result.success).toBe(true);
      const addCall = (db.transactions.add as any).mock.calls[0][0];
      expect(addCall.category).toBe(TRANSACTION_CATEGORIES.ACCOUNTS_PAYABLE);
      expect(addCall.reference).toMatch(/^AP-\d+$/);
    });
  });

  // ============================================================================
  // BALANCE UPDATE TESTS
  // ============================================================================

  describe('Balance Updates', () => {
    beforeEach(() => {
      (db.transactions.add as any).mockResolvedValue(undefined);
      (db.customers.update as any).mockResolvedValue(undefined);
      (db.suppliers.update as any).mockResolvedValue(undefined);
    });

    it('should update customer USD balance on payment', async () => {
      const result = await transactionService.createCustomerPayment(
        'customer-789',
        50,
        'USD',
        'Payment',
        context,
        { updateCashDrawer: false }
      );

      expect(result.success).toBe(true);
      expect(result.balanceBefore).toBe(100);
      expect(result.balanceAfter).toBe(50); // 100 - 50
      expect(db.customers.update).toHaveBeenCalledWith(
        'customer-789',
        expect.objectContaining({
          usd_balance: 50,
          _synced: false
        })
      );
    });

    it('should update customer LBP balance on payment', async () => {
      const result = await transactionService.createCustomerPayment(
        'customer-789',
        895000,
        'LBP',
        'Payment',
        context,
        { updateCashDrawer: false }
      );

      expect(result.success).toBe(true);
      expect(db.customers.update).toHaveBeenCalledWith(
        'customer-789',
        expect.objectContaining({
          lb_balance: expect.any(Number),
          _synced: false
        })
      );
    });

    it('should update supplier USD balance on payment', async () => {
      const result = await transactionService.createSupplierPayment(
        'supplier-789',
        100,
        'USD',
        'Payment',
        context,
        { updateCashDrawer: false }
      );

      expect(result.success).toBe(true);
      expect(result.balanceBefore).toBe(200);
      expect(result.balanceAfter).toBe(100); // 200 - 100
      expect(db.suppliers.update).toHaveBeenCalledWith(
        'supplier-789',
        expect.objectContaining({
          usd_balance: 100,
          _synced: false
        })
      );
    });

    it('should skip balance update when disabled', async () => {
      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test',
        context,
        customerId: 'customer-789',
        updateBalances: false,
        updateCashDrawer: false
      });

      expect(result.success).toBe(true);
      expect(db.customers.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // QUERY TESTS
  // ============================================================================

  describe('Query Methods', () => {
    it('should get transaction by ID', async () => {
      const mockTransaction = {
        id: 'txn-123',
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100
      };
      (db.transactions.get as any).mockResolvedValue(mockTransaction);

      const result = await transactionService.getTransaction('txn-123');

      expect(result).toEqual(mockTransaction);
      expect(db.transactions.get).toHaveBeenCalledWith('txn-123');
    });

    it('should return null for non-existent transaction', async () => {
      (db.transactions.get as any).mockResolvedValue(null);

      const result = await transactionService.getTransaction('non-existent');

      expect(result).toBeNull();
    });

    it('should get transactions by store', async () => {
      const mockTransactions = [
        { id: 'txn-1', store_id: 'store-456', created_at: '2024-01-01', _deleted: false },
        { id: 'txn-2', store_id: 'store-456', created_at: '2024-01-02', _deleted: false }
      ];

      (db.transactions.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockTransactions)
        })
      });

      const result = await transactionService.getTransactionsByStore('store-456');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('txn-2'); // Sorted by date descending
    });

    it('should filter out deleted transactions by default', async () => {
      const mockTransactions = [
        { id: 'txn-1', store_id: 'store-456', created_at: '2024-01-01', _deleted: false },
        { id: 'txn-2', store_id: 'store-456', created_at: '2024-01-02', _deleted: true }
      ];

      (db.transactions.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockTransactions)
        })
      });

      const result = await transactionService.getTransactionsByStore('store-456');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('txn-1');
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (db.transactions.add as any).mockRejectedValue(new Error('DB Error'));

      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test',
        context,
        customerId: 'customer-789',
        updateCashDrawer: false
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB Error');
    });

    it('should handle missing customer gracefully', async () => {
      (db.customers.get as any).mockResolvedValue(null);
      (db.transactions.add as any).mockResolvedValue(undefined);

      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 100,
        currency: 'USD',
        description: 'Test',
        context,
        customerId: 'non-existent',
        updateCashDrawer: false
      });

      // Should still create transaction but skip balance update
      expect(result.success).toBe(true);
    });
  });
});
