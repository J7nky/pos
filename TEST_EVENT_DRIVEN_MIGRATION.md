# Testing Guide: Fully Event-Driven Migration

## 🧪 Test Plan Overview

This guide provides a comprehensive test plan to verify the fully event-driven migration is working correctly.

---

## ✅ Pre-Testing Checklist

Before running tests, ensure:

- [ ] `eventEmissionService.ts` has been updated with config table events
- [ ] `eventStreamService.ts` has been updated with new entity mappings
- [ ] `syncService.ts` has removed periodic sync
- [ ] Database migration `branch_event_log_fixed.sql` has been run
- [ ] Event emission has been integrated into offlineDataContext (or will be tested manually)
- [ ] At least 2 devices/tabs are available for testing

---

## 🔍 Test Suite 1: Event Emission

### Test 1.1: Verify Event Emission Service

**Objective:** Ensure all new event methods work

**Steps:**
```typescript
// In browser console or test file
import { eventEmissionService } from './services/eventEmissionService';

// Test product event
await eventEmissionService.emitProductUpdated(
  'store-id',
  'branch-id',
  'product-id',
  'user-id',
  { operation: 'create' }
);

// Check branch_event_log table in Supabase
// Should see 1 new event with event_type='product_updated'
```

**Expected Result:**
- ✅ Event appears in `branch_event_log` table
- ✅ Event has correct `entity_type` = 'product'
- ✅ Event has correct `operation` = 'insert'
- ✅ Event has sequential version number

### Test 1.2: Verify Bulk Event Emission

**Steps:**
```typescript
// Test bulk product event
await eventEmissionService.emitProductsBulkUpdated(
  'store-id',
  'branch-id',
  ['product-id-1', 'product-id-2', 'product-id-3'],
  'user-id',
  { operation: 'create', operation_type: 'import', count: 3 }
);

// Check branch_event_log table
// Should see 1 event (not 3)
// Event metadata should contain affected_product_ids array
```

**Expected Result:**
- ✅ Only 1 event created (not 3)
- ✅ Event metadata contains `affected_product_ids` array
- ✅ Event metadata contains `count: 3`

---

## 🔍 Test Suite 2: Event Processing

### Test 2.1: Verify Event Stream Service Entity Mapping

**Objective:** Ensure new entity types map correctly

**Steps:**
```typescript
// In browser console
import { eventStreamService } from './services/eventStreamService';

// This is a private method, so we'll test indirectly by processing events
// Just verify the service starts without errors
await eventStreamService.start('branch-id', 'store-id');

console.log('EventStreamService started successfully');
```

**Expected Result:**
- ✅ No errors during startup
- ✅ Console shows "Realtime subscribed" message

### Test 2.2: Verify Single Event Processing

**Setup:**
1. Open Device A
2. Open Device B
3. Both devices logged into same store/branch

**Steps:**
1. On Device A: Update a product price manually in Supabase
2. Emit event manually:
```sql
SELECT emit_branch_event(
  'store-id'::UUID,
  'branch-id'::UUID,
  'product_updated',
  'product',
  'product-id'::UUID,
  'update',
  'user-id'::UUID,
  '{"fields_changed": ["price"]}'::JSONB
);
```
3. Watch Device B console logs

**Expected Result:**
- ✅ Device B receives Realtime signal within 1 second
- ✅ Device B fetches updated product from Supabase
- ✅ Device B updates IndexedDB
- ✅ Device B UI shows new price

### Test 2.3: Verify Bulk Event Processing

**Steps:**
1. Manually insert 100 products in Supabase
2. Emit bulk event:
```sql
SELECT emit_branch_event(
  'store-id'::UUID,
  'branch-id'::UUID,
  'products_bulk_updated',
  'product',
  (SELECT id FROM products WHERE store_id = 'store-id'::UUID LIMIT 1),
  'insert',
  'user-id'::UUID,
  jsonb_build_object(
    'affected_product_ids', (
      SELECT jsonb_agg(id) FROM products 
      WHERE store_id = 'store-id'::UUID 
      LIMIT 100
    ),
    'count', 100,
    'operation_type', 'import'
  )
);
```
3. Watch Device B console logs

**Expected Result:**
- ✅ Device B receives 1 event (not 100)
- ✅ Device B fetches all 100 products in 1 query (check Network tab)
- ✅ Device B updates IndexedDB with all 100 products
- ✅ Device B UI shows all 100 products

