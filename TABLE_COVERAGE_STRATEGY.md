# Table Coverage Strategy
## Event-Driven vs Periodic Sync

## Overview

We use a **hybrid approach**: event-driven sync for high-frequency business actions, periodic sync for configuration tables.

---

## ✅ Event-Driven Tables (Real-Time Sync)

These tables change frequently during business operations and need immediate sync across devices.

### High-Frequency Business Tables

| Table | Change Frequency | Why Event-Driven |
|-------|-----------------|------------------|
| `bills` | Dozens per hour | Sales need immediate sync across devices |
| `bill_line_items` | Dozens per hour | Line items change with sales |
| `transactions` | Dozens per hour | Payments need real-time balance updates |
| `inventory_items` | Frequent | Stock updates affect availability |
| `inventory_bills` | Several per day | Inventory receipts need immediate sync |
| `cash_drawer_sessions` | Several per day | Session open/close needs coordination |
| `cash_drawer_accounts` | Frequent | Balance updates need real-time sync |
| `journal_entries` | Frequent | Accounting entries need immediate sync |

**Event Types:**
- `sale_posted` → triggers bill sync
- `payment_posted` → triggers transaction sync
- `inventory_received` → triggers inventory_bill sync
- `cash_drawer_session_opened` → triggers session sync
- `journal_entry_created` → triggers journal sync

**Sync Method:**
- Subscribe to `branch_event_log` via Realtime
- Pull events by version on wake-up
- Fetch affected records immediately
- Update IndexedDB in real-time

---

## ⏰ Periodic Sync Tables (Configuration)

These tables change infrequently (configuration, setup) and can sync every 5-10 minutes.

### Configuration & Setup Tables

| Table | Change Frequency | Why Periodic Sync |
|-------|-----------------|-------------------|
| `stores` | Rare (days/weeks) | Store settings (commission rate, exchange rate) |
| `branches` | Rare (days/weeks) | Branch info (name, is_active) |
| `products` | Occasional (hours) | Product catalog (name, price, category) |
| `entities` | Occasional (hours) | Customer/supplier info updates |
| `users` | Occasional (hours) | Employee info changes |
| `chart_of_accounts` | Rare (weeks) | Accounting chart setup |
| `role_operation_limits` | Rare (weeks) | RBAC settings |
| `user_module_access` | Rare (weeks) | Permission changes |
| `reminders` | Occasional (hours) | Reminder updates |

**Example: Store Preferred Commission Fee Change**

```typescript
// User changes store commission rate
await db.stores.update(storeId, {
  preferred_commission_rate: 0.15,
  updated_at: new Date().toISOString(),
  _synced: false
});

// NO event emission - this is a configuration change
// Will sync via periodic sync (every 5-10 minutes)
```

**Sync Method:**
- Periodic sync every 5-10 minutes (reduced from 30 seconds)
- Uses change detection (check `updated_at > last_synced_at`)
- Only syncs if changes detected
- No Realtime subscription needed

---

## Implementation

### Event-Driven Sync Flow

```typescript
// In eventStreamService.ts
async function start(branchId: string, storeId: string) {
  // 1. Subscribe to branch_event_log via Realtime
  await this.subscribeToRealtime(branchId, storeId);
  
  // 2. On event received, pull events and fetch records
  // 3. Update IndexedDB immediately
}
```

### Periodic Sync Flow

```typescript
// In syncService.ts (simplified, no polling)
async function syncConfigurationTables(storeId: string) {
  const tables = ['stores', 'branches', 'products', 'entities', 'users'];
  
  for (const table of tables) {
    // Check if changes exist (change detection)
    const hasChanges = await checkForChanges(table, storeId);
    if (!hasChanges) continue;
    
    // Pull only changed records
    const records = await pullChangedRecords(table, storeId);
    await updateIndexedDB(table, records);
  }
}
```

---

## Benefits of Hybrid Approach

1. **Efficiency**: Event-driven for high-frequency, periodic for low-frequency
2. **Cost**: Reduces REST requests by 90%+ (no polling empty tables)
3. **Real-Time**: Business actions sync immediately
4. **Simplicity**: Configuration changes don't need event emission
5. **Scalability**: Linear cost with business activity

---

## Decision Matrix

**Use Event-Driven If:**
- ✅ Table changes frequently (dozens per hour)
- ✅ Multi-device coordination needed
- ✅ Business-critical (affects operations)
- ✅ Real-time sync required

**Use Periodic Sync If:**
- ✅ Table changes rarely (once per day/week)
- ✅ Configuration/setup data
- ✅ Not time-sensitive
- ✅ Can tolerate 5-10 minute delay

---

## Example: Store Commission Rate Change

**Scenario**: Admin changes store preferred commission rate from 10% to 15%

**What Happens:**
1. ✅ Change saved to local IndexedDB (`_synced: false`)
2. ❌ **NO event emission** (this is configuration, not business action)
3. ⏰ Next periodic sync (within 5-10 minutes) will:
   - Check if `stores` table has changes
   - Pull updated store record from Supabase
   - Update local IndexedDB
   - Other devices will get update on their next periodic sync

**Why This is OK:**
- Commission rate changes are rare (once per week/month)
- Not time-sensitive (doesn't affect current operations)
- 5-10 minute delay is acceptable for configuration

---

## Summary

- **Event-Driven**: 8 tables (high-frequency business actions)
- **Periodic Sync**: 9+ tables (configuration, rarely changed)
- **Result**: 90%+ reduction in REST requests, real-time sync for business-critical data

