# Event-Driven Sync Architecture
## Long-Term Scalable Offline-First POS System

### Executive Summary

Replace table-wide polling (3,471+ requests every 5 seconds) with a **single event log table** that acts as the authoritative change feed. Clients subscribe via Supabase Realtime for wake-up signals, then pull only affected records using version-based sequential processing.

**Result**: 10 sales = ~10-20 network calls (vs. thousands). Idle system = near-zero traffic.

---

## 1️⃣ Single Branch Event Table

### Why This Replaces Polling

**Current Problem:**
- Polling 20+ tables every 5-30 seconds
- Each table requires HEAD/GET requests even when no changes
- Change detection still makes network calls
- Scales poorly: 100 stores × 20 tables × 12 polls/min = 24,000 requests/minute

**Event Log Solution:**
- **One table** (`branch_event_log`) contains all change signals
- **One Realtime subscription** per branch (not per table)
- **Pull data only when events exist** (no polling empty tables)
- Scales linearly with business activity, not table count

### Why It's Safe and Scalable

1. **Append-Only**: No updates/deletes = no conflicts, no lost history
2. **Monotonic Ordering**: Version numbers guarantee sequential processing
3. **Branch-Scoped**: Each branch processes only its events (RLS enforced)
4. **Immutable**: Events are facts, not mutable state
5. **Auditable**: Complete history of all business actions

### How It Supports Audit and Replay

- **Audit Trail**: Every business action has an event with timestamp, user, operation
- **Replay**: Devices can process events from any version to catch up
- **Debugging**: Can trace exactly what happened and when
- **Compliance**: Immutable log satisfies audit requirements

---

## 2️⃣ Event Emission Rules & Table Coverage

### Table Categorization

**Not all tables need event-driven sync. We use a hybrid approach:**

#### ✅ Event-Driven Tables (High-Frequency Business Actions)
These tables change frequently during business operations:
- `bills` - Sales transactions
- `bill_line_items` - Line item changes
- `transactions` - Financial transactions
- `inventory_items` - Stock updates
- `inventory_bills` - Inventory receipts
- `cash_drawer_sessions` - Session open/close
- `cash_drawer_accounts` - Balance updates
- `journal_entries` - Accounting entries (when created)

**Why Event-Driven:**
- High frequency (dozens per hour)
- Business-critical (need real-time sync)
- Multi-device coordination required

#### ⏰ Periodic Sync Tables (Configuration & Rarely Changed)
These tables change infrequently (configuration, setup):
- `stores` - Store settings (commission rate, exchange rate, etc.)
- `branches` - Branch info (name, is_active)
- `products` - Product catalog (name, price, category)
- `entities` - Customer/supplier info
- `users` - Employee info
- `chart_of_accounts` - Accounting chart
- `role_operation_limits` - RBAC settings
- `user_module_access` - Permission settings
- `reminders` - Reminder updates

**Why Periodic Sync:**
- Low frequency (changes once per day/week)
- Configuration changes (not time-sensitive)
- Can sync every 5-10 minutes (vs. every 5 seconds)

### When to Emit Events

**Emit ONE event per completed business action (for event-driven tables only):**

✅ **DO Emit:**
- Sale completed → `sale_posted` event
- Payment received → `payment_posted` event
- Inventory received → `inventory_received` event
- Transaction reversed → `transaction_reversed` event
- Journal entry created → `journal_entry_created` event

❌ **DON'T Emit:**
- Configuration changes (stores, branches, products) - use periodic sync
- Per journal entry in a batch (emit one event for the batch)
- Derived balances (balance is computed from transactions)
- Cached calculations
- Intermediate states (only final committed states)
- Per-row updates in bulk operations

### Event Emission Pattern

```typescript
// After business action commits locally:
async function completeSale(bill: Bill) {
  // 1. Save to local IndexedDB
  await db.bills.put(bill);
  
  // 2. Emit event AFTER local commit succeeds
  await emitEvent({
    event_type: 'sale_posted',
    entity_type: 'bill',
    entity_id: bill.id,
    operation: 'insert',
    // ... other fields
  });
  
  // 3. Sync to Supabase (event will be written there too)
  await syncToSupabase();
}
```

