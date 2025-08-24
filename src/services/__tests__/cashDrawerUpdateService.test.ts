import { cashDrawerUpdateService } from '../cashDrawerUpdateService';
import { db } from '../../lib/db';

// Mock the database
jest.mock('../../lib/db', () => ({
  db: {
    getCashDrawerAccount: jest.fn(),
    getCurrentCashDrawerSession: jest.fn(),
    cash_drawer_accounts: {
      update: jest.fn()
    },
    transactions: {
      add: jest.fn()
    }
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
      expect(db.cash_drawer_accounts.update).toHaveBeenCalledWith('account-1', {
        currentBalance: 150,
        updated_at: expect.any(String),
        _synced: false
      });
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

    it('should handle missing cash drawer session', async () => {
      const mockAccount = {
        id: 'account-1',
        currentBalance: 100,
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
      expect(result.error).toBe('No active cash drawer session');
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
});
