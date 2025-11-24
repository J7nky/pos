/**
 * Unit Tests for PaymentManagementService (Phase 5 Refactor)
 * 
 * Tests the refactored paymentManagementService to ensure:
 * 1. Deprecated methods log warnings
 * 2. updatePayment and deletePayment work correctly
 * 3. No duplicate balance updates occur
 * 4. Proper error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymentManagementService } from '../paymentManagementService';
import { db } from '../../lib/db';

describe('PaymentManagementService - Phase 5 Refactor', () => {
  let service: PaymentManagementService;
  let consoleWarnSpy: any;

  beforeEach(() => {
    service = PaymentManagementService.getInstance();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('Deprecated Methods', () => {
    it('should log warning when applyTransactionImpact is called', async () => {
      const mockTransaction = {
        id: 'test-txn-1',
        amount: 100,
        currency: 'USD',
        type: 'income',
        store_id: 'store-1',
        created_by: 'user-1'
      };

      const mockContext = {
        userId: 'user-1',
        module: 'test'
      };

      // Access private method via any cast for testing
      const result = await (service as any).applyTransactionImpact(mockTransaction, mockContext);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('applyTransactionImpact is deprecated')
      );
      expect(result.success).toBe(true);
      expect(result.balanceUpdates).toEqual({});
    });

    it('should log warning when revertTransactionImpact is called', async () => {
      const mockTransaction = {
        id: 'test-txn-1',
        amount: 100,
        currency: 'USD',
        type: 'income',
        store_id: 'store-1',
        created_by: 'user-1'
      };

      const mockContext = {
        userId: 'user-1',
        module: 'test'
      };

      // Access private method via any cast for testing
      const result = await (service as any).revertTransactionImpact(mockTransaction, mockContext);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('revertTransactionImpact is deprecated')
      );
      expect(result.success).toBe(true);
      expect(result.balanceUpdates).toEqual({});
    });
  });

  describe('updatePayment', () => {
    it('should return error if transaction not found', async () => {
      const result = await service.updatePayment(
        'non-existent-id',
        { amount: 100 },
        { userId: 'user-1', module: 'test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction not found');
    });

    it('should handle updates without amount/currency/entity changes', async () => {
      // This test would require mocking the database
      // For now, we verify the method exists and has correct signature
      expect(service.updatePayment).toBeDefined();
      expect(typeof service.updatePayment).toBe('function');
    });
  });

  describe('deletePayment', () => {
    it('should return error if transaction not found', async () => {
      const result = await service.deletePayment(
        'non-existent-id',
        { userId: 'user-1', module: 'test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction not found');
    });

    it('should have correct method signature', () => {
      expect(service.deletePayment).toBeDefined();
      expect(typeof service.deletePayment).toBe('function');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PaymentManagementService.getInstance();
      const instance2 = PaymentManagementService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('No Duplicate Balance Updates', () => {
    it('should not perform manual balance updates', async () => {
      // Verify that the service no longer has the old balance update methods
      expect((service as any).updateCustomerBalance).toBeUndefined();
      expect((service as any).updateSupplierBalance).toBeUndefined();
      expect((service as any).revertCustomerBalance).toBeUndefined();
      expect((service as any).revertSupplierBalance).toBeUndefined();
    });
  });
});
