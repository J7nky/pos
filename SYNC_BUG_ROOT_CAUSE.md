# Multi-Device Sync Bug - Root Cause Analysis

## Problem Description

When manually changing data in Supabase (e.g., setting customer balance to 0), the changes **never sync** to devices, even after 30+ minutes.

## Root Cause: Missing `updated_at` Triggers

### The Issue

The sync service uses **incremental sync** based on the `updated_at` timestamp:

```typescript
// syncService.ts line 818-819
const hasUpdatedAt = TABLES_WITH_UPDATED_AT.includes(tableName as any);
const timestampField = hasUpdatedAt ? 'updated_at' : 'created_at';
```

For tables with `updated_at`, it only downloads records where:
```typescript
// syncService.ts line 947
query = query.gte(timestampField, lastSyncAt);
```

**This means:** Only records with `updated_at >= lastSyncAt` are downloaded.

### The Bug

**Critical tables are missing automatic `updated_at` triggers:**

#### ❌ Missing Triggers:
- `customers` - Has `updated_at` field but NO trigger
- `suppliers` - Has `updated_at` field but NO trigger  
- `users` (employees) - Has `updated_at` field but NO trigger
- `products` - Has `updated_at` field but NO trigger
- `stores` - Has `updated_at` field but NO trigger
- `cash_drawer_accounts` - Has `updated_at` field but NO trigger
- `cash_drawer_sessions` - Has `updated_at` field but NO trigger
- `inventory_bills` - Has `updated_at` field but NO trigger
- `bills` - Has `updated_at` field but NO trigger
- `bill_line_items` - Has `updated_at` field but NO trigger
- `bill_audit_logs` - Has `updated_at` field but NO trigger
- `missed_products` - Has `updated_at` field but NO trigger

#### ✅ Has Triggers:
- `reminders` - Has trigger (line 152 in migration)
- `employee_attendance` - Has trigger (line 89 in migration)
- `exchange_rates` (deleted table) - Had trigger

### What Happens

1. **Manual Update in Supabase:**
   ```sql
   UPDATE customers SET lb_balance = 0 WHERE id = 'xxx';
   ```
   Result: `updated_at` remains OLD (not auto-updated)

2. **Device Sync Runs:**
   ```sql
   SELECT * FROM customers 
   WHERE store_id = 'xxx' 
   AND updated_at >= '2025-01-19T10:00:00Z'  -- Last sync time
   ```
   Result: **0 rows returned** (because `updated_at` wasn't updated)

3. **Device Never Gets Update:**
   The sync service thinks there are no changes, so it doesn't download anything.

### Evidence

**From database schema** (`database.ts` line 280):
```typescript
customers: {
  Row: {
    id: string;
    name: string;
    // ...
    lb_balance: number;
    usd_balance: number;
    // ...
    updated_at: string;  // ✅ Field exists
  }
}
```

**From migrations:**
- No `CREATE TRIGGER` for `customers` table
- No `CREATE TRIGGER` for `suppliers` table
- No `CREATE TRIGGER` for `transactions` table
- etc.

**From sync service** (`syncService.ts` line 37-50):
```typescript
const TABLES_WITH_UPDATED_AT = [
  'products',
  'suppliers', 
  'customers',  // ❌ Listed but has no trigger!
  'users',
  'stores',
  'cash_drawer_accounts',
  // ... all listed but none have triggers
]
```

## Impact

### Affected Scenarios:

1. **Manual database edits** (your case) - Never sync
2. **Admin panel changes** - May not sync if admin panel doesn't update `updated_at`
3. **Direct API calls** - Won't sync if they don't update `updated_at`
4. **Database migrations/fixes** - Won't sync

### Working Scenarios:

1. **App-initiated changes** - Work because the app explicitly sets `updated_at`:
   ```typescript
   // From OfflineDataContext.tsx
   await db.customers.put({
     ...customer,
     updated_at: new Date().toISOString()  // ✅ App sets this
   });
   ```

2. **First-time sync** - Works because it does a full sync when `lastSyncAt` is null

## Why This Wasn't Caught Earlier

1. **Normal app usage works** - The app always sets `updated_at` when making changes
2. **Single device testing** - No need for sync between devices
3. **Initial sync works** - First sync downloads everything
4. **Manual edits are rare** - Most changes come through the app

## Solution

Add `updated_at` triggers to ALL tables that have an `updated_at` field.

### Required Migration

Create a migration to add triggers for:
- customers
- suppliers
- users
- products
- stores
- cash_drawer_accounts
- cash_drawer_sessions
- inventory_bills
- bills
- bill_line_items
- bill_audit_logs
- missed_products
- transactions (if it gets an `updated_at` field)

### Example Trigger Pattern

```sql
CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_customers_updated_at();
```

## Verification

After adding triggers, test:

1. Manually update a customer balance in Supabase
2. Verify `updated_at` is automatically updated
3. Wait for sync (5-30 seconds)
4. Verify change appears on device

## Alternative Solutions

### Option 1: Add Triggers (Recommended)
- ✅ Fixes the root cause
- ✅ Works for all update scenarios
- ✅ Standard PostgreSQL pattern
- ❌ Requires migration

### Option 2: Always Do Full Sync
- ✅ Simple change in code
- ❌ Inefficient (downloads all data every time)
- ❌ Slow for large datasets
- ❌ Wastes bandwidth

### Option 3: Use Supabase Realtime
- ✅ Instant updates
- ✅ No reliance on timestamps
- ❌ More complex
- ❌ Higher costs
- ❌ Requires significant refactoring

## Conclusion

The sync system is **correctly implemented** but relies on `updated_at` being automatically updated by the database. The missing triggers cause manual database edits to be invisible to the sync system.

**Fix:** Add `updated_at` triggers to all tables with `updated_at` fields.
