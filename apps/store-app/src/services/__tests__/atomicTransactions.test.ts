/**
 * ATOMIC TRANSACTIONS TESTS
 * Tests for atomicity, rollback scenarios, and data integrity
 * 
 * These tests verify that the TransactionService maintains ACID properties
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TransactionService } from '../transactionService';
import { auditLogService } from '../auditLogService';
import { currencyService } from '../currencyService';
import { db } from '../../lib/db';
import { TRANSACTION_CATEGORIES } from '../../constants/transactionCategories';

// Mock dependencies
vi.mock('../../lib/db');
vi.mock('../auditLogService');
vi.mock('../currencyService');

describe('Atomic Transactions', () => {
  let transactionService: TransactionService;
  let mockDbTransaction: any;

  const mockContext = {
    userId: 'user-123',
    userEmail: 'test@example.com',
    userName: 'Test User',
    storeId: 'store-456',
    module: 'test',
    source: 'web' as const
  };

  beforeEach(() => {
    vi.clearAllMocks();
    transactionService = TransactionService.getInstance();

    // Mock IndexedDB transaction
    mockDbTransaction = vi.fn();
    (db.transaction as any) = mockDbTransaction;

    // Mock database collections
    (db.transactions.add as any) = vi.fn().mockResolvedValue(undefined);
    (db.customers.get as any) = vi.fn();
    (db.customers.update as any) = vi.fn().mockResolvedValue(undefined);
    (db.suppliers.get as any) = vi.fn();
    (db.suppliers.update as any) = vi.fn().mockResolvedValue(undefined);
    (db.cash_drawer_sessions.where as any) = vi.fn();
    (db.cash_drawer_sessions.update as any) = vi.fn().mockResolvedValue(undefined);

    // Mock currency service
    (currencyService.convertCurrency as any) = vi.fn().mockImplementation((amount, from, to) => {
      if (from === to) return amount;
      if (from === 'LBP' && to === 'USD') return amount / 1500;
      if (from === 'USD' && to === 'LBP') return amount * 1500;
      return amount;
    });

    (currencyService.validateCurrencyAmount as any) = vi.fn().mockReturnValue(true);
    (currencyService.formatCurrency as any) = vi.fn().mockImplementation((amount, currency) => 
      `${currency} ${amount.toFixed(2)}`
    );

    // Mock audit log service
    (auditLogService.log as any) = vi.fn().mockResolvedValue('audit-log-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // ATOMICITY TESTS
  // ============================================================================

  describe('Transaction Atomicity', () => {
    it('should execute all operations atomically in a single database transaction', async () => {
      // Mock customer
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100,
        lb_balance: 0
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);

      // Mock active cash drawer session
      (db.cash_drawer_sessions.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          and: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({
              id: 'session-123',
              current_amount: 500
            })
          })
        })
      });

      // Mock successful transaction execution
      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        await callback();
      });

      const result = await transactionService.createCustomerPayment(
        'customer-123',
        50,
        'USD',
        'Test payment',
        mockContext
      );

      expect(result.success).toBe(true);

      // Verify atomic transaction was used
      expect(mockDbTransaction).toHaveBeenCalledWith(
        'rw',
        [db.transactions, db.customers, db.suppliers, db.cash_drawer_sessions],
        expect.any(Function)
      );

      // Verify all operations were called within transaction
      expect(db.transactions.add).toHaveBeenCalled();
      expect(db.customers.update).toHaveBeenCalled();
      expect(db.cash_drawer_sessions.update).toHaveBeenCalled();
    });

    it('should rollback all operations if any step fails', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100,
        lb_balance: 0
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);

      // Mock transaction that fails during cash drawer update
      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        // Simulate failure during transaction execution
        throw new Error('Cash drawer update failed');
      });

      const result = await transactionService.createCustomerPayment(
        'customer-123',
        50,
        'USD',
        'Test payment',
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cash drawer update failed');

      // Verify transaction was attempted
      expect(mockDbTransaction).toHaveBeenCalled();

      // Since transaction failed, no individual operations should succeed
      // (IndexedDB handles the rollback automatically)
    });

    it('should handle validation errors before starting transaction', async () => {
      const result = await transactionService.createTransaction({
        category: 'Invalid Category' as any,
        amount: -50, // Invalid amount
        currency: 'USD',
        description: '',
        context: mockContext
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid category');
      expect(result.error).toContain('Amount must be greater than 0');
      expect(result.error).toContain('Description is required');

      // No database transaction should be started for validation errors
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // BALANCE UPDATE ATOMICITY TESTS
  // ============================================================================

  describe('Balance Update Atomicity', () => {
    it('should update customer balance atomically with transaction creation', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100,
        lb_balance: 0
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);

      let balanceUpdateCalled = false;
      let transactionCreated = false;

      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        // Mock the atomic operations
        (db.transactions.add as any).mockImplementation(() => {
          transactionCreated = true;
          return Promise.resolve();
        });

        (db.customers.update as any).mockImplementation(() => {
          balanceUpdateCalled = true;
          return Promise.resolve();
        });

        await callback();
      });

      const result = await transactionService.createCustomerPayment(
        'customer-123',
        50,
        'USD',
        'Test payment',
        mockContext
      );

      expect(result.success).toBe(true);
      expect(transactionCreated).toBe(true);
      expect(balanceUpdateCalled).toBe(true);

      // Verify balance calculation
      expect(result.balanceBefore).toBe(100);
      expect(result.balanceAfter).toBe(50); // 100 - 50 = 50 (payment reduces customer debt)
    });

    it('should update supplier balance atomically with transaction creation', async () => {
      const mockSupplier = {
        id: 'supplier-456',
        name: 'Test Supplier',
        usd_balance: 200,
        lb_balance: 0
      };

      (db.suppliers.get as any).mockResolvedValue(mockSupplier);

      let balanceUpdateCalled = false;
      let transactionCreated = false;

      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        (db.transactions.add as any).mockImplementation(() => {
          transactionCreated = true;
          return Promise.resolve();
        });

        (db.suppliers.update as any).mockImplementation(() => {
          balanceUpdateCalled = true;
          return Promise.resolve();
        });

        await callback();
      });

      const result = await transactionService.createSupplierPayment(
        'supplier-456',
        75,
        'USD',
        'Test payment to supplier',
        mockContext
      );

      expect(result.success).toBe(true);
      expect(transactionCreated).toBe(true);
      expect(balanceUpdateCalled).toBe(true);

      // Verify balance calculation for supplier
      expect(result.balanceBefore).toBe(200);
      expect(result.balanceAfter).toBe(125); // 200 - 75 = 125 (payment reduces what we owe)
    });
  });

  // ============================================================================
  // CASH DRAWER ATOMICITY TESTS
  // ============================================================================

  describe('Cash Drawer Atomicity', () => {
    it('should update cash drawer atomically with transaction', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100,
        lb_balance: 0
      };

      const mockCashSession = {
        id: 'session-123',
        current_amount: 500,
        store_id: 'store-456',
        closed_at: null
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);
      (db.cash_drawer_sessions.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          and: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockCashSession)
          })
        })
      });

      let cashDrawerUpdated = false;
      let transactionCreated = false;

      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        (db.transactions.add as any).mockImplementation(() => {
          transactionCreated = true;
          return Promise.resolve();
        });

        (db.cash_drawer_sessions.update as any).mockImplementation((sessionId: string, updateData: any) => {
          cashDrawerUpdated = true;
          expect(sessionId).toBe('session-123');
          expect(updateData.current_amount).toBe(550); // 500 + 50 = 550
          return Promise.resolve();
        });

        await callback();
      });

      const result = await transactionService.createCustomerPayment(
        'customer-123',
        50,
        'USD',
        'Cash payment',
        mockContext,
        { updateCashDrawer: true }
      );

      expect(result.success).toBe(true);
      expect(transactionCreated).toBe(true);
      expect(cashDrawerUpdated).toBe(true);
      expect(result.cashDrawerImpact).toEqual({
        previousBalance: 500,
        newBalance: 550
      });
    });

    it('should handle missing cash drawer session gracefully', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100,
        lb_balance: 0
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);
      (db.cash_drawer_sessions.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          and: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null) // No active session
          })
        })
      });

      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        await callback();
      });

      const result = await transactionService.createCustomerPayment(
        'customer-123',
        50,
        'USD',
        'Payment without cash drawer',
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.cashDrawerImpact).toBeUndefined();

      // Transaction should still be created even without cash drawer
      expect(db.transactions.add).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // ROLLBACK SCENARIO TESTS
  // ============================================================================

  describe('Rollback Scenarios', () => {
    it('should rollback when customer balance update fails', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100,
        lb_balance: 0
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);

      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        // Mock successful transaction creation but failed balance update
        (db.transactions.add as any).mockResolvedValue(undefined);
        (db.customers.update as any).mockRejectedValue(new Error('Balance update failed'));

        await callback(); // This should throw and trigger rollback
      });

      const result = await transactionService.createCustomerPayment(
        'customer-123',
        50,
        'USD',
        'Test payment',
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Balance update failed');

      // IndexedDB transaction should have been attempted
      expect(mockDbTransaction).toHaveBeenCalled();
    });

    it('should rollback when cash drawer update fails', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100,
        lb_balance: 0
      };

      const mockCashSession = {
        id: 'session-123',
        current_amount: 500
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);
      (db.cash_drawer_sessions.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          and: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockCashSession)
          })
        })
      });

      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        // Mock successful transaction and balance update but failed cash drawer
        (db.transactions.add as any).mockResolvedValue(undefined);
        (db.customers.update as any).mockResolvedValue(undefined);
        (db.cash_drawer_sessions.update as any).mockRejectedValue(new Error('Cash drawer locked'));

        await callback(); // This should throw and trigger rollback
      });

      const result = await transactionService.createCustomerPayment(
        'customer-123',
        50,
        'USD',
        'Test payment',
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cash drawer locked');
    });

    it('should rollback complex multi-entity transaction on failure', async () => {
      // Test a complex transaction that involves multiple entities
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100,
        lb_balance: 0
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);

      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        // Simulate partial success then failure
        let operationCount = 0;
        
        (db.transactions.add as any).mockImplementation(() => {
          operationCount++;
          return Promise.resolve();
        });

        (db.customers.update as any).mockImplementation(() => {
          operationCount++;
          return Promise.resolve();
        });

        // Third operation fails
        (db.cash_drawer_sessions.update as any).mockImplementation(() => {
          operationCount++;
          throw new Error('Third operation failed');
        });

        await callback(); // Should fail on third operation
      });

      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
        amount: 50,
        currency: 'USD',
        description: 'Complex transaction test',
        context: mockContext,
        customerId: 'customer-123',
        updateBalances: true,
        updateCashDrawer: true
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Third operation failed');

      // All operations should have been attempted within the transaction
      expect(mockDbTransaction).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CURRENCY CONVERSION ATOMICITY TESTS
  // ============================================================================

  describe('Currency Conversion Atomicity', () => {
    it('should handle USD to LBP conversion atomically', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 0,
        lb_balance: 150000 // 100 USD equivalent
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);

      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        await callback();
      });

      const result = await transactionService.createCustomerPayment(
        'customer-123',
        75000, // 50 USD equivalent in LBP
        'LBP',
        'LBP payment',
        mockContext
      );

      expect(result.success).toBe(true);

      // Verify currency conversion was used for balance calculation
      expect(currencyService.convertCurrency).toHaveBeenCalledWith(75000, 'LBP', 'USD');

      // Balance should be updated in LBP
      expect(db.customers.update).toHaveBeenCalledWith('customer-123', 
        expect.objectContaining({
          lb_balance: 75000 // 150000 - 75000 = 75000
        })
      );
    });

    it('should maintain precision in currency calculations', async () => {
      const mockSupplier = {
        id: 'supplier-456',
        name: 'Test Supplier',
        usd_balance: 100.50,
        lb_balance: 0
      };

      (db.suppliers.get as any).mockResolvedValue(mockSupplier);

      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        await callback();
      });

      const result = await transactionService.createSupplierPayment(
        'supplier-456',
        25.75,
        'USD',
        'Precise payment',
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.balanceBefore).toBe(100.50);
      expect(result.balanceAfter).toBe(74.75); // 100.50 - 25.75 = 74.75

      // Verify precise balance update
      expect(db.suppliers.update).toHaveBeenCalledWith('supplier-456',
        expect.objectContaining({
          usd_balance: 74.75
        })
      );
    });
  });

  // ============================================================================
  // AUDIT LOG INTEGRATION TESTS
  // ============================================================================

  describe('Audit Log Integration', () => {
    it('should create audit log after successful atomic transaction', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100,
        lb_balance: 0
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);

      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        await callback();
      });

      const result = await transactionService.createCustomerPayment(
        'customer-123',
        50,
        'USD',
        'Test payment',
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.auditLogId).toBe('audit-log-id');

      // Audit log should be created after transaction completes
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'transaction_created',
          entityType: 'transaction',
          entityId: expect.any(String)
        })
      );
    });

    it('should not create audit log if transaction fails', async () => {
      mockDbTransaction.mockImplementation(async () => {
        throw new Error('Transaction failed');
      });

      const result = await transactionService.createCustomerPayment(
        'customer-123',
        50,
        'USD',
        'Failed payment',
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.auditLogId).toBeUndefined();

      // No audit log should be created for failed transactions
      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('should continue if audit log creation fails', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100,
        lb_balance: 0
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);
      (auditLogService.log as any).mockRejectedValue(new Error('Audit log failed'));

      mockDbTransaction.mockImplementation(async (_mode: any, _tables: any, callback: () => Promise<void>) => {
        await callback();
      });

      const result = await transactionService.createCustomerPayment(
        'customer-123',
        50,
        'USD',
        'Test payment',
        mockContext
      );

      // Transaction should still succeed even if audit log fails
      expect(result.success).toBe(true);
      expect(result.auditLogId).toBeUndefined();
    });
  });
});
