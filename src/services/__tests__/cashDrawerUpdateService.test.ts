import { cashDrawerUpdateService } from '../cashDrawerUpdateService';
import { db } from '../../lib/db';

// Mock the createId function
jest.mock('../../lib/db', () => ({
  db: {
    getCashDrawerAccount: jest.fn(),
    getCurrentCashDrawerSession: jest.fn(),
    openCashDrawerSession: jest.fn(),
    closeCashDrawerSession: jest.fn(),
    cash_drawer_accounts: {
      add: jest.fn(),
      update: jest.fn()
    },
    cash_drawer_sessions: {
      add: jest.fn(),
      get: jest.fn(),
      where: jest.fn(() => ({
        equals: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue([])
        }))
      }))
    },
    transactions: {
      add: jest.fn(),
      filter: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([])
      }))
    },
    transaction: jest.fn()
  },
  createId: jest.fn(() => 'mock-id-123')
}));

// Mock currency service
jest.mock('../currencyService', () => ({
  currencyService: {
    convertCurrency: jest.fn((amount, from, to) => amount)
  }
}));

describe('CashDrawerUpdateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateCashDrawerForTransaction', () => {
    it('should update cash drawer for cash sale', async () => {
      const mockAccount = {
        id: 'account-1',
        current_balance: 100,
        store_id: 'store-1',
        currency: 'USD'
      };
      const mockSession = {
        id: 'session-1',
        status: 'open'
      };

      (db.getCashDrawerAccount as jest.Mock).mockResolvedValue(mockAccount);
      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(mockSession);
      (db.transaction as jest.Mock).mockImplementation(async (mode, tables, callback) => {
        return await callback();
      });
      (db.cash_drawer_accounts.update as jest.Mock).mockResolvedValue(undefined);
      (db.transactions.add as jest.Mock).mockResolvedValue(undefined);

      const result = await cashDrawerUpdateService.updateCashDrawerForTransaction({
        type: 'sale',
        amount: 50,
        currency: 'USD',
        description: 'Test sale',
        reference: 'SALE-123',
        storeId: 'store-1',
        createdBy: 'user-1'
      });

      expect(result.success).toBe(true);
      expect(result.previousBalance).toBe(100);
      expect(result.newBalance).toBe(150);
    });

    it('should not update cash drawer for non-USD transactions', async () => {
      const result = await cashDrawerUpdateService.updateCashDrawerForTransaction({
        type: 'sale',
        amount: 50,
        currency: 'LBP',
        description: 'Test sale',
        reference: 'SALE-123',
        storeId: 'store-1',
        createdBy: 'user-1'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only USD transactions are supported for cash drawer updates');
    });

    it('should handle missing cash drawer account', async () => {
      (db.getCashDrawerAccount as jest.Mock).mockResolvedValue(null);

      const result = await cashDrawerUpdateService.updateCashDrawerForTransaction({
        type: 'sale',
        amount: 50,
        currency: 'USD',
        description: 'Test sale',
        reference: 'SALE-123',
        storeId: 'store-1',
        createdBy: 'user-1'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cash drawer account not found');
    });

    it('should require active session for transactions', async () => {
      const mockAccount = {
        id: 'account-1',
        current_balance: 100,
        store_id: 'store-1'
      };

      (db.getCashDrawerAccount as jest.Mock).mockResolvedValue(mockAccount);
      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(null);

      const result = await cashDrawerUpdateService.updateCashDrawerForTransaction({
        type: 'sale',
        amount: 50,
        currency: 'USD',
        description: 'Test sale',
        reference: 'SALE-123',
        storeId: 'store-1',
        createdBy: 'user-1'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active cash drawer session. Please open cash drawer session before processing transactions.');
    });

    it('should require active session status', async () => {
      const mockAccount = {
        id: 'account-1',
        current_balance: 100,
        store_id: 'store-1'
      };
      const mockSession = {
        id: 'session-1',
        status: 'closed'
      };

      (db.getCashDrawerAccount as jest.Mock).mockResolvedValue(mockAccount);
      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(mockSession);

      const result = await cashDrawerUpdateService.updateCashDrawerForTransaction({
        type: 'sale',
        amount: 50,
        currency: 'USD',
        description: 'Test sale',
        reference: 'SALE-123',
        storeId: 'store-1',
        createdBy: 'user-1'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active cash drawer session. Please open cash drawer session before processing transactions.');
    });

    it('should use atomic transactions to prevent data corruption', async () => {
      const mockAccount = {
        id: 'account-1',
        current_balance: 100,
        store_id: 'store-1',
        currency: 'USD'
      };
      const mockSession = {
        id: 'session-1',
        status: 'open'
      };

      (db.getCashDrawerAccount as jest.Mock).mockResolvedValue(mockAccount);
      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(mockSession);
      (db.transaction as jest.Mock).mockImplementation(async (mode, tables, callback) => {
        return await callback();
      });
      (db.cash_drawer_accounts.update as jest.Mock).mockResolvedValue(undefined);
      (db.transactions.add as jest.Mock).mockResolvedValue(undefined);

      const result = await cashDrawerUpdateService.updateCashDrawerForTransaction({
        type: 'sale',
        amount: 50,
        currency: 'USD',
        description: 'Test sale',
        reference: 'SALE-123',
        storeId: 'store-1',
        createdBy: 'user-1'
      });

      expect(result.success).toBe(true);
      expect(db.transaction).toHaveBeenCalledWith('rw', [db.cash_drawer_accounts, db.transactions], expect.any(Function));
    });
  });

  describe('updateCashDrawerForSale', () => {
    it('should update cash drawer for cash sales only', async () => {
      const mockAccount = {
        id: 'account-1',
        currentBalance: 100,
        store_id: 'store-1'
      };
      const mockSession = {
        id: 'session-1',
        status: 'open'
      };

      (db.getCashDrawerAccount as jest.Mock).mockResolvedValue(mockAccount);
      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(mockSession);
      (db.cash_drawer_accounts.update as jest.Mock).mockResolvedValue(undefined);
      (db.transactions.add as jest.Mock).mockResolvedValue(undefined);

      // Cash sale
      const cashResult = await cashDrawerUpdateService.updateCashDrawerForSale({
        amount: 50,
        currency: 'USD',
        paymentMethod: 'cash',
        storeId: 'store-1',
        createdBy: 'user-1'
      });

      expect(cashResult.success).toBe(true);

      // Card sale
      const cardResult = await cashDrawerUpdateService.updateCashDrawerForSale({
        amount: 50,
        currency: 'USD',
        paymentMethod: 'card',
        storeId: 'store-1',
        createdBy: 'user-1'
      });

      expect(cardResult.success).toBe(true);
      expect(cardResult.previousBalance).toBe(0);
      expect(cardResult.newBalance).toBe(0);
    });
  });

  describe('updateCashDrawerForExpense', () => {
    it('should decrease cash drawer for expenses', async () => {
      const mockAccount = {
        id: 'account-1',
        currentBalance: 100,
        store_id: 'store-1'
      };
      const mockSession = {
        id: 'session-1',
        status: 'open'
      };

      (db.getCashDrawerAccount as jest.Mock).mockResolvedValue(mockAccount);
      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(mockSession);
      (db.cash_drawer_accounts.update as jest.Mock).mockResolvedValue(undefined);
      (db.transactions.add as jest.Mock).mockResolvedValue(undefined);

      const result = await cashDrawerUpdateService.updateCashDrawerForExpense({
        amount: 30,
        currency: 'USD',
        storeId: 'store-1',
        createdBy: 'user-1',
        description: 'Office supplies',
        category: 'Office'
      });

      expect(result.success).toBe(true);
      expect(result.previousBalance).toBe(100);
      expect(result.newBalance).toBe(70);
    });
  });
<<<<<<< Current (Your changes)
=======

  describe('openCashDrawerSession', () => {
    it('should open new cash drawer session successfully', async () => {
      const mockAccount = {
        id: 'account-1',
        store_id: 'store-1',
        currency: 'USD'
      };

      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(null);
      (db.getCashDrawerAccount as jest.Mock).mockResolvedValue(mockAccount);
      (db.openCashDrawerSession as jest.Mock).mockResolvedValue('session-123');

      const result = await cashDrawerUpdateService.openCashDrawerSession(
        'store-1',
        100,
        'user-1',
        'Opening for shift'
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('session-123');
      expect(db.openCashDrawerSession).toHaveBeenCalledWith('store-1', 'account-1', 100, 'user-1');
    });

    it('should prevent opening multiple sessions', async () => {
      const mockSession = {
        id: 'existing-session',
        status: 'open',
        openedBy: 'other-user',
        openedAt: '2024-01-01T10:00:00Z'
      };

      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(mockSession);

      const result = await cashDrawerUpdateService.openCashDrawerSession(
        'store-1',
        100,
        'user-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cash drawer session already open');
      expect(db.openCashDrawerSession).not.toHaveBeenCalled();
    });

    it('should create account if none exists', async () => {
      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(null);
      (db.getCashDrawerAccount as jest.Mock).mockResolvedValue(null);
      (db.cash_drawer_accounts.add as jest.Mock).mockResolvedValue(undefined);
      (db.openCashDrawerSession as jest.Mock).mockResolvedValue('session-123');

      const result = await cashDrawerUpdateService.openCashDrawerSession(
        'store-1',
        100,
        'user-1'
      );

      expect(result.success).toBe(true);
      expect(db.cash_drawer_accounts.add).toHaveBeenCalled();
    });
  });

  describe('closeCashDrawer', () => {
    it('should close cash drawer session successfully', async () => {
      const mockSession = {
        id: 'session-1',
        store_id: 'store-1',
        status: 'open',
        expectedAmount: 150,
        actualAmount: 145,
        variance: -5
      };

      (db.cash_drawer_sessions.get as jest.Mock).mockResolvedValue(mockSession);
      (db.closeCashDrawerSession as jest.Mock).mockResolvedValue(undefined);

      const result = await cashDrawerUpdateService.closeCashDrawer(
        'session-1',
        145,
        'user-1',
        'End of shift'
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('session-1');
      expect(result.expectedAmount).toBe(150);
      expect(result.actualAmount).toBe(145);
      expect(result.variance).toBe(-5);
    });

    it('should handle missing session', async () => {
      (db.cash_drawer_sessions.get as jest.Mock).mockResolvedValue(null);

      const result = await cashDrawerUpdateService.closeCashDrawer(
        'nonexistent-session',
        100,
        'user-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found');
    });
  });

  describe('getCurrentCashDrawerBalance', () => {
    it('should calculate balance from transactions (single source of truth)', async () => {
      const mockAccount = {
        id: 'account-1',
        current_balance: 100,
        store_id: 'store-1',
        currency: 'USD'
      };
      const mockTransactions = [
        { type: 'income', amount: 50, category: 'cash_drawer_sale' },
        { type: 'expense', amount: 20, category: 'cash_drawer_expense' }
      ];
      const mockSessions = [
        { openingAmount: 50 }
      ];

      (db.getCashDrawerAccount as jest.Mock).mockResolvedValue(mockAccount);
      (db.transactions.filter as jest.Mock).mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockTransactions)
      });
      (db.cash_drawer_sessions.where as jest.Mock).mockReturnValue({
        equals: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockSessions)
        })
      });

      // Mock the balance calculation to return calculated balance
      const calculatedBalance = 80; // 50 (opening) + 50 (income) - 20 (expense)
      
      // Since stored balance (100) differs from calculated (80), it should reconcile
      (db.cash_drawer_accounts.update as jest.Mock).mockResolvedValue(undefined);

      const balance = await cashDrawerUpdateService.getCurrentCashDrawerBalance('store-1');

      // Should return calculated balance and update stored balance
      expect(db.cash_drawer_accounts.update).toHaveBeenCalledWith('account-1', {
        current_balance: calculatedBalance,
        updated_at: expect.any(String),
        _synced: false
      });
    });
  });

  describe('Race Condition Prevention', () => {
    it('should handle concurrent operations with locking', async () => {
      const mockAccount = {
        id: 'account-1',
        current_balance: 100,
        store_id: 'store-1',
        currency: 'USD'
      };
      const mockSession = {
        id: 'session-1',
        status: 'open'
      };

      (db.getCashDrawerAccount as jest.Mock).mockResolvedValue(mockAccount);
      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(mockSession);
      (db.transaction as jest.Mock).mockImplementation(async (mode, tables, callback) => {
        return await callback();
      });
      (db.cash_drawer_accounts.update as jest.Mock).mockResolvedValue(undefined);
      (db.transactions.add as jest.Mock).mockResolvedValue(undefined);

      // Start multiple concurrent operations
      const operation1 = cashDrawerUpdateService.updateCashDrawerForTransaction({
        type: 'sale',
        amount: 25,
        currency: 'USD',
        description: 'Sale 1',
        reference: 'SALE-1',
        storeId: 'store-1',
        createdBy: 'user-1'
      });

      const operation2 = cashDrawerUpdateService.updateCashDrawerForTransaction({
        type: 'sale',
        amount: 35,
        currency: 'USD',
        description: 'Sale 2',
        reference: 'SALE-2',
        storeId: 'store-1',
        createdBy: 'user-1'
      });

      const [result1, result2] = await Promise.all([operation1, operation2]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // Both operations should complete without interference
      expect(db.cash_drawer_accounts.update).toHaveBeenCalledTimes(2);
      expect(db.transactions.add).toHaveBeenCalledTimes(2);
    });
  });
>>>>>>> Incoming (Background Agent changes)
});
