# Hotfix: Foreign Key Dependency Validation

## Issue Encountered

**Error**: `bill_line_items` failing to sync with foreign key constraint error:
```
insert or update on table "bill_line_items" violates foreign key constraint "bill_line_items_bill_id_fkey"
Key is not present in table "bills".
```

## Root Cause

When the optimized sync service was created, I removed the explicit foreign key validation checks that were in the original `syncService.ts`. This caused child records (like `bill_line_items`) to attempt syncing before their parent records (like `bills`) were successfully uploaded to Supabase.

### Why This Happens

1. Both `bills` and `bill_line_items` are marked as `_synced: false`
2. Sync processes tables in order: `bills` → `bill_line_items`
3. However, if `bills` fail validation or have issues, they don't sync
4. `bill_line_items` then try to sync, but their parent bills don't exist in Supabase
5. Foreign key constraint violation occurs

## Fix Applied

Added explicit parent record validation for critical foreign key dependencies:

### 1. **bill_line_items** and **bill_audit_logs**
- Check if parent `bills` exist in Supabase before attempting to sync
- Skip records whose parent bills don't exist yet
- They'll retry on the next sync cycle (after parent bills sync)

### 2. **inventory_items** with `batch_id`
- Check if parent `inventory_bills` exist in Supabase or locally
- Skip records whose parent batches don't exist yet
- They'll retry on the next sync cycle

## Code Changes

Location: `src/services/syncService.optimized.ts` lines 149-257

```typescript
// CRITICAL: For inventory_items with batch_id, check if parent batch exists
if (tableName === 'inventory_items') {
  const recordsWithBatch = activeRecords.filter((r: any) => r.batch_id);
  
  if (recordsWithBatch.length > 0) {
    const batchIds = [...new Set(recordsWithBatch.map((record: any) => record.batch_id))];
    
    const { data: batchesData, error: batchesError } = await supabase
      .from('inventory_bills')
      .select('id')
      .in('id', batchIds);
    
    // Filter to only include records with valid batch references
    // ... validation logic
  }
}

// CRITICAL: For bill_line_items and bill_audit_logs, check if parent bills exist
if (tableName === 'bill_line_items' || tableName === 'bill_audit_logs') {
  const billIds = [...new Set(activeRecords.map((record: any) => record.bill_id))];
  
  const { data: billsData, error: billsError } = await supabase
    .from('bills')
    .select('id')
    .in('id', billIds);
  
  // Filter to only include records with valid parent bills
  // ... validation logic
}
```

## Behavior After Fix

### Successful Sync Flow:
1. **Sync Cycle 1**:
   - `bills` sync successfully → marked as `_synced: true`
   - `bill_line_items` check parent bills → **found in Supabase** ✅
   - `bill_line_items` sync successfully

2. **If parent not synced yet**:
   - `bills` fail validation or have issues → remain `_synced: false`
   - `bill_line_items` check parent bills → **not found in Supabase** ⏳
   - `bill_line_items` skipped (will retry next cycle)
   - Log: `⏳ X bill_line_items records skipped - parent bills not yet synced (will retry next sync)`

### Console Output:
```
✅ Successfully synced bills
⏳ 5 bill_line_items records skipped - parent bills not yet synced (will retry next sync)
```

Next sync cycle will retry and succeed after parent bills are synced.

## Testing Verification

To verify the fix works:

1. **Create a bill with line items offline**
2. **Come online and sync**
3. **Check console logs**:
   - Should see bills sync first
   - Then bill_line_items sync (or skip if bills failed)
   - No foreign key errors

4. **Check Supabase**:
   - Bills exist in `bills` table
   - Bill line items exist in `bill_line_items` table
   - All foreign key relationships intact

## Prevention for Future Tables

When adding new tables with foreign key dependencies:

### Add validation in `syncService.optimized.ts`:

