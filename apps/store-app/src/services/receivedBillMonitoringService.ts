import { db } from '../lib/db';
import { notificationService } from './notificationService';
import { InventoryItem, inventory_bills, BillLineItem } from '../types';

/**
 * Received Bill Monitoring Service
 * Monitors received bills for 100% completion and sends notifications to close them
 * Implements recurring notifications every 3 hours if read but not closed
 */
export class ReceivedBillMonitoringService {
  private static instance: ReceivedBillMonitoringService;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly RENOTIFICATION_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

  private constructor() {}

  public static getInstance(): ReceivedBillMonitoringService {
    if (!ReceivedBillMonitoringService.instance) {
      ReceivedBillMonitoringService.instance = new ReceivedBillMonitoringService();
    }
    return ReceivedBillMonitoringService.instance;
  }

  /**
   * Start periodic monitoring (checks every 10 minutes)
   */
  public startMonitoring(storeId: string): void {
    // Initial check
    this.checkCompletedBills(storeId);

    // Set up periodic checks every 10 minutes
    if (!this.checkInterval) {
      this.checkInterval = setInterval(() => {
        this.checkCompletedBills(storeId);
      }, 10 * 60 * 1000); // 10 minutes
    }
  }

  /**
   * Stop periodic monitoring
   */
  public stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Main method: Check for completed bills and send notifications
   */
  public async checkCompletedBills(storeId: string): Promise<void> {
    try {
      const completedBills = await this.findCompletedBills(storeId);

      for (const bill of completedBills) {
        await this.handleCompletedBill(storeId, bill);
      }
    } catch (error) {
      console.error('Error checking completed bills:', error);
    }
  }

  /**
   * Find all bills that are 100% sold out but not closed
   */
  private async findCompletedBills(storeId: string): Promise<Array<{
    id: string;
    productName: string;
    supplierName: string;
    progress: number;
    totalRevenue: number;
  }>> {
    const completedBills: Array<{
      id: string;
      productName: string;
      supplierName: string;
      progress: number;
      totalRevenue: number;
    }> = [];

    try {
      // Get all inventory items for this store
      const allInventoryItems = await db.inventory_items
        .where('store_id')
        .equals(storeId)
        .and(item => !item._deleted)
        .toArray();

      // Get all inventory bills (batches)
      const allInventoryBills = await db.inventory_bills
        .where('store_id')
        .equals(storeId)
        .and(bill => !bill._deleted)
        .toArray();

      // Get all products and suppliers
      const products = await db.products
        .where('store_id')
        .equals(storeId)
        .toArray();

      const suppliers = await db.suppliers
        .where('store_id')
        .equals(storeId)
        .toArray();

      // Get all sales (bill line items)
      const sales = await db.bill_line_items
        .where('store_id')
        .equals(storeId)
        .and(item => !item._deleted)
        .toArray();

      // Create a set of closed bill IDs
      const closedBillIds = new Set(
        allInventoryBills
          .filter(bill => bill.status?.includes('[CLOSED]'))
          .map(bill => bill.id)
      );

      // Process each inventory item
      for (const item of allInventoryItems) {
        const product = products.find(p => p.id === item.product_id);
        if (!product) continue;

        // Get the batch (inventory bill) for this item
        const batch = item.batch_id 
          ? allInventoryBills.find(b => b.id === item.batch_id)
          : null;

        if (!batch) continue;

        // Skip if already closed
        if (closedBillIds.has(item.id)) continue;

        // Get supplier
        const supplier = suppliers.find(s => s.id === batch.supplier_id);
        if (!supplier) continue;

        // Get all sales for this inventory item
        const itemSales = sales.filter(sale => sale.inventory_item_id === item.id);

        // Calculate total sold quantity
        let totalSoldQuantity = 0;
        let totalRevenue = 0;
        for (const sale of itemSales) {
          const qty = typeof sale.quantity === 'number' ? sale.quantity : 0;
          const receivedValue = typeof sale.received_value === 'number' ? sale.received_value : 0;
          totalSoldQuantity += qty;
          totalRevenue += receivedValue;
        }

        // Calculate original received quantity
        const originalReceivedQuantity = 
          (item.received_quantity !== null && item.received_quantity !== undefined && item.received_quantity > 0)
            ? item.received_quantity
            : (item.quantity + totalSoldQuantity);

        const remainingQuantity = item.quantity;

        // Calculate progress
        const soldFromThisItem = Math.max(originalReceivedQuantity - remainingQuantity, 0);
        const progress = originalReceivedQuantity > 0 
          ? (soldFromThisItem / originalReceivedQuantity) * 100 
          : 0;

        // Check if 100% complete
        if (progress >= 100) {
          completedBills.push({
            id: item.id,
            productName: product.name,
            supplierName: supplier.name,
            progress,
            totalRevenue
          });
        }
      }
    } catch (error) {
      console.error('Error finding completed bills:', error);
    }

    return completedBills;
  }

