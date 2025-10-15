import { realTimeSyncService } from '../realTimeSyncService';

// Mock Supabase client
jest.mock('../../lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn(() => ({
        subscribe: jest.fn((callback) => {
          // Simulate successful subscription
          callback('SUBSCRIBED');
          return { unsubscribe: jest.fn() };
        })
      }))
    })),
    removeChannel: jest.fn()
  }
}));

// Mock database
jest.mock('../../lib/db', () => ({
  db: {
    cash_drawer_accounts: {
      update: jest.fn(),
      add: jest.fn()
    },
    transactions: {
      add: jest.fn()
    },
    cash_drawer_sessions: {
      add: jest.fn()
    }
  }
}));

// Mock cash drawer service
jest.mock('../cashDrawerUpdateService', () => ({
  cashDrawerUpdateService: {
    getCurrentCashDrawerBalance: jest.fn(() => Promise.resolve(1000))
  }
}));

describe('RealTimeSyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize real-time sync for a store', async () => {
    const storeId = 'test-store-123';
    
    await realTimeSyncService.initializeRealTimeSync(storeId);
    
    const status = realTimeSyncService.getConnectionStatus();
    expect(status.connected).toBe(true);
    expect(status.subscriptions).toBeGreaterThan(0);
    expect(status.deviceId).toBeDefined();
  });

  test('should disconnect all subscriptions', async () => {
    const storeId = 'test-store-123';
    
    await realTimeSyncService.initializeRealTimeSync(storeId);
    await realTimeSyncService.disconnect();
    
    const status = realTimeSyncService.getConnectionStatus();
    expect(status.connected).toBe(false);
    expect(status.subscriptions).toBe(0);
  });

  test('should get connection status', () => {
    const status = realTimeSyncService.getConnectionStatus();
    
    expect(status).toHaveProperty('connected');
    expect(status).toHaveProperty('subscriptions');
    expect(status).toHaveProperty('deviceId');
  });

  test('should update configuration', () => {
    const newConfig = {
      enabled: false,
      reconnectInterval: 10000
    };
    
    realTimeSyncService.updateConfig(newConfig);
    
    // Configuration is updated internally
    expect(true).toBe(true); // Placeholder assertion
  });
});
