# Branch Event Log Optimizations

## 🎯 Overview

This document outlines potential optimizations for the branch event log system to improve performance, reduce network calls, and optimize database operations.

---

## 1️⃣ **Batch Record Fetching** (High Impact)

### Current Problem
Events are processed sequentially, fetching records one-by-one:
```typescript
// Current: 10 events = 10 sequential network calls
for (const event of events) {
  const record = await fetchAffectedRecord(...); // 1 request per event
  await updateIndexedDB(...);
}
```

### Optimization: Group by Entity Type
```typescript
// Optimized: 10 events = 2-3 batched network calls
const eventsByType = groupBy(events, 'entity_type');
for (const [entityType, typeEvents] of eventsByType) {
  const ids = typeEvents.map(e => e.entity_id);
  const records = await fetchBatch(entityType, ids); // 1 request for all
  for (const record of records) {
    await updateIndexedDB(...);
  }
}
```

**Impact:**
- 10 events with 3 entity types = **3 requests** (vs. 10)
- Reduces network latency by ~70%
- Better database query efficiency

**Implementation:**
```typescript
private async fetchBatchRecords(
  entityType: string,
  entityIds: string[],
  storeId: string
): Promise<Map<string, any>> {
  const tableName = this.mapEntityTypeToTable(entityType);
  let query = supabase.from(tableName).select('*').in('id', entityIds);
  
  // Apply store filter
  if (tableName === 'products') {
    query = query.or(`store_id.eq.${storeId},is_global.eq.true`);
  } else if (tableName !== 'stores' && tableName !== 'transactions') {
    query = query.eq('store_id', storeId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  return new Map(data.map(r => [r.id, r]));
}
```

---

## 2️⃣ **Parallel Processing by Entity Type** (Medium Impact)

### Current Problem
All events processed sequentially, even when they're independent:
```typescript
// Current: Sequential processing
for (const event of events) {
  await processEvent(event); // Wait for each
}
```

### Optimization: Parallel Processing
```typescript
// Optimized: Process different entity types in parallel
const eventsByType = groupBy(events, 'entity_type');
const promises = Array.from(eventsByType.entries()).map(
  ([type, typeEvents]) => this.processEventBatch(type, typeEvents)
);
await Promise.all(promises);
```

**Impact:**
- 10 events across 3 types = **3 parallel batches** (vs. 10 sequential)
- Reduces processing time by ~60% for mixed event types
- Still maintains order within each entity type

**Caveat:**
- Must ensure no cross-entity dependencies
- Keep sequential processing for same entity type (to respect version order)

---

## 3️⃣ **Version Counter Optimization** (High Impact)

### Current Problem
`get_next_branch_event_version()` uses `MAX(version)` which scans the table:
```sql
SELECT COALESCE(MAX(version), 0) + 1
FROM branch_event_log
WHERE branch_id = p_branch_id;
```

### Optimization: Sequence-Based Counter
```sql
-- Create sequence per branch (or use a single counter table)
CREATE SEQUENCE branch_event_version_seq;

-- Or use a counter table:
CREATE TABLE branch_event_version_counter (
  branch_id UUID PRIMARY KEY REFERENCES branches(id),
  current_version BIGINT NOT NULL DEFAULT 0
);

-- Optimized function:
CREATE OR REPLACE FUNCTION get_next_branch_event_version(p_branch_id UUID)
RETURNS BIGINT AS $$
DECLARE
  next_version BIGINT;
BEGIN
  UPDATE branch_event_version_counter
  SET current_version = current_version + 1
  WHERE branch_id = p_branch_id
  RETURNING current_version INTO next_version;
  
  -- If no row exists, create it
  IF next_version IS NULL THEN
    INSERT INTO branch_event_version_counter (branch_id, current_version)
    VALUES (p_branch_id, 1)
    RETURNING current_version INTO next_version;
  END IF;
  
  RETURN next_version;
END;
$$ LANGUAGE plpgsql;
```

**Impact:**
- O(1) version increment (vs. O(n) MAX scan)
- **10x faster** for high-frequency branches
- Reduces database load significantly

**Migration:**
```sql
-- Initialize counter table from existing events
INSERT INTO branch_event_version_counter (branch_id, current_version)
SELECT branch_id, COALESCE(MAX(version), 0)
FROM branch_event_log
GROUP BY branch_id;
```

---

## 4️⃣ **Event Log Cleanup** ✅ **IMPLEMENTED**

### ✅ Implementation Status
**Migration File:** `migrations/branch_event_log_cleanup.sql`  
**Status:** Ready to deploy

### Solution: 30-Day Retention with Deletion (Not Archiving)
- **Approach:** Deletion (events are sync signals, not business data)
- **Retention Period:** 30 days (configurable)
- **Simple Time-Based:** No count-based safety net - just delete events older than 30 days
- **Deletion Function:** `delete_old_events(retention_days)` - atomic, safe
- **Manual Trigger:** `cleanup_events_now(retention_days)` for immediate cleanup
- **Statistics Function:** `get_event_log_statistics()` for monitoring
- **Optional Scheduling:** pg_cron support for daily automated cleanup