  /**
   * Handle a completed bill - send or resend notification as needed
   */
  private async handleCompletedBill(
    storeId: string,
    bill: {
      id: string;
      productName: string;
      supplierName: string;
      progress: number;
      totalRevenue: number;
    }
  ): Promise<void> {
    try {
      // Check if there's an existing notification for this bill
      const existingNotifications = await db.notifications
        .where('store_id')
        .equals(storeId)
        .filter(n => 
          n.type === 'bill_ready_to_close' &&
          n.metadata?.billId === bill.id &&
          !n.expires_at
        )
        .toArray();

      const now = new Date();

      if (existingNotifications.length === 0) {
        // No existing notification - create new one
        await this.createNotification(storeId, bill);
      } else {
        // Check if we need to resend notification
        const latestNotification = existingNotifications.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        // If notification was read but bill not closed, check if 3 hours have passed
        if (latestNotification.read) {
          const lastNotificationTime = new Date(latestNotification.created_at);
          const timeSinceLastNotification = now.getTime() - lastNotificationTime.getTime();

          if (timeSinceLastNotification >= this.RENOTIFICATION_INTERVAL_MS) {
            // 3+ hours have passed since last notification - send a new one
            await this.createNotification(storeId, bill, true);
          }
        }
        // If notification is unread, don't send another one yet
      }
    } catch (error) {
      console.error('Error handling completed bill:', error);
    }
  }

  /**
   * Create a notification for a completed bill
   */
  private async createNotification(
    storeId: string,
    bill: {
      id: string;
      productName: string;
      supplierName: string;
      progress: number;
      totalRevenue: number;
    },
    isReminder: boolean = false
  ): Promise<void> {
    const title = isReminder
      ? `Reminder: Close Completed Bill - ${bill.productName}`
      : `Bill Ready to Close - ${bill.productName}`;

    const message = isReminder
      ? `This bill is still not closed. The ${bill.productName} from ${bill.supplierName} is 100% sold out. Please close it to finalize the transaction.`
      : `The ${bill.productName} from ${bill.supplierName} is 100% sold out (${bill.progress.toFixed(0)}% complete). Please close this bill to finalize the transaction.`;

    await notificationService.createNotification(
      storeId,
      'bill_ready_to_close',
      title,
      message,
      {
        priority: 'high',
        action_url: '/accounting?tab=received-bills',
        action_label: 'View Bill',
        metadata: {
          billId: bill.id,
          productName: bill.productName,
          supplierName: bill.supplierName,
          progress: bill.progress,
          totalRevenue: bill.totalRevenue,
          isReminder,
          sentAt: new Date().toISOString()
        }
      }
    );

    console.log(`📢 Notification sent for completed bill: ${bill.productName} (${bill.supplierName})`);
  }

  /**
   * Check a specific bill after a sale is made
   * This provides real-time checking when a sale completes a bill
   */
  public async checkBillAfterSale(
    storeId: string,
    inventoryItemId: string
  ): Promise<void> {
    try {
      // Get the inventory item
      const inventoryItem = await db.inventory_items.get(inventoryItemId);
      if (!inventoryItem) return;

      // Get all sales for this item
      const sales = await db.bill_line_items
        .where('inventory_item_id')
        .equals(inventoryItemId)
        .and(item => !item._deleted)
        .toArray();

      // Calculate progress
      let totalSoldQuantity = 0;
      let totalRevenue = 0;
      for (const sale of sales) {
        totalSoldQuantity += sale.quantity;
        totalRevenue += sale.received_value;
      }

      const originalReceivedQuantity = 
        (inventoryItem.received_quantity !== null && inventoryItem.received_quantity !== undefined && inventoryItem.received_quantity > 0)
          ? inventoryItem.received_quantity
          : (inventoryItem.quantity + totalSoldQuantity);

      const remainingQuantity = inventoryItem.quantity;
      const soldFromThisItem = Math.max(originalReceivedQuantity - remainingQuantity, 0);
      const progress = originalReceivedQuantity > 0 
        ? (soldFromThisItem / originalReceivedQuantity) * 100 
        : 0;

      // If 100% complete, check if we need to send notification
      if (progress >= 100) {
        // Get product and supplier info
        const product = await db.products.get(inventoryItem.product_id);
        const batch = inventoryItem.batch_id 
          ? await db.inventory_bills.get(inventoryItem.batch_id)
          : null;
        const entity = batch ? await db.entities.get(batch.supplier_id) : null;
        const supplier = entity && entity.entity_type === 'supplier' ? entity : null;

        if (product && supplier) {
          await this.handleCompletedBill(storeId, {
            id: inventoryItem.id,
            productName: product.name,
            supplierName: supplier.name,
            progress,
            totalRevenue
          });
        }
      }
    } catch (error) {
      console.error('Error checking bill after sale:', error);
    }
  }

  /**
   * Mark bill as closed - clean up notifications
   */
  public async markBillAsClosed(storeId: string, billId: string): Promise<void> {
    try {
      // Find all notifications for this bill and delete them
      const notifications = await db.notifications
        .where('store_id')
        .equals(storeId)
        .filter(n => 
          n.type === 'bill_ready_to_close' &&
          n.metadata?.billId === billId
        )
        .toArray();

      // Delete all related notifications
      await Promise.all(
        notifications.map(n => notificationService.deleteNotification(n.id))
      );

      console.log(`✅ Cleaned up ${notifications.length} notification(s) for closed bill: ${billId}`);
    } catch (error) {
      console.error('Error marking bill as closed:', error);
    }
  }
}

export const receivedBillMonitoringService = ReceivedBillMonitoringService.getInstance();

