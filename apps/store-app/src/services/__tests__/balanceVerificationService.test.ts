/**
 * BALANCE VERIFICATION SERVICE TESTS
 * Tests for balance integrity verification and correction functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BalanceVerificationService, balanceVerificationService } from '../balanceVerificationService';
import { TransactionService } from '../transactionService';
import { auditLogService } from '../auditLogService';
import { currencyService } from '../currencyService';
import { db } from '../../lib/db';
// Import removed - not used in balance verification tests

// Mock dependencies
vi.mock('../../lib/db');
vi.mock('../auditLogService');
vi.mock('../currencyService');
vi.mock('../transactionService');

describe('BalanceVerificationService', () => {
  let service: BalanceVerificationService;
  let mockTransactionService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = BalanceVerificationService.getInstance();
    mockTransactionService = {
      getTransactionsByEntity: vi.fn()
    };
    (TransactionService.getInstance as any).mockReturnValue(mockTransactionService);

    // Mock currency service
    (currencyService.formatCurrency as any).mockImplementation((amount: number, currency: string) => 
      `${currency} ${amount.toFixed(2)}`
    );

    // Mock audit log service
    (auditLogService.log as any).mockResolvedValue('audit-log-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // SINGLETON TESTS
  // ============================================================================

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = BalanceVerificationService.getInstance();
      const instance2 = BalanceVerificationService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should use the exported singleton instance', () => {
      expect(balanceVerificationService).toBeInstanceOf(BalanceVerificationService);
    });
  });

  // ============================================================================
  // ENTITY BALANCE VERIFICATION TESTS
  // ============================================================================

  describe('verifyEntityBalance', () => {
    it('should return null when balances match exactly', async () => {
      // Mock customer data
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100.00,
        lb_balance: 150000.00
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);

      // Mock transactions that result in the same balance
      const mockTransactions = [
        {
          id: 'txn-1',
          type: 'expense', // Credit sale - increases customer balance
          amount: 100.00,
          currency: 'USD'
        }
      ];

      mockTransactionService.getTransactionsByEntity.mockResolvedValue(mockTransactions);

      const result = await service.verifyEntityBalance('customer-123', 'customer');

      expect(result).toBeNull();
      expect(db.customers.get).toHaveBeenCalledWith('customer-123');
      expect(mockTransactionService.getTransactionsByEntity).toHaveBeenCalledWith('customer-123', 'customer');
    });

    it('should detect USD balance discrepancy for customer', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100.00, // Stored balance
        lb_balance: 0.00
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);

      // Mock transactions that should result in 50.00 balance
      const mockTransactions = [
        {
          id: 'txn-1',
          type: 'expense', // Credit sale - increases balance by 100
          amount: 100.00,
          currency: 'USD'
        },
        {
          id: 'txn-2',
          type: 'income', // Payment - decreases balance by 50
          amount: 50.00,
          currency: 'USD'
        }
      ];

      mockTransactionService.getTransactionsByEntity.mockResolvedValue(mockTransactions);

      const result = await service.verifyEntityBalance('customer-123', 'customer');

      expect(result).toEqual({
        entityType: 'customer',
        entityId: 'customer-123',
        entityName: 'Test Customer',
        storedBalance: { USD: 100.00, LBP: 0.00 },
        calculatedBalance: { USD: 50.00, LBP: 0.00 }, // 100 - 50 = 50
        difference: { USD: -50.00, LBP: 0.00 }
      });
    });

    it('should detect LBP balance discrepancy for supplier', async () => {
      const mockSupplier = {
        id: 'supplier-456',
        name: 'Test Supplier',
        usd_balance: 0.00,
        lb_balance: 100000.00 // Stored balance
      };

      (db.suppliers.get as any).mockResolvedValue(mockSupplier);

      // Mock transactions that should result in 50000 LBP balance
      const mockTransactions = [
        {
          id: 'txn-1',
          type: 'income', // We owe supplier - increases balance by 100000
          amount: 100000.00,
          currency: 'LBP'
        },
        {
          id: 'txn-2',
          type: 'expense', // We paid supplier - decreases balance by 50000
          amount: 50000.00,
          currency: 'LBP'
        }
      ];

      mockTransactionService.getTransactionsByEntity.mockResolvedValue(mockTransactions);

      const result = await service.verifyEntityBalance('supplier-456', 'supplier');

      expect(result).toEqual({
        entityType: 'supplier',
        entityId: 'supplier-456',
        entityName: 'Test Supplier',
        storedBalance: { USD: 0.00, LBP: 100000.00 },
        calculatedBalance: { USD: 0.00, LBP: 50000.00 }, // 100000 - 50000 = 50000
        difference: { USD: 0.00, LBP: -50000.00 }
      });
    });

    it('should handle entity not found', async () => {
      (db.customers.get as any).mockResolvedValue(null);

      await expect(service.verifyEntityBalance('non-existent', 'customer'))
        .rejects.toThrow('customer not found: non-existent');
    });

    it('should ignore small differences (< 0.01)', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100.00,
        lb_balance: 0.00
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);

      // Mock transactions with tiny rounding difference
      const mockTransactions = [
        {
          id: 'txn-1',
          type: 'expense',
          amount: 100.005, // Slight rounding difference
          currency: 'USD'
        }
      ];

      mockTransactionService.getTransactionsByEntity.mockResolvedValue(mockTransactions);

      const result = await service.verifyEntityBalance('customer-123', 'customer');

      expect(result).toBeNull(); // Should ignore tiny difference
    });
  });

  // ============================================================================
  // STORE-WIDE VERIFICATION TESTS
  // ============================================================================

  describe('verifyAllBalances', () => {
    it('should verify all customers and suppliers in a store', async () => {
      const storeId = 'store-789';

      // Mock customers
      const mockCustomers = [
        { id: 'customer-1', name: 'Customer 1', usd_balance: 100, lb_balance: 0, _deleted: false },
        { id: 'customer-2', name: 'Customer 2', usd_balance: 200, lb_balance: 0, _deleted: false }
      ];

      // Mock suppliers
      const mockSuppliers = [
        { id: 'supplier-1', name: 'Supplier 1', usd_balance: 0, lb_balance: 150000, _deleted: false }
      ];

      (db.customers.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          and: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockCustomers)
          })
        })
      });

      (db.suppliers.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          and: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockSuppliers)
          })
        })
      });

      // Mock perfect balance matches for all entities
      mockTransactionService.getTransactionsByEntity
        .mockResolvedValueOnce([{ type: 'expense', amount: 100, currency: 'USD' }]) // customer-1
        .mockResolvedValueOnce([{ type: 'expense', amount: 200, currency: 'USD' }]) // customer-2
        .mockResolvedValueOnce([{ type: 'income', amount: 150000, currency: 'LBP' }]); // supplier-1

      const result = await service.verifyAllBalances(storeId);

      expect(result.verified).toBe(true);
      expect(result.discrepancies).toHaveLength(0);
      expect(result.totalEntitiesChecked).toBe(3);
      expect(result.verificationTimestamp).toBeDefined();

      // Should log verification result
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'system_maintenance',
          entityType: 'system',
          entityId: 'balance_verification'
        })
      );
    });

    it('should detect and report discrepancies', async () => {
      const storeId = 'store-789';

      // Mock one customer with discrepancy
      const mockCustomers = [
        { id: 'customer-1', name: 'Customer 1', usd_balance: 100, lb_balance: 0, _deleted: false }
      ];

      const mockSuppliers: any[] = [];

      (db.customers.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          and: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockCustomers)
          })
        })
      });

      (db.suppliers.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          and: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockSuppliers)
          })
        })
      });

      // Mock transaction that creates discrepancy
      mockTransactionService.getTransactionsByEntity
        .mockResolvedValueOnce([{ type: 'expense', amount: 50, currency: 'USD' }]); // Should be 50, but stored is 100

      const result = await service.verifyAllBalances(storeId);

      expect(result.verified).toBe(false);
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0]).toEqual({
        entityType: 'customer',
        entityId: 'customer-1',
        entityName: 'Customer 1',
        storedBalance: { USD: 100, LBP: 0 },
        calculatedBalance: { USD: 50, LBP: 0 },
        difference: { USD: -50, LBP: 0 }
      });
    });
  });

  // ============================================================================
  // BALANCE CORRECTION TESTS
  // ============================================================================

  describe('fixDiscrepancies', () => {
    it('should fix customer balance discrepancy', async () => {
      const discrepancy = {
        entityType: 'customer' as const,
        entityId: 'customer-123',
        entityName: 'Test Customer',
        storedBalance: { USD: 100, LBP: 0 },
        calculatedBalance: { USD: 50, LBP: 0 },
        difference: { USD: -50, LBP: 0 }
      };

      (db.customers.update as any).mockResolvedValue(undefined);

      const result = await service.fixDiscrepancies([discrepancy], 'user-456', 'Test correction');

      expect(result.fixed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Should update customer balance
      expect(db.customers.update).toHaveBeenCalledWith('customer-123', {
        usd_balance: 50,
        lb_balance: 0,
        updated_at: expect.any(String),
        _synced: false
      });

      // Should log the correction
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'customer_balance_adjusted',
          entityType: 'customer',
          entityId: 'customer-123'
        })
      );
    });

    it('should fix supplier balance discrepancy', async () => {
      const discrepancy = {
        entityType: 'supplier' as const,
        entityId: 'supplier-456',
        entityName: 'Test Supplier',
        storedBalance: { USD: 0, LBP: 100000 },
        calculatedBalance: { USD: 0, LBP: 75000 },
        difference: { USD: 0, LBP: -25000 }
      };

      (db.suppliers.update as any).mockResolvedValue(undefined);

      const result = await service.fixDiscrepancies([discrepancy], 'user-456', 'Test correction');

      expect(result.fixed).toBe(1);
      expect(result.failed).toBe(0);

      // Should update supplier balance
      expect(db.suppliers.update).toHaveBeenCalledWith('supplier-456', {
        usd_balance: 0,
        lb_balance: 75000,
        updated_at: expect.any(String),
        _synced: false
      });

      // Should log the correction
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'supplier_balance_adjusted',
          entityType: 'supplier',
          entityId: 'supplier-456'
        })
      );
    });

    it('should handle correction failures gracefully', async () => {
      const discrepancy = {
        entityType: 'customer' as const,
        entityId: 'customer-123',
        entityName: 'Test Customer',
        storedBalance: { USD: 100, LBP: 0 },
        calculatedBalance: { USD: 50, LBP: 0 },
        difference: { USD: -50, LBP: 0 }
      };

      (db.customers.update as any).mockRejectedValue(new Error('Database error'));

      const result = await service.fixDiscrepancies([discrepancy], 'user-456', 'Test correction');

      expect(result.fixed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to fix customer Test Customer');
    });
  });

  // ============================================================================
  // UTILITY METHOD TESTS
  // ============================================================================

  describe('hasDiscrepancies', () => {
    it('should return true when discrepancies exist', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100.00,
        lb_balance: 0.00
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);
      mockTransactionService.getTransactionsByEntity.mockResolvedValue([
        { type: 'expense', amount: 50, currency: 'USD' } // Should result in 50, but stored is 100
      ]);

      const result = await service.hasDiscrepancies('customer-123', 'customer');

      expect(result).toBe(true);
    });

    it('should return false when no discrepancies exist', async () => {
      const mockCustomer = {
        id: 'customer-123',
        name: 'Test Customer',
        usd_balance: 100.00,
        lb_balance: 0.00
      };

      (db.customers.get as any).mockResolvedValue(mockCustomer);
      mockTransactionService.getTransactionsByEntity.mockResolvedValue([
        { type: 'expense', amount: 100, currency: 'USD' } // Matches stored balance
      ]);

      const result = await service.hasDiscrepancies('customer-123', 'customer');

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      (db.customers.get as any).mockRejectedValue(new Error('Database error'));

      const result = await service.hasDiscrepancies('customer-123', 'customer');

      expect(result).toBe(false);
    });
  });

  describe('getVerificationSummary', () => {
    it('should return summary of verification status', async () => {
      const storeId = 'store-789';

      // Mock customers and suppliers
      const mockCustomers = [
        { id: 'customer-1', name: 'Customer 1', usd_balance: 100, lb_balance: 0, _deleted: false },
        { id: 'customer-2', name: 'Customer 2', usd_balance: 200, lb_balance: 0, _deleted: false }
      ];

      const mockSuppliers = [
        { id: 'supplier-1', name: 'Supplier 1', usd_balance: 0, lb_balance: 150000, _deleted: false }
      ];

      (db.customers.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          and: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockCustomers)
          })
        })
      });

      (db.suppliers.where as any).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          and: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockSuppliers)
          })
        })
      });

      // Mock one customer with discrepancy, others OK
      mockTransactionService.getTransactionsByEntity
        .mockResolvedValueOnce([{ type: 'expense', amount: 50, currency: 'USD' }]) // customer-1: discrepancy
        .mockResolvedValueOnce([{ type: 'expense', amount: 200, currency: 'USD' }]) // customer-2: OK
        .mockResolvedValueOnce([{ type: 'income', amount: 150000, currency: 'LBP' }]); // supplier-1: OK

      const result = await service.getVerificationSummary(storeId);

      expect(result).toEqual({
        totalCustomers: 2,
        totalSuppliers: 1,
        customersWithDiscrepancies: 1,
        suppliersWithDiscrepancies: 0
      });
    });
  });

  // ============================================================================
  // REPORT GENERATION TESTS
  // ============================================================================

  describe('generateVerificationReport', () => {
    it('should generate report for successful verification', () => {
      const result = {
        verified: true,
        discrepancies: [],
        totalEntitiesChecked: 5,
        verificationTimestamp: '2024-01-01T10:00:00.000Z'
      };

      const report = service.generateVerificationReport(result);

      expect(report).toContain('BALANCE VERIFICATION REPORT');
      expect(report).toContain('Total Entities Checked: 5');
      expect(report).toContain('✅ ALL BALANCES VERIFIED');
      expect(report).toContain('✅ No discrepancies found');
    });

    it('should generate report with discrepancies', () => {
      const result = {
        verified: false,
        discrepancies: [
          {
            entityType: 'customer' as const,
            entityId: 'customer-123',
            entityName: 'Test Customer',
            storedBalance: { USD: 100, LBP: 0 },
            calculatedBalance: { USD: 50, LBP: 0 },
            difference: { USD: -50, LBP: 0 }
          }
        ],
        totalEntitiesChecked: 3,
        verificationTimestamp: '2024-01-01T10:00:00.000Z'
      };

      const report = service.generateVerificationReport(result);

      expect(report).toContain('❌ DISCREPANCIES FOUND');
      expect(report).toContain('DISCREPANCIES FOUND: 1');
      expect(report).toContain('CUSTOMER: Test Customer');
      expect(report).toContain('Stored Balance:');
      expect(report).toContain('Calculated Balance:');
      expect(report).toContain('Difference:');
    });
  });
});