```typescript
// CRITICAL: For new_child_table, check if parent exists
if (tableName === 'new_child_table') {
  const parentIds = [...new Set(activeRecords.map((record: any) => record.parent_id))];
  
  try {
    const { data: parentData, error: parentError } = await supabase
      .from('parent_table')
      .select('id')
      .in('id', parentIds);
    
    if (parentError) {
      console.warn(`Failed to validate parent IDs for ${tableName}:`, parentError);
      console.log(`⏳ Skipping ${tableName} sync - cannot validate parent dependencies`);
      continue;
    }
    
    const validParentIds = new Set(parentData?.map((p: any) => p.id) || []);
    
    // Filter records
    const recordsWithValidParents: any[] = [];
    const recordsWithMissingParents: any[] = [];
    
    for (const record of activeRecords) {
      if (validParentIds.has(record.parent_id)) {
        recordsWithValidParents.push(record);
      } else {
        recordsWithMissingParents.push(record);
      }
    }
    
    if (recordsWithMissingParents.length > 0) {
      console.log(`⏳ ${recordsWithMissingParents.length} ${tableName} records skipped - parent not yet synced`);
    }
    
    if (recordsWithValidParents.length === 0) {
      console.log(`⏳ No ${tableName} records ready to sync (all waiting for parents)`);
      continue;
    }
    
    activeRecords.length = 0;
    activeRecords.push(...recordsWithValidParents);
    
  } catch (error) {
    console.warn(`Failed to validate parent IDs for ${tableName}:`, error);
    console.log(`⏳ Skipping ${tableName} sync - cannot validate parent dependencies`);
    continue;
  }
}
```

## Tables with Foreign Key Dependencies

Current tables that need this validation:

| Child Table | Parent Table | Foreign Key Field | Status |
|-------------|--------------|-------------------|--------|
| inventory_items | inventory_bills | batch_id | ✅ Fixed |
| bill_line_items | bills | bill_id | ✅ Fixed |
| bill_audit_logs | bills | bill_id | ✅ Fixed |
| missed_products | cash_drawer_sessions | session_id | ⚠️ Monitor |
| missed_products | inventory_items | inventory_item_id | ⚠️ Monitor |
| cash_drawer_sessions | cash_drawer_accounts | account_id | ⚠️ Monitor |

**Note**: The ⚠️ tables are less critical as they follow proper sync order and don't commonly have the parent-missing issue. Monitor during testing.

## Impact on Code Size

This fix adds ~108 lines back to `syncService.optimized.ts`:
- **Before fix**: 736 lines
- **After fix**: ~844 lines
- **Still optimized**: Original was 2,109 lines (60% reduction maintained)

## Alternative Considered

Instead of checking Supabase for parent existence, we could:
1. **Rely on sync order only** - but this fails if parent records have validation issues
2. **Mark children as pending** - more complex state management
3. **Use database transactions** - Supabase doesn't support multi-table transactions over REST API

The current solution (explicit validation) is the most reliable.

## Rollback Instructions

If this fix causes issues:

```bash
# Restore previous version
git checkout HEAD~1 -- src/services/syncService.optimized.ts
```

Or manually remove the validation blocks at lines 149-257.

## Status

- ✅ **Fix applied**: 2025-10-01
- ✅ **No linter errors**: Verified
- ⏳ **Testing needed**: User should test sync with bills and line items
- 📝 **Documentation updated**: This file

## Next Steps

1. **Test the fix**:
   - Create bills with line items
   - Sync to Supabase
   - Verify no foreign key errors

2. **Monitor for similar issues**:
   - Check for other tables with foreign key dependencies
   - Add validation if needed

3. **Update migration docs**:
   - Note this fix in CODE_OPTIMIZATION_SUMMARY.md
   - Update line counts in documentation

---

**Conclusion**: The foreign key validation is now properly handled. Child records will wait for their parent records to sync before attempting to upload. This maintains data integrity and prevents constraint violations.

