# Event-Driven Sync Integration Guide

## Quick Start

### 1. Run Database Migration

```bash
# Apply the branch_event_log table
psql -h your-supabase-host -U postgres -d postgres -f migrations/branch_event_log.sql
```

### 2. Update IndexedDB Schema

`sync_state` table is already added in `db.ts` (version 44).

### 3. Initialize Event Stream Service

In `OfflineDataContext.tsx`:

```typescript
import { eventStreamService } from '../services/eventStreamService';

// When branch is selected
useEffect(() => {
  if (storeId && currentBranchId && isOnline) {
    // Start event stream (for event-driven tables)
    eventStreamService.start(currentBranchId, storeId);
    
    return () => {
      // Cleanup on unmount
      eventStreamService.stop(currentBranchId);
    };
  }
}, [storeId, currentBranchId, isOnline]);
```

### 4. Emit Events After Business Actions (Event-Driven Tables Only)

**Important**: Only emit events for high-frequency business actions. Configuration changes (stores, products, etc.) use periodic sync.

#### Example: After Sale Completion

```typescript
import { eventEmissionService } from '../services/eventEmissionService';

async function completeSale(bill: Bill, lineItems: BillLineItem[]) {
  // 1. Save to local IndexedDB
  await db.bills.put(bill);
  await db.bill_line_items.bulkPut(lineItems);
  
  // 2. Emit event AFTER local commit succeeds
  try {
    await eventEmissionService.emitSalePosted(
      bill.store_id,
      bill.branch_id,
      bill.id,
      bill.created_by,
      {
        total: bill.total,
        line_items_count: lineItems.length
      }
    );
  } catch (error) {
    // Event emission failure doesn't break the sale
    // It will be caught on next sync
    console.error('Failed to emit sale event:', error);
  }
  
  // 3. Normal sync will upload bill and event to Supabase
}
```

#### Example: After Payment

```typescript
async function recordPayment(transaction: Transaction) {
  // 1. Save to local IndexedDB
  await db.transactions.put(transaction);
  
  // 2. Emit event
  await eventEmissionService.emitPaymentPosted(
    transaction.store_id,
    transaction.branch_id,
    transaction.id,
    transaction.created_by,
    {
      amount: transaction.amount,
      currency: transaction.currency,
      method: transaction.payment_method
    }
  );
}
```

#### Example: After Inventory Receipt

```typescript
async function receiveInventory(inventoryBill: InventoryBill, items: InventoryItem[]) {
  // 1. Save to local IndexedDB
  await db.inventory_bills.put(inventoryBill);
  await db.inventory_items.bulkPut(items);
  
  // 2. Emit ONE event for the entire receipt (not per item)
  await eventEmissionService.emitInventoryReceived(
    inventoryBill.store_id,
    inventoryBill.branch_id,
    inventoryBill.id,
    inventoryBill.created_by,
    {
      items_count: items.length,
      total_value: items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    }
  );
}
```

---

## Hybrid Sync Strategy

### Event-Driven Tables (Real-Time)

**High-frequency business actions:**
- `bills`, `bill_line_items`
- `transactions`
- `inventory_items`, `inventory_bills`
- `cash_drawer_sessions`, `cash_drawer_accounts`
- `journal_entries`

**How it works:**
- Subscribe to `branch_event_log` via Realtime
- Pull events by version on wake-up
- Fetch affected records immediately
- Update IndexedDB in real-time

### Periodic Sync Tables (Configuration)

**Rarely changed configuration:**
- `stores` (commission rate, exchange rate, etc.)
- `branches` (name, is_active)
- `products` (catalog updates)
- `entities` (customer/supplier info)
- `users` (employee info)
- `chart_of_accounts`, `role_operation_limits`, etc.

**How it works:**
- Periodic sync every 5-10 minutes (reduced from 30 seconds)
- Uses change detection (check `updated_at > last_synced_at`)
- Only syncs if changes detected
- No Realtime subscription needed

### Example: Store Commission Rate Change

```typescript
// User changes store commission rate
await db.stores.update(storeId, {
  preferred_commission_rate: 0.15,
  updated_at: new Date().toISOString(),
  _synced: false
});

// NO event emission - this is configuration
// Will sync via periodic sync (every 5-10 minutes)
```