### Critical Rules

1. **One Event Per Business Action**: A sale with 5 line items = 1 event, not 5
2. **Emit After Commit**: Event only written if local transaction succeeds
3. **No Derived Data**: Don't emit events for computed fields (balances, totals)
4. **Atomic**: Event emission is part of the same transaction (or idempotent)

---

## 3️⃣ Realtime Subscription Strategy

### Why Realtime is NOT the Source of Truth

**Realtime messages are signals, not data:**

- ✅ **Use Realtime for**: Wake-up notification that "something changed"
- ❌ **Don't use Realtime for**: Full record data, conflict resolution, offline recovery

**Why:**
- Realtime can drop messages (network issues, reconnections)
- Realtime payloads are limited in size
- Realtime doesn't guarantee ordering across reconnects
- Offline devices miss Realtime messages entirely

### Why Realtime is Safe as Wake-Up Mechanism

1. **Idempotent**: If we miss a Realtime signal, periodic catch-up will find it
2. **Non-Critical**: Realtime failure doesn't break sync (we pull by version)
3. **Efficient**: One WebSocket connection per branch (not per table)
4. **Filtered**: RLS ensures clients only see their branch's events

### What Happens When Device is Offline

1. **Realtime disconnects** (expected)
2. **Events continue being written** to `branch_event_log` in Supabase
3. **Device stores `last_seen_event_version`** before going offline
4. **On reconnect**: Device pulls events WHERE `version > last_seen_event_version`
5. **Sequential processing**: Events processed in order, fetching affected records
6. **No data loss**: All events are in the log, catch-up is guaranteed

---

## 4️⃣ Offline-First Catch-Up Algorithm

### Deterministic Sync Algorithm

```typescript
interface SyncState {
  branch_id: string;
  last_seen_event_version: number; // Stored in IndexedDB
  is_online: boolean;
}

async function catchUpSync(branchId: string) {
  // 1. Get last seen version from local storage
  const state = await db.sync_state.get(branchId);
  const lastVersion = state?.last_seen_event_version || 0;
  
  // 2. Pull events since last version
  const { data: events, error } = await supabase
    .from('branch_event_log')
    .select('*')
    .eq('branch_id', branchId)
    .gt('version', lastVersion)
    .order('version', { ascending: true })
    .limit(1000); // Batch processing
  
  if (error || !events) {
    throw new Error(`Failed to fetch events: ${error?.message}`);
  }
  
  // 3. Process events sequentially
  let maxVersion = lastVersion;
  for (const event of events) {
    try {
      // Fetch only the affected record
      await processEvent(event);
      maxVersion = Math.max(maxVersion, event.version);
    } catch (error) {
      // Log error but continue (don't block on one bad event)
      console.error(`Failed to process event ${event.id}:`, error);
    }
  }
  
  // 4. Update last seen version
  await db.sync_state.put({
    branch_id: branchId,
    last_seen_event_version: maxVersion,
    updated_at: new Date().toISOString()
  });
}
```

### How This Guarantees No Missed Data

1. **Monotonic Versions**: Version numbers are sequential, gaps indicate missed events
2. **Pull-Based**: We pull all events > last_version, not relying on Realtime
3. **Sequential Processing**: Events processed in order, preventing race conditions
4. **Idempotent**: Processing same event twice is safe (upsert logic)

### How This Avoids Conflicts

1. **Append-Only**: Events never change, so no merge conflicts
2. **Sequential Processing**: All devices process events in same order
3. **Pull Latest State**: Each event tells us to fetch the current record state
4. **No Local Mutations**: We don't merge local changes with events (local changes upload separately)

### How This Works Across Many Devices

- **Same Event Log**: All devices read from same `branch_event_log`
- **Independent Versions**: Each device tracks its own `last_seen_event_version`
- **No Coordination Needed**: Devices don't need to know about each other
- **Linear Scalability**: 1 device or 100 devices = same algorithm

---

## 5️⃣ Client Sync Flow

### App Start

