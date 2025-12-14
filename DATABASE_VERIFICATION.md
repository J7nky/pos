# Database Setup Verification Checklist

Run these queries in **Supabase SQL Editor** to verify everything is set up correctly.

---

## 1. Verify `branch_event_log` Table Exists

```sql
-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'branch_event_log'
) as table_exists;
```

**Expected result:** `table_exists: true`

---

## 2. Verify Table Schema

```sql
-- Check all columns
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'branch_event_log'
ORDER BY ordinal_position;
```

**Expected columns:**
- `id` (uuid)
- `store_id` (uuid, not null)
- `branch_id` (uuid, not null)
- `event_type` (text, not null)
- `entity_type` (text, not null)
- `entity_id` (uuid, not null)
- `operation` (text, not null)
- `version` (bigint, not null)
- `occurred_at` (timestamp with time zone, not null)
- `user_id` (uuid)
- `metadata` (jsonb)

---

## 3. Verify RPC Functions

```sql
-- Check if emit_branch_event function exists
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  prokind as function_type
FROM pg_proc 
WHERE proname IN ('emit_branch_event', 'get_next_branch_event_version')
ORDER BY proname;
```

**Expected result:** Two functions should exist:
- `emit_branch_event` with parameters (8 parameters)
- `get_next_branch_event_version` with parameter (p_branch_id uuid)

---

## 4. Verify Indexes

```sql
-- Check indexes on branch_event_log
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'branch_event_log'
ORDER BY indexname;
```

**Expected indexes:**
- `branch_event_log_pkey` (primary key on id)
- `idx_branch_event_log_branch_version` (on branch_id, version)
- `idx_branch_event_log_branch_occurred` (on branch_id, occurred_at DESC)
- `idx_branch_event_log_entity` (on entity_type, entity_id)
- `idx_branch_event_log_store` (on store_id)

---

## 5. Verify RLS Policies

```sql
-- Check RLS is enabled
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'branch_event_log';
```

**Expected result:** `rls_enabled: true`

```sql
-- Check RLS policies
SELECT 
  policyname,
  cmd as command,
  qual as using_expression,
  with_check as check_expression
FROM pg_policies 
WHERE tablename = 'branch_event_log'
ORDER BY policyname;
```

**Expected policies:**
- `Users can view events for their branch` (SELECT)
- `Service role can insert events` (INSERT)

---

## 6. Verify Permissions

```sql
-- Check table permissions
SELECT 
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_name = 'branch_event_log'
AND grantee = 'authenticated'
ORDER BY privilege_type;
```

**Expected:** `authenticated` should have `SELECT` privilege

```sql
-- Check function permissions
SELECT 
  r.rolname as grantee,
  p.proname as function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN pg_roles r ON r.oid = ANY(p.proacl::text::oid[])
WHERE p.proname IN ('emit_branch_event', 'get_next_branch_event_version')
AND n.nspname = 'public'
ORDER BY p.proname;
```

---

## 7. Test Event Emission (Manual Test)

```sql
-- Test emitting an event
SELECT emit_branch_event(
  p_store_id := '<YOUR_STORE_ID>'::uuid,
  p_branch_id := '<YOUR_BRANCH_ID>'::uuid,
  p_event_type := 'test_event',
  p_entity_type := 'bill',
  p_entity_id := gen_random_uuid(),
  p_operation := 'insert',
  p_user_id := NULL,
  p_metadata := '{"test": true}'::jsonb
);
```

**Replace:** `<YOUR_STORE_ID>` and `<YOUR_BRANCH_ID>` with actual IDs

**Expected:** Returns a UUID (the event ID)

---

## 8. View Test Event

```sql
-- Check the test event was created
SELECT * FROM branch_event_log 
WHERE event_type = 'test_event'
ORDER BY occurred_at DESC 
LIMIT 1;
```

**Expected:** Should show the test event with:
- `version: 1` (or incremented if there were previous events)
- `event_type: 'test_event'`
- `operation: 'insert'`
- `occurred_at: <current timestamp>`

---

## 9. Clean Up Test Event

```sql
-- Delete the test event (optional)
DELETE FROM branch_event_log 
WHERE event_type = 'test_event';
```

---

## 10. Check Realtime Settings

In Supabase Dashboard:
1. Go to **Settings** → **API**
2. Scroll to **Realtime**
3. Verify: **Realtime is enabled**
4. Go to **Database** → **Replication**
5. Verify: `branch_event_log` table is in the publication (or add it)

---

## Quick Verification Script (Run All at Once)

```sql
-- Comprehensive verification script
DO $$
DECLARE
  table_exists boolean;
  func_count int;
  index_count int;
  rls_enabled boolean;
BEGIN
  -- Check table
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'branch_event_log'
  ) INTO table_exists;
  
  -- Check functions
  SELECT COUNT(*) 
  FROM pg_proc 
  WHERE proname IN ('emit_branch_event', 'get_next_branch_event_version')
  INTO func_count;
  
  -- Check indexes
  SELECT COUNT(*) 
  FROM pg_indexes 
  WHERE tablename = 'branch_event_log'
  INTO index_count;
  
  -- Check RLS
  SELECT rowsecurity 
  FROM pg_tables 
  WHERE tablename = 'branch_event_log'
  INTO rls_enabled;
  
  -- Print results
  RAISE NOTICE '=== Database Setup Verification ===';
  RAISE NOTICE 'Table exists: %', table_exists;
  RAISE NOTICE 'Functions found: % (expected: 2)', func_count;
  RAISE NOTICE 'Indexes found: % (expected: 5)', index_count;
  RAISE NOTICE 'RLS enabled: %', rls_enabled;
  
  IF table_exists AND func_count = 2 AND index_count >= 5 AND rls_enabled THEN
    RAISE NOTICE '✅ Database setup is CORRECT!';
  ELSE
    RAISE NOTICE '❌ Database setup has issues - check individual components above';
  END IF;
END $$;
```

---

## Expected Output

If everything is correct, you should see:

```
NOTICE:  === Database Setup Verification ===
NOTICE:  Table exists: t
NOTICE:  Functions found: 2 (expected: 2)
NOTICE:  Indexes found: 5 (expected: 5)
NOTICE:  RLS enabled: t
NOTICE:  ✅ Database setup is CORRECT!
```

---

## Troubleshooting

### If table doesn't exist:
```sql
-- Re-run the migration
-- Copy content from migrations/branch_event_log.sql and run it
```

### If functions are missing:
```sql
-- Check for errors in function creation
SELECT * FROM pg_proc WHERE proname LIKE '%branch_event%';
```

### If indexes are missing:
```sql
-- Manually create missing indexes
CREATE INDEX IF NOT EXISTS idx_branch_event_log_branch_version 
  ON branch_event_log(branch_id, version);

CREATE INDEX IF NOT EXISTS idx_branch_event_log_branch_occurred 
  ON branch_event_log(branch_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_event_log_entity 
  ON branch_event_log(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_branch_event_log_store 
  ON branch_event_log(store_id);
```

### If RLS is not enabled:
```sql
ALTER TABLE branch_event_log ENABLE ROW LEVEL SECURITY;
```

---

## Next Step

After verification, open your app and complete a sale. Then check:

```sql
-- View events from your app
SELECT 
  id,
  event_type,
  entity_type,
  operation,
  version,
  occurred_at,
  metadata
FROM branch_event_log 
ORDER BY occurred_at DESC 
LIMIT 10;
```

You should see `sale_posted` events appearing! 🎉