---

## 🔍 Test Suite 3: End-to-End Integration

### Test 3.1: Product Create → Sync → Other Device

**Setup:** 2 devices on same store/branch

**Steps:**
1. Device A: Create new product via UI
2. Watch both Device A and Device B console logs
3. Verify product appears on Device B

**Expected Flow:**
```
Device A:
1. addProduct() called
2. Product saved to IndexedDB
3. syncService.sync() uploads to Supabase
4. emitProductEvent() emits event
5. UI refreshes, product visible

Device B:
1. EventStreamService receives Realtime signal
2. Catches up, pulls new event
3. Fetches product from Supabase
4. Updates IndexedDB
5. UI refreshes, product visible
```

**Expected Result:**
- ✅ Product created on Device A
- ✅ Product appears on Device B within 1-2 seconds
- ✅ No errors in console
- ✅ Event appears in branch_event_log

### Test 3.2: Bulk Product Import → Sync → Other Device

**Setup:** 2 devices on same store/branch

**Steps:**
1. Device A: Import 50 products via bulk import
2. Watch Network tab on Device B
3. Verify all 50 products appear on Device B

**Expected Result:**
- ✅ All 50 products imported on Device A
- ✅ Only 1 event emitted (check branch_event_log)
- ✅ Device B makes only 1 fetch request for products (not 50)
- ✅ All 50 products appear on Device B
- ✅ Total time < 5 seconds

### Test 3.3: Store Settings Update → Instant Sync

**Setup:** 2 devices on same store/branch

**Steps:**
1. Device A: Update store commission rate (e.g., 10% → 15%)
2. Start timer
3. Check Device B for updated rate

**Expected Result:**
- ✅ New rate appears on Device B within < 1 second
- ✅ NO 5-minute delay (this was the old behavior)
- ✅ Event emitted with fields_changed metadata

---

## 🔍 Test Suite 4: Offline & Recovery

### Test 4.1: Offline Device Recovery

**Setup:** 2 devices on same store/branch

**Steps:**
1. Device A: Go offline (disable network)
2. Device B: Make 10 changes (5 sales, 5 product updates)
3. Device A: Come back online
4. Watch Device A console logs

**Expected Result:**
- ✅ Device A catches up when online
- ✅ Device A processes ~10 events
- ✅ Device A syncs all changes
- ✅ No data loss
- ✅ Recovery time < 30 seconds

### Test 4.2: Long Offline Period

**Setup:** 1 device offline for 6 hours

**Steps:**
1. Device A: Go offline
2. Other devices: Continue business operations (100 events)
3. Wait 6 hours (or simulate with timestamp manipulation)
4. Device A: Come back online

**Expected Result:**
- ✅ Device A catches up from last_seen_event_version
- ✅ All 100 events processed in batches
- ✅ Full sync completes
- ✅ Recovery time < 2 minutes

---

## 🔍 Test Suite 5: Performance & Monitoring

### Test 5.1: Idle System Network Usage

**Objective:** Verify zero polling when idle

**Steps:**
1. Open app on Device A
2. Let it sit idle for 10 minutes
3. Open DevTools → Network tab
4. Filter by Fetch/XHR requests
5. Count requests to Supabase REST API

**Expected Result:**
- ✅ ZERO REST API requests during idle period
- ✅ Only WebSocket connection active (Realtime)
- ✅ No periodic sync visible

**Before (Hybrid):** 12 polls/min × 9 tables × 10 min = 1,080 requests
**After (Event-Driven):** 0 requests ✅

### Test 5.2: Event Log Growth Monitoring

**Objective:** Ensure event log isn't growing too fast

**Steps:**
1. Perform typical day's operations:
   - 50 sales
   - 20 inventory receipts
   - 30 product updates
   - 10 customer updates
   - 5 store setting changes
2. Check branch_event_log table size

**Expected Result:**
- ✅ ~115 events created (reasonable)
- ✅ Table size ~57 KB (tiny)
- ✅ No event storms (100+ events for single action)

### Test 5.3: Bulk Operation Performance

**Objective:** Verify bulk events are faster than individual events

**Steps:**
1. Import 100 products using bulk event
2. Measure time for other device to sync
3. Import 100 products using individual events (if possible)
4. Compare times