```
1. Load last_seen_event_version from IndexedDB
2. Establish Realtime subscription to branch_event_log
3. Perform initial catch-up sync (pull events > last_version)
4. Process events sequentially, update IndexedDB
5. Update last_seen_event_version
6. Ready for real-time updates
```

### Online with Realtime

```
Realtime Event Received:
  → Extract event.version
  → If version > last_seen_event_version:
      → Fetch affected record from Supabase
      → Update IndexedDB
      → Update last_seen_event_version
      → Trigger UI refresh if needed
```

### Offline Mode

```
1. Realtime disconnects (expected)
2. Local operations continue (write to IndexedDB)
3. Local changes marked as _synced: false
4. Events continue being written to Supabase (by other devices)
5. Device stores current last_seen_event_version
```

### Reconnect After Offline

```
1. Realtime reconnects
2. Immediately perform catch-up sync:
   → Pull events WHERE version > last_seen_event_version
   → Process events sequentially
   → Fetch affected records
   → Update IndexedDB
3. Upload local unsynced changes (normal sync flow)
4. Resume real-time updates
```

### Conflict-Free Reconciliation

```
Local Change (unsynced):
  → Upload to Supabase
  → Supabase writes event to branch_event_log
  → Other devices receive event via Realtime
  → Other devices pull updated record
  → No conflict (event is the source of truth)

Remote Change (via event):
  → Receive event via Realtime
  → Pull updated record from Supabase
  → If local has unsynced changes:
      → Conflict resolution (timestamp-based or user choice)
  → Update IndexedDB
  → Mark local as synced if remote wins
```

### Sequence Diagram

```
Device A                    Supabase                  Device B
   |                            |                         |
   |--[Create Sale]------------>|                         |
   |                            |--[Write Event]--------->|
   |                            |                         |
   |                            |<--[Realtime Signal]-----|
   |                            |                         |
   |                            |<--[Pull Event]----------|
   |                            |                         |
   |                            |--[Fetch Bill]---------->|
   |                            |                         |
   |                            |<--[Update IndexedDB]---|
   |                            |                         |
```

---

## 6️⃣ Cost & Performance Impact

### Why REST Calls Drop from Thousands → Tens

**Before (Polling):**
- 20 tables × 12 polls/minute = 240 requests/minute
- Change detection: 20 HEAD requests per poll = 240 HEAD/minute
- Total: ~480 requests/minute = **28,800 requests/hour**

**After (Event-Driven):**
- 1 Realtime subscription (WebSocket, not REST)
- Pull events: 1 GET request per catch-up (batched)
- Fetch affected records: ~1 GET per business event
- 10 sales = 10 events = ~10-15 GET requests total
- **Idle system: ~0 requests/hour**

### Why PostgreSQL Connection Churn Disappears

**Before:**
- Each poll opens/closes connections
- 240 polls/minute = constant connection churn
- Connection pool exhaustion under load

**After:**
- 1 persistent WebSocket connection per branch
- Pull requests reuse connection pool efficiently
- No connection churn (long-lived connections)

### Why This Scales Linearly with Business Events

**Polling Model:**
- Cost = (Number of Tables) × (Poll Frequency) × (Number of Branches)
- 20 tables × 12/min × 100 branches = **24,000 requests/minute**

**Event Model:**
- Cost = (Number of Business Events) × (Devices per Branch)
- 10 events/min × 3 devices × 100 branches = **3,000 requests/minute**
- **8x reduction**, and scales with actual activity, not table count

### Why This Reduces Supabase Billing Risk

1. **Predictable Costs**: Billing tied to business activity, not infrastructure
2. **No Surprise Spikes**: Idle periods cost near-zero
3. **Linear Scaling**: 2x business = 2x cost (not exponential)
4. **Realtime Efficiency**: WebSocket cheaper than REST for high-frequency updates

---

## 7️⃣ Implementation Plan (No Migration Needed - Fresh Start)

Since there's no real data yet, we can implement directly without migration complexity.

### Phase 1: Database Setup

1. Run SQL migration: `migrations/branch_event_log.sql`
2. Verify RLS policies and indexes
3. Test RPC function `emit_branch_event`

