import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { cashDrawerUpdateService } from './cashDrawerUpdateService';

export interface RealTimeSyncConfig {
  enabled: boolean;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
}

export interface CashDrawerUpdateEvent {
  storeId: string;
  newBalance: number;
  transactionId: string;
  timestamp: string;
  deviceId: string;
  eventType: 'balance_update' | 'session_opened' | 'session_closed';
}

export class RealTimeSyncService {
  private static instance: RealTimeSyncService;
  private subscriptions: Map<string, any> = new Map();
  private isConnected = false;
  private reconnectAttempts = 0;
  private deviceId: string;
  private config: RealTimeSyncConfig;

  private constructor() {
    this.deviceId = this.generateDeviceId();
    this.config = {
      enabled: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000
    };
  }

  public static getInstance(): RealTimeSyncService {
    if (!RealTimeSyncService.instance) {
      RealTimeSyncService.instance = new RealTimeSyncService();
    }
    return RealTimeSyncService.instance;
  }

  private generateDeviceId(): string {
    // Generate a unique device ID based on browser fingerprint
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx?.fillText('Device ID', 10, 10);
    const canvasFingerprint = canvas.toDataURL();
    
    return `device_${Date.now()}_${btoa(canvasFingerprint).slice(0, 8)}`;
  }

  /**
   * Initialize real-time synchronization for a store
   * Enhanced to include more tables for better real-time refresh
   */
  public async initializeRealTimeSync(storeId: string): Promise<void> {
    if (!this.config.enabled) {
      console.log('🔕 Real-time sync disabled');
      return;
    }

    try {
      console.log(`🔄 Initializing real-time sync for store: ${storeId}`);
      
      // Subscribe to cash drawer account changes
      await this.subscribeToCashDrawerUpdates(storeId);
      
      // Subscribe to transaction changes
      await this.subscribeToTransactionUpdates(storeId);
      
      // Subscribe to cash drawer session changes
      await this.subscribeToSessionUpdates(storeId);
      
      // Subscribe to inventory changes for real-time stock updates
      await this.subscribeToInventoryUpdates(storeId);
      
      // Subscribe to bill changes for real-time sales updates
      await this.subscribeToBillUpdates(storeId);
      
      // Subscribe to product updates for real-time product changes
      await this.subscribeToProductUpdates(storeId);
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      console.log('✅ Real-time sync initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize real-time sync:', error);
      this.scheduleReconnect(storeId);
    }
  }

