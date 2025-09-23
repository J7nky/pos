import { syncService } from '../syncService';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';

// Mock the database
jest.mock('../../lib/db', () => ({
  db: {
    getCurrentCashDrawerSession: jest.fn(),
    cash_drawer_accounts: {
      update: jest.fn(),
      put: jest.fn()
    },
    cash_drawer_sessions: {
      update: jest.fn(),
      put: jest.fn()
    },
    transactions: {
      put: jest.fn(),
      update: jest.fn(),
      filter: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([])
      }))
    },
    customers: {
      put: jest.fn(),
      update: jest.fn()
    },
    suppliers: {
      put: jest.fn(),
      update: jest.fn()
    }
  }
}));

// Mock Supabase
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis()
    }))
  }
}));

describe('SyncService Financial Conflict Resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Cash Drawer Account Conflicts', () => {
    it('should resolve balance conflicts using financial logic', async () => {
      const localRecord = {
        id: 'account-1',
        current_balance: 150,
        store_id: 'store-1',
        updated_at: '2024-01-01T10:00:00Z'
      };
      
      const remoteRecord = {
        id: 'account-1',
        current_balance: 120,
        store_id: 'store-1',
        updated_at: '2024-01-01T09:00:00Z'
      };

      const mockSession = {
        id: 'session-1',
        status: 'open',
        openingAmount: 100
      };

      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(mockSession);
      (db.transactions.filter as jest.Mock).mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { type: 'income', amount: 50 }
        ])
      });

      // Access private method for testing
      const syncServiceInstance = (syncService as any);
      const conflict = await syncServiceInstance.resolveCashDrawerAccountConflict(localRecord, remoteRecord);

      expect(conflict).toBe(true);
      expect(db.cash_drawer_accounts.update).toHaveBeenCalled();
    });

    it('should handle session-based conflict resolution', async () => {
      const localRecord = {
        id: 'account-1',
        current_balance: 150,
        store_id: 'store-1',
        updated_at: '2024-01-01T10:00:00Z'
      };
      
      const remoteRecord = {
        id: 'account-1',
        current_balance: 120,
        store_id: 'store-1',
        updated_at: '2024-01-01T09:00:00Z'
      };

      const mockSession = {
        id: 'session-1',
        status: 'open',
        openingAmount: 100
      };

      (db.getCurrentCashDrawerSession as jest.Mock).mockResolvedValue(mockSession);
      (db.transactions.filter as jest.Mock).mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { type: 'income', amount: 50 } // Expected balance should be 150
        ])
      });

      const syncServiceInstance = (syncService as any);
      await syncServiceInstance.resolveCashDrawerAccountConflict(localRecord, remoteRecord);

      // Should use local balance since it matches expected from transactions
      expect(db.cash_drawer_accounts.update).toHaveBeenCalledWith('account-1', {
        current_balance: 150,
        _synced: true,
        _lastSyncedAt: expect.any(String)
      });
    });
  });

  describe('Session Conflicts', () => {
    it('should prioritize closed sessions over open ones', async () => {
      const localRecord = {
        id: 'session-1',
        status: 'closed',
        updated_at: '2024-01-01T10:00:00Z'
      };
      
      const remoteRecord = {
        id: 'session-1',
        status: 'open',
        updated_at: '2024-01-01T11:00:00Z'
      };

      const syncServiceInstance = (syncService as any);
      const conflict = await syncServiceInstance.resolveCashDrawerSessionConflict(localRecord, remoteRecord);

      expect(conflict).toBe(true);
      expect(db.cash_drawer_sessions.update).toHaveBeenCalledWith('session-1', {
        _synced: true,
        _lastSyncedAt: expect.any(String)
      });
    });

    it('should handle multiple open sessions by closing the older one', async () => {
      const localRecord = {
        id: 'session-1',
        status: 'open',
        updated_at: '2024-01-01T09:00:00Z',
        openingAmount: 100
      };
      
      const remoteRecord = {
        id: 'session-1',
        status: 'open',
        updated_at: '2024-01-01T10:00:00Z',
        openingAmount: 100
      };

      const syncServiceInstance = (syncService as any);
      const conflict = await syncServiceInstance.resolveCashDrawerSessionConflict(localRecord, remoteRecord);

      expect(conflict).toBe(true);
      // Should use newer (remote) session
      expect(db.cash_drawer_sessions.put).toHaveBeenCalledWith({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: expect.any(String)
      });
    });
  });

  describe('Transaction Conflicts', () => {
    it('should preserve both transactions when amounts differ', async () => {
      const localRecord = {
        id: 'trans-1',
        amount: 100,
        description: 'Sale',
        reference: 'SALE-123',
        created_at: '2024-01-01T10:00:00Z'
      };
      
      const remoteRecord = {
        id: 'trans-1',
        amount: 120,
        description: 'Sale',
        reference: 'SALE-123',
        created_at: '2024-01-01T10:00:00Z'
      };

      const syncServiceInstance = (syncService as any);
      const conflict = await syncServiceInstance.resolveTransactionConflict(localRecord, remoteRecord);

      expect(conflict).toBe(true);
      // Should create duplicate transaction to preserve both amounts
      expect(db.transactions.put).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringContaining('trans-1-conflict'),
          amount: 120,
          description: 'Sale [Conflict resolution duplicate]'
        })
      );
    });
  });

  describe('Customer Balance Conflicts', () => {
    it('should use higher balance to preserve debt', async () => {
      const localRecord = {
        id: 'customer-1',
        usd_balance: 150,
        lb_balance: 500000,
        updated_at: '2024-01-01T10:00:00Z'
      };
      
      const remoteRecord = {
        id: 'customer-1',
        usd_balance: 120,
        lb_balance: 600000,
        updated_at: '2024-01-01T11:00:00Z'
      };

      const syncServiceInstance = (syncService as any);
      const conflict = await syncServiceInstance.resolveCustomerConflict(localRecord, remoteRecord);

      expect(conflict).toBe(true);
      expect(db.customers.put).toHaveBeenCalledWith({
        ...remoteRecord,
        usd_balance: 150, // Higher USD balance
        lb_balance: 600000, // Higher LBP balance
        _synced: true,
        _lastSyncedAt: expect.any(String)
      });
    });
  });

  describe('Supplier Balance Conflicts', () => {
    it('should use higher balance to preserve debt', async () => {
      const localRecord = {
        id: 'supplier-1',
        usd_balance: 200,
        lb_balance: 800000,
        updated_at: '2024-01-01T10:00:00Z'
      };
      
      const remoteRecord = {
        id: 'supplier-1',
        usd_balance: 180,
        lb_balance: 900000,
        updated_at: '2024-01-01T11:00:00Z'
      };

      const syncServiceInstance = (syncService as any);
      const conflict = await syncServiceInstance.resolveSupplierConflict(localRecord, remoteRecord);

      expect(conflict).toBe(true);
      expect(db.suppliers.put).toHaveBeenCalledWith({
        ...remoteRecord,
        usd_balance: 200, // Higher USD balance
        lb_balance: 900000, // Higher LBP balance
        _synced: true,
        _lastSyncedAt: expect.any(String)
      });
    });
  });
});