### Phase 2: Implement Event Services

1. Add `eventStreamService.ts` to project
2. Add `eventEmissionService.ts` to project
3. Update `db.ts` with `sync_state` table (version 44)
4. Test event emission and processing

### Phase 3: Integrate Event Emission

1. Add event emission to business actions:
   - Sale completion → `emitSalePosted()`
   - Payment processing → `emitPaymentPosted()`
   - Inventory receipt → `emitInventoryReceived()`
2. Test events are being written correctly

### Phase 4: Start Event Stream

1. Initialize `eventStreamService` in `OfflineDataContext.tsx`
2. Subscribe to Realtime on branch selection
3. Test catch-up sync on app start
4. Verify events are processed correctly

### Phase 5: Hybrid Sync Strategy

1. **Event-driven sync** for high-frequency tables (bills, transactions, inventory)
2. **Periodic sync** (every 5-10 minutes) for configuration tables (stores, products, etc.)
3. Monitor both systems working together

### Phase 6: Optimize & Monitor

1. Monitor event emission rates
2. Track sync performance
3. Optimize batch sizes
4. Document patterns

---

## 8️⃣ Guardrails & Anti-Patterns

### ❌ Anti-Patterns to Avoid

1. **Polling Every Table**
   - ❌ Don't: Poll 20 tables every 30 seconds
   - ✅ Do: Subscribe to event log, pull only when events exist

2. **Using Realtime as Only Sync Source**
   - ❌ Don't: Rely solely on Realtime messages for data
   - ✅ Do: Use Realtime as wake-up, pull data by version

3. **Mutating History**
   - ❌ Don't: Update or delete events in `branch_event_log`
   - ✅ Do: Append-only, use `operation: 'reverse'` for corrections

4. **Syncing Derived Balances**
   - ❌ Don't: Emit events when balances change
   - ✅ Do: Balance is computed from transactions, not synced

5. **Treating IndexedDB as Authoritative**
   - ❌ Don't: Use local state to resolve conflicts
   - ✅ Do: Supabase is source of truth, events are signals

6. **Per-Row Event Spam**
   - ❌ Don't: Emit one event per journal entry in a batch
   - ✅ Do: Emit one event per business action (batch = 1 event)

7. **Event Ordering Assumptions**
   - ❌ Don't: Assume Realtime delivers events in order
   - ✅ Do: Always process events by version number, not arrival time

### ✅ Enforce in Code Reviews

1. **Event Emission**: One event per business action, not per database row
2. **Version Tracking**: Always update `last_seen_event_version` after processing
3. **Sequential Processing**: Never process events in parallel (same branch)
4. **Pull-Based Recovery**: Always pull events by version on reconnect
5. **Idempotency**: Processing same event twice must be safe
6. **No Derived Events**: Don't emit events for computed fields

---

## 9️⃣ Deliverables

### SQL Schema

See `branch_event_log.sql` (next file)

### TypeScript Implementation

See `eventStreamService.ts` (next file)

### Realtime Subscription Example

See implementation in `eventStreamService.ts`

### Invariants

1. **Append-Only**: Events never updated or deleted
2. **Monotonic**: Versions always increase
3. **Branch-Scoped**: Events filtered by branch_id (RLS)
4. **Sequential**: Events processed in version order
5. **Idempotent**: Processing same event twice is safe

---

## Success Criteria

✅ **10 sales generate ~10-20 network calls total**
- 10 events = 10 GET requests (batched)
- 10 record fetches = 10 GET requests
- Total: ~20 requests (vs. thousands before)

✅ **Idle system generates near-zero traffic**
- 1 WebSocket connection (not REST)
- No polling = no requests
- Only Realtime keep-alive packets

✅ **Offline devices fully recover on reconnect**
- Pull events by version
- Process sequentially
- No missed data

✅ **Accounting correctness is preserved**
- Events are immutable
- Sequential processing
- Journal entries remain source of truth

✅ **Architecture is understandable**
- Clear separation of concerns
- Documented patterns
- Enforced invariants