**Why Deletion Instead of Archiving:**
- ✅ **Events are sync signals, not business data**: Actual data (bills, transactions) is in main tables
- ✅ **Old events not needed for sync**: Devices offline >30 days use `fullResync()` anyway
- ✅ **Simpler implementation**: No archive table to maintain, no count-based safety net
- ✅ **Lower storage cost**: No duplicate data in archive
- ✅ **Simple logic**: Pure time-based retention - easier to understand and maintain

**Why No Count-Based Safety Net:**
- ✅ **Devices offline >30 days use fullResync()**: They don't need old events
- ✅ **Sync state initialization**: Prevents replaying old events even if sync_state is lost
- ✅ **Simpler logic**: Fewer edge cases, easier to reason about
- ✅ **Events are just pointers**: Actual business data is in main tables

**Features:**
- ✅ Atomic operations (transaction-safe)
- ✅ Configurable retention period (default 30 days)
- ✅ Simple time-based deletion (no complex ranking logic)
- ✅ Comprehensive statistics and monitoring
- ✅ Simpler than archiving (no archive table)

**Impact:**
- Keeps active table small (~3,000 events vs ~36,500 for 1 year)
- **10x faster** queries on active table
- Automatic daily cleanup (if pg_cron enabled)
- Lower storage cost (no archive table)

**Usage:**
```sql
-- Check statistics
SELECT * FROM get_event_log_statistics();

-- Manually trigger cleanup (30-day retention)
SELECT * FROM cleanup_events_now(30);

-- Check active table size
SELECT COUNT(*), MIN(occurred_at), MAX(occurred_at) 
FROM branch_event_log;
```

See `migrations/branch_event_log_cleanup.sql` for complete implementation.

---

## 5️⃣ **Adaptive Catch-Up Interval** (Medium Impact)

### Current Problem
Fixed 60-second catch-up interval:
```typescript
private readonly CATCH_UP_INTERVAL_MS = 60000; // Fixed 1 minute
```

### Optimization: Adaptive Based on Activity
```typescript
private catchUpIntervals: Map<string, number> = new Map();
private readonly MIN_INTERVAL_MS = 10000; // 10 seconds (high activity)
private readonly MAX_INTERVAL_MS = 300000; // 5 minutes (low activity)

private adjustCatchUpInterval(branchId: string, eventsFound: number) {
  const current = this.catchUpIntervals.get(branchId) || 60000;
  
  if (eventsFound > 10) {
    // High activity: reduce interval
    this.catchUpIntervals.set(branchId, Math.max(current * 0.8, MIN_INTERVAL_MS));
  } else if (eventsFound === 0) {
    // Low activity: increase interval
    this.catchUpIntervals.set(branchId, Math.min(current * 1.2, MAX_INTERVAL_MS));
  }
  
  // Reschedule with new interval
  this.schedulePeriodicCatchUp(branchId, storeId);
}
```

**Impact:**
- High activity: Faster sync (10s intervals)
- Low activity: Less network overhead (5min intervals)
- **50% reduction** in unnecessary catch-up calls

---

## 6️⃣ **IndexedDB Batch Operations** (Medium Impact)

### Current Problem
Individual `put()` operations:
```typescript
// Current: 10 events = 10 IndexedDB writes
for (const record of records) {
  await table.put(record); // Individual write
}
```

### Optimization: Bulk Put
```typescript
// Optimized: 10 events = 1 bulk write
const normalizedRecords = records.map(r => ({
  ...this.normalizeRecord(r, tableName),
  _synced: true,
  _lastSyncedAt: new Date().toISOString(),
}));
await table.bulkPut(normalizedRecords); // Single transaction
```

**Impact:**
- **5x faster** IndexedDB writes
- Atomic batch operation
- Already implemented for bulk events, extend to regular events

---

## 7️⃣ **Smart Deduplication** (Low-Medium Impact)

### Current Implementation
Deduplicates by entity, but could be smarter:

### Optimization: Time-Window Deduplication
```typescript
private deduplicateEvents(events: BranchEvent[]): BranchEvent[] {
  // Group events by entity within time windows
  const windowMs = 5000; // 5 second window
  const entityMap = new Map<string, BranchEvent>();
  
  for (const event of events) {
    const key = `${event.entity_type}:${event.entity_id}`;
    const existing = entityMap.get(key);
    
    // Keep latest version, but also consider time window
    if (!existing || 
        (event.version > existing.version && 
         new Date(event.occurred_at).getTime() - 
         new Date(existing.occurred_at).getTime() < windowMs)) {
      entityMap.set(key, event);
    }
  }
  
  return Array.from(entityMap.values()).sort((a, b) => a.version - b.version);
}
```

**Impact:**
- Prevents processing rapid-fire updates
- Reduces unnecessary network calls
- Better for high-frequency entities

---

## 8️⃣ **Connection Pooling for Record Fetching** (Medium Impact)

### Current Problem
Each fetch creates a new query connection.