  /**
   * Subscribe to cash drawer account balance changes
   */
  private async subscribeToCashDrawerUpdates(storeId: string): Promise<void> {
    const channelName = `cash_drawer_accounts_${storeId}`;
    
    if (this.subscriptions.has(channelName)) {
      return; // Already subscribed
    }

    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_drawer_accounts',
          filter: `store_id=eq.${storeId}`
        },
        async (payload) => {
          console.log('💰 Real-time cash drawer account update:', payload);
          await this.handleCashDrawerAccountUpdate(payload, storeId);
        }
      )
      .subscribe((status) => {
        console.log(`📡 Cash drawer subscription status: ${status}`);
        if (status === 'SUBSCRIBED') {
          this.subscriptions.set(channelName, subscription);
        }
      });

    this.subscriptions.set(channelName, subscription);
  }

  /**
   * Subscribe to transaction changes (for cash drawer transactions)
   */
  private async subscribeToTransactionUpdates(storeId: string): Promise<void> {
    const channelName = `transactions_${storeId}`;
    
    if (this.subscriptions.has(channelName)) {
      return; // Already subscribed
    }

    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
          filter: `store_id=eq.${storeId}`
        },
        async (payload) => {
          const transaction = payload.new;
          
          // Only handle cash drawer related transactions
          if (transaction.category && transaction.category.startsWith('cash_drawer_')) {
            console.log('💰 Real-time cash drawer transaction:', transaction);
            await this.handleCashDrawerTransactionUpdate(transaction, storeId);
          }
        }
      )
      .subscribe((status) => {
        console.log(`📡 Transaction subscription status: ${status}`);
        if (status === 'SUBSCRIBED') {
          this.subscriptions.set(channelName, subscription);
        }
      });

    this.subscriptions.set(channelName, subscription);
  }

  /**
   * Subscribe to cash drawer session changes
   */
  private async subscribeToSessionUpdates(storeId: string): Promise<void> {
    const channelName = `cash_drawer_sessions_${storeId}`;
    
    if (this.subscriptions.has(channelName)) {
      return; // Already subscribed
    }

    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_drawer_sessions',
          filter: `store_id=eq.${storeId}`
        },
        async (payload) => {
          console.log('💰 Real-time cash drawer session update:', payload);
          await this.handleCashDrawerSessionUpdate(payload, storeId);
        }
      )
      .subscribe((status) => {
        console.log(`📡 Session subscription status: ${status}`);
        if (status === 'SUBSCRIBED') {
          this.subscriptions.set(channelName, subscription);
        }
      });

    this.subscriptions.set(channelName, subscription);
  }

  /**
   * Handle cash drawer account balance updates from other devices
   */
  private async handleCashDrawerAccountUpdate(payload: any, storeId: string): Promise<void> {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      
      // // Skip updates from the same device to avoid loops
      // if (newRecord?.device_id === this.deviceId) {
      //   return;
      // }

      if (eventType === 'UPDATE' && newRecord) {
        const newBalance = Number(newRecord.current_balance || 0);
        const oldBalance = Number(oldRecord?.current_balance || 0);
        
        if (Math.abs(newBalance - oldBalance) > 0.01) {
          console.log(`💰 Real-time balance update: $${oldBalance.toFixed(2)} → $${newBalance.toFixed(2)}`);
          
          // Update local database
          await db.cash_drawer_accounts.update(newRecord.id, {
            current_balance: newBalance,
            updated_at: newRecord.updated_at,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });

          // Notify UI components
          this.notifyLocalComponents(storeId, newBalance, 'balance_update');
        }
      }
    } catch (error) {
      console.error('Error handling cash drawer account update:', error);
    }
  }

  /**
   * Handle cash drawer transaction updates from other devices
   */
  private async handleCashDrawerTransactionUpdate(transaction: any, storeId: string): Promise<void> {
    try {
      // Skip transactions from the same device
      if (transaction.device_id === this.deviceId) {
        return;
      }

      console.log(`💰 Real-time transaction received: ${transaction.category} - $${transaction.amount}`);
      
      // Add transaction to local database (filter out fields not in local schema)
      const { status, ...transactionData } = transaction;
      await db.transactions.add({
        ...transactionData,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });

      // Recalculate and update local balance
      const currentBalance = await cashDrawerUpdateService.getCurrentCashDrawerBalance(storeId);
      
      // Notify UI components
      this.notifyLocalComponents(storeId, currentBalance, 'balance_update');
      
    } catch (error) {
      console.error('Error handling cash drawer transaction update:', error);
    }
  }

  /**
   * Handle cash drawer session updates from other devices
   */
  private async handleCashDrawerSessionUpdate(payload: any, storeId: string): Promise<void> {
    try {
      const { eventType, new: newRecord } = payload;
      
      // // Skip updates from the same device
      // if (newRecord?.device_id === this.deviceId) {
      //   return;
      // }

      if (eventType === 'INSERT' && newRecord) {
        console.log(`💰 Real-time session opened: ${newRecord.status}`);
        
        // Add session to local database
        await db.cash_drawer_sessions.add({
          ...newRecord,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });

        // Notify UI components
        this.notifyLocalComponents(storeId, newRecord.opening_amount, 'session_opened');
      }
    } catch (error) {
      console.error('Error handling cash drawer session update:', error);
    }
  }

  /**
   * Subscribe to inventory changes for real-time stock updates
   */
  private async subscribeToInventoryUpdates(storeId: string): Promise<void> {
    const channelName = `inventory_items_${storeId}`;
    
    if (this.subscriptions.has(channelName)) {
      return; // Already subscribed
    }

    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_items',
          filter: `store_id=eq.${storeId}`
        },
        async (payload) => {
          console.log('📦 Real-time inventory update:', payload);
          await this.handleInventoryUpdate(payload, storeId);
        }
      )
      .subscribe((status) => {
        console.log(`📡 Inventory subscription status: ${status}`);
        if (status === 'SUBSCRIBED') {
          this.subscriptions.set(channelName, subscription);
        }
      });

    this.subscriptions.set(channelName, subscription);
  }

  /**
   * Subscribe to bill changes for real-time sales updates
   */
  private async subscribeToBillUpdates(storeId: string): Promise<void> {
    const channelName = `bills_${storeId}`;
    
    if (this.subscriptions.has(channelName)) {
      return; // Already subscribed
    }

    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bills',
          filter: `store_id=eq.${storeId}`
        },
        async (payload) => {
          console.log('🧾 Real-time bill update:', payload);
          await this.handleBillUpdate(payload, storeId);
        }
      )
      .subscribe((status) => {
        console.log(`📡 Bill subscription status: ${status}`);
        if (status === 'SUBSCRIBED') {
          this.subscriptions.set(channelName, subscription);
        }
      });

    this.subscriptions.set(channelName, subscription);
  }

  /**
   * Subscribe to product changes for real-time product updates
   */
  private async subscribeToProductUpdates(storeId: string): Promise<void> {
    const channelName = `products_${storeId}`;
    
    if (this.subscriptions.has(channelName)) {
      return; // Already subscribed
    }

    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `store_id=eq.${storeId}`
        },
        async (payload) => {
          console.log('🛍️ Real-time product update:', payload);
          await this.handleProductUpdate(payload, storeId);
        }
      )
      .subscribe((status) => {
        console.log(`📡 Product subscription status: ${status}`);
        if (status === 'SUBSCRIBED') {
          this.subscriptions.set(channelName, subscription);
        }
      });

    this.subscriptions.set(channelName, subscription);
  }

  /**
   * Handle inventory updates from other devices
   */
  private async handleInventoryUpdate(payload: any, storeId: string): Promise<void> {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      if (eventType === 'INSERT' && newRecord) {
        // Check if record already exists (may have been created locally)
        const existing = await db.inventory_items.get(newRecord.id);
        if (existing) {
          // Update existing record
          await db.inventory_items.update(newRecord.id, {
            ...newRecord,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });
        } else {
          // Add new inventory item to local database
          await db.inventory_items.add({
            ...newRecord,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });
        }
      } else if (eventType === 'UPDATE' && newRecord) {
        // Update existing inventory item
        await db.inventory_items.update(newRecord.id, {
          ...newRecord,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      } else if (eventType === 'DELETE' && oldRecord) {
        // Mark as deleted in local database
        await db.inventory_items.update(oldRecord.id, {
          _deleted: true,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      }

      // Notify UI components
      this.notifyInventoryUpdate(storeId);
    } catch (error) {
      console.error('Error handling inventory update:', error);
    }
  }

  /**
   * Handle bill updates from other devices
   */
  private async handleBillUpdate(payload: any, storeId: string): Promise<void> {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      if (eventType === 'INSERT' && newRecord) {
        // Check if record already exists (may have been created locally)
        const existing = await db.bills.get(newRecord.id);
        if (existing) {
          // Update existing record
          await db.bills.update(newRecord.id, {
            ...newRecord,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });
        } else {
          // Add new bill to local database
          await db.bills.add({
            ...newRecord,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });
        }
      } else if (eventType === 'UPDATE' && newRecord) {
        // Update existing bill
        await db.bills.update(newRecord.id, {
          ...newRecord,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      } else if (eventType === 'DELETE' && oldRecord) {
        // Mark as deleted in local database
        await db.bills.update(oldRecord.id, {
          _deleted: true,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      }

      // Notify UI components
      this.notifyBillUpdate(storeId);
    } catch (error) {
      console.error('Error handling bill update:', error);
    }
  }

  /**
   * Handle product updates from other devices
   */
  private async handleProductUpdate(payload: any, storeId: string): Promise<void> {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      if (eventType === 'INSERT' && newRecord) {
        // Check if record already exists (may have been created locally)
        const existing = await db.products.get(newRecord.id);
        if (existing) {
          // Update existing record
          await db.products.update(newRecord.id, {
            ...newRecord,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });
        } else {
          // Add new product to local database
          await db.products.add({
            ...newRecord,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });
        }
      } else if (eventType === 'UPDATE' && newRecord) {
        // Update existing product
        await db.products.update(newRecord.id, {
          ...newRecord,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      } else if (eventType === 'DELETE' && oldRecord) {
        // Mark as deleted in local database
        await db.products.update(oldRecord.id, {
          _deleted: true,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      }

      // Notify UI components
      this.notifyProductUpdate(storeId);
    } catch (error) {
      console.error('Error handling product update:', error);
    }
  }

  /**
   * Notify UI components about inventory updates
   */
  private notifyInventoryUpdate(storeId: string): void {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('inventory-realtime-update', {
          detail: {
            storeId,
            timestamp: new Date().toISOString(),
            source: 'realtime'
          }
        }));
      }
    } catch (error) {
      console.error('Error notifying inventory update:', error);
    }
  }

  /**
   * Notify UI components about bill updates
   */
  private notifyBillUpdate(storeId: string): void {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bills-realtime-update', {
          detail: {
            storeId,
            timestamp: new Date().toISOString(),
            source: 'realtime'
          }
        }));
      }
    } catch (error) {
      console.error('Error notifying bill update:', error);
    }
  }

  /**
   * Notify UI components about product updates
   */
  private notifyProductUpdate(storeId: string): void {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('products-realtime-update', {
          detail: {
            storeId,
            timestamp: new Date().toISOString(),
            source: 'realtime'
          }
        }));
      }
    } catch (error) {
      console.error('Error notifying product update:', error);
    }
  }

  /**
   * Notify local UI components about real-time updates
   */
  private notifyLocalComponents(storeId: string, newBalance: number, eventType: string): void {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cash-drawer-realtime-update', {
          detail: {
            storeId,
            newBalance,
            eventType,
            timestamp: new Date().toISOString(),
            source: 'realtime'
          }
        }));
      }
    } catch (error) {
      console.error('Error notifying local components:', error);
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(storeId: string): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached. Real-time sync disabled.');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);
    
    setTimeout(() => {
      this.initializeRealTimeSync(storeId);
    }, this.config.reconnectInterval);
  }

  /**
   * Disconnect all real-time subscriptions
   */
  public async disconnect(): Promise<void> {
    console.log('🔌 Disconnecting real-time sync...');
    
    for (const [channelName, subscription] of this.subscriptions) {
      try {
        await supabase.removeChannel(subscription);
        console.log(`✅ Disconnected channel: ${channelName}`);
      } catch (error) {
        console.error(`❌ Error disconnecting channel ${channelName}:`, error);
      }
    }
    
    this.subscriptions.clear();
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): { connected: boolean; subscriptions: number; deviceId: string } {
    return {
      connected: this.isConnected,
      subscriptions: this.subscriptions.size,
      deviceId: this.deviceId
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<RealTimeSyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

export const realTimeSyncService = RealTimeSyncService.getInstance();
