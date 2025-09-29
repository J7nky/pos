import { missedProductsService } from '../missedProductsService';
import { db } from '../../lib/db';

// Mock the database
jest.mock('../../lib/db', () => ({
  db: {
    missed_products: {
      where: jest.fn().mockReturnThis(),
      equals: jest.fn().mockReturnThis(),
      filter: jest.fn().mockReturnThis(),
      toArray: jest.fn()
    },
    cash_drawer_sessions: {
      where: jest.fn().mockReturnThis(),
      anyOf: jest.fn().mockReturnThis(),
      toArray: jest.fn()
    }
  }
}));

describe('MissedProductsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMissedProductsHistory', () => {
    it('should return empty array when no missed products found', async () => {
      (db.missed_products.where as jest.Mock).mockReturnValue({
        equals: jest.fn().mockReturnValue({
          filter: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([])
          })
        })
      });

      const result = await missedProductsService.getMissedProductsHistory('store-1', 30);
      
      expect(result).toEqual([]);
    });

    it('should return missed products history with sessions', async () => {
      const mockMissedProducts = [
        {
          id: 'mp-1',
          store_id: 'store-1',
          session_id: 'session-1',
          inventory_item_id: 'item-1',
          system_quantity: 10,
          physical_quantity: 8,
          variance: -2,
          created_at: '2024-01-15T10:00:00Z'
        },
        {
          id: 'mp-2',
          store_id: 'store-1',
          session_id: 'session-1',
          inventory_item_id: 'item-2',
          system_quantity: 5,
          physical_quantity: 7,
          variance: 2,
          created_at: '2024-01-15T10:00:00Z'
        }
      ];

      const mockSessions = [
        {
          id: 'session-1',
          opened_at: '2024-01-15T09:00:00Z',
          closed_at: '2024-01-15T17:00:00Z',
          opened_by: 'user-1'
        }
      ];

      (db.missed_products.where as jest.Mock).mockReturnValue({
        equals: jest.fn().mockReturnValue({
          filter: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue(mockMissedProducts)
          })
        })
      });

      (db.cash_drawer_sessions.where as jest.Mock).mockReturnValue({
        anyOf: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockSessions)
        })
      });

      const result = await missedProductsService.getMissedProductsHistory('store-1', 30);
      
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].discrepancy_count).toBe(2);
      expect(result[0].total_variance).toBe(4); // |2| + |2|
      expect(result[0].sessions).toHaveLength(1);
      expect(result[0].sessions[0].session_id).toBe('session-1');
    });

    it('should use context data when provided', async () => {
      // Use a recent date to pass the date filter
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1); // Yesterday
      
      const contextData = {
        missedProducts: [
          {
            id: 'mp-1',
            store_id: 'store-1',
            session_id: 'session-1',
            inventory_item_id: 'item-1',
            system_quantity: 10,
            physical_quantity: 8,
            variance: -2,
            created_at: recentDate.toISOString()
          }
        ]
      };

      const mockSessions = [
        {
          id: 'session-1',
          opened_at: recentDate.toISOString(),
          closed_at: new Date(recentDate.getTime() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours later
          opened_by: 'user-1'
        }
      ];

      (db.cash_drawer_sessions.where as jest.Mock).mockReturnValue({
        anyOf: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockSessions)
        })
      });

      const result = await missedProductsService.getMissedProductsHistory('store-1', 30, contextData);
      
      expect(result).toHaveLength(1);
      expect(result[0].discrepancy_count).toBe(1);
      expect(result[0].total_variance).toBe(2);
    });
  });
});
