# Received Bill Notification Feature

## Overview
This feature implements a comprehensive notification system for received bills that are 100% sold out, prompting users to close them. If the notification is read but the bill remains unclosed, the system sends recurring reminders every 3 hours until the bill is properly closed.

## Implementation Details

### 1. New Notification Type
- Added `'bill_ready_to_close'` to the `NotificationType` union in `/src/types/index.ts`
- This notification type is enabled by default in notification preferences
- Uses orange color scheme (warning level) in the UI

### 2. Monitoring Service (`receivedBillMonitoringService.ts`)
Located at: `/src/services/receivedBillMonitoringService.ts`

#### Key Features:
- **Singleton Pattern**: Ensures only one instance monitors bills across the application
- **Periodic Monitoring**: Checks for completed bills every 10 minutes
- **Real-time Checking**: Immediately checks after each sale is made
- **Smart Notifications**: Tracks notification state to avoid spam
- **Recurring Reminders**: Re-sends notifications every 3 hours if read but not acted upon

#### Core Methods:
1. `startMonitoring(storeId)`: Starts periodic checks
2. `checkCompletedBills(storeId)`: Finds and handles all 100% complete bills
3. `checkBillAfterSale(storeId, inventoryItemId)`: Real-time check after a sale
4. `markBillAsClosed(storeId, billId)`: Cleans up notifications when bill is closed

#### Progress Calculation:
```typescript
progress = (soldFromThisItem / originalReceivedQuantity) × 100
```
A bill is considered complete when `progress >= 100%`

### 3. Integration Points

#### A. OfflineDataContext (`/src/contexts/OfflineDataContext.tsx`)

**Initialization** (Line ~703):
```typescript
// Start monitoring for completed bills
if (storeId) {
  receivedBillMonitoringService.startMonitoring(storeId);
}
```

**After Sale Creation** (Line ~1344-1351):
```typescript
// Check if any inventory items are now 100% complete
for (const item of mappedLineItems) {
  if (item.inventory_item_id) {
    receivedBillMonitoringService.checkBillAfterSale(storeId, item.inventory_item_id)
      .catch(err => console.error('Error checking bill completion:', err));
  }
}
```

**After Bill Closure** (Line ~2697-2711):
```typescript
// Check if bill was just closed - clean up notifications
if (updates.status && typeof updates.status === 'string' && updates.status.includes('[CLOSED]')) {
  if (storeId) {
    const inventoryItems = await db.inventory_items
      .where('batch_id')
      .equals(id)
      .toArray();
    
    for (const item of inventoryItems) {
      receivedBillMonitoringService.markBillAsClosed(storeId, item.id)
        .catch(err => console.error('Error marking bill as closed:', err));
    }
  }
}
```

#### B. NotificationCenter UI (`/src/components/NotificationCenter.tsx`)
- Added orange color scheme for `'bill_ready_to_close'` notifications (Line ~49)
- Existing action URL and action label functionality works out of the box
- Notifications link to: `/accounting?tab=received-bills`

#### C. NotificationService (`/src/services/notificationService.ts`)
- Added `'bill_ready_to_close'` to default enabled notification types (Line ~149)

### 4. Notification Behavior

#### Initial Notification:
- **Trigger**: When a received bill reaches 100% sold out (progress >= 100%)
- **Title**: `"Bill Ready to Close - {productName}"`
- **Message**: `"The {productName} from {supplierName} is 100% sold out (100% complete). Please close this bill to finalize the transaction."`
- **Priority**: High
- **Action**: Links to Accounting page, Received Bills tab

#### Reminder Notifications:
- **Trigger**: Every 3 hours after the notification is marked as read but bill remains unclosed
- **Title**: `"Reminder: Close Completed Bill - {productName}"`
- **Message**: `"This bill is still not closed. The {productName} from {supplierName} is 100% sold out. Please close it to finalize the transaction."`
- **Priority**: High
- **Action**: Same as initial notification

#### Notification Cleanup:
- All related notifications are automatically deleted when a bill is marked as closed
- Status is checked for the `[CLOSED]` marker in the inventory batch status field

### 5. Data Flow

```
Sale Made → createBill() → Inventory Deducted → checkBillAfterSale()
                                                        ↓
                                                  Check Progress
                                                        ↓
                                                   >= 100%?
                                                        ↓
                                                 Create/Update
                                                  Notification
                                                        ↓
                                               User Reads & Closes
                                                        ↓
                                            updateInventoryBatch()
                                                        ↓
                                            markBillAsClosed()
                                                        ↓
                                            Delete Notifications
```

### 6. Metadata Stored in Notifications

Each notification stores:
```typescript
{
  billId: string,           // Inventory item ID
  productName: string,      // Product name
  supplierName: string,     // Supplier name
  progress: number,         // Completion percentage
  totalRevenue: number,     // Total revenue from sales
  isReminder: boolean,      // True for recurring reminders
  sentAt: string           // ISO timestamp
}
```

### 7. Offline-First Architecture

Following the project's [[memory:9276959]] offline-first pattern:
- All monitoring happens locally on IndexedDB
- No server calls required
- Notifications persist across app restarts
- Works completely offline

### 8. Performance Considerations

- **Periodic checks**: Every 10 minutes (configurable)
- **Real-time checks**: Only on affected inventory items after sales
- **Database queries**: Optimized with proper indexes
- **Memory**: Singleton pattern prevents multiple monitoring instances

### 9. Configuration

The monitoring interval can be adjusted in `receivedBillMonitoringService.ts`:
```typescript
private readonly RENOTIFICATION_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours
```

Periodic check interval (currently 10 minutes):
```typescript
setInterval(() => {
  this.checkCompletedBills(storeId);
}, 10 * 60 * 1000); // 10 minutes
```

## Testing

### Manual Test Steps:
1. Create a received bill with inventory items
2. Sell items from that inventory batch
3. When quantity reaches 100% sold:
   - Check notification center for "Bill Ready to Close" notification
   - Notification should appear with high priority (orange)
4. Mark notification as read without closing the bill
5. Wait 3 hours (or adjust `RENOTIFICATION_INTERVAL_MS` for testing)
6. Verify reminder notification appears
7. Close the bill through Accounting → Received Bills
8. Verify all related notifications are automatically removed

### Edge Cases Handled:
- Bills already closed (checked via `[CLOSED]` marker)
- Multiple sales from same batch
- Unread notifications (no reminder until read)
- Multiple reminder cycles
- App restarts (monitoring resumes)
- Offline operation

## Future Enhancements

Possible improvements:
1. User-configurable reminder intervals
2. Notification preferences per notification type
3. Sound/push notifications support
4. Bulk bill closure from notification
5. Analytics on bill completion times
6. Custom notification templates

## Related Files

- `/src/types/index.ts` - Type definitions
- `/src/services/receivedBillMonitoringService.ts` - Main monitoring logic
- `/src/services/notificationService.ts` - Notification management
- `/src/contexts/OfflineDataContext.tsx` - Integration and data management
- `/src/components/NotificationCenter.tsx` - UI component
- `/src/lib/db.ts` - IndexedDB schema and operations

## Notes

- The feature integrates seamlessly with existing notification infrastructure
- No database schema changes required
- Follows existing code patterns and architecture
- Fully compatible with offline-first approach
- No impact on existing functionality