**Expected Result:**
- ✅ Bulk: ~2-3 seconds for full sync
- ✅ Individual: ~30-60 seconds (if tested)
- ✅ Bulk is 10x+ faster

---

## 🔍 Test Suite 6: Error Handling

### Test 6.1: Missing branchId Handling

**Steps:**
1. Temporarily set currentBranchId to null
2. Try to create a product
3. Check console logs

**Expected Result:**
- ✅ Product created successfully
- ✅ Warning logged: "Skipping event emission - no branchId"
- ✅ No errors thrown
- ✅ Operation completes successfully

### Test 6.2: Event Emission Failure

**Steps:**
1. Temporarily break Supabase connection (or mock failure)
2. Try to create a product
3. Check console logs

**Expected Result:**
- ✅ Product created in IndexedDB
- ✅ Error logged: "Failed to emit event"
- ✅ Main operation still succeeds
- ✅ User sees product in UI

### Test 6.3: Network Interruption During Sync

**Steps:**
1. Start creating a product
2. Disable network immediately after save
3. Re-enable network
4. Check final state

**Expected Result:**
- ✅ Product saved to IndexedDB
- ✅ Sync retries when online
- ✅ Event emitted after successful sync
- ✅ Other devices eventually receive update

---

## 📊 Test Results Summary Template

Use this template to document test results:

```markdown
## Test Results - [Date]

### Environment
- Device A: [Browser/OS]
- Device B: [Browser/OS]
- Store ID: [ID]
- Branch ID: [ID]

### Suite 1: Event Emission
- [ ] Test 1.1: PASS / FAIL - [Notes]
- [ ] Test 1.2: PASS / FAIL - [Notes]

### Suite 2: Event Processing
- [ ] Test 2.1: PASS / FAIL - [Notes]
- [ ] Test 2.2: PASS / FAIL - [Notes]
- [ ] Test 2.3: PASS / FAIL - [Notes]

### Suite 3: End-to-End Integration
- [ ] Test 3.1: PASS / FAIL - [Notes]
- [ ] Test 3.2: PASS / FAIL - [Notes]
- [ ] Test 3.3: PASS / FAIL - [Notes]

### Suite 4: Offline & Recovery
- [ ] Test 4.1: PASS / FAIL - [Notes]
- [ ] Test 4.2: PASS / FAIL - [Notes]

### Suite 5: Performance & Monitoring
- [ ] Test 5.1: PASS / FAIL - Idle requests: [count]
- [ ] Test 5.2: PASS / FAIL - Event count: [count]
- [ ] Test 5.3: PASS / FAIL - Bulk time: [seconds]

### Suite 6: Error Handling
- [ ] Test 6.1: PASS / FAIL - [Notes]
- [ ] Test 6.2: PASS / FAIL - [Notes]
- [ ] Test 6.3: PASS / FAIL - [Notes]

### Issues Found
1. [Issue description]
2. [Issue description]

### Overall Assessment
- [ ] Ready for production
- [ ] Needs fixes before production
- [ ] Requires further testing
```

---

## 🎯 Success Criteria

Migration is successful if:

- ✅ All test suites pass
- ✅ Zero REST requests when idle
- ✅ Config changes propagate in < 1 second
- ✅ Bulk operations use bulk events
- ✅ No event storms observed
- ✅ Offline recovery works correctly
- ✅ No regressions in existing features

---

## 🚨 Known Limitations

1. **Initial Full Sync**: First sync after migration will be slower (downloads all data)
2. **Event Log Growth**: Monitor over time, may need archival after 1 year
3. **Bulk Event Support**: Only products, entities, and users have bulk events currently

---

## 📝 Notes for Testers

- Use browser DevTools Console for logging
- Use Network tab to monitor requests
- Use Supabase dashboard to check branch_event_log table
- Take screenshots of any errors
- Document timing measurements
- Test with realistic data volumes

---

## 🎓 Troubleshooting

### Events not propagating
1. Check EventStreamService is started
2. Verify Realtime connection status
3. Check branch_event_log for events
4. Verify branchId is correct

### Bulk events creating storms
1. Check if bulk emission method is used
2. Verify event count in branch_event_log
3. Review code for loops calling individual emissions

### Offline recovery fails
1. Check last_seen_event_version in sync_state
2. Verify event versions are sequential
3. Check for network errors during catch-up

---

Good luck with testing! 🧪✨

