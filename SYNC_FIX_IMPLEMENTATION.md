# Sync Bug Fix - Implementation Guide

## Summary

**Problem:** Manual database changes (e.g., updating customer balance in Supabase) never sync to devices, even after 30+ minutes.

**Root Cause:** Missing `updated_at` triggers in PostgreSQL. The sync service uses incremental sync based on `updated_at` timestamps, but the database doesn't automatically update these timestamps when rows are modified.

**Solution:** Add PostgreSQL triggers to automatically update `updated_at` on all tables.

## Files Created

1. **`SYNC_BUG_ROOT_CAUSE.md`** - Detailed technical analysis
2. **`apps/store-app/supabase/migrations/20250210000000_add_updated_at_triggers.sql`** - Migration to fix the issue

## How to Apply the Fix

### Step 1: Apply the Migration

Run the migration on your Supabase database:

```bash
cd apps/store-app
npx supabase db push
```

Or manually run the SQL in Supabase SQL Editor:
- Go to Supabase Dashboard → SQL Editor
- Copy contents of `20250210000000_add_updated_at_triggers.sql`
- Execute the SQL

### Step 2: Verify the Fix

Test that triggers are working:

```sql
-- 1. Check current updated_at
SELECT id, name, lb_balance, updated_at 
FROM customers 
WHERE id = 'your-customer-id';

-- 2. Update the balance
UPDATE customers 
SET lb_balance = 0 
WHERE id = 'your-customer-id';

-- 3. Verify updated_at changed
SELECT id, name, lb_balance, updated_at 
FROM customers 
WHERE id = 'your-customer-id';
-- updated_at should now be current timestamp
```

### Step 3: Test Multi-Device Sync

1. **Device A:** Open the app, note customer balance
2. **Supabase:** Manually update customer balance
3. **Wait:** 5-30 seconds for sync
4. **Device A:** Refresh or wait for auto-sync
5. **Verify:** Balance should update automatically

## What the Migration Does

The migration adds a generic trigger function and applies it to 13 tables:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Tables Fixed:
1. ✅ `customers` - Customer balance changes now sync
2. ✅ `suppliers` - Supplier balance changes now sync
3. ✅ `users` - Employee data changes now sync
4. ✅ `products` - Product changes now sync
5. ✅ `stores` - Store settings changes now sync
6. ✅ `cash_drawer_accounts` - Cash drawer balance changes now sync
7. ✅ `cash_drawer_sessions` - Session changes now sync
8. ✅ `inventory_bills` - Batch changes now sync
9. ✅ `bills` - Bill changes now sync
10. ✅ `bill_line_items` - Line item changes now sync
11. ✅ `bill_audit_logs` - Audit log changes now sync
12. ✅ `missed_products` - Missed product changes now sync
13. ✅ `inventory_items` - Inventory changes now sync

## Technical Details

### Before Fix:

```
Manual Update → updated_at stays OLD → Sync queries find nothing → No update on devices
```

**Example:**
```sql
-- Manual update
UPDATE customers SET lb_balance = 0 WHERE id = 'xxx';
-- updated_at = '2025-01-15T10:00:00Z' (unchanged!)

-- Sync query
SELECT * FROM customers 
WHERE store_id = 'yyy' 
AND updated_at >= '2025-01-19T10:00:00Z';  -- Last sync
-- Returns 0 rows because updated_at is still 2025-01-15
```

### After Fix:

```
Manual Update → Trigger sets updated_at = now() → Sync finds new changes → Updates on devices
```

**Example:**
```sql
-- Manual update
UPDATE customers SET lb_balance = 0 WHERE id = 'xxx';
-- Trigger automatically sets: updated_at = '2025-02-10T15:30:00Z'

-- Sync query
SELECT * FROM customers 
WHERE store_id = 'yyy' 
AND updated_at >= '2025-01-19T10:00:00Z';
-- Returns 1 row because updated_at is now 2025-02-10
```

## Why This Bug Existed

1. **App-initiated changes worked** - The app explicitly sets `updated_at`:
   ```typescript
   await db.customers.put({
     ...customer,
     updated_at: new Date().toISOString()
   });
   ```

2. **Manual edits are rare** - Most changes come through the app

3. **Initial sync works** - First sync downloads everything regardless of timestamp

4. **Standard pattern was missing** - PostgreSQL doesn't auto-update timestamps; triggers are required

## Sync System Overview

The sync system uses **incremental sync** for efficiency:

```typescript
// syncService.ts
const lastSyncAt = '2025-01-19T10:00:00Z';  // Last successful sync

// Only fetch records modified since last sync
query = query.gte('updated_at', lastSyncAt);
```

This is efficient but requires `updated_at` to be accurate. Without triggers, manual updates are invisible.

## Impact on Different Scenarios

### ✅ Now Works:
- Manual database edits (your original issue)
- Admin panel changes (if admin panel doesn't set updated_at)
- Direct API calls
- Database migrations/fixes
- SQL scripts
- Any UPDATE statement

### ✅ Already Worked:
- App-initiated changes (app sets updated_at)
- Initial sync (downloads everything)
- Single device usage

## Performance Impact

**Minimal** - Triggers are very lightweight:
- Executes in microseconds
- Only runs on UPDATE (not SELECT)
- Standard PostgreSQL pattern
- No network calls or complex logic

## Rollback Plan

If needed, you can remove the triggers:

```sql
-- Drop all triggers
DROP TRIGGER IF EXISTS trigger_update_customers_updated_at ON customers;
DROP TRIGGER IF EXISTS trigger_update_suppliers_updated_at ON suppliers;
-- ... (repeat for all tables)

-- Drop the function
DROP FUNCTION IF EXISTS update_updated_at_column();
```

However, this will break incremental sync for manual edits again.

## Future Improvements

Consider these enhancements:

### 1. Add Realtime for Critical Tables
For instant updates on critical data:
```typescript
// Subscribe to customer balance changes
supabase
  .channel('customer-changes')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'customers'
  }, (payload) => {
    // Update local IndexedDB immediately
  })
  .subscribe();
```

### 2. Add Monitoring
Track sync performance:
- Log sync duration
- Alert on sync failures
- Monitor updated_at accuracy

### 3. Add Validation
Ensure updated_at is always set:
```sql
-- Add constraint to prevent NULL updated_at
ALTER TABLE customers 
  ALTER COLUMN updated_at SET NOT NULL;
```

## Testing Checklist

- [ ] Migration applied successfully
- [ ] Triggers created on all tables
- [ ] Manual update triggers `updated_at` change
- [ ] Device syncs manual changes within 30 seconds
- [ ] No performance degradation
- [ ] App-initiated changes still work
- [ ] Multi-device sync works correctly

## Support

If issues persist after applying the fix:

1. **Check trigger exists:**
   ```sql
   SELECT trigger_name, event_manipulation, event_object_table
   FROM information_schema.triggers
   WHERE trigger_name LIKE '%updated_at%';
   ```

2. **Check sync logs:**
   - Open browser console
   - Look for sync service logs
   - Verify download count > 0

3. **Force full resync:**
   ```typescript
   // In browser console
   localStorage.removeItem('last_synced_at');
   location.reload();
   ```

## Conclusion

This fix addresses the root cause of the sync issue by ensuring `updated_at` timestamps are always accurate, regardless of how the data is modified. The sync system was correctly implemented; it just needed the database to cooperate with automatic timestamp updates.

**Expected Result:** All database changes, whether from the app or manual edits, will now sync to all devices within 5-30 seconds.