**Why this is OK:**
- Commission rate changes are rare (once per week/month)
- Not time-sensitive (doesn't affect current operations)
- 5-10 minute delay is acceptable for configuration

---

## Event Emission Patterns

### ✅ Correct: One Event Per Business Action

```typescript
// Sale with 5 line items = 1 event
await eventEmissionService.emitSalePosted(storeId, branchId, billId, userId);

// Inventory receipt with 20 items = 1 event
await eventEmissionService.emitInventoryReceived(storeId, branchId, billId, userId);

// Journal entry batch with 10 entries = 1 event
await eventEmissionService.emitJournalEntryCreated(storeId, branchId, entryId, userId);
```

### ❌ Incorrect: Per-Row Events

```typescript
// DON'T do this:
for (const lineItem of lineItems) {
  await eventEmissionService.emitSalePosted(...); // WRONG - too many events
}

// DO this instead:
await eventEmissionService.emitSalePosted(storeId, branchId, billId, userId); // ONE event
```

---

## Error Handling

### Event Emission Failures

```typescript
try {
  await eventEmissionService.emitSalePosted(...);
} catch (error) {
  // Event emission failure doesn't break the business action
  // The record will still sync via normal sync flow
  // Event will be written when record uploads to Supabase
  console.error('Event emission failed (non-critical):', error);
}
```

### Configuration Changes (No Events)

```typescript
// Store commission rate change - NO event emission
await db.stores.update(storeId, {
  preferred_commission_rate: 0.15,
  _synced: false
});

// Will sync via periodic sync (every 5-10 minutes)
// No event needed - this is configuration, not business action
```

### Event Processing Failures

```typescript
// In eventStreamService.ts - already handles errors gracefully
// Failed events are logged but don't block processing
// Periodic catch-up will retry
```

---

## Testing

### Test Event Emission

```typescript
// After completing a sale
const bill = await completeSale(...);
const events = await supabase
  .from('branch_event_log')
  .select('*')
  .eq('entity_id', bill.id)
  .eq('event_type', 'sale_posted');

console.assert(events.data.length === 1, 'Should have one sale_posted event');
```

### Test Event Processing

```typescript
// Simulate event processing
const result = await eventStreamService.catchUp(branchId, storeId);
console.assert(result.processed > 0, 'Should process events');
console.assert(result.errors.length === 0, 'Should have no errors');
```

### Test Offline Recovery

```typescript
// 1. Go offline
// 2. Make changes on another device
// 3. Come back online
// 4. Verify events are processed
const state = await eventStreamService.getCurrentState(branchId);
console.assert(state.last_seen_event_version > 0, 'Should have processed events');
```

---

## Monitoring

### Key Metrics

1. **Event Emission Rate**: Events per minute per branch
2. **Event Processing Rate**: Events processed per catch-up
3. **Catch-Up Frequency**: How often catch-up runs
4. **Error Rate**: Failed event emissions/processing
5. **Last Seen Version**: Track sync progress

### Logging

```typescript
// Event emission
console.log(`[Event] Emitted ${eventType} for ${entityType}/${entityId}`);

// Event processing
console.log(`[EventStream] Processed ${count} events, last version: ${version}`);

// Errors
console.error(`[EventStream] Failed to process event ${eventId}: ${error}`);
```

---

## Troubleshooting

### Events Not Being Emitted

**Check:**
1. RPC function `emit_branch_event` exists in Supabase
2. User has permission to call RPC
3. Event emission is called AFTER local commit
4. Network connectivity

### Events Not Being Processed

**Check:**
1. Realtime subscription is active
2. `last_seen_event_version` is being updated
3. Events exist in `branch_event_log` table
4. RLS policies allow reading events

### High Event Volume

**If too many events:**
1. Review event emission patterns (should be one per business action)
2. Check for per-row event spam
3. Consider batching for bulk operations

---

## Performance Tips

1. **Batch Event Processing**: Process events in batches (100 at a time)
2. **Parallel Record Fetching**: Fetch multiple records in parallel
3. **Index Optimization**: Ensure indexes on `branch_id` and `version`
4. **RLS Optimization**: Keep RLS policies simple and indexed

---

## Security Considerations

1. **RLS Policies**: Events filtered by branch_id (users only see their branch)
2. **Event Validation**: Validate event data before processing
3. **Idempotency**: Processing same event twice is safe
4. **Audit Trail**: All events are immutable and auditable