### Optimization: Reuse Query Builder
```typescript
// Batch fetch multiple entity types in parallel
private async fetchRecordsBatch(
  events: BranchEvent[],
  storeId: string
): Promise<Map<string, any>> {
  const byTable = new Map<string, string[]>();
  
  // Group by table
  for (const event of events) {
    const table = this.mapEntityTypeToTable(event.entity_type);
    if (!byTable.has(table)) {
      byTable.set(table, []);
    }
    byTable.get(table)!.push(event.entity_id);
  }
  
  // Fetch all tables in parallel
  const promises = Array.from(byTable.entries()).map(
    async ([table, ids]) => {
      const records = await this.fetchBatchRecords(table, ids, storeId);
      return Array.from(records.entries()).map(([id, record]) => ({
        entity_id: id,
        record,
        table
      }));
    }
  );
  
  const results = await Promise.all(promises);
  const recordMap = new Map<string, any>();
  
  for (const batch of results) {
    for (const { entity_id, record } of batch) {
      recordMap.set(entity_id, record);
    }
  }
  
  return recordMap;
}
```

**Impact:**
- Parallel fetching across entity types
- **3x faster** for mixed event batches
- Better connection utilization

---

## 9️⃣ **Event Metadata Compression** (Low Impact)

### Current Problem
JSONB metadata can grow large:
```typescript
metadata: {
  affected_product_ids: [/* 1000 IDs */],
  operation_type: 'import',
  count: 1000
}
```

### Optimization: Store Only Essential Data
```typescript
// For bulk events, store only count and operation type
metadata: {
  count: 1000,
  operation_type: 'import'
  // Don't store all IDs - fetch by operation_type + timestamp if needed
}
```

**Impact:**
- **50% smaller** event log size
- Faster inserts/queries
- Still maintains audit trail

---

## 🔟 **Realtime Subscription Optimization** (Low Impact)

### Current Problem
Reconnection logic could be smarter.

### Optimization: Exponential Backoff with Jitter
```typescript
private reconnectAttempts: Map<string, number> = new Map();
private readonly MAX_RECONNECT_DELAY = 30000; // 30 seconds max

private scheduleReconnect(branchId: string, storeId: string): void {
  const attempts = this.reconnectAttempts.get(branchId) || 0;
  const baseDelay = Math.min(2000 * Math.pow(2, attempts), MAX_RECONNECT_DELAY);
  const jitter = Math.random() * 1000; // Prevent thundering herd
  const delay = baseDelay + jitter;
  
  this.reconnectAttempts.set(branchId, attempts + 1);
  
  setTimeout(async () => {
    try {
      await this.subscribeToRealtime(branchId, storeId);
      this.reconnectAttempts.delete(branchId); // Reset on success
    } catch (error) {
      this.scheduleReconnect(branchId, storeId); // Retry
    }
  }, delay);
}
```

**Impact:**
- Prevents connection storms
- More resilient to network issues
- Better server load distribution

---

## 📊 **Priority Ranking**

| Optimization | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| 1. Batch Record Fetching | High | Medium | 🔥 **P0** |
| 3. Version Counter | High | Low | 🔥 **P0** |
| 2. Parallel Processing | Medium | Medium | ⚡ **P1** |
| 4. Event Log Archiving | Medium | High | ⚡ **P1** |
| 5. Adaptive Catch-Up | Medium | Low | ⚡ **P1** |
| 6. IndexedDB Batch Ops | Medium | Low | ⚡ **P1** |
| 8. Connection Pooling | Medium | Medium | 📋 **P2** |
| 7. Smart Deduplication | Low-Medium | Low | 📋 **P2** |
| 9. Metadata Compression | Low | Low | 📋 **P2** |
| 10. Realtime Optimization | Low | Low | 📋 **P2** |

---

## 🚀 **Quick Wins (Implement First)**

1. **Batch Record Fetching** - Biggest impact, moderate effort
2. **Version Counter Optimization** - High impact, low effort
3. **IndexedDB Batch Operations** - Medium impact, low effort
4. **Adaptive Catch-Up Interval** - Medium impact, low effort

**Expected Results:**
- **60-70% reduction** in network calls
- **50% faster** event processing
- **10x faster** version increments
- **30% reduction** in unnecessary catch-ups

---

## 📝 **Implementation Notes**

### Testing Strategy
1. Load test with 1000+ events
2. Measure network call reduction
3. Monitor database query performance
4. Test offline/online scenarios

### Rollout Plan
1. Implement optimizations incrementally
2. Feature flag for gradual rollout
3. Monitor metrics before/after
4. Rollback plan for each optimization

### Metrics to Track
- Average events processed per second
- Network requests per event batch
- Database query time for version increment
- IndexedDB write time
- Catch-up interval frequency
- Event log table size growth

---

## 🔍 **Future Considerations**

1. **Event Sourcing**: Store full record state in event metadata (eliminates fetch step)
2. **CDN Caching**: Cache frequently accessed records
3. **WebSocket Streaming**: Stream events instead of polling
4. **Compression**: Compress event payloads for large batches
5. **Sharding**: Partition event log by date/branch for very large stores

